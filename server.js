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
// no-store so the browser always loads the latest files (no stale cached screens during the demo)
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
}));

const KEY = process.env.RUNWAY_API_KEY && process.env.RUNWAY_API_KEY.trim();
// Optional Claude key — powers story starters / directions / video-prompt director. Server-side only.
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim();
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001'; // cheap + fast on purpose (override via CLAUDE_MODEL)
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const BASE = (process.env.RUNWAY_API_BASE || 'https://api.dev.runwayml.com/v1').replace(/\/$/, '');
const MODEL = process.env.RUNWAY_MODEL || 'gen4.5'; // gen4_turbo was retired by Runway; override via RUNWAY_MODEL
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
  // never throttle local use (your own machine) — the limiter is for a public deployment
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return false;
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

// Create a text-to-video task; returns the task id. Fast — fits a serverless timeout.
async function runwayCreateTask(prompt, { ratio = '1280:720', duration = 10 } = {}) {
  // gen4.5 accepts 5 or 10 for a single clip; clamp anything else to the longest (10s).
  const dur = [5, 10].includes(Number(duration)) ? Number(duration) : 10;
  const createRes = await fetch(`${BASE}/text_to_video`, {
    method: 'POST',
    headers: rwHeaders(),
    body: JSON.stringify({ promptText: prompt, model: MODEL, ratio, duration: dur }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`create ${createRes.status}: ${body.slice(0, 300)}`);
  }
  const { id } = await createRes.json();
  if (!id) throw new Error('no task id returned');
  return id;
}

// Check a task once; returns { status, videoUrl?, error? }. The browser polls this,
// so no single request is ever held open for the multi-minute generation.
async function runwayTaskStatus(id) {
  const sRes = await fetch(`${BASE}/tasks/${id}`, { headers: rwHeaders() });
  if (!sRes.ok) return { status: 'PENDING' }; // transient — keep polling
  const task = await sRes.json();
  if (task.status === 'SUCCEEDED') {
    const out = Array.isArray(task.output) ? task.output[0] : task.output;
    return { status: 'SUCCEEDED', videoUrl: out || null };
  }
  if (task.status === 'FAILED') {
    return { status: 'FAILED', error: task.failureCode || task.failure || 'unknown' };
  }
  return { status: task.status || 'PENDING' };
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
        'Turn this 4-beat story into ONE vivid English prompt (max 60 words) for a 10 second clip. ' +
          'Keep it SIMPLE: one continuous, easy-to-follow action through the four beats — no subplots, ' +
          'no extra characters, no complex detail (only ~10s of screen time). ' +
          'Style: playful 3D animation, soft pastel colors, warm cinematic light, one consistent cute character. ' +
          'Match the mood to the story. Name a clear camera move. End with: vertical 9:16, no text, no watermark. Story: ' + beats,
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

  // kick off the Runway job and return the task id immediately — the browser polls /api/status.
  try {
    const taskId = await runwayCreateTask(prompt, { ratio, duration });
    res.json({ taskId });
  } catch (err) {
    console.error('[runway create]', err.message);
    res.json({ videoUrl: MOCK_VIDEO, mock: true, note: 'Runway 调用失败，播放示例片段：' + err.message });
  }
});

// poll a Runway task's status — the browser hits this every few seconds until the film is ready
app.get('/api/status', async (req, res) => {
  const id = (req.query.id || '').toString();
  if (!id) return res.status(400).json({ error: 'id required' });
  if (!KEY) return res.json({ status: 'SUCCEEDED', videoUrl: MOCK_VIDEO, mock: true });
  try {
    res.json(await runwayTaskStatus(id));
  } catch (err) {
    console.error('[runway status]', err.message);
    res.json({ status: 'PENDING' }); // transient — keep the client polling
  }
});

