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
    julia2: '你打开门，猫说它来自云上的城市，只有你能跟它回去。',
    scene3: ['你跟着猫走进了夜色。', '你问猫：那座城市在哪里？', '你犹豫了，把门又关上了。'],
    julia4: '猫带你穿过那扇会发光的门，回头说：欢迎回家。',
  };

  const state = { mode: null, theme: '悬疑', scenes: {}, chosen: null, dyn: {}, starterP: null, friend: { name: 'Julia', av: './assets/julia.jpeg' } };
  const FNAME = () => state.friend.name;

  /* ---- optional Claude features (graceful: any failure falls back to hardcoded) ---- */
  function storySoFar() {
    const s = state.scenes;
    return [s.s1, J2(), s.s3].filter(Boolean).join(' ');
  }
  function fetchStarter() {
    state.starterP = fetch('/api/starter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: state.theme }) })
      .then(r => r.json())
      .then(d => { if (d && d.ok && Array.isArray(d.opening) && d.opening.length) state.dyn.opening = d.opening; return state.dyn.opening || null; })
      .catch(() => null);
  }
  // the friend's relay turns — AI-written continuation of YOUR story (falls back to the canned cat lines)
  const J2 = () => state.dyn.j2 || STORY.julia2;
  const J4 = () => state.dyn.j4 || STORY.julia4;
  function fetchContinue(key, story, ask) {
    return fetch('/api/continue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ story, ask, theme: state.theme }) })
      .then(r => r.json())
      .then(d => { if (d && d.ok && d.text) state.dyn[key] = d.text; })
      .catch(() => {});
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
    state.chatBack = null;   // home resets the chat back-target (set by the build relay → inbox)
    render(`<div class="screen">
      ${statusbar()}
      <div class="eyebrow" style="margin-top:30px">STORY RELAY</div>
      <div class="h1">开始一个新故事</div>
      <div class="sub">和好友接力，写只属于你们的故事</div>
      <div class="hero">
        <div class="hero-emoji">🎬</div>
        <div class="hero-top">你们写的每一幕</div>
        <div class="hero-big">会变成一部短片</div>
      </div>
      <div class="cta-row">
        <button class="cta" id="build">自己做一个</button>
        <div class="demolink" id="demo">先看一个示例</div>
      </div>
    </div>`);
    document.getElementById('build').onclick = () => { state.mode = 'build'; state.scenes = {}; state.dyn = {}; theme(); };
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
    document.getElementById('go').onclick = () => { fetchStarter(); editor(EDITORS.s1); };  // fetch openings now that the theme is chosen
    app().querySelector('.back').onclick = landing;
  }

  /* ===================== generic EDITOR ===================== */
  // cfg: { title, cur, ctx:{who,body,avatar}, heading, options, placeholder, cta, key, next }
  function editor(cfg) {
    state.chosen = null;
    // build mode pulls AI options for the opening (s1) and the direction screens (cfg.dyn)
    const aiBuild = state.mode === 'build' && (cfg.dyn || (cfg.key === 's1' && state.starterP));
    render(`<div class="screen">
      ${statusbar()}
      ${dotsHTML(cfg.cur, cfg.total || 8)}
      <div class="count" style="margin-top:16px">${cfg.cur + 1} / ${cfg.total || 8}</div>
      <div class="edit-mid">
        ${cfg.ctx ? `<div class="ctx">
          <div class="who">${cfg.ctx.avatar === 'lime' ? `<span class="av"></span>` : favHTML('av', 13)}<span>${cfg.ctx.who}</span></div>
          <div class="body">${cfg.ctx.body}</div>
        </div>` : ''}
        ${cfg.intro ? `<div class="first-intro"><div class="fi-t">${cfg.intro.t}</div><div class="fi-s">${cfg.intro.s}</div></div>` : `<div class="section-title" style="margin-top:18px">${cfg.heading}</div>`}
        <div class="opts">
          ${aiBuild ? `<div class="opt-loading">✦ AI 正在构思…</div>` : cfg.options.map((o, i) => `<div class="opt" data-i="${i}">${o}</div>`).join('')}
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

    // AI options: while they load we show "AI 正在构思…", then fill; on failure/timeout use the canned list.
    function fillOpts(arr) {
      if (state.chosen) return;                            // user already wrote/picked — leave them be
      const wrap = app().querySelector('.opts');
      if (!wrap) return;
      const list = (Array.isArray(arr) && arr.length) ? arr : cfg.options;
      wrap.innerHTML = list.map((o, i) => `<div class="opt" data-i="${i}">${o}</div>`).join('');
      bindOpts();
    }
    if (aiBuild) {
      const src = cfg.key === 's1'
        ? (state.starterP || Promise.resolve(null))
        : fetch('/api/directions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ story: storySoFar(), label: cfg.heading, theme: state.theme }),
          }).then(r => r.json()).then(d => (d && d.ok ? d.options : null)).catch(() => null);
      const timeout = new Promise(res => setTimeout(() => res('__t__'), 8000));
      Promise.race([src, timeout]).then(v => fillOpts(v === '__t__' ? null : v));
    }
  }

  const EDITORS = {
    s1: { cur: 0, total: 4, key: 's1', heading: '选一个开头', cta: '发给好友', placeholder: '自己写一个开头…',
      intro: { t: '写下故事的开头', s: '选一个，或者自己写一个' },
      get options() { return state.dyn.opening || STORY.opening }, next: () => pickFriend(() => catChat1()) },
    s3: { cur: 2, total: 4, key: 's3', heading: '接着往下写', get cta() { return '发给 ' + FNAME(); }, placeholder: '自己写第 3 幕…', dyn: true,
      get ctx() { return { who: `${FNAME()} 写的 · 第 2 幕`, body: J2(), avatar: 'julia' } },
      get options() { return STORY.scene3 }, next: () => catChat2() },
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
  function filmCard(poster = POSTER, side = 'in', total = 8) {
    return `<div class="scard ${side}" data-tap="film">
      <div class="poster"><img src="${poster}"><div class="play"><span>▶</span></div></div>
      <div class="meta">
        <div class="t">🎬 我们的大结局</div>
        <div class="dotsline">${dotsRow(total, total)}<span class="cnt">${total} / ${total}</span></div>
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
    const back = app().querySelector('.chat-head .back'); if (back) back.onclick = () => { chatLog = []; (state.chatBack || landing)(); };
    const t = document.getElementById('thread'); t.scrollTop = t.scrollHeight; return t;
  }
  function msgHTML(m) {
    if (m.profile) return `<div class="chatintro">${favHTML('bigav', 52)}<div class="bn">${m.profile.name}</div><div class="bh">${m.profile.handle}</div><div class="bf">${m.profile.meta}</div></div>`;
    if (m.day != null) return `<div class="daydiv">${m.day}</div>`;
    if (m.in != null) return `<div class="row in">${favHTML('av', 16)}<div class="bubble">${m.in}</div></div>`;
    if (m.out != null) return `<div class="row out"><div class="bubble">${m.out}</div></div>`;
    if (m.film) { const fc = filmCard(m.film.poster, m.film.side, m.film.total); return m.film.side === 'out' ? fc : `<div class="row in cardrow">${favHTML('av', 16)}${fc}</div>`; }
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
  function catChat1() {  // you wrote 幕1; Julia writes 幕2, then hands 幕3 back to you
    if (state.mode === 'build') fetchContinue('j2', [state.scenes.s1].filter(Boolean).join(' '), '接着写第 2 幕');
    state.chatBack = inbox;   // ‹ back here opens the "接力箱" — stories friends sent YOU
    chatLog = [];
    playChat([
      { day: '今天 下午 3:20' },
      { out: '我来写！' },
      { card: { side: 'out', total: 4, title: '你完成了第 1 幕', done: 1, pill: `等待 ${FNAME()} 接力` } },
      { in: '我接好啦，该你写第 3 幕！' },
      { card: { side: 'in', total: 4, title: `${FNAME()} 完成了第 2 幕`, done: 2, pill: '接着写 第 3 幕', go: true, tap: true } },
    ], () => editor(EDITORS.s3));
  }
  function catChat2() {  // you wrote 幕3; Julia finishes 幕4 (结局) + film
    if (state.mode === 'build') fetchContinue('j4', [state.scenes.s1, J2(), state.scenes.s3].filter(Boolean).join(' '), '写故事的大结局第 4 幕，收尾');
    playChat([
      { card: { side: 'out', total: 4, title: '你完成了第 3 幕', done: 3, pill: `等待 ${FNAME()} 收尾` } },
      { card: { side: 'in', total: 4, title: `${FNAME()} 完成了第 4 幕`, done: 4, pill: '已接力' } },
      { in: '我们的大结局也太好看了！🎬' },
      { film: { tap: true, total: 4 } },
    ], () => generating());
  }

  /* ===================== 接力箱 · stories friends sent YOU (reverse relay) ===================== */
  const INBOX = [
    { friend: FRIENDS[1], handle: '@crystal', meta: '12 关注 · 88 粉丝',
      opening: '午夜的便利店，收银员是一只猫。',
      msg: '帮我接着写第 2 幕！🙏',
      options: ['你假装没看见，继续挑关东煮。', '你问猫：今天几点关门？', '你掏出手机想拍照，猫瞪了你一眼。'] },
    { friend: FRIENDS[2], handle: '@theo', meta: '9 关注 · 40 粉丝',
      opening: '实验室爆炸那天，时间倒流了十分钟。',
      msg: '就差一幕，你来续！⏳',
      options: ['你冲回去，想阻止爆炸。', '你愣在原地，看着一切重演。', '你发现只有你记得刚刚发生的事。'] },
  ];
  const ibAv = (f) => f.av ? `<img src="${f.av}">` : `<span style="background:${f.bg}">${f.emoji}</span>`;

  function inbox() {
    chatLog = [];
    render(`<div class="screen">
      ${statusbar()}
      <div class="bar"><span class="back">‹</span><span class="screen-title">接力箱</span></div>
      <div style="margin-top:10px">
        <div class="section-title" style="text-align:left;font-size:22px">好友发来的接力</div>
        <div class="sub" style="margin-top:4px;font-size:15px">轮到你接着写啦</div>
      </div>
      <div class="inbox-list">
        ${INBOX.map((it, i) => `<div class="inbox-row" data-i="${i}">
          <div class="ib-av">${ibAv(it.friend)}</div>
          <div class="ib-meta">
            <div class="ib-name">${it.friend.name}</div>
            <div class="ib-snip">${it.opening}</div>
            <div class="ib-prog">${dotsRow(1, 4)}<span class="cnt">该你写第 2 幕</span></div>
          </div>
          <div class="ib-go">继续</div>
        </div>`).join('')}
      </div>
    </div>`);
    app().querySelector('.back').onclick = landing;
    app().querySelectorAll('.inbox-row').forEach(r => r.onclick = () => incomingChat(INBOX[+r.dataset.i]));
  }

  // a friend handed YOU their story — reverse roles: the incoming card is theirs, you continue it
  function incomingChat(item) {
    chatLog = [];
    state.friend = item.friend;
    state.chatBack = inbox;
    playChat([
      { profile: { name: item.friend.name, handle: item.handle, meta: item.meta } },
      { day: '今天 上午 11:02' },
      { in: item.msg },
      { card: { side: 'in', total: 4, title: `${item.friend.name} 完成了第 1 幕`, done: 1, pill: '接着写 第 2 幕', go: true, tap: true } },
    ], () => incomingEditor(item));
  }
  function incomingEditor(item) {
    editor({
      cur: 1, total: 4, key: 'inbox', heading: '你来续写', placeholder: '自己写这一幕…',
      ctx: { who: `${item.friend.name} 写的 · 第 1 幕`, body: item.opening, avatar: 'friend' },
      options: item.options, cta: '发回 ' + item.friend.name,
      next: () => incomingSent(item),
    });
  }
  function incomingSent(item) {
    playChat([
      { card: { side: 'out', total: 4, title: '你完成了第 2 幕', done: 2, pill: '已发回 ' + item.friend.name } },
      { in: '谢啦！接下来交给我～😎' },
    ]);
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
    document.getElementById('join').onclick = () => editor(WED.w2);
  }

  /* ===================== WHALE flow (Door 1 · 看一个示例 / continue) ===================== */
  const WHALE = {
    julia1: 'Tung Tung Tung Sahur 和朋友发现一头搁浅的巨鲸，决定爬上它的脊背一探究竟。',
    scene2: ['在鲸鱼的头上挖了个洞，钻了进去。', '想合力把鲸鱼推回大海里。', '在鲸鱼背上铺开野餐垫。'],
    julia3: '钻进去才发现，鲸鱼肚子里竟是一整间客厅；这时鲸鱼忽然醒了，海水猛地灌了进来。',
    scene4: ['鲸鱼驮着他们，一路游向夕阳。', '镜头拉远 —— 原来这都是 Sahur 的一场梦。', '他们在鲸鱼背上办了场告别派对。'],
  };
  const WED = {
    w2: { title: 'Julia 的接力', cur: 1, total: 4, key: 'w2', heading: '你来续写', cta: '发回', placeholder: '自己写这一幕…',
      ctx: { who: 'Julia 写的 · 第 1 幕', body: WHALE.julia1, avatar: 'julia' },
      get options() { return WHALE.scene2 }, next: () => whaleChat2() },
    w4: { title: 'Julia 的接力', cur: 3, total: 4, key: 'w4', heading: '你来收尾', cta: '锁定大结局', placeholder: '自己写这一幕…',
      get ctx() { return { who: 'Julia 写的 · 第 3 幕', body: WHALE.julia3, avatar: 'julia' } },
      get options() { return WHALE.scene4 }, next: () => whaleChat3() },
  };

  // receive: Julia hands you 芒果鲸鱼 (she wrote 幕1) → tap 查看 → cover → editor w2
  function whaleStart() {
    chatLog = [];
    state.friend = FRIENDS[0];   // Door 1: the story came from Julia
    playChat([
      { profile: { name: 'Julia', handle: '@julia77', meta: '4 关注 · 51 粉丝' } },
      { day: '今天 下午 3:21' },
      { in: '你一定要帮我把这个写完！😭' },
      { card: { side: 'in', total: 4, poster: WHALE_POSTER, title: 'Julia 完成了第 1 幕', done: 1, pill: '查看', go: true, tap: true } },
    ], () => cover());
  }
  // you wrote 幕2 → Julia writes 幕3 → tap 收尾 → editor w4
  function whaleChat2() {
    playChat([
      { card: { side: 'out', total: 4, poster: WHALE_POSTER, title: '你完成了第 2 幕', done: 2, pill: '等待 Julia 接力' } },
      { card: { side: 'in', total: 4, poster: WHALE_POSTER, title: 'Julia 完成了第 3 幕', done: 3, pill: '收尾', go: true, tap: true } },
    ], () => editor(WED.w4));
  }
  // you finished 幕4 → the film is ready → tap → generate whale film
  function whaleChat3() {
    playChat([
      { card: { side: 'out', total: 4, poster: WHALE_POSTER, title: '你完成了第 4 幕', done: 4, pill: '已锁定' } },
      { out: '我把大结局做出来了！🎬' },
      { film: { poster: WHALE_POSTER, side: 'out', total: 4, tap: true } },
    ], () => generating());
  }

  /* ===================== generating + film ===================== */
  // Template-only prompt: locked style + the full story beats + technical constraints → one 6–10s clip.
  function sceneBeats() {
    const s = state.scenes;
    return [s.s1, J2(), s.s3, J4()].filter(Boolean);
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
    render(`<div class="screen gen-screen">
      ${statusbar()}
      <div class="gen-center">
        <div class="gen-sparkles">
          <img class="spk spk-lg" src="./assets/star.svg" alt="">
        </div>
        <div class="gen-title">正在生成你们的影片…</div>
        <div class="gen-sub" id="gsub">马上就好，请稍候…</div>
      </div>
    </div>`);

    if (state.mode === 'demo') {
      setTimeout(() => showFilm('./assets/finale.mp4'), 2600);   // whale = mango-whale video
      return;
    }
    // build mode → kick off the Runway job, then poll for the result (serverless-friendly)
    const lines = ['马上就好，请稍候…', '正在为第 1 幕打光…', '镜头在动了…', '快好了，正在收尾…'];
    let li = 0; const sub = document.getElementById('gsub');
    const ticker = setInterval(() => { if (!document.getElementById('gsub')) return clearInterval(ticker); li = (li + 1) % lines.length; sub.textContent = lines[li]; }, 4000);
    const done = (url, note) => { clearInterval(ticker); showFilm(url, note); };

    fetch('/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: fullPrompt(), scenes: sceneBeats(), duration: 10, ratio: '720:1280' }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.taskId) return pollFilm(d.taskId, done);
        done(d.videoUrl || './assets/sample.mp4', d.note || (d.mock ? '示例片段' : null));   // mock / immediate
      })
      .catch(() => done('./assets/sample.mp4', '生成失败，播放示例片段。'));
  }

  // poll the server for the Runway task until it's ready — short calls, no held request
  function pollFilm(taskId, done) {
    const deadline = Date.now() + 5 * 60 * 1000;   // give up after 5 min
    const check = () => {
      if (!document.querySelector('.gen-screen')) return;   // user navigated away
      fetch('/api/status?id=' + encodeURIComponent(taskId))
        .then(r => r.json())
        .then(s => {
          if (s.status === 'SUCCEEDED' && s.videoUrl) return done(s.videoUrl, s.mock ? '示例片段' : null);
          if (s.status === 'FAILED') return done('./assets/sample.mp4', '生成失败，播放示例片段。');
          if (Date.now() > deadline) return done('./assets/sample.mp4', '生成超时，播放示例片段。');
          setTimeout(check, 5000);
        })
        .catch(() => { if (Date.now() > deadline) done('./assets/sample.mp4', '生成失败，播放示例片段。'); else setTimeout(check, 5000); });
    };
    setTimeout(check, 5000);   // first check after 5s
  }

  function showFilm(url, note) {
    const title = state.mode === 'demo' ? '芒果鲸鱼 · 大结局' : '我们的故事 · 大结局';
    const poster = state.mode === 'demo' ? `poster="./assets/mango-whale.jpg"` : '';
    render(`<div class="screen endscreen">
      ${statusbar()}
      <div class="bar"><span class="back">‹</span><span class="screen-title">${title}</span></div>
      <div class="bigcard filmcard">
        <video src="${url}" playsinline autoplay muted ${poster}></video>
        <div class="filmplay" id="play"><span>▶</span></div>
      </div>
      ${note ? `<div class="endcap">${note}</div>` : ''}
      <div class="savepub"><button class="cta ghost" id="save">保存</button><button class="cta" id="pub">发布</button></div>
    </div>`);
    const v = app().querySelector('video');
    const play = document.getElementById('play');
    v.addEventListener('playing', () => { play.style.display = 'none'; });   // hide ▶ while it reveals
    play.onclick = () => { v.muted = false; if (v.ended) v.currentTime = 0; v.play(); play.style.display = 'none'; v.controls = true; };
    v.onended = () => { play.querySelector('span').textContent = '↺'; play.style.display = 'grid'; v.controls = false; };
    v.play().catch(() => { play.style.display = 'grid'; });   // muted autoplay reveal; show ▶ if blocked
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
