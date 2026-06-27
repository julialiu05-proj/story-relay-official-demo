/* ============================================================================
   Story Relay — official demo (front-end)
   Faithful to the latest Figma: white + lime, black subtext hierarchy,
   the 8-scene create/relay spine with the cat story.
   Two modes: 'demo' (scripted) and 'build' (you write + Runway makes the film).
   ============================================================================ */
(() => {
  const app = () => document.getElementById('app');
  const phone = () => document.getElementById('phone');
  const AV = './assets/julia.jpeg';          // Julia avatar
  const POSTER = './assets/gen-iridescent.png'; // "developing" poster (cat / generic)
  const WHALE_POSTER = './assets/whale-card.png'; // exact whale card still (Figma 204:401)
  const STAR = '<img class="star" src="./assets/star.svg" alt="">'; // Julia's exact ✦ icon
  const FRIENDS = [
    { name: 'Julia', av: './assets/julia.jpeg' },
    { name: 'Crystal', emoji: '🦊', bg: '#ffe1c4' },
    { name: 'Theo', emoji: '🐼', bg: '#dfe7ff' },
    { name: 'Kai', emoji: '🐯', bg: '#ffe6a6' },
  ];

  // ---- story content (cat story · matches Figma) ----
  const STORY = {
    themes: [
      { emj: '🔍', nm: '悬疑' }, { emj: '😂', nm: '搞笑' },
      { emj: '🌿', nm: '治愈' }, { emj: '💞', nm: '恋爱' },
    ],
    opening: ['一只会说话的猫敲了你的门。', '你醒来，发现全世界只剩你一个人。', '电梯停在了一个不存在的楼层。'],
    direction: ['你把门打开，猫径直走了进来。', '你假装不在家，但门把手开始转动。', '你问它：你怎么知道我的名字？'],
    julia34: '猫说它来自一座漂浮在云上的城市，只有你能跟它回去。',
    scene5: ['你跟着猫走进了夜色。', '你问猫：那座城市在哪里？', '你犹豫了，把门又关上了。'],
    scene6: ['猫带你来到一扇会发光的门前。', '街角的路灯一盏盏亮了起来。', '猫突然停下，回头看你。'],
    julia78: '门后是整座漂浮的城市，猫回头说：欢迎回家。',
  };

  const state = { mode: null, theme: '悬疑', scenes: {}, chosen: null, dyn: {}, starterP: null, friend: { name: 'Julia', av: './assets/julia.jpeg' } };
  const FNAME = () => state.friend.name;

  /* ---- optional Claude features (graceful: any failure falls back to hardcoded) ---- */
  function storySoFar() {
    const s = state.scenes;
    return [s.s1, s.s2, STORY.julia34, s.s5, s.s6].filter(Boolean).join(' ');
  }
  function fetchStarter() {
    state.starterP = fetch('/api/starter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(r => r.json())
      .then(d => { if (d && d.ok && Array.isArray(d.opening) && d.opening.length) state.dyn.opening = d.opening; return state.dyn.opening || null; })
      .catch(() => null);
  }

  /* ---------------- shared chrome (real Figma exports — no hand-drawn svg) ---------------- */
  const statusbar = (v) => `<div class="statusbar"><img src="./assets/statusbar-${v === 'white' ? 'white' : 'dark'}.svg" alt=""></div>`;
  const home = () => '';
  // the chat partner's avatar — photo (Julia) or an emoji circle (other friends)
  function favHTML(cls, size) {
    const f = state.friend;
    if (f.av) return `<img class="${cls}" src="${f.av}">`;
    return `<span class="${cls}" style="background:${f.bg};display:grid;place-items:center;font-size:${size}px">${f.emoji}</span>`;
  }

  function dotsHTML(cur, total = 8, small = false) {
    let s = `<div class="dots">`;
    for (let i = 0; i < total; i++) {
      const cls = i === cur ? 'now' : (i < cur ? 'done' : '');
      s += `<i class="${cls}"></i>`;
    }
    return s + `</div>`;
  }

  function render(html, { chat = false } = {}) {
    phone().classList.toggle('is-chat', chat);
    app().innerHTML = html + home();
  }

  /* ===================== ENTRANCE (Figma 开始一个新故事) + mode choice ===================== */
  function landing() {
    render(`<div class="screen">
      ${statusbar()}
      <div class="eyebrow" style="margin-top:30px">STORY RELAY</div>
      <div class="h1">开始一个新故事</div>
      <div class="sub">和好友接力，写只属于你们的故事</div>
      <div class="hero">
        <div class="hero-top">你们写的每一幕</div>
        <div class="hero-big">会变成一部短片 🎬</div>
      </div>
      <div class="cta-row">
        <button class="cta" id="build">自己做一个</button>
        <div class="demolink" id="demo">先看一个示例</div>
      </div>
    </div>`);
    document.getElementById('build').onclick = () => { state.mode = 'build'; state.scenes = {}; state.dyn = {}; fetchStarter(); theme(); };
    document.getElementById('demo').onclick = () => { state.mode = 'demo'; state.scenes = {}; whaleStart(); };
  }

  /* ===================== 2 · 选个主题 ===================== */
  function theme() {
    render(`<div class="screen">
      ${statusbar()}
      <div class="bar"><span class="back">‹</span><span class="screen-title">开新故事</span></div>
      <div style="margin-top:10px"><div class="section-title" style="text-align:left;font-size:22px">选个主题</div>
      <div class="sub" style="margin-top:4px;font-size:15px">想写哪种故事？</div></div>
      <div class="tiles">
        ${STORY.themes.map(t => `<div class="tile ${t.nm === state.theme ? 'sel' : ''}" data-nm="${t.nm}"><div class="emj">${t.emj}</div><div class="nm">${t.nm}</div></div>`).join('')}
      </div>
      <div class="cta-row"><button class="cta" id="go">下一步</button></div>
    </div>`);
    app().querySelectorAll('.tile').forEach(t => t.onclick = () => {
      state.theme = t.dataset.nm;
      app().querySelectorAll('.tile').forEach(x => x.classList.toggle('sel', x === t));
    });
    document.getElementById('go').onclick = () => editor(EDITORS.s1);
    app().querySelector('.back').onclick = landing;
  }

  /* ===================== generic EDITOR ===================== */
  // cfg: { title, cur, ctx:{who,body,avatar}, heading, options, placeholder, cta, key, next }
  function editor(cfg) {
    const preSel = -1;            // no auto-selected option
    state.chosen = null;
    render(`<div class="screen">
      ${statusbar()}
      ${dotsHTML(cfg.cur)}
      <div class="count" style="margin-top:16px">${cfg.cur + 1} / 8</div>
      <div class="edit-mid">
        ${cfg.ctx ? `<div class="ctx">
          <div class="who">${cfg.ctx.avatar === 'lime' ? `<span class="av"></span>` : favHTML('av', 13)}<span>${cfg.ctx.who}</span></div>
          <div class="body">${cfg.ctx.body}</div>
        </div>` : ''}
        ${cfg.intro ? `<div class="first-intro"><div class="fi-t">${cfg.intro.t}</div><div class="fi-s">${cfg.intro.s}</div></div>` : `<div class="section-title" style="margin-top:18px">${cfg.heading}</div>`}
        <div class="opts">
          ${cfg.options.map((o, i) => `<div class="opt ${i === preSel ? 'sel' : ''}" data-i="${i}">${o}</div>`).join('')}
        </div>
        <div class="or">或者自己写</div>
        <textarea class="write" id="own" placeholder="${cfg.placeholder}"></textarea>
      </div>
      <div class="cta-row"><button class="cta" id="go">${cfg.cta.replace(/✦\s*/, STAR)}</button></div>
    </div>`);

    let opts = [];
    const own = document.getElementById('own');
    const go = document.getElementById('go');
    const refresh = () => { go.disabled = !(own.value.trim() || state.chosen); };  // grey until a pick/type
    function bindOpts() {
      opts = [...app().querySelectorAll('.opt')];
      opts.forEach(el => el.onclick = () => {
        opts.forEach(x => x.classList.toggle('sel', x === el));
        state.chosen = el.textContent;
        own.value = '';
        refresh();
      });
    }
    bindOpts();
    own.oninput = () => {
      if (own.value.trim()) { opts.forEach(x => x.classList.remove('sel')); state.chosen = own.value.trim(); }
      else if (!opts.some(x => x.classList.contains('sel'))) { state.chosen = null; }
      refresh();
    };
    refresh();
    go.onclick = () => {
      const text = (own.value.trim() || state.chosen);
      if (!text) { own.focus(); return; }
      state.scenes[cfg.key] = text;
      cfg.next();
    };

    // AI content (build mode only): swap fresh options in when they arrive. Never blocks, never breaks.
    if (state.mode === 'build') {
      const swap = (arr) => {
        if (state.chosen) return;                          // don't yank a choice already made
        const wrap = app().querySelector('.opts');
        if (!wrap || !Array.isArray(arr) || !arr.length) return;
        wrap.innerHTML = arr.map((o, i) => `<div class="opt" data-i="${i}">${o}</div>`).join('');
        bindOpts();
      };
      if (cfg.key === 's1' && state.starterP) {
        state.starterP.then(swap);                         // fresh story openings
      } else if (cfg.dyn) {
        fetch('/api/directions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ story: storySoFar(), label: cfg.heading }),
        }).then(r => r.json()).then(d => { if (d && d.ok) swap(d.options); }).catch(() => {});
      }
    }
  }

  const EDITORS = {
    s1: { cur: 0, key: 's1', heading: '选一个开头', cta: '下一幕', placeholder: '自己写一个开头…',
      intro: { t: '写下故事的开头', s: '选一个，或者自己写一个' },
      get options() { return state.dyn.opening || STORY.opening }, next: () => editor(EDITORS.s2) },
    s2: { cur: 1, key: 's2', heading: '接着往哪走', cta: '发给好友', placeholder: '自己写…', dyn: true,
      get ctx() { return { who: '你写的 · 第 1 幕', body: state.scenes.s1 || STORY.opening[0], avatar: 'lime' } },
      get options() { return STORY.direction }, next: () => pickFriend(() => catChat1()) },
    s5: { cur: 4, key: 's5', heading: '接着写', cta: '下一幕', placeholder: '自己写第 5 幕…', dyn: true,
      get ctx() { return { who: `${FNAME()} 写的 · 第 3–4 幕`, body: STORY.julia34, avatar: 'julia' } },
      get options() { return STORY.scene5 }, next: () => editor(EDITORS.s6) },
    s6: { cur: 5, key: 's6', heading: '接着写', get cta() { return '发给 ' + FNAME(); }, placeholder: '自己写第 6 幕…', dyn: true,
      get ctx() { return { who: '你写的 · 第 5 幕', body: state.scenes.s5 || STORY.scene5[0], avatar: 'lime' } },
      get options() { return STORY.scene6 }, next: () => catChat2() },
  };

  /* ===================== DM thread bits ===================== */
  function storyCard({ side = 'out', title, done, total = 8, pill, go, tap, poster = POSTER }) {
    return `<div class="scard ${side}" ${tap ? 'data-tap="1"' : ''}>
      <div class="poster"><img src="${poster}"></div>
      <div class="meta">
        <div class="t">${title}</div>
        <div class="dotsline">${dotsRow(done, total)}<span class="cnt">${done} / ${total}</span></div>
        <div class="pill ${go ? 'go' : ''}">${pill}</div>
      </div>
    </div>`;
  }
  function dotsRow(done, total) {
    let s = `<div class="dots">`;
    for (let i = 0; i < total; i++) s += `<i class="${i < done ? 'done' : ''}"></i>`;
    return s + `</div>`;
  }
  function filmCard(poster = POSTER, side = 'in') {
    return `<div class="scard ${side}" data-tap="film">
      <div class="poster"><img src="${poster}"><div class="play"><span>▶</span></div></div>
      <div class="meta">
        <div class="t">🎬 我们的大结局</div>
        <div class="dotsline">${dotsRow(8, 8)}<span class="cnt">8 / 8</span></div>
        <div class="pill go">一起看大结局</div>
      </div>
    </div>`;
  }
  const chatHead = () => `<div class="chat-head"><span class="back">‹</span>${favHTML('av', 16)}<div><div class="nm">${FNAME()}</div><div class="st">在线</div></div></div>`;
  const composer = () => `<div class="composer"><div class="box">发消息…</div></div>`;
  const typing = () => `<div class="row in">${favHTML('av', 16)}<div class="bubble typing"><i></i><i></i><i></i></div></div>`;

  /* ---- sequential chat engine: messages reveal one at a time (real chat) ---- */
  let chatLog = [];
  function chatShell() {
    render(`<div class="screen">
      ${statusbar()}
      ${chatHead()}
      <div class="thread" id="thread">${chatLog.join('')}</div>
      ${composer()}
    </div>`, { chat: true });
    const back = app().querySelector('.chat-head .back'); if (back) back.onclick = () => { chatLog = []; landing(); };
    const t = document.getElementById('thread'); t.scrollTop = t.scrollHeight; return t;
  }
  function msgHTML(m) {
    if (m.profile) return `<div class="chatintro">${favHTML('bigav', 52)}<div class="bn">${m.profile.name}</div><div class="bh">${m.profile.handle}</div><div class="bf">${m.profile.meta}</div></div>`;
    if (m.day != null) return `<div class="daydiv">${m.day}</div>`;
    if (m.in != null) return `<div class="row in">${favHTML('av', 16)}<div class="bubble">${m.in}</div></div>`;
    if (m.out != null) return `<div class="row out"><div class="bubble">${m.out}</div></div>`;
    if (m.film) { const fc = filmCard(m.film.poster, m.film.side); return m.film.side === 'out' ? fc : `<div class="row in cardrow">${favHTML('av', 16)}${fc}</div>`; }
    if (m.card) { const sc = storyCard(m.card); return m.card.side === 'in' ? `<div class="row in cardrow">${favHTML('av', 16)}${sc}</div>` : sc; }
    return '';
  }
  const isIncoming = (m) => (m.in != null) || (m.film && m.film.side !== 'out') || (m.card && m.card.side === 'in');
  // reveal `messages` one at a time on top of the existing history; wire onTap to the last tappable
  function playChat(messages, onTap) {
    const thread = chatShell();
    let i = 0;
    const reveal = (m) => { const h = msgHTML(m); chatLog.push(h); thread.insertAdjacentHTML('beforeend', h); thread.scrollTop = thread.scrollHeight; };
    function finish() {
      if (!onTap) return;
      const taps = thread.querySelectorAll('[data-tap]');
      const last = taps[taps.length - 1];
      if (last) last.onclick = onTap;
    }
    function step() {
      if (i >= messages.length) return finish();
      const m = messages[i++];
      if (isIncoming(m)) {
        const wrap = document.createElement('div'); wrap.innerHTML = typing();
        const tEl = wrap.firstElementChild; thread.appendChild(tEl); thread.scrollTop = thread.scrollHeight;
        setTimeout(() => { tEl.remove(); reveal(m); setTimeout(step, 450); }, 1100);
      } else {
        reveal(m); setTimeout(step, m.day != null ? 350 : 700);
      }
    }
    step();
  }

  /* ---- CAT (build) chat segments ---- */
  function catChat1() {  // after 方向 2/8 you sent 1–2, Julia writes 3–4
    chatLog = [];
    playChat([
      { day: '今天 下午 3:20' },
      { out: '我来写！' },
      { card: { side: 'out', title: '你完成了第 1–2 幕', done: 2, pill: `等待 ${FNAME()} 接力` } },
      { in: '该你写第 5 幕啦！' },
      { card: { side: 'in', title: `${FNAME()} 完成了第 3–4 幕`, done: 4, pill: '接着写 第 5 幕', go: true, tap: true } },
    ], () => editor(EDITORS.s5));
  }
  function catChat2() {  // after 第6幕 you sent 5–6, Julia finishes 7–8 + film
    playChat([
      { card: { side: 'out', title: '你完成了第 5–6 幕', done: 6, pill: `等待 ${FNAME()} 收尾` } },
      { card: { side: 'in', title: `${FNAME()} 完成了第 7–8 幕`, done: 8, pill: '已接力' } },
      { in: '我们的大结局也太好看了！🎬' },
      { film: { tap: true } },
    ], () => generating());
  }

  /* ===================== PICK A FRIEND (bottom sheet) ===================== */
  function pickFriend(onDone) {
    let picked = 0;
    const ov = document.createElement('div');
    ov.className = 'sheet-overlay';
    ov.innerHTML = `
      <div class="sheet-scrim"></div>
      <div class="sheet">
        <div class="sheet-grab"></div>
        <div class="sheet-title">发给谁？</div>
        <div class="sheet-sub">选一位好友，开始你们的接力</div>
        <div class="friend-row">
          ${FRIENDS.map((f, i) => `<div class="friend ${i === picked ? 'sel' : ''}" data-i="${i}">
            <div class="fav">${f.av ? `<img src="${f.av}">` : `<span style="background:${f.bg}">${f.emoji}</span>`}</div>
            <div class="fname">${f.name}</div>
          </div>`).join('')}
        </div>
        <button class="cta" id="sheet-done">完成</button>
      </div>`;
    app().appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('open'));
    const close = (cb) => { ov.classList.remove('open'); setTimeout(() => { ov.remove(); if (cb) cb(); }, 300); };
    ov.querySelectorAll('.friend').forEach(el => el.onclick = () => {
      picked = +el.dataset.i;
      ov.querySelectorAll('.friend').forEach(x => x.classList.toggle('sel', x === el));
    });
    ov.querySelector('.sheet-scrim').onclick = () => close();              // dismiss without sending
    document.getElementById('sheet-done').onclick = () => { state.friend = FRIENDS[picked]; close(onDone); };
  }

  /* ===================== COVER (芒果鲸鱼 · shared-story landing) ===================== */
  function cover() {
    render(`<div class="screen cover" style="padding:0">
      <video class="covervid" src="./assets/story-entry.mp4" autoplay muted playsinline></video>
      <img class="coverstill" src="./assets/mango-whale.jpg" alt="">
      <div class="coverscrim"></div>
      ${statusbar()}
      <div class="coverfoot">
        <div class="cover-title">芒果鲸鱼</div>
        <div class="cover-avs"><img class="ca" src="${AV}"><span class="cc">+</span><span class="cc">+</span><span class="cc">+</span></div>
        <div class="cover-sub">Julia 写好了开头</div>
      </div>
      <div class="coverbtn"><button class="cta" id="join">加入接力故事</button></div>
    </div>`);
    const vid = app().querySelector('.covervid');
    const still = app().querySelector('.coverstill');
    if (vid) vid.onended = () => still.classList.add('show');  // freeze on the mango-whale still
    document.getElementById('join').onclick = () => editor(WED.w3);
  }

  /* ===================== WHALE flow (Door 1 · 看一个示例 / continue) ===================== */
  const WHALE = {
    julia12: 'Tung Tung Tung Sahur 和朋友发现一头搁浅的巨鲸，决定爬上它的脊背一探究竟。',
    scene3: ['在鲸鱼的头上挖了个洞，钻了进去。', '想把鲸鱼推回大海里。', '在鲸鱼背上铺开野餐垫。'],
    scene4: ['一间舒服的客厅——沙发、台灯、电视，全套都有。', '一间录音棚，给 Sahur 录下一首节拍。', '一座室内泳池。在鲸鱼肚子里，挺大胆。'],
    julia56: '鲸鱼醒了，客厅进水了，大家手忙脚乱地往它头顶爬。',
    scene7: ['鲸鱼驮着他们，游向了夕阳。', '镜头拉远 —— 原来这都是 Sahur 的一场梦。', '他们在鲸鱼背上办了场告别派对。'],
    scene8: ['鲸鱼驮着他们，游向了夕阳。', '镜头拉远 —— 原来这都是 Sahur 的一场梦。', '他们在鲸鱼背上办了场告别派对。'],
  };
  const WED = {
    w3: { title: 'Julia 的接力', cur: 2, key: 'w3', heading: '你来续写', cta: '下一幕', placeholder: '自己写这一幕…',
      ctx: { who: 'Julia 写的 · 第 1–2 幕', body: WHALE.julia12, avatar: 'julia' },
      get options() { return WHALE.scene3 }, next: () => editor(WED.w4) },
    w4: { title: 'Julia 的接力', cur: 3, key: 'w4', heading: '你来续写', cta: '发回', placeholder: '自己写这一幕…',
      get ctx() { return { who: '你写的 · 第 3 幕', body: state.scenes.w3 || WHALE.scene3[0], avatar: 'lime' } },
      get options() { return WHALE.scene4 }, next: () => whaleChat2() },
    w7: { title: 'Julia 的接力', cur: 6, key: 'w7', heading: '你来收尾', cta: '下一幕', placeholder: '自己写这一幕…',
      ctx: { who: 'Julia 写的 · 第 5–6 幕', body: WHALE.julia56, avatar: 'julia' },
      get options() { return WHALE.scene7 }, next: () => editor(WED.w8) },
    w8: { title: 'Julia 的接力', cur: 7, key: 'w8', heading: '你来收尾', cta: '锁定大结局', placeholder: '自己写这一幕…',
      get ctx() { return { who: '你写的 · 第 7 幕', body: state.scenes.w7 || WHALE.scene7[0], avatar: 'lime' } },
      get options() { return WHALE.scene8 }, next: () => whaleChat3() },
  };

  // receive: Julia hands you 芒果鲸鱼 tap 接着写 editor w3
  function whaleStart() {
    chatLog = [];
    state.friend = FRIENDS[0];   // Door 1: the story came from Julia
    playChat([
      { profile: { name: 'Julia', handle: '@julia77', meta: '4 关注 · 51 粉丝' } },
      { day: '今天 下午 3:21' },
      { in: '你一定要帮我把这个写完！😭' },
      { card: { side: 'in', poster: WHALE_POSTER, title: 'Julia 完成了第 1–2 幕', done: 2, pill: '查看', go: true, tap: true } },
    ], () => cover());
  }
  // after 4/8 you sent 3–4, Julia writes 5–6 tap 接着收尾 editor w7
  function whaleChat2() {
    playChat([
      { card: { side: 'out', poster: WHALE_POSTER, title: '你完成了第 3–4 幕', done: 4, pill: '等待 Julia 接力' } },
      { card: { side: 'in', poster: WHALE_POSTER, title: 'Julia 完成了第 5–6 幕', done: 6, pill: '收尾', go: true, tap: true } },
    ], () => editor(WED.w7));
  }
  // after 8/8 you finished, the film is ready tap generate whale film
  function whaleChat3() {
    playChat([
      { card: { side: 'out', poster: WHALE_POSTER, title: '你完成了第 7–8 幕', done: 8, pill: '已锁定' } },
      { out: '我把大结局做出来了！🎬' },
      { film: { poster: WHALE_POSTER, side: 'out', tap: true } },
    ], () => generating());
  }

  /* ===================== generating + film ===================== */
  // Template-only prompt: locked style + the full story beats + technical constraints → one 6–10s clip.
  function sceneBeats() {
    const s = state.scenes;
    return [s.s1, s.s2, STORY.julia34, s.s5, s.s6, STORY.julia78].filter(Boolean);
  }
  function fullPrompt() {
    const beats = sceneBeats().join(' ');
    return [
      'Playful 3D animated short film, soft pastel colors, warm cinematic lighting, cute storybook character design, shallow depth of field, gentle flowing camera motion.',
      'Tell this story as one continuous dreamy montage:',
      beats,
      'Keep the main character consistent throughout. Heartwarming, whimsical mood.',
      'Vertical 9:16, no on-screen text, no captions, no watermark.',
    ].join(' ');
  }

  function generating() {
    render(`<div class="screen endscreen">
      ${statusbar()}
      <div class="bar"><span class="back">‹</span><span class="screen-title">正在生成</span></div>
      <div class="bigcard gencard">
        <div class="genmid">
          <img class="genstar" src="./assets/star.svg" alt="">
          <div class="gent">正在生成你们的影片…</div>
          <div class="gens" id="gsub">马上就好，请稍候…</div>
        </div>
      </div>
      <div class="endcap">影片生成好后，就能保存或发布啦</div>
      <div class="savepub"><button class="cta ghost" disabled>保存</button><button class="cta ghost" disabled>发布</button></div>
    </div>`);
    app().querySelector('.bar .back').onclick = landing;

    if (state.mode === 'demo') {
      setTimeout(() => showFilm('./assets/finale.mp4'), 2600);   // whale = mango-whale video
      return;
    }
    // build mode → real Runway video via the server
    fetch('/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: fullPrompt(), scenes: sceneBeats(), duration: 10, ratio: '720:1280' }),
    })
      .then(r => r.json())
      .then(d => showFilm(d.videoUrl || './assets/sample.mp4', d.mock ? (d.note || '示例片段') : null))
      .catch(() => showFilm('./assets/sample.mp4', '生成失败，播放示例片段。'));
    const lines = ['马上就好，请稍候…', '正在为第 1 幕打光…', '镜头在动了…', '快好了，正在收尾…'];
    let i = 0; const sub = document.getElementById('gsub');
    const tick = setInterval(() => { i++; if (!document.getElementById('gsub')) return clearInterval(tick); if (i < lines.length) sub.textContent = lines[i]; }, 4000);
  }

  function showFilm(url, note) {
    const title = state.mode === 'demo' ? '芒果鲸鱼 · 大结局' : '我们的故事 · 大结局';
    const poster = state.mode === 'demo' ? `poster="./assets/mango-whale.jpg"` : '';
    render(`<div class="screen endscreen">
      ${statusbar()}
      <div class="bar"><span class="back">‹</span><span class="screen-title">${title}</span></div>
      <div class="bigcard filmcard">
        <video src="${url}" playsinline ${poster}></video>
        <div class="filmplay" id="play"><span>▶</span></div>
      </div>
      ${note ? `<div class="endcap">${note}</div>` : ''}
      <div class="savepub"><button class="cta ghost" id="save">保存</button><button class="cta" id="pub">发布</button></div>
    </div>`);
    const v = app().querySelector('video');
    const play = document.getElementById('play');
    play.onclick = () => { if (v.ended) v.currentTime = 0; v.play(); play.style.display = 'none'; v.controls = true; };
    v.onended = () => { play.querySelector('span').textContent = '↺'; play.style.display = 'grid'; v.controls = false; };
    app().querySelector('.bar .back').onclick = landing;
    document.getElementById('save').onclick = landing;
    document.getElementById('pub').onclick = landing;
  }

  /* ---------------- fit the fixed 430×932 frame into the viewport (exact ratio) ---------------- */
  function fit() {
    const s = Math.min((window.innerHeight - 20) / 932, (window.innerWidth - 20) / 430, 1.2);
    document.documentElement.style.setProperty('--scale', s);
  }
  window.addEventListener('resize', fit);

  /* ---------------- boot ---------------- */
  fit();
  landing();
})();
