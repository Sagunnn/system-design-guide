/* System Design Guide — behaviour. No dependencies.
   theme toggle · mobile sidebar · progress ticks (localStorage) · self-test cards ·
   search (/search.json) · "On this page" highlighting · flashcard console */

(function () {
  'use strict';

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { return null; }
  }

  /* ---- Theme ------------------------------------------------------------ */
  var themeBtn = document.querySelector('.top__theme');
  themeBtn.addEventListener('click', function () {
    var dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('sdg-theme', next); } catch (e) { /* not remembered */ }
  });

  /* ---- Mobile sidebar ------------------------------------------------------ */
  var menu = document.querySelector('.top__menu');
  var sidebar = document.getElementById('sidebar');
  menu.addEventListener('click', function () {
    var open = sidebar.classList.toggle('is-open');
    menu.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', function (e) {
    if (sidebar.classList.contains('is-open') && !sidebar.contains(e.target) && !menu.contains(e.target)) {
      sidebar.classList.remove('is-open');
      menu.setAttribute('aria-expanded', 'false');
    }
  });

  /* ---- Progress: pages marked as done ------------------------------------------ */
  var done = store('sdg-done') || [];
  function paintProgress() {
    document.querySelectorAll('[data-done-key]').forEach(function (a) {
      a.classList.toggle('is-done', done.indexOf(a.getAttribute('data-done-key')) >= 0);
    });
    document.querySelectorAll('[data-tile]').forEach(function (a) {
      a.classList.toggle('is-done', done.indexOf(a.getAttribute('data-tile')) >= 0);
    });
    ['topic', 'practice'].forEach(function (kind) {
      var el = document.querySelector('[data-progress="' + kind + '"]');
      if (!el) return;
      var links = el.parentNode.nextElementSibling.querySelectorAll('[data-done-key]');
      var n = Array.prototype.filter.call(links, function (a) { return a.classList.contains('is-done'); }).length;
      el.textContent = n ? n + '/' + links.length : '';
    });
    document.querySelectorAll('[data-done]').forEach(function (b) {
      var on = done.indexOf(b.getAttribute('data-done')) >= 0;
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? 'Done' : 'Mark as done';
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-done]');
    if (!b) return;
    var key = b.getAttribute('data-done');
    var i = done.indexOf(key);
    if (i >= 0) done.splice(i, 1); else done.push(key);
    store('sdg-done', done);
    paintProgress();
  });
  paintProgress();

  /* ---- Self-test cards ------------------------------------------------------------ */
  document.addEventListener('click', function (e) {
    var card = e.target.closest('.card');
    if (!card) return;
    card.setAttribute('aria-expanded', String(card.getAttribute('aria-expanded') !== 'true'));
  });

  /* ---- Search ----------------------------------------------------------------------- */
  var input = document.querySelector('.search__input');
  var results = document.querySelector('.search__results');
  var index = null;
  var active = -1;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    return fetch('/search.json').then(function (r) { return r.json(); }).then(function (d) { index = d; return d; });
  }
  function score(item, words) {
    var title = item.title.toLowerCase(), text = item.text;
    var s = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (title.indexOf(w) >= 0) s += 10;
      else if (item.headings.indexOf(w) >= 0) s += 4;
      else if (text.indexOf(w) >= 0) s += 1;
      else return 0;                                  // every word must match somewhere
    }
    return s;
  }
  function show(list) {
    results.textContent = '';
    active = -1;
    if (!list) { results.hidden = true; return; }
    if (!list.length) {
      var li = document.createElement('li');
      li.className = 'search__empty';
      li.textContent = 'No matches. Try another word.';
      results.appendChild(li);
    }
    list.slice(0, 8).forEach(function (item) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = item.url;
      a.textContent = item.title;
      var small = document.createElement('small');
      small.textContent = item.section + ' · ' + item.summary;
      a.appendChild(small);
      li.appendChild(a);
      results.appendChild(li);
    });
    results.hidden = false;
  }
  input.addEventListener('input', function () {
    var words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) { show(null); return; }
    loadIndex().then(function (items) {
      show(items.map(function (it) { return { it: it, s: score(it, words) }; })
        .filter(function (x) { return x.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .map(function (x) { return x.it; }));
    });
  });
  input.addEventListener('focus', loadIndex);
  input.addEventListener('keydown', function (e) {
    var links = results.querySelectorAll('a');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(0, Math.min(links.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
      links.forEach(function (a, i) { a.classList.toggle('is-active', i === active); });
    } else if (e.key === 'Enter' && links.length) {
      window.location.href = links[Math.max(active, 0)].href;
    } else if (e.key === 'Escape') {
      input.value = '';
      show(null);
      input.blur();
    }
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search')) show(null);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !e.target.closest('input, textarea')) { e.preventDefault(); input.focus(); }
  });

  /* ---- "On this page": highlight the section in view ---------------------------------- */
  var tocLinks = document.querySelectorAll('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    tocLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        tocLinks.forEach(function (a) { a.classList.remove('is-active'); });
        if (byId[en.target.id]) byId[en.target.id].classList.add('is-active');
      });
    }, { rootMargin: '-15% 0px -75% 0px' });
    Object.keys(byId).forEach(function (id) {
      var h = document.getElementById(id);
      if (h) spy.observe(h);
    });
  }

  /* ---- Flashcards on the "Study Boy Advance" handheld (flashcards page) --------------------------
     States: off → boot → title → q (question) → a (answer) → … → done. Buttons carry data-key;
     the keyboard works once the console has been clicked or focused. */
  var gb = document.querySelector('[data-gb]');
  if (gb) {
    var deck = JSON.parse(document.getElementById('deck').textContent);
    var metaEl = gb.querySelector('[data-gb-meta]');
    var body = gb.querySelector('[data-gb-body]');
    var hint = gb.querySelector('[data-gb-hint]');
    var cart = document.querySelector('[data-gb-cart]');
    var soundBtn = document.querySelector('[data-gb-sound]');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var state = 'off', queue = [], total = 0, missed = {}, card = null, engaged = false;
    var soundOn = store('sdg-sound') !== false;

    var ac = null;
    function tone(freq, dur, delay) {
      if (!soundOn) return;
      try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        var t = ac.currentTime + (delay || 0);
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = 'square';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.035, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(ac.destination);
        o.start(t); o.stop(t + dur);
      } catch (e) { /* no audio, no problem */ }
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function topicName() { return cart.options[cart.selectedIndex].text.replace(/\s*\(\d+( cards)?\)$/, ''); }
    function topicCount() { var m = cart.options[cart.selectedIndex].text.match(/\((\d+)/); return m ? m[1] : ''; }
    function paint(meta, html, left, right) {
      metaEl.innerHTML = meta;
      body.innerHTML = html;
      body.scrollTop = 0;
      hint.innerHTML = '<span>' + left + '</span><span>' + (right || '') + '</span>';
    }

    function boot() {
      gb.classList.add('is-on');
      if (reduce) { title(); return; }
      state = 'boot';
      paint('', '<p class="gb__boot">STUDY BOY<span>ADVANCE</span></p>', '', '');
      setTimeout(function () { if (state === 'boot') { tone(1046, 0.09); tone(2093, 0.4, 0.09); title(); } }, 1700);
    }
    function title() {
      state = 'title';
      gb.classList.remove('is-answer');
      paint('<span>FLASHCARDS</span><span>' + deck.length + ' CARDS</span>',
        '<div class="gb__title"><p class="gb__logo-scr">SYSTEM<br><em>DESIGN</em></p>' +
        '<p class="gb__cart"><span>◄</span><b>' + esc(topicName()) + '</b><span>►</span></p>' +
        '<p class="gb__small">' + topicCount() + ' cards</p><p class="blink">PRESS START</p></div>',
        '◄► L R:TOPIC', 'START:PLAY');
    }
    function play() {
      var t = cart.value;
      queue = deck.filter(function (c) { return !t || c.topic === t; });
      for (var i = queue.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = queue[i]; queue[i] = queue[j]; queue[j] = x; }
      total = queue.length;
      missed = {};
      ask();
    }
    function bar() {
      var pct = total ? Math.round(100 * (total - queue.length) / total) : 0;
      return '<span>' + esc(card.topicTitle) + '</span><span>' + (total - queue.length) + '/' + total + '</span><span class="gb__bar"><i style="width:' + pct + '%"></i></span>';
    }
    function ask() {
      gb.classList.remove('is-answer');
      if (!queue.length) { done(); return; }
      card = queue[0];
      state = 'q';
      paint(bar(), '<p class="gb__q">' + card.frontHtml + '</p>', 'A:FLIP', 'START:MENU');
    }
    function flip() {
      state = 'a';
      gb.classList.add('is-answer');
      paint(bar(), '<p class="gb__q">' + card.frontHtml + '</p><div class="gb__a">' + card.backHtml + '</div>', 'A:GOT IT', 'B:AGAIN');
    }
    function grade(ok) {
      queue.shift();
      if (ok) { tone(1318, 0.07); tone(1760, 0.1, 0.07); }
      else { missed[card.frontHtml] = true; queue.splice(Math.min(queue.length, 3), 0, card); tone(196, 0.16); }
      ask();
    }
    function done() {
      state = 'done';
      var first = total - Object.keys(missed).length;
      [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.12, i * 0.1); });
      paint('<span>' + esc(topicName()) + '</span>',
        '<div class="gb__title"><p class="gb__logo-scr">DECK<br><em>CLEAR!</em></p><p class="gb__small">' + first + ' of ' + total + ' right first try</p><p class="blink">PRESS START</p></div>',
        '', 'START:MENU');
    }
    function shiftTopic(step) {
      var n = cart.options.length;
      cart.selectedIndex = (cart.selectedIndex + step + n) % n;
      title();
    }

    function press(key) {
      if (state === 'off') return;
      tone(key === 'b' ? 440 : 880, 0.04);
      if (key === 'up' || key === 'down') { body.scrollBy(0, key === 'up' ? -48 : 48); return; }
      if (state === 'boot') { title(); return; }
      if (state === 'title') {
        if (key === 'left') shiftTopic(-1);
        else if (key === 'right' || key === 'select') shiftTopic(1);
        else if (key === 'start' || key === 'a') play();
      } else if (state === 'q') {
        if (key === 'a') flip();
        else if (key === 'b') grade(false);
        else if (key === 'start') title();
      } else if (state === 'a') {
        if (key === 'a') grade(true);
        else if (key === 'b') grade(false);
        else if (key === 'start') title();
      } else if (state === 'done') {
        if (key === 'start' || key === 'a') title();
      }
    }

    gb.addEventListener('click', function (e) {
      var b = e.target.closest('[data-key]');
      if (!b) return;
      press(b.getAttribute('data-key'));
      // after a mouse/touch press, park focus on the screen so Enter means START, not "this button again"
      if (e.detail > 0) gb.querySelector('.gb__screen').focus({ preventScroll: true });
    });
    gb.addEventListener('pointerdown', function () { engaged = true; });
    gb.addEventListener('focusin', function () { engaged = true; });
    document.addEventListener('pointerdown', function (e) { if (!gb.contains(e.target)) engaged = false; });
    var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', x: 'a', X: 'a', z: 'b', Z: 'b', Enter: 'start', Shift: 'select' };
    document.addEventListener('keydown', function (e) {
      var key = KEYS[e.key];
      if (!engaged || !key || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, select, textarea')) return;
      if (e.key === 'Enter' && e.target.closest('button, a')) return;   // let Enter activate the focused control
      e.preventDefault();
      var btn = gb.querySelector('[data-key="' + key + '"]');
      if (btn) { btn.classList.add('is-down'); setTimeout(function () { btn.classList.remove('is-down'); }, 120); }
      press(key);
    });
    cart.addEventListener('change', function () { if (state !== 'off' && state !== 'boot') title(); });

    function paintSound() {
      soundBtn.textContent = '♪ Sound: ' + (soundOn ? 'on' : 'off');
      soundBtn.setAttribute('aria-pressed', String(soundOn));
    }
    soundBtn.addEventListener('click', function () { soundOn = !soundOn; store('sdg-sound', soundOn); paintSound(); });
    paintSound();

    // switch on when the console scrolls into view
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { io.disconnect(); setTimeout(boot, 250); }
      }, { threshold: 0.4 });
      io.observe(gb);
    } else {
      boot();
    }
  }
}());
