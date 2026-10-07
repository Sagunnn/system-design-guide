/* Design Lab demo: a scripted run of a photo-sharing app at its daily peak.
   "Goes well": right-sized servers + a cache. "Goes wrong": too few servers (queue, timeouts,
   meltdown), then the panic fix of far too many (idle machines, wasted money, BOOM).
   Requests are little pixel squares hopping along the links; meters and captions tell the story.
   The numbers match the calculator's "Scale a web app" defaults: 1M users × 50 requests a day,
   ×3 at peak ≈ 1,700 req/s, 20 ms of CPU each → 8 servers of 8 vCPU at 60%, + 1 spare. */

(function () {
  'use strict';

  var stage = document.querySelector('[data-demo-stage]');
  if (!stage) return;
  var svg = stage.querySelector('[data-demo-edges]');
  var idle = stage.querySelector('[data-demo-idle]');
  var caption = document.querySelector('[data-demo-caption]');
  var stepEl = caption.querySelector('.demo__step');
  var textEl = caption.querySelector('[data-demo-text]');
  var buttons = document.querySelectorAll('[data-demo-play]');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';

  var icons = {};
  JSON.parse(document.getElementById('lab-data').textContent).components.forEach(function (c) { icons[c.t] = c.icon; });

  var NODES = [
    { id: 'client', t: 'client', kind: 'client', label: 'Users' },
    { id: 'lb', t: 'lb', kind: 'lb', label: 'Load balancer' },
    { id: 'app', t: 'app', kind: 'service', label: 'App servers' },
    { id: 'cache', t: 'cache', kind: 'cache', label: 'Cache' },
    { id: 'db', t: 'sql', kind: 'db', label: 'Database' },
  ];
  // left-to-right on wide screens, top-to-bottom on phones (fractions of the stage)
  var LAYOUT = {
    wide: { client: [0.1, 0.5], lb: [0.31, 0.5], app: [0.53, 0.5], cache: [0.8, 0.22], db: [0.8, 0.78] },
    narrow: { client: [0.5, 0.09], lb: [0.5, 0.32], app: [0.36, 0.57], cache: [0.25, 0.88], db: [0.75, 0.88] },
  };
  function narrow() { return stage.clientWidth < 560; }
  var LINKS = [['client', 'lb'], ['lb', 'app'], ['app', 'cache'], ['app', 'db']];

  var els = {}, timers = [], spawner = null, run = 0, mode = null, pile = [];
  var sim = { rate: 0, hit: 0.8, overload: false };

  function pos(id) {
    var f = LAYOUT[narrow() ? 'narrow' : 'wide'][id];
    return { x: f[0] * stage.clientWidth, y: f[1] * stage.clientHeight };
  }

  function build() {
    stage.querySelectorAll('.lab-node, .demo__pkt, .demo__coin, .demo__pile, .fx-bit, .fx-smoke, .fx-text').forEach(function (e) { e.remove(); });
    svg.textContent = '';
    LINKS.forEach(function (l) {
      var a = pos(l[0]), b = pos(l[1]);
      var line = document.createElementNS(SVGNS, 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      line.setAttribute('class', 'demo__link');
      svg.appendChild(line);
    });
    NODES.forEach(function (n) {
      var el = document.createElement('div');
      el.className = 'lab-node demo__node d-node--' + n.kind;
      var p = pos(n.id);
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.innerHTML = (icons[n.t] || '') + '<span class="lab-node__label"></span><span class="lab-node__count" hidden></span>';
      el.querySelector('.lab-node__label').textContent = n.label;
      if (n.id === 'app' || n.id === 'db') el.insertAdjacentHTML('beforeend', '<span class="demo__cpu"><i></i></span><span class="demo__cpu-label"></span>');
      stage.appendChild(el);
      els[n.id] = el;
    });
    var pl = document.createElement('div');
    pl.className = 'demo__pile';
    var ap = pos('app');
    if (narrow()) {                              // beside the servers, to their right
      pl.style.left = (ap.x + 66) + 'px';
      pl.style.top = (ap.y - 34) + 'px';
    } else {                                     // underneath them
      pl.style.left = (ap.x - 66) + 'px';
      pl.style.top = (ap.y + 46) + 'px';
    }
    stage.appendChild(pl);
    els.pile = pl;
    pile = [];
  }

  function count(id, n) {
    var b = els[id].querySelector('.lab-node__count');
    b.hidden = !n;
    b.textContent = '×' + n;
  }
  function load(id, pct) {
    var el = els[id];
    var bar = el.querySelector('.demo__cpu i');
    bar.style.width = Math.min(100, pct) + '%';
    el.querySelector('.demo__cpu').className = 'demo__cpu ' + (pct > 95 ? 'is-bad' : pct > 75 ? 'is-warn' : 'is-ok');
    el.querySelector('.demo__cpu-label').textContent = (id === 'db' ? 'load ' : 'CPU ') + Math.round(pct) + '%';
  }
  function meter(key, text, state) {
    var m = document.querySelector('[data-meter="' + key + '"]');
    m.querySelector('b').textContent = text;
    m.className = 'demo__meter' + (state ? ' is-' + state : '');
  }
  function say(i, total, text) {
    stepEl.textContent = i + '/' + total;
    textEl.textContent = text;
  }

  /* requests: a square hops along a route; each hop is a short stepped animation */
  function hop(pkt, from, to, ms, done) {
    var a = pos(from), b = pos(to);
    if (reduce || !pkt.animate) { done && done(); return; }
    var anim = pkt.animate([
      { transform: 'translate(' + a.x + 'px,' + a.y + 'px)' },
      { transform: 'translate(' + b.x + 'px,' + b.y + 'px)' },
    ], { duration: ms, easing: 'steps(7)', fill: 'forwards' });
    anim.onfinish = function () { done && done(); };
  }
  function send(myRun) {
    if (reduce || myRun !== run) return;
    var pkt = document.createElement('span');
    pkt.className = 'demo__pkt';
    stage.appendChild(pkt);
    var end = function () { pkt.remove(); };
    hop(pkt, 'client', 'lb', 420, function () {
      if (myRun !== run) return end();
      hop(pkt, 'lb', 'app', 420, function () {
        if (myRun !== run) return end();
        if (sim.overload) {
          // stuck in the queue, then times out and goes back as an error
          if (pile.length < 28) {
            pkt.remove();
            var q = document.createElement('span');
            q.className = 'demo__q';
            els.pile.appendChild(q);
            pile.push(q);
            return;
          }
          pkt.classList.add('is-error');
          return hop(pkt, 'app', 'client', 700, end);
        }
        var to = Math.random() < sim.hit ? 'cache' : 'db';
        pkt.classList.add(to === 'cache' ? 'is-hit' : 'is-db');
        hop(pkt, 'app', to, 420, end);
      });
    });
  }
  function rate(perSecond, myRun) {
    clearInterval(spawner);
    if (!perSecond || reduce) return;
    spawner = setInterval(function () { send(myRun); }, 1000 / perSecond);
  }
  function coins(myRun, n) {
    if (reduce) return;
    var ap = pos('app');
    for (var i = 0; i < n; i++) {
      (function (i) {
        timers.push(setTimeout(function () {
          if (myRun !== run) return;
          var c = document.createElement('span');
          c.className = 'demo__coin';
          c.textContent = '$';
          c.style.left = (ap.x - 40 + Math.random() * 80) + 'px';
          c.style.top = (ap.y - 30) + 'px';
          stage.appendChild(c);
          setTimeout(function () { c.remove(); }, 1500);
        }, i * 140));
      })(i);
    }
  }
  function drainPile() {
    pile.forEach(function (q, i) { setTimeout(function () { q.remove(); }, i * 30); });
    pile = [];
  }
  function fx(id, kind) {
    var el = els[id];
    if (window.sdgFx && el) window.sdgFx(el, stage, el.offsetLeft, el.offsetTop, kind);
  }

  var SCRIPTS = {
    good: [
      [0, function (r) {
        say(1, 4, 'A photo-sharing app hits its daily peak: 1M users × 50 requests a day, ×3 at peak ≈ 1,700 requests a second.');
        count('app', 9); count('lb', 2); load('app', 20); load('db', 10);
        meter('rps', '1.7k/s', 'ok'); meter('p99', '80 ms', 'ok'); meter('err', '0%', 'ok'); meter('cost', '$1.8k', 'ok');
        rate(5, r);
      }],
      [2600, function (r) {
        say(2, 4, 'The load balancer spreads requests over 9 app servers: 8 needed for 20 ms of CPU each, plus 1 spare. Each runs at about 60% CPU, with room for a spike.');
        load('app', 60); rate(9, r);
      }],
      [5600, function () {
        say(3, 4, 'Requests that need data try the cache first (green). It answers 8 in 10, so only a trickle reaches the database (yellow), which stays calm.');
        load('db', 35); meter('p99', '120 ms', 'ok');
      }],
      [9000, function () {
        say(4, 4, 'Right-sized: p99 latency 120 ms, 0% errors, about $1.8k a month. Every machine is earning its keep.');
        fx('lb', 'spot'); setTimeout(function () { fx('app', 'spot'); }, 260); setTimeout(function () { fx('db', 'spot'); }, 520);
      }],
      [13000, function () { finish(); }],
    ],
    bad: [
      [0, function (r) {
        say(1, 5, 'Same app, same 1,700 requests a second at peak. But someone sized it at just 2 app servers.');
        count('app', 2); count('lb', 2); load('app', 70); load('db', 15);
        meter('rps', '1.7k/s', 'ok'); meter('p99', '150 ms', 'ok'); meter('err', '0%', 'ok'); meter('cost', '$400', 'ok');
        rate(9, r);
      }],
      [2200, function () {
        say(2, 5, 'Each server now has 2× more work than it can do. CPU pins at 100% and requests start queueing (the pile under the servers).');
        sim.overload = true; load('app', 100); meter('p99', '1.9 s', 'warn'); meter('err', '8%', 'warn');
      }],
      [5200, function () {
        say(3, 5, 'Latency passes 4 seconds. Clients time out and retry, which adds even more load. 503 errors (red) climb past 50%. Meltdown.');
        meter('p99', '4.3 s', 'bad'); meter('err', '54%', 'bad');
        fx('app', 'under');
      }],
      [8600, function () {
        say(4, 5, 'Panic fix: buy 60 servers! The queue drains and errors stop…');
        sim.overload = false; drainPile(); count('app', 60); load('app', 7);
        meter('p99', '90 ms', 'ok'); meter('err', '0%', 'ok'); meter('cost', '$12k', 'bad');
      }],
      [10800, function (r) {
        say(5, 5, '…but every server idles at 7% CPU. The bill is $12k a month instead of $1.8k: about $10k a month of wasted money. BOOM.');
        coins(r, 14); fx('app', 'over');
      }],
      [15500, function () {
        textEl.textContent = 'Both are sizing mistakes. Estimate from the numbers instead: try "Guess, then reveal" in the calculator below.';
        finish();
      }],
    ],
  };

  function stop() {
    run += 1;
    timers.forEach(clearTimeout);
    timers = [];
    clearInterval(spawner);
    sim.overload = false;
  }
  function finish() {
    clearInterval(spawner);
    buttons.forEach(function (b) { b.disabled = false; });
    stage.classList.remove('is-playing');
  }
  function play(which) {
    stop();
    var myRun = run;
    mode = which;
    idle.hidden = true;
    build();
    stage.classList.add('is-playing');
    buttons.forEach(function (b) { b.disabled = b.dataset.demoPlay === which; });
    SCRIPTS[which].forEach(function (s) {
      timers.push(setTimeout(function () { if (myRun === run) s[1](myRun); }, reduce ? s[0] * 0.6 : s[0]));
    });
  }
  buttons.forEach(function (b) { b.addEventListener('click', function () { play(b.dataset.demoPlay); }); });

  var t;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () { if (mode) { stop(); finish(); build(); } }, 200);
  });
  // stop the animation when the demo scrolls out of view, to save battery
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting && stage.classList.contains('is-playing')) { stop(); finish(); textEl.textContent = 'Paused. Press play to run it again.'; }
    }).observe(stage);
  }
}());