// theme → tone guidance, so every AI choice matches the story's vibe
const TONE = {
  '悬疑': '悬疑：神秘、有谜团和紧张感，但不血腥、不恐怖',
  '搞笑': '搞笑：轻松、荒诞、有梗，让人会心一笑，绝不惊悚或黑暗',
  '治愈': '治愈：温暖、舒缓、美好，带点小温情',
  '恋爱': '恋爱：甜蜜、心动、暧昧、青春',
};
function toneLine(theme) {
  const t = TONE[(theme || '').toString()];
  return t ? ('整体风格必须是【' + t + '】，所有内容都要紧贴这个风格，绝不要跑到别的类型（比如搞笑就不要写惊悚或恐怖）。') : '';
}
// the final film is only ~10s, so keep every beat simple and easy to picture
const SIMPLE = '保持简单、画面感强：每句只写一个清晰、容易拍成画面的动作或场景，不要复杂支线、抽象心理或多线叙事。';

// STORY STARTERS — fresh openings for "build your own" (falls back to hardcoded on the client)
app.post('/api/starter', async (req, res) => {
  if (!ANTHROPIC_KEY) return res.json({ ok: false });
  if (rejected(req, res)) return;
  const theme = (req.body && req.body.theme || '').toString().slice(0, 12);
  try {
    const txt = await callClaude(
      '你为一个中文好友接力故事游戏出点子。只输出 JSON，不要多余文字。',
      '生成一个新鲜、适合好友接力续写的故事开头。' + toneLine(theme) + SIMPLE +
        '返回 {"opening":["开头A","开头B","开头C"]}，每个一句话、不超过16个字、简单好懂、有画面感。',
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
  const theme = (req.body && req.body.theme || '').toString().slice(0, 12);
  try {
    const txt = await callClaude(
      '你为中文故事接力游戏生成续写方向。只输出 JSON 数组，不要多余文字。',
      '故事到现在：' + (story || '(还没有内容)') +
        '\n请紧接着上文的最后一句，给出 3 个不同的「下一步」发展方向。' +
        '每个方向都必须承接刚刚发生的情节、用到上文已出现的人物或线索，自然推进剧情——' +
        '不要另起炉灶，不要引入和上文无关的新设定或新场景。' +
        toneLine(theme) + SIMPLE +
        '每个一句话、不超过14个字。返回 ["...","...","..."]',
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

// FRIEND'S RELAY TURN — Claude continues YOUR story (scenes 3–4, then the 7–8 finale)
app.post('/api/continue', async (req, res) => {
  if (!ANTHROPIC_KEY) return res.json({ ok: false });
  if (rejected(req, res)) return;
  const story = (req.body && req.body.story || '').toString().slice(0, 1200);
  const ask = (req.body && req.body.ask || '接着把故事往下写').toString().slice(0, 40);
  const theme = (req.body && req.body.theme || '').toString().slice(0, 12);
  try {
    const txt = await callClaude(
      '你是好友接力故事里的另一位作者，自然地接着把故事往下写。只输出续写的一句话，不要引号、不要解释。',
      '故事到现在：' + story + '\n' + ask + '，写一句话（不超过24字），承接上文、推进剧情。' +
        toneLine(theme) + SIMPLE,
      120
    );
    const line = txt.replace(/^[\s"「『]+|[\s"」』]+$/g, '').trim();
    if (line) return res.json({ ok: true, text: line });
    res.json({ ok: false });
  } catch (err) {
    console.error('[claude continue]', err.message);
    res.json({ ok: false });
  }
});

const PORT = process.env.PORT || 3000;
// Only start a listener when run directly (local dev). On Vercel the exported app
// is invoked per-request as a serverless function — no app.listen there.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  🎬  Story Relay official demo`);
    console.log(`      → http://localhost:${PORT}`);
    console.log(`      Runway: ${KEY ? 'configured (' + MODEL + ')' : 'NOT configured — build-your-own uses sample clip'}\n`);
  });
}

module.exports = app;
