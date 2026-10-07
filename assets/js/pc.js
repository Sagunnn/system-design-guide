/* SAGUN-OS: the retro computer in the corner.
   A desktop of navigation icons, folders of pages, and a tiny terminal:
     ~/home  ~/design_lab  ~/flashcards  ~/fundamentals/<topic>  ~/practice/<question>
   `cd` into a folder changes directory; `cd` (or `open`) on a page goes there. The window, the
   current directory and the scrollback survive page changes (sessionStorage), so you can keep
   navigating from the terminal. Press ` (backtick) anywhere to open it.
   Sounds are synthesised (no files): a POST beep, disk seeks and a fan hum on open, key clicks
   while typing, seeks on `cd`. A hint with an arrow points at the computer once an hour. */

(function () {
  'use strict';

  var launch = document.querySelector('.pc-launch');
  var win = document.getElementById('pc');
  if (!launch || !win) return;

  var fsData = JSON.parse(document.getElementById('pc-fs').textContent);
  var out = win.querySelector('[data-pc-out]');
  var form = win.querySelector('[data-pc-form]');
  var input = win.querySelector('[data-pc-input]');
  var promptEl = win.querySelector('[data-pc-prompt]');
  var titleEl = win.querySelector('[data-pc-title]');
  var list = win.querySelector('[data-pc-list]');
  var pathEl = win.querySelector('[data-pc-path]');
  var clock = win.querySelector('[data-pc-clock]');
  var KEY = 'sdg-pc';

  /* ---- sound: an old PC, synthesised with Web Audio ---- */
  var soundBtn = win.querySelector('[data-pc-sound]');
  var soundOn = true;
  try { soundOn = localStorage.getItem('sdg-pc-sound') !== 'off'; } catch (e) { /* default on */ }
  var ac = null, hum = null, noiseBuf = null;
  function audio() {
    if (!soundOn) return null;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      if (!noiseBuf) {
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      return ac;
    } catch (e) { return null; }
  }
  function noise(at, dur, freq, q, vol, type) {
    var src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf;
    f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(ac.destination);
    src.start(at, Math.random() * 0.5); src.stop(at + dur + 0.02);
  }
  function beep(at) {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = 'square'; o.frequency.value = 1000;
    g.gain.setValueAtTime(0.035, at); g.gain.setValueAtTime(0.035, at + 0.11); g.gain.linearRampToValueAtTime(0, at + 0.13);
    o.connect(g); g.connect(ac.destination); o.start(at); o.stop(at + 0.14);
  }
  function seeks(at, n) {                       // hard-drive head chatter
    for (var i = 0; i < n; i++) {
      at += 0.03 + Math.random() * 0.07;
      noise(at, 0.018, 2500 + Math.random() * 1800, 3, 0.09);
      if (Math.random() < 0.3) noise(at + 0.01, 0.03, 180, 1, 0.05, 'lowpass');   // the arm landing
    }
  }
  function startHum() {                         // fan spin-up, then a quiet hum while open
    if (hum) return;
    var src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    var o = ac.createOscillator(), og = ac.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = 'lowpass'; f.frequency.setValueAtTime(200, ac.currentTime); f.frequency.linearRampToValueAtTime(700, ac.currentTime + 1.2);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.03, ac.currentTime + 0.8);
    g.gain.exponentialRampToValueAtTime(0.012, ac.currentTime + 2.5);
    o.type = 'sine'; o.frequency.value = 60;   // mains hum
    og.gain.setValueAtTime(0.0001, ac.currentTime); og.gain.exponentialRampToValueAtTime(0.008, ac.currentTime + 1);
    src.connect(f); f.connect(g); g.connect(ac.destination);
    o.connect(og); og.connect(ac.destination);
    src.start(); o.start();
    hum = {
      slow: function () {                       // fan spinning down over ~1.5 s
        var t = ac.currentTime;
        f.frequency.cancelScheduledValues(t); f.frequency.setValueAtTime(f.frequency.value, t); f.frequency.exponentialRampToValueAtTime(60, t + 1.5);
        g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(g.gain.value, 0.012), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        og.gain.cancelScheduledValues(t); og.gain.setValueAtTime(og.gain.value, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        src.stop(t + 1.7); o.stop(t + 1.7);
      },
      stop: function () {
      var t = ac.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      og.gain.cancelScheduledValues(t); og.gain.setValueAtTime(og.gain.value, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      src.stop(t + 0.7); o.stop(t + 0.7);
    } };
  }
  function stopHum() { if (hum) { hum.stop(); hum = null; } }
  function windDown() {
    var t = ac.currentTime;
    noise(t, 0.05, 140, 1, 0.12, 'lowpass');                 // relay / power switch thunk
    noise(t + 0.01, 0.02, 3200, 2, 0.06);
    var o = ac.createOscillator(), g = ac.createGain();         // the CRT's whine dropping away
    o.type = 'triangle';
    o.frequency.setValueAtTime(900, t + 0.02);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.5);
    g.gain.setValueAtTime(0.04, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g); g.connect(ac.destination); o.start(t + 0.02); o.stop(t + 0.6);
  }
  var sfx = {
    boot: function () { if (!audio()) return; var t = ac.currentTime; beep(t + 0.05); seeks(t + 0.25, 12); startHum(); },
    key: function () { if (!audio()) return; noise(ac.currentTime, 0.012, 3000 + Math.random() * 1500, 1.5, 0.05, 'highpass'); },
    seek: function () { if (!audio()) return; seeks(ac.currentTime, 7); },
    off: function () { if (ac) stopHum(); },
    shutdown: function () { if (audio()) windDown(); if (hum) { hum.slow(); hum = null; } },
  };
  function paintSound() {
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.textContent = soundOn ? '♪' : '×♪';
    soundBtn.title = soundOn ? 'Sound on (click to mute)' : 'Sound off (click to unmute)';
  }
  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    try { localStorage.setItem('sdg-pc-sound', soundOn ? 'on' : 'off'); } catch (e) { /* not kept */ }
    paintSound();
    if (soundOn) { if (audio()) startHum(); } else sfx.off();
  });
  paintSound();

  /* ---- the file system ---- */
  var FS = {
    home: { type: 'page', url: '/', title: 'Home & study plan' },
    design_lab: { type: 'page', url: '/lab/', title: 'Design Lab' },
    flashcards: { type: 'page', url: '/flashcards/', title: 'Flashcards & Anki deck' },
    fundamentals: { type: 'dir', title: 'Fundamentals', items: fsData.fundamentals },
    practice: { type: 'dir', title: 'Practice questions', items: fsData.practice },
  };
  var ALIAS = { lab: 'design_lab', designlab: 'design_lab', topics: 'fundamentals', questions: 'practice', cards: 'flashcards', '~': 'home' };

  function norm(s) { return String(s || '').toLowerCase().replace(/\/+$/, '').replace(/-/g, '_'); }
  function entries(dir) {
    if (!dir) return Object.keys(FS).map(function (k) { return { name: k + (FS[k].type === 'dir' ? '/' : ''), title: FS[k].title }; });
    return FS[dir].items.map(function (f) { return { name: f.n, title: f.t }; });
  }
  // find a page or folder by name: relative to the current folder first, then anywhere
  function resolve(name, cwd) {
    var n = norm(name);
    n = ALIAS[n] || n;
    if (cwd) {
      var hit = FS[cwd].items.filter(function (f) { return norm(f.n) === n; })[0];
      if (hit) return { type: 'page', url: hit.u, title: hit.t };
    }
    if (FS[n]) return FS[n].type === 'dir' ? { type: 'dir', dir: n, title: FS[n].title } : FS[n];
    var all = [];
    ['fundamentals', 'practice'].forEach(function (d) {
      FS[d].items.forEach(function (f) { all.push({ type: 'page', url: f.u, title: f.t, n: norm(f.n) }); });
    });
    var exact = all.filter(function (f) { return f.n === n; });
    if (exact.length) return exact[0];
    var pre = all.filter(function (f) { return f.n.indexOf(n) === 0; });
    if (pre.length === 1) return pre[0];
    if (pre.length > 1) return { type: 'many', options: pre };
    return null;
  }

  /* ---- state that survives navigation ---- */
  var state = { open: false, view: 'desk', cwd: '', lines: [], history: [], folder: '' };
  try { Object.assign(state, JSON.parse(sessionStorage.getItem(KEY)) || {}); } catch (e) { /* fresh */ }
  function save() {
    state.lines = state.lines.slice(-60);
    state.history = state.history.slice(-50);
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* not kept */ }
  }

  /* ---- window ---- */
  function show(view) {
    state.view = view;
    win.querySelectorAll('[data-pc-view]').forEach(function (v) { v.hidden = v.dataset.pcView !== view; });
    titleEl.textContent = view === 'term' ? 'TERMINAL' : view === 'folder' ? FS[state.folder].title.toUpperCase() : 'SAGUN-OS';
    if (view === 'term') { renderLines(); setTimeout(function () { input.focus(); }, 0); }
    save();
  }
  function open(view, quiet) {
    if (win.classList.contains('is-off')) { clearTimeout(offTimer); win.classList.remove('is-off'); win.hidden = true; }
    if (win.hidden && !quiet) sfx.boot();
    hideHint(true);
    state.open = true;
    win.hidden = false;
    launch.setAttribute('aria-expanded', 'true');
    tick();
    show(view || state.view || 'desk');
  }
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var offTimer = null;
  function close() {
    if (win.hidden || win.classList.contains('is-off')) return;
    input.value = '';                           // a half-typed line shouldn't come back later
    hIndex = -1;
    sfx.shutdown();
    state.open = false;
    launch.setAttribute('aria-expanded', 'false');
    save();
    launch.focus();
    win.classList.add('is-off');                // CRT collapses to a line, then a dot
    offTimer = setTimeout(function () { win.hidden = true; win.classList.remove('is-off'); }, reduceMotion ? 0 : 650);
  }
  function go(url) {
    sfx.seek();
    save();
    if (location.pathname === url) { print('You\'re already here.', 'dim'); return; }
    window.location.href = url;
  }
  function openFolder(dir) {
    state.folder = dir;
    pathEl.textContent = 'C:\\' + dir.toUpperCase();
    list.innerHTML = FS[dir].items.map(function (f) {
      return '<li><a href="' + f.u + '"' + (location.pathname === f.u ? ' aria-current="page"' : '') + '>' + fsData.file + '<span>' + esc(f.t) + '</span></a></li>';
    }).join('');
    show('folder');
  }

  launch.addEventListener('click', function () { if (win.hidden) open(); else close(); });
  win.querySelector('[data-pc-close]').addEventListener('click', close);
  win.querySelector('[data-pc-back]').addEventListener('click', function () { show('desk'); });
  win.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pc-open]');
    if (!b) return;
    var what = b.dataset.pcOpen;
    if (what === 'terminal') show('term');
    else if (FS[what].type === 'dir') openFolder(what);
    else go(FS[what].url);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !win.hidden) { close(); return; }
    if (e.key === '`' && !e.target.closest('input, textarea, select, [contenteditable]')) {
      e.preventDefault();
      if (win.hidden || state.view !== 'term') open('term'); else close();
    }
  });

  function tick() {
    var d = new Date();
    clock.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  setInterval(function () { if (!win.hidden) tick(); }, 15000);

  /* ---- terminal ---- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function promptText() { return 'sagun@guide:~' + (state.cwd ? '/' + state.cwd : '') + '$'; }
  function print(text, cls) { state.lines.push({ t: text, c: cls || '' }); renderLines(); }
  function renderLines() {
    out.innerHTML = state.lines.map(function (l) {
      return '<p class="pc__ln' + (l.c ? ' is-' + l.c : '') + '">' + esc(l.t) + '</p>';
    }).join('');
    promptEl.textContent = promptText();
    out.scrollTop = out.scrollHeight;
  }

  var COMMANDS = {
    help: function () {
      ['Commands:',
        '  ls                 list this folder',
        '  cd <name>          enter a folder, or go to a page (cd design_lab, cd caching)',
        '  cd .. / cd ~       up a folder / back to the top',
        '  open <name>        go to a page',
        '  pwd                where am I?',
        '  search <words>     search the guide',
        '  theme dark|light   switch colours',
        '  history, clear, whoami, date, neofetch, exit',
        'Tab completes names; ↑ and ↓ go through history.'].forEach(function (l) { print(l, 'dim'); });
    },
    ls: function () {
      entries(state.cwd).forEach(function (e) { print(e.name.padEnd(22) + e.title, e.name.slice(-1) === '/' ? 'dir' : ''); });
    },
    pwd: function () { print('~' + (state.cwd ? '/' + state.cwd : '') + '   (you are reading ' + location.pathname + ')'); },
    cd: function (arg) {
      if (!arg || arg === '~' || arg === '/') { state.cwd = ''; return; }
      if (arg === '..') { state.cwd = ''; return; }
      var r = resolve(arg, state.cwd);
      if (!r) { print('cd: no such page or folder: ' + arg + '   (try ls, or search ' + arg + ')', 'err'); return; }
      if (r.type === 'many') { print('cd: ' + arg + ' matches several:', 'err'); r.options.forEach(function (o) { print('  ' + o.n.replace(/_/g, '-') + '   ' + o.title, 'dim'); }); return; }
      if (r.type === 'dir') { state.cwd = r.dir; print(r.title + ': ' + FS[r.dir].items.length + ' pages. Type ls to see them.', 'dim'); return; }
      print('Opening ' + r.title + '…', 'ok');
      go(r.url);
    },
    open: function (arg) {
      var r = arg && resolve(arg, state.cwd);
      if (!r || r.type !== 'page') { print('open: not a page: ' + (arg || '(nothing)'), 'err'); return; }
      print('Opening ' + r.title + '…', 'ok');
      go(r.url);
    },
    search: function (arg) {
      if (!arg) { print('search: what for? e.g. search hot key', 'err'); return; }
      print('Searching for "' + arg + '"…', 'dim');
      fetch('/search.json').then(function (res) { return res.json(); }).then(function (items) {
        var words = arg.toLowerCase().split(/\s+/);
        var hits = items.filter(function (it) {
          var hay = (it.title + ' ' + it.headings + ' ' + it.text).toLowerCase();
          return words.every(function (w) { return hay.indexOf(w) >= 0; });
        }).slice(0, 6);
        if (!hits.length) { print('No matches.', 'err'); return; }
        hits.forEach(function (h) { print('  ' + h.url.replace(/^\/(topics|practice)\//, '').replace(/\/$/, '').padEnd(22) + h.title); });
        print('Type cd <name> to go there.', 'dim');
      }).catch(function () { print('search: could not load the index.', 'err'); });
    },
    theme: function (arg) {
      if (arg !== 'dark' && arg !== 'light') { print('theme: say theme dark or theme light', 'err'); return; }
      document.documentElement.dataset.theme = arg;
      try { localStorage.setItem('sdg-theme', arg); } catch (e) { /* not kept */ }
      print('Theme: ' + arg + '.', 'ok');
    },
    history: function () { state.history.forEach(function (h, i) { print(String(i + 1).padStart(3) + '  ' + h, 'dim'); }); },
    clear: function () { state.lines = []; },
    whoami: function () { print('a future staff engineer, studying system design'); },
    date: function () { print(new Date().toString()); },
    neofetch: function () {
      ['   ________      sagun@guide',
        '  |  ____  |     -----------',
        '  | |    | |     OS: SAGUN-OS 1.0 (retro)',
        '  | |____| |     Fundamentals: ' + FS.fundamentals.items.length,
        '  |________|     Practice questions: ' + FS.practice.items.length,
        '  [=-=-=-=-]     Shell: sdgsh',
        '                 Uptime: as long as you keep studying'].forEach(function (l) { print(l, 'ok'); });
    },
    exit: function () { close(); },
    sudo: function () { print('sudo: nice try. You have root on your own designs only.', 'err'); },
  };
  COMMANDS.dir = COMMANDS.ls;
  COMMANDS.cls = COMMANDS.clear;
  COMMANDS.man = COMMANDS.help;

  function run(line) {
    line = line.trim();
    print(promptText() + ' ' + line, 'cmd');
    if (!line) return;
    state.history.push(line);
    var parts = line.split(/\s+/), cmd = parts[0].toLowerCase(), arg = parts.slice(1).join(' ');
    if (COMMANDS[cmd]) COMMANDS[cmd](arg);
    else if (resolve(cmd, state.cwd)) COMMANDS.cd(cmd);          // typing just a name goes there
    else print(cmd + ': command not found. Type help.', 'err');
    renderLines();
    save();
  }

  var hIndex = -1;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = input.value;
    input.value = '';
    hIndex = -1;
    run(v);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') sfx.key();
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!state.history.length) return;
      if (hIndex === -1) hIndex = state.history.length;
      hIndex = Math.max(0, Math.min(state.history.length, hIndex + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = state.history[hIndex] || '';
    } else if (e.key === 'Tab') {
      e.preventDefault();
      var parts = input.value.split(/\s+/);
      var last = norm(parts[parts.length - 1]);
      var names = entries(state.cwd).map(function (x) { return x.name.replace(/\/$/, ''); })
        .concat(parts.length === 1 ? Object.keys(COMMANDS) : [])
        .concat(FS.fundamentals.items.concat(FS.practice.items).map(function (f) { return f.n; }));
      var hits = names.filter(function (n, i) { return norm(n).indexOf(last) === 0 && names.indexOf(n) === i; });
      if (hits.length === 1) { parts[parts.length - 1] = hits[0]; input.value = parts.join(' ') + ' '; }
      else if (hits.length > 1) { print(hits.join('   '), 'dim'); }
    }
  });
  out.addEventListener('click', function () { input.focus(); });

  /* ---- restore after a page change ---- */
  if (!state.lines.length) {
    print('SAGUN-OS 1.0. Type help for commands, ls to look around.', 'ok');
    print('Try: cd design_lab, cd fundamentals, cd caching', 'dim');
  }
  if (state.open) {
    open(state.view === 'folder' && !FS[state.folder] ? 'desk' : state.view, true);
    if (state.view === 'folder' && FS[state.folder]) openFolder(state.folder);
    if (state.view === 'term') print('Now reading ' + (document.title.split(' — ')[0] || location.pathname) + '.', 'dim');
  }

  /* ---- once an hour, point at the computer ---- */
  var hint = document.querySelector('[data-pc-hint]');
  var hintTimer = null;
  function hideHint(forGood) {
    if (!hint || hint.hidden) return;
    hint.classList.add('is-leaving');
    setTimeout(function () { hint.hidden = true; hint.classList.remove('is-leaving'); }, 250);
    clearTimeout(hintTimer);
    if (forGood) { try { localStorage.setItem('sdg-pc-hint', String(Date.now())); } catch (e) { /* fine */ } }
  }
  if (hint) {
    var last = 0;
    try { last = Number(localStorage.getItem('sdg-pc-hint')) || 0; } catch (e) { last = Date.now(); }
    if (!state.open && Date.now() - last > 60 * 60 * 1000) {
      setTimeout(function () {
        if (!win.hidden) return;
        hint.hidden = false;
        try { localStorage.setItem('sdg-pc-hint', String(Date.now())); } catch (e) { /* fine */ }
        hintTimer = setTimeout(function () { hideHint(false); }, 9000);
      }, 1400);
    }
    hint.querySelector('[data-pc-hint-open]').addEventListener('click', function () { hideHint(true); open('term'); });
    hint.querySelector('[data-pc-hint-close]').addEventListener('click', function () { hideHint(true); });
  }
}());
