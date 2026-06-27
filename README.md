# Story Relay — Official Demo

A working demo of **Story Relay** (开新故事 / 接力创作). Visuals match the latest
Figma exactly: clean **white + lime**, black subtext hierarchy, the 8-scene
build/continue flow.

Two modes from the landing screen:

1. **看一个示例 (Prebuilt)** — a scripted walkthrough of the cat story
   ("一只会说话的猫"): 开始一个新故事 → 选个主题 → 开头 1/8 → 方向 2/8 →
   发给好友 → DM 接力 (你发出 → 朋友接力 → 5/8 → 6/8 → 你传回) → 大结局 film.
2. **自己做一个 (Build your own)** — same flow, but **you** write each scene, the
   friend's turns are auto-continued, and at the end **Runway turns your scenes
   into the film** (text → video).

## Run it

```bash
cd "Story Relay official Demo"
npm install
npm start
# open http://localhost:3000
```

That's it — the prebuilt demo and the whole build-your-own flow work immediately.
Build-your-own will play a **sample clip** at the film step until you add a
Runway key (below).

## Enable real video generation (Runway)

1. Get a key at <https://dev.runwayml.com> → **API Keys**.
2. Copy the env template and paste your key:
   ```bash
   cp .env.example .env
   # edit .env →  RUNWAY_API_KEY=your_key_here
   ```
3. Restart `npm start`. Now the film step calls Runway **text → video** with the
   combined scene text and plays the real result.

### Notes
- The key lives only in `.env` / the Node server — it never reaches the browser.
- Default model is `gen4_turbo` (text-to-video). If your plan uses a different
  model or endpoint, override `RUNWAY_MODEL` / `RUNWAY_API_BASE` in `.env`.
- Any failure or timeout falls back to the sample clip with a small note, so the
  demo never dead-ends.

## Security / guardrails
- **The key never reaches the browser** — it lives only in `.env` on the server and
  is sent in a server-side `Authorization` header. The front-end only calls `/api/generate`.
- **`.env` is gitignored**, and a **pre-commit hook** (`githooks/`) blocks committing
  any `.env` or key-shaped string. After cloning, activate it once:
  `git config core.hooksPath githooks`.
- **The `/api/generate` proxy is protected**: per-IP rate limit, same-origin check, and
  a daily generation cap — tunable via `RATE_MAX`, `RATE_WINDOW_MS`, `ALLOWED_ORIGINS`,
  `DAILY_CAP` in `.env`. This stops the public endpoint from being abused to burn credits.
- If a key ever leaks, **rotate it** in the provider dashboard — it takes seconds.

## Structure

```
Story Relay official Demo/
  server.js            Express server + Runway proxy (/api/generate)
  package.json
  .env.example         copy → .env, add RUNWAY_API_KEY
  public/
    index.html         app shell (phone frame)
    styles.css         design tokens + every screen, matched to Figma
    app.js             screen router, prebuilt script, build-your-own, Runway client
    assets/            gen-iridescent.png, julia.jpeg, finale.mp4, sample.mp4, ...
```

## Credit
Built from the Figma file `qgclxcf85L3fvPRP9GyOi3` and the prior `The Story Relay`
prototype.
