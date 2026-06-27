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
const BASE = (process.env.RUNWAY_API_BASE || 'https://api.dev.runwayml.com/v1').replace(/\/$/, '');
const MODEL = process.env.RUNWAY_MODEL || 'gen4_turbo';
const VERSION = process.env.RUNWAY_VERSION || '2024-11-06';
const MOCK_VIDEO = '/assets/sample.mp4';

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
  res.json({ ok: true, runway: KEY ? 'configured' : 'not-configured', model: MODEL });
});

app.post('/api/generate', async (req, res) => {
  const { prompt, ratio, duration } = req.body || {};
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt required' });
  }
  if (!KEY) {
    return res.json({
      videoUrl: MOCK_VIDEO,
      mock: true,
      note: '未设置 RUNWAY_API_KEY，播放示例片段。在 .env 里填入 key 即可真实生成。',
    });
  }
  try {
    const videoUrl = await runwayTextToVideo(prompt, { ratio, duration });
    res.json({ videoUrl, mock: false });
  } catch (err) {
    console.error('[runway]', err.message);
    res.json({
      videoUrl: MOCK_VIDEO,
      mock: true,
      note: 'Runway 调用失败，播放示例片段：' + err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  🎬  Story Relay official demo`);
  console.log(`      → http://localhost:${PORT}`);
  console.log(`      Runway: ${KEY ? 'configured (' + MODEL + ')' : 'NOT configured — build-your-own uses sample clip'}\n`);
});
