/**
 * Story Relay — official demo server.
 *
 * Serves the static front-end (public/) and proxies "build your own" video
 * generation to the Runway API so the secret key never reaches the browser.
 *
 * If RUNWAY_API_KEY is missing, or any Runway call fails/ times out, the
 * endpoint gracefully falls back to a bundled sample clip so the demo always
 * completes. The front-end shows a small "demo clip" note when that happens.
 */
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const KEY = process.env.RUNWAY_API_KEY && process.env.RUNWAY_API_KEY.trim();
// Optional Claude key — powers story starters / directions / video-prompt director. Server-side only.
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim();
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001'; // cheap + fast on purpose (override via CLAUDE_MODEL)
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const BASE = (process.env.RUNWAY_API_BASE || 'https://api.dev.runwayml.com/v1').replace(/\/$/, '');
const MODEL = process.env.RUNWAY_MODEL || 'gen4_turbo';
const VERSION = process.env.RUNWAY_VERSION || '2024-11-06';
const MOCK_VIDEO = '/assets/sample.mp4';

// ---- guardrails: the /api/generate proxy is public, so protect it from abuse ----
// (these matter once a real key is set — they bound who can call it and how much
//  Runway spend a bad actor could trigger, even though the key itself never leaks.)
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS) || 60_000; // window per IP
const RATE_MAX = Number(process.env.RATE_MAX) || 12;                  // calls per window per IP
const DAILY_CAP = Number(process.env.DAILY_CAP) || 50;               // real generations/day (spend guard)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const hits = new Map();          // ip -> { count, resetAt }
let day = { key: '', count: 0 }; // global daily generation counter

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_MAX;
}

// only let our own page (same host) or an explicitly allow-listed origin call the proxy
function originAllowed(req) {
  const src = req.get('origin') || req.get('referer') || '';
  if (!src) return true; // native fetch / curl sends no Origin — can't reliably block, allow
  let host;
  try { host = new URL(src).host; } catch { return false; }
  if (host === req.get('host')) return true;
  return ALLOWED_ORIGINS.some((o) => {
    try { return new URL(o).host === host; } catch { return o === host; }
  });
}

const clientIp = (req) =>
  (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();

// shared guard for the cheap Claude endpoints (origin + rate limit). Returns true if rejected.
function rejected(req, res) {
  if (!originAllowed(req)) { res.status(403).json({ error: 'forbidden origin' }); return true; }
  if (rateLimited(clientIp(req))) { res.status(429).json({ error: 'rate limit' }); return true; }
  return false;
}

// minimal Claude call — short, cheap (Haiku, small max_tokens). Returns the reply text.
async function callClaude(system, user, maxTokens = 220) {
  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error('claude ' + r.status + ': ' + (await r.text()).slice(0, 160));
  const data = await r.json();
  return ((data.content && data.content[0] && data.content[0].text) || '').trim();
}

// pull the first JSON array/object out of a model reply
function pickJSON(txt, fallback) {
  try {
    const m = txt.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : fallback;
  } catch {
    return fallback;
  }
}

function rwHeaders() {
  return {
    Authorization: `Bearer ${KEY}`,
    'X-Runway-Version': VERSION,
    'Content-Type': 'application/json',
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Create a text-to-video task and poll until it finishes.
 * Returns the output video URL.
 */
async function runwayTextToVideo(prompt, { ratio = '1280:720', duration = 5 } = {}) {
  const createRes = await fetch(`${BASE}/text_to_video`, {
    method: 'POST',
    headers: rwHeaders(),
    body: JSON.stringify({ promptText: prompt, model: MODEL, ratio, duration }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`create ${createRes.status}: ${body.slice(0, 300)}`);
  }
  const { id } = await createRes.json();
  if (!id) throw new Error('no task id returned');

  const deadline = Date.now() + 5 * 60 * 1000; // 5 min cap
  while (Date.now() < deadline) {
    await sleep(4000);
    const sRes = await fetch(`${BASE}/tasks/${id}`, { headers: rwHeaders() });
    if (!sRes.ok) continue;
    const task = await sRes.json();
    if (task.status === 'SUCCEEDED') {
      const out = Array.isArray(task.output) ? task.output[0] : task.output;
      if (!out) throw new Error('succeeded but no output url');
      return out;
    }
    if (task.status === 'FAILED') {
      throw new Error('runway task failed: ' + (task.failureCode || task.failure || 'unknown'));
    }
    // PENDING / RUNNING / THROTTLED → keep polling
  }
  throw new Error('timed out after 5 minutes');
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    runway: KEY ? 'configured' : 'not-configured',
    anthropic: ANTHROPIC_KEY ? 'configured' : 'not-configured',
    model: MODEL,
  });
});

app.post('/api/generate', async (req, res) => {
  if (rejected(req, res)) return; // origin + rate-limit guards
  let { prompt, scenes, ratio, duration } = req.body || {};

  if (!KEY) {
    return res.json({
      videoUrl: MOCK_VIDEO,
      mock: true,
      note: '未设置 RUNWAY_API_KEY，播放示例片段。在 .env 里填入 key 即可真实生成。',
    });
  }

  // DIRECTOR: when Claude is available, turn the raw scenes into one tight English
  // cinematic prompt before Runway. Any failure → keep the client's template prompt.
  if (ANTHROPIC_KEY && Array.isArray(scenes) && scenes.filter(Boolean).length) {
    try {
      const beats = scenes.filter(Boolean).join(' ');
      const better = await callClaude(
        'You are a cinematic director. Output ONLY one text-to-video prompt — no preamble, no quotes.',
        'Turn this short story into ONE vivid English prompt (max 60 words) for a 6-10 second clip. ' +
          'Style: playful 3D animation, soft pastel colors, warm cinematic light, one consistent cute character. ' +
          'Name a clear camera move and the mood. End with: vertical 9:16, no text, no watermark. Story: ' + beats,
        200
      );
      if (better) prompt = better;
    } catch (err) {
      console.error('[claude director]', err.message); // fall back to the template prompt
    }
  }

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt required' });
  }

  // daily spend cap — only real (keyed) generations count
  const today = new Date().toISOString().slice(0, 10);
  if (day.key !== today) day = { key: today, count: 0 };
  if (day.count >= DAILY_CAP) {
    return res.json({ videoUrl: MOCK_VIDEO, mock: true, note: '今日生成已达上限，播放示例片段。' });
  }
  day.count += 1;

  try {
    const videoUrl = await runwayTextToVideo(prompt, { ratio, duration });
    res.json({ videoUrl, mock: false });
  } catch (err) {
    console.error('[runway]', err.message);
    res.json({ videoUrl: MOCK_VIDEO, mock: true, note: 'Runway 调用失败，播放示例片段：' + err.message });
  }
});

