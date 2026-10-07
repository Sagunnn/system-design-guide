/* "See it in action" demos: scripted traffic animations, one per page (data in src/_data/demos.js,
   embedded as JSON in each .demo). Requests are pixel squares hopping along the links; each run is a
   list of timed steps that change the traffic, routes, loads, meters and caption, and trigger the
   shared effects in fx.js (meltdown, blast, nice). Pauses when scrolled away; reduced motion skips
   the moving parts but keeps captions and meters. */

(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function init(root) {
    var cfg = JSON.parse(root.querySelector('.demo__data').textContent);
    var stage = root.querySelector('[data-demo-stage]');
    var svg = root.querySelector('[data-demo-edges]');
    var idle = root.querySelector('[data-demo-idle]');
    var stepEl = root.querySelector('.demo__step');
    var textEl = root.querySelector('[data-demo-text]');
    var buttons = root.querySelectorAll('[data-demo-play]');
    var els = {}, timers = [], spawner = null, run = 0, playing = false, built = false;
    var sim = { routes: [], queue: null, dead: {} }, pile = [];
    var NODE = {};
    cfg.nodes.forEach(function (n) { NODE[n.id] = n; });

    function narrow() { return stage.clientWidth < 560; }
    function pos(id) {
      var f = narrow() ? NODE[id].n : NODE[id].at;
      return { x: f[0] * stage.clientWidth, y: f[1] * stage.clientHeight };
    }

    function build() {
      stage.querySelectorAll('.lab-node, .demo__pkt, .demo__coin, .demo__pile, .fx-bit, .fx-smoke, .fx-text').forEach(function (e) { e.remove(); });
      svg.textContent = '';
      cfg.links.forEach(function (l) {
        var a = pos(l[0]), b = pos(l[1]);
        var line = document.createElementNS(SVGNS, 'line');
        line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
        line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
        line.setAttribute('class', 'demo__link');
        svg.appendChild(line);
      });
      cfg.nodes.forEach(function (n) {
        var el = document.createElement('div');
        el.className = 'lab-node demo__node d-node--' + n.kind;
        var p = pos(n.id);
        el.style.left = p.x + 'px';
        el.style.top = p.y + 'px';
        el.innerHTML = n.icon + '<span class="lab-node__label"></span><span class="lab-node__count" hidden></span>' +
          (n.bar ? '<span class="demo__cpu"><i></i></span><span class="demo__cpu-label"></span>' : '');
        el.querySelector('.lab-node__label').textContent = n.label;
        stage.appendChild(el);
        els[n.id] = el;
      });
      pile = [];
      sim = { routes: [], queue: null, dead: {} };
      built = true;
    }

    /* ---- the pieces a step can change ---- */
    function setLoad(id, pct) {
      var el = els[id], n = NODE[id];
      if (!el || !n.bar) return;
      el.querySelector('.demo__cpu i').style.width = Math.min(100, pct) + '%';
      el.querySelector('.demo__cpu').className = 'demo__cpu ' + (pct > 95 ? 'is-bad' : pct > 75 ? 'is-warn' : 'is-ok');
      el.querySelector('.demo__cpu-label').textContent = (n.bar === 'cpu' ? 'CPU ' : 'load ') + Math.round(pct) + '%';
    }
    function setCount(id, v) {
      var b = els[id].querySelector('.lab-node__count');
      b.hidden = !v;
      b.textContent = '×' + v;
    }
    function setMeter(key, val) {
      var m = root.querySelector('[data-meter="' + key + '"]');
      if (!m) return;
      m.querySelector('b').textContent = val[0];
      m.className = 'demo__meter' + (val[1] ? ' is-' + val[1] : '');
    }
    function setQueue(id) {
      sim.queue = id;
      root.querySelectorAll('.demo__pile').forEach(function (p) { p.remove(); });
      pile = [];
      if (!id) return;
      var pl = document.createElement('div');
      pl.className = 'demo__pile';
      var p = pos(id);
      if (narrow()) { pl.style.left = (p.x + 62) + 'px'; pl.style.top = (p.y - 30) + 'px'; pl.classList.add('is-side'); }
      else { pl.style.left = (p.x - 66) + 'px'; pl.style.top = (p.y + 44) + 'px'; }
      stage.appendChild(pl);
      els.__pile = pl;
    }
    function drain() {
      var old = pile;
      pile = [];
      old.forEach(function (q, i) { setTimeout(function () { q.remove(); }, i * 35); });
    }
    function coins(id, myRun) {
      if (reduce) return;
      var p = pos(id);
      for (var i = 0; i < 14; i++) {
        timers.push(setTimeout(function () {
          if (myRun !== run) return;
          var c = document.createElement('span');
          c.className = 'demo__coin';
          c.textContent = '$';
          c.style.left = (p.x - 40 + Math.random() * 80) + 'px';
          c.style.top = (p.y - 30) + 'px';
          stage.appendChild(c);
          setTimeout(function () { c.remove(); }, 1500);
        }, i * 140));
      }
    }
    function effect(id, kind) {
      var el = els[id];
      if (window.sdgFx && el) window.sdgFx(el, stage, el.offsetLeft, el.offsetTop, kind);
    }

    /* ---- requests ---- */
    function hop(pkt, from, to, done) {
      var a = pos(from), b = pos(to);
      var ms = Math.max(260, Math.hypot(b.x - a.x, b.y - a.y) * 2.1);
      var anim = pkt.animate([
        { transform: 'translate(' + a.x + 'px,' + a.y + 'px)' },
        { transform: 'translate(' + b.x + 'px,' + b.y + 'px)' },
      ], { duration: ms, easing: 'steps(7)', fill: 'forwards' });
      anim.onfinish = done;
    }
    function bounce(pkt, from, to) {
      pkt.className = 'demo__pkt is-error';
      hop(pkt, from, to, function () { pkt.remove(); });
    }
    function send(myRun) {
      if (myRun !== run || !sim.routes.length) return;
      var r = Math.random(), acc = 0, route = sim.routes[sim.routes.length - 1];
      for (var i = 0; i < sim.routes.length; i++) { acc += sim.routes[i].p; if (r <= acc) { route = sim.routes[i]; break; } }
      var path = route.path;
      var pkt = document.createElement('span');
      pkt.className = 'demo__pkt' + (route.cls ? ' is-' + route.cls : '');
      if (route.back) pkt.className = 'demo__pkt';
      var start = pos(path[0]);
      pkt.style.transform = 'translate(' + start.x + 'px,' + start.y + 'px)';
      stage.appendChild(pkt);
      (function step(i) {
        if (myRun !== run) { pkt.remove(); return; }
        var here = path[i];
        if (sim.dead[here]) return bounce(pkt, here, path[0]);
        if (sim.queue === here && i > 0) {
          if (pile.length < 28) {
            pkt.remove();
            var q = document.createElement('span');
            q.className = 'demo__q';
            els.__pile.appendChild(q);
            pile.push(q);
            return;
          }
          return bounce(pkt, here, path[0]);
        }
        if (i === path.length - 1) {
          if (route.back) return bounce(pkt, here, path[0]);
          pkt.remove();
          return;
        }
        hop(pkt, here, path[i + 1], function () { step(i + 1); });
      })(0);
    }
    function setRate(perSecond, myRun) {
      clearInterval(spawner);
      if (!perSecond || reduce || !Element.prototype.animate) return;
      spawner = setInterval(function () { send(myRun); }, 1000 / perSecond);
    }

    function apply(s, myRun, total, index) {
      if (s.say) { stepEl.textContent = (index + 1) + '/' + total; textEl.textContent = s.say; }
      if (s.routes) sim.routes = s.routes;
      if ('queue' in s) setQueue(s.queue);
      if (s.drain) drain();
      (s.dead || []).forEach(function (id) { sim.dead[id] = true; els[id].classList.add('is-dead'); });
      (s.alive || []).forEach(function (id) { delete sim.dead[id]; els[id].classList.remove('is-dead'); });
      Object.keys(s.label || {}).forEach(function (id) { els[id].querySelector('.lab-node__label').textContent = s.label[id]; });
      Object.keys(s.load || {}).forEach(function (id) { setLoad(id, s.load[id]); });
      Object.keys(s.count || {}).forEach(function (id) { setCount(id, s.count[id]); });
      Object.keys(s.meters || {}).forEach(function (k) { setMeter(k, s.meters[k]); });
      (s.fx || []).forEach(function (f) { timers.push(setTimeout(function () { if (myRun === run) effect(f[0], f[1]); }, f[2] || 0)); });
      if (s.coins) coins(s.coins, myRun);
      if ('rate' in s) setRate(s.rate, myRun);
      if (s.end) finish();
    }

    function stop() {
      run += 1;
      timers.forEach(clearTimeout);
      timers = [];
      clearInterval(spawner);
    }
    function finish() {
      clearInterval(spawner);
      playing = false;
      buttons.forEach(function (b) { b.disabled = false; });
      stage.classList.remove('is-playing');
    }
    function play(which) {
      stop();
      var myRun = run;
      idle.hidden = true;
      build();
      cfg.meters.forEach(function (m) { setMeter(m[0], ['–', '']); });
      playing = true;
      stage.classList.add('is-playing');
      buttons.forEach(function (b) { b.disabled = b.dataset.demoPlay === which; });
      var steps = cfg[which].steps, said = steps.filter(function (s) { return s.say; }).length, n = 0;
      steps.forEach(function (s) {
        var index = s.say ? n++ : n - 1;
        timers.push(setTimeout(function () { if (myRun === run) apply(s, myRun, said, index); }, reduce ? s.at * 0.6 : s.at));
      });
    }
    buttons.forEach(function (b) { b.addEventListener('click', function () { play(b.dataset.demoPlay); }); });

    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        if (!built) return;
        stop(); finish(); build();
        textEl.textContent = 'Resized. Press play to run it again.';
        stepEl.textContent = '';
      }, 200);
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting && playing) {
          stop(); finish();
          stepEl.textContent = '';
          textEl.textContent = 'Paused. Press play to run it again.';
        }
      }).observe(stage);
    }
  }

  document.querySelectorAll('.demo[data-demo]').forEach(init);
}());
