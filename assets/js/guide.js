/* System Design Guide — behaviour. No dependencies.
   theme toggle · mobile sidebar · progress ticks (localStorage) · self-test cards ·
   search (/search.json) · "On this page" highlighting · flashcard quiz */

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

  /* ---- Flashcard quiz (flashcards page) ------------------------------------------------- */
  var quiz = document.querySelector('[data-quiz]');
  if (quiz) {
    var deck = JSON.parse(document.getElementById('deck').textContent);
    var q = quiz.querySelector('.quiz__q'), a = quiz.querySelector('.quiz__a');
    var meta = quiz.querySelector('.quiz__meta'), reveal = quiz.querySelector('[data-q="reveal"]');
    var grade = quiz.querySelectorAll('[data-q="good"], [data-q="again"]');
    var topicSel = document.querySelector('[data-quiz-topic]');
    var queue = [], seen = 0, right = 0;

    function shuffle(arr) {
      for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    }
    function start() {
      var topic = topicSel.value;
      queue = shuffle(deck.filter(function (c) { return !topic || c.topic === topic; }));
      seen = 0; right = 0;
      quiz.hidden = false;
      next();
    }
    function next() {
      if (!queue.length) {
        q.textContent = 'Deck finished — ' + right + ' of ' + seen + ' right first time.';
        a.hidden = true; reveal.hidden = true;
        grade.forEach(function (b) { b.hidden = true; });
        meta.textContent = 'Pick a topic and press Start to go again.';
        return;
      }
      var c = queue[0];
      q.innerHTML = c.frontHtml;
      a.innerHTML = c.backHtml;
      a.hidden = true; reveal.hidden = false;
      grade.forEach(function (b) { b.hidden = true; });
      meta.textContent = c.topicTitle + ' · ' + queue.length + ' left';
    }
    quiz.addEventListener('click', function (e) {
      var b = e.target.closest('[data-q]');
      if (!b) return;
      var act = b.getAttribute('data-q');
      if (act === 'reveal') {
        a.hidden = false; reveal.hidden = true;
        grade.forEach(function (x) { x.hidden = false; });
      } else {
        var card = queue.shift();
        seen += 1;
        if (act === 'good') right += 1;
        else queue.splice(Math.min(queue.length, 3), 0, card);   // "again": see it again soon
        next();
      }
    });
    document.querySelector('[data-quiz-start]').addEventListener('click', start);
  }
}());