// STORY STARTERS — fresh openings for "build your own" (falls back to hardcoded on the client)
app.post('/api/starter', async (req, res) => {
  if (!ANTHROPIC_KEY) return res.json({ ok: false });
  if (rejected(req, res)) return;
  try {
    const txt = await callClaude(
      '你为一个中文好友接力故事游戏出点子。只输出 JSON，不要多余文字。',
      '生成一个新鲜、适合好友接力续写的故事开头。返回 {"opening":["开头A","开头B","开头C"]}，每个一句话、有悬念、不超过18个字。',
      220
    );
    const j = pickJSON(txt, null);
    if (j && Array.isArray(j.opening) && j.opening.length) {
      return res.json({ ok: true, opening: j.opening.slice(0, 3).map(String) });
    }
    res.json({ ok: false });
  } catch (err) {
    console.error('[claude starter]', err.message);
    res.json({ ok: false });
  }
});

// AI DIRECTIONS — dynamic next-scene options from the story so far (falls back to hardcoded)
app.post('/api/directions', async (req, res) => {
  if (!ANTHROPIC_KEY) return res.json({ ok: false });
  if (rejected(req, res)) return;
  const story = (req.body && req.body.story || '').toString().slice(0, 1000);
  const label = (req.body && req.body.label || '下一幕').toString().slice(0, 24);
  try {
    const txt = await callClaude(
      '你为中文故事接力游戏生成续写方向。只输出 JSON 数组，不要多余文字。',
      '故事到现在：' + (story || '(还没有内容)') +
        '\n围绕「' + label + '」给出 3 个不同、有趣的方向，每个一句话、不超过16个字。返回 ["...","...","..."]',
      160
    );
    const arr = pickJSON(txt, null);
    if (Array.isArray(arr) && arr.length) {
      return res.json({ ok: true, options: arr.slice(0, 3).map(String) });
    }
    res.json({ ok: false });
  } catch (err) {
    console.error('[claude directions]', err.message);
    res.json({ ok: false });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  🎬  Story Relay official demo`);
  console.log(`      → http://localhost:${PORT}`);
  console.log(`      Runway: ${KEY ? 'configured (' + MODEL + ')' : 'NOT configured — build-your-own uses sample clip'}\n`);
});
