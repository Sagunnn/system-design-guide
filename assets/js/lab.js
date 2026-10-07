/* Design Lab: drag components onto a canvas, connect them, and get the design rated.
   Data (components + scoring rules per scenario) comes from <script id="lab-data">, written by the build.
   Each scenario's canvas and calculator inputs are saved in localStorage ("sdg-lab:<id>").
   Links are scored undirected. Boxes can name a technology (Postgres, Kafka…), which feeds both the
   rating (fit for the scenario) and the capacity calculator (per-node limits). */

(function () {
  'use strict';

  var data = JSON.parse(document.getElementById('lab-data').textContent);
  var canvas = document.querySelector('[data-lab-canvas]');
  var edgesG = canvas.querySelector('[data-lab-edges]');
  var temp = canvas.querySelector('[data-lab-temp]');
  var empty = canvas.querySelector('[data-lab-empty]');
  var pick = document.querySelector('[data-lab-scenario]');
  var fromSel = document.querySelector('[data-lab-from]');
  var toSel = document.querySelector('[data-lab-to]');
  var result = document.querySelector('[data-lab-result]');
  var modelBtn = document.querySelector('[data-lab-model]');
  var SVGNS = 'http://www.w3.org/2000/svg';

  var COMP = {};
  data.components.forEach(function (c) { COMP[c.t] = c; });
  var SCEN = {};
  data.scenarios.forEach(function (s) { SCEN[s.id] = s; });

  var state = { id: null, nodes: [], edges: [], seq: 0, calc: null };
  var ASSUME = { l7rps: data.profiles.lb.l7.rps, l4rps: data.profiles.lb.l4.rps, connsPerGw: 50000, redisGB: 25 };

  /* ---- Storage ------------------------------------------------------------- */
  function save() {
    try { localStorage.setItem('sdg-lab:' + state.id, JSON.stringify({ nodes: state.nodes, edges: state.edges, seq: state.seq, calc: state.calc })); } catch (e) { /* not saved */ }
  }
  function load(id) {
    state.id = id;
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('sdg-lab:' + id)); } catch (e) { saved = null; }
    state.nodes = (saved && saved.nodes) || [];
    state.edges = (saved && saved.edges) || [];
    state.seq = (saved && saved.seq) || 0;
    state.calc = Object.assign({}, SCEN[id].calc, ASSUME, (saved && saved.calc) || {});
    state.nodes = state.nodes.filter(function (n) { return COMP[n.t]; });
  }

  /* ---- Rendering ---------------------------------------------------------- */
  function nodeById(id) { for (var i = 0; i < state.nodes.length; i++) if (state.nodes[i].id === id) return state.nodes[i]; return null; }
  function elFor(id) { return canvas.querySelector('.lab-node[data-id="' + id + '"]'); }
  function displayName(n) {
    var same = state.nodes.filter(function (m) { return m.t === n.t; });
    return COMP[n.t].label + (same.length > 1 ? ' ' + (same.indexOf(n) + 1) : '');
  }
  function clampNode(n) {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    var hw = w < 600 ? 62 : 72;                // half a box plus room for the badge and handle
    n.x = Math.max(hw, Math.min(w - hw, n.x));
    n.y = Math.max(40, Math.min(h - 40, n.y));
  }

  function render() {
    canvas.querySelectorAll('.lab-node').forEach(function (el) { el.remove(); });
    state.nodes.forEach(function (n) {
      clampNode(n);
      var c = COMP[n.t];
      var el = document.createElement('div');
      el.className = 'lab-node d-node--' + c.kind;
      el.dataset.id = n.id;
      el.tabIndex = 0;
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', displayName(n) + '. Press Delete to remove.');
      el.style.left = n.x + 'px';
      el.style.top = n.y + 'px';
      el.innerHTML = '<span class="lab-node__label"></span>' +
        '<button class="lab-node__x" type="button" aria-label="Remove">×</button>' +
        '<span class="lab-node__out" title="Drag to another box to connect"></span>' +
        '<span class="lab-node__count" hidden></span>';
      el.firstChild.textContent = displayName(n);
      if (c.tech) {
        var sel = document.createElement('select');
        sel.className = 'lab-node__tech';
        sel.setAttribute('aria-label', 'Technology for ' + displayName(n));
        c.tech.forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o.k;
          opt.textContent = o.label;
          sel.appendChild(opt);
        });
        sel.value = n.tech || c.tech[0].k;
        el.insertBefore(sel, el.children[1]);
      }
      canvas.appendChild(el);
    });
    empty.hidden = state.nodes.length > 0;
    drawEdges();
    fillSelects();
    runCalc();
  }

  // where the line from a box's centre towards (tx, ty) leaves the box
  function exitPoint(el, tx, ty) {
    var cx = el.offsetLeft, cy = el.offsetTop;       // boxes are centred on left/top (translate -50%)
    var hw = el.offsetWidth / 2 + 3, hh = el.offsetHeight / 2 + 3;
    var dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    var s = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
    return { x: cx + dx * s, y: cy + dy * s };
  }
  function drawEdges() {
    edgesG.textContent = '';
    state.edges.forEach(function (e, i) {
      var a = elFor(e.a), b = elFor(e.b);
      if (!a || !b) return;
      var p = exitPoint(a, b.offsetLeft, b.offsetTop), q = exitPoint(b, a.offsetLeft, a.offsetTop);
      var d = 'M' + p.x + ' ' + p.y + 'L' + q.x + ' ' + q.y;
      var hit = document.createElementNS(SVGNS, 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('class', 'lab__hit');
      hit.dataset.edge = i;
      var t = document.createElementNS(SVGNS, 'title');
      t.textContent = 'Click to remove this link';
      hit.appendChild(t);
      var line = document.createElementNS(SVGNS, 'path');
      line.setAttribute('d', d);
      line.setAttribute('class', 'lab__edge');
      line.setAttribute('marker-end', 'url(#lab-arrow)');
      edgesG.appendChild(line);
      edgesG.appendChild(hit);
    });
  }
  function fillSelects() {
    [fromSel, toSel].forEach(function (sel, k) {
      var keep = sel.value;
      sel.textContent = '';
      var none = document.createElement('option');
      none.value = '';
      none.textContent = state.nodes.length ? (k ? 'to…' : 'from…') : 'add components first';
      sel.appendChild(none);
      state.nodes.forEach(function (n) {
        var o = document.createElement('option');
        o.value = n.id;
        o.textContent = displayName(n);
        sel.appendChild(o);
      });
      sel.value = nodeById(keep) ? keep : '';
    });
  }

  /* ---- Editing -------------------------------------------------------------- */
  function freeSpot() {
    var w = canvas.clientWidth, cols = Math.max(1, Math.floor((w - 40) / 150));
    var i = state.nodes.length;
    return { x: 80 + (i % cols) * 150, y: 56 + Math.floor(i / cols) * 104 };
  }
  function addNode(t, x, y) {
    var spot = x === undefined ? freeSpot() : { x: x, y: y };
    state.seq += 1;
    state.nodes.push({ id: 'n' + state.seq, t: t, x: Math.round(spot.x), y: Math.round(spot.y) });
    save();
    render();
    hideVerdict();
  }
  function removeNode(id) {
    state.nodes = state.nodes.filter(function (n) { return n.id !== id; });
    state.edges = state.edges.filter(function (e) { return e.a !== id && e.b !== id; });
    save();
    render();
    hideVerdict();
  }
  function addEdge(a, b) {
    if (!a || !b || a === b) return;
    var dup = state.edges.some(function (e) { return (e.a === a && e.b === b) || (e.a === b && e.b === a); });
    if (dup) return;
    state.edges.push({ a: a, b: b });
    save();
    drawEdges();
    hideVerdict();
  }
  function hideVerdict() { result.hidden = true; }

  /* palette: drag a chip onto the canvas, or click / tap / Enter to add it */
  var ghost = null, dragged = false;
  document.querySelectorAll('.lab__chip').forEach(function (chip) {
    var sx = 0, sy = 0;
    chip.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      sx = e.clientX; sy = e.clientY; dragged = false;
      chip.setPointerCapture(e.pointerId);
    });
    chip.addEventListener('pointermove', function (e) {
      if (!chip.hasPointerCapture(e.pointerId)) return;
      if (!ghost && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 6) {
        dragged = true;
        ghost = chip.cloneNode(true);
        ghost.className += ' lab__ghost';
        document.body.appendChild(ghost);
      }
      if (ghost) { ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; }
    });
    chip.addEventListener('pointerup', function (e) {
      if (!ghost) return;
      ghost.remove(); ghost = null;
      var r = canvas.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        addNode(chip.dataset.type, e.clientX - r.left, e.clientY - r.top);
      }
    });
    chip.addEventListener('pointercancel', function () { if (ghost) { ghost.remove(); ghost = null; } });
    chip.addEventListener('click', function () {
      if (dragged) { dragged = false; return; }
      addNode(chip.dataset.type);
    });
  });

  /* canvas: move boxes, pull links from the ● handle, remove boxes and links */
  var drag = null;
  canvas.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('.lab-node');
    if (!el || e.target.closest('.lab-node__x, .lab-node__tech')) return;
    e.preventDefault();
    var r = canvas.getBoundingClientRect();
    if (e.target.closest('.lab-node__out')) {
      drag = { mode: 'link', from: el.dataset.id, el: el };
      temp.setAttribute('x1', el.offsetLeft);
      temp.setAttribute('y1', el.offsetTop);
      temp.setAttribute('x2', e.clientX - r.left);
      temp.setAttribute('y2', e.clientY - r.top);
      temp.removeAttribute('hidden');
    } else {
      var n = nodeById(el.dataset.id);
      drag = { mode: 'move', node: n, el: el, dx: e.clientX - r.left - n.x, dy: e.clientY - r.top - n.y };
      el.classList.add('is-dragging');
    }
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var r = canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    if (drag.mode === 'move') {
      drag.node.x = x - drag.dx;
      drag.node.y = y - drag.dy;
      clampNode(drag.node);
      drag.el.style.left = drag.node.x + 'px';
      drag.el.style.top = drag.node.y + 'px';
      drawEdges();
    } else {
      temp.setAttribute('x2', x);
      temp.setAttribute('y2', y);
      canvas.querySelectorAll('.lab-node.is-target').forEach(function (n) { n.classList.remove('is-target'); });
      var over = document.elementFromPoint(e.clientX, e.clientY);
      over = over && over.closest('.lab-node');
      if (over && over !== drag.el) over.classList.add('is-target');
    }
  });
  function endDrag(e) {
    if (!drag) return;
    if (drag.mode === 'move') {
      drag.el.classList.remove('is-dragging');
      drag.node.x = Math.round(drag.node.x);
      drag.node.y = Math.round(drag.node.y);
      save();
    } else {
      temp.setAttribute('hidden', '');
      canvas.querySelectorAll('.lab-node.is-target').forEach(function (n) { n.classList.remove('is-target'); });
      var over = e.type === 'pointerup' && document.elementFromPoint(e.clientX, e.clientY);
      over = over && over.closest('.lab-node');
      if (over) addEdge(drag.from, over.dataset.id);
    }
    drag = null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('click', function (e) {
    var x = e.target.closest('.lab-node__x');
    if (x) { removeNode(x.closest('.lab-node').dataset.id); return; }
    var hit = e.target.closest('.lab__hit');
    if (hit) {
      state.edges.splice(Number(hit.dataset.edge), 1);
      save();
      drawEdges();
      hideVerdict();
    }
  });
  canvas.addEventListener('change', function (e) {
    var sel = e.target.closest('.lab-node__tech');
    if (!sel) return;
    nodeById(sel.closest('.lab-node').dataset.id).tech = sel.value;
    save();
    runCalc();
    hideVerdict();
  });
  canvas.addEventListener('keydown', function (e) {
    if (e.target.closest('.lab-node__tech')) return;
    var el = e.target.closest('.lab-node');
    if (el && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeNode(el.dataset.id); }
  });
  document.querySelector('[data-lab-link]').addEventListener('click', function () {
    addEdge(fromSel.value, toSel.value);
    toSel.value = '';
  });
  document.querySelector('[data-lab-clear]').addEventListener('click', function () {
    if (state.nodes.length && !window.confirm('Clear the canvas for this scenario?')) return;
    state.nodes = []; state.edges = []; state.seq = 0;   // calculator inputs are kept
    save(); render(); hideVerdict();
  });
  var resizeTimer;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });

  /* ---- Scoring ------------------------------------------------------------------ */
  function set(s) { return s.split('|'); }
  function names(s) { return set(s).map(function (t) { return COMP[t].label; }).join(' or '); }
  function typeOf(id) { var n = nodeById(id); return n && n.t; }
  function has(s) { var ts = set(s); return state.nodes.some(function (n) { return ts.indexOf(n.t) >= 0; }); }
  function count(t) { return state.nodes.filter(function (n) { return n.t === t; }).length; }
  function linked(a, b) {
    var A = set(a), B = set(b);
    return state.edges.some(function (e) {
      var x = typeOf(e.a), y = typeOf(e.b);
      return (A.indexOf(x) >= 0 && B.indexOf(y) >= 0) || (A.indexOf(y) >= 0 && B.indexOf(x) >= 0);
    });
  }
  function ruleMet(r) { return r.t ? has(r.t) : linked(r.a, r.b); }
  function ruleName(r) { return r.t ? names(r.t) : names(r.a) + ' ↔ ' + names(r.b); }

  function score(s) {
    var max = 0, earned = 0, plus = 0, minus = 0, ok = [], miss = [], bad = [];
    (s.need || []).forEach(function (r) {
      max += r.pts;
      if (has(r.t)) { earned += r.pts; ok.push({ name: names(r.t), why: r.why }); }
      else miss.push({ name: 'Add ' + names(r.t), why: r.why });
    });
    (s.min || []).forEach(function (r) {
      max += r.pts;
      var label = r.n + '+ × ' + COMP[r.t].label;
      if (count(r.t) >= r.n) { earned += r.pts; ok.push({ name: label, why: r.why }); }
      else miss.push({ name: 'Use ' + label, why: r.why });
    });
    (s.link || []).forEach(function (r) {
      max += r.pts;
      if (linked(r.a, r.b)) { earned += r.pts; ok.push({ name: names(r.a) + ' → ' + names(r.b), why: r.why }); }
      else miss.push({ name: 'Connect ' + names(r.a) + ' → ' + names(r.b), why: r.why });
    });
    (s.bonus || []).forEach(function (r) {
      if (ruleMet(r)) { plus += r.pts; ok.push({ name: '★ ' + ruleName(r), why: r.why, bonus: true }); }
    });
    (s.avoid || []).forEach(function (r) {
      var hit = r.t ? has(r.t) && !(r.unless && has(r.unless)) : linked(r.a, r.b);
      if (hit) { minus += r.pts; bad.push({ name: ruleName(r), why: r.why }); }
    });
    (s.fit || []).forEach(function (r) {
      var chosen = state.nodes.filter(function (n) { return n.t === r.t && n.tech; }).map(function (n) { return n.tech; });
      var label = function (k) { return COMP[r.t].tech.filter(function (o) { return o.k === k; })[0].label; };
      var good = chosen.filter(function (k) { return r.best.indexOf(k) >= 0; });
      if (good.length) { plus += 3; ok.push({ name: '★ ' + label(good[0]) + ' for ' + COMP[r.t].label, why: r.why, bonus: true }); }
      chosen.forEach(function (k) {
        if (r.poor && r.poor[k]) { minus += 4; bad.push({ name: label(k) + ' for ' + COMP[r.t].label, why: r.poor[k] }); }
      });
    });
    if (linked('client', 'sql|nosql|replica|cache|search|geo')) {
      minus += 10;
      bad.push({ name: 'Client → data store', why: 'Clients never talk to databases or caches directly. Put an app tier in between for auth, validation and connection pooling.' });
    }
    var lonely = state.nodes.filter(function (n) {
      return !state.edges.some(function (e) { return e.a === n.id || e.b === n.id; });
    });
    lonely.slice(0, 3).forEach(function (n) {
      minus += 3;
      bad.push({ name: displayName(n) + ' is not connected', why: 'Every component should be wired into a request or data path, or removed.' });
    });
    var pct = Math.round(Math.max(0, Math.min(100, (max ? 100 * earned / max : 0) + plus - minus)));
    return { pct: pct, ok: ok, miss: miss, bad: bad };
  }

  var GRADES = [
    [90, 'S', 'Strong hire. This is the design interviewers hope to see.'],
    [75, 'A', 'Hire. Solid design, with a gap or two to close.'],
    [60, 'B', 'Lean hire. The core is there; the scale story needs work.'],
    [40, 'C', 'Lean no hire. Key building blocks are missing.'],
    [0, 'D', 'Keep going. Re-read the brief and add what each requirement demands.'],
  ];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function list(items, cls) {
    return '<ul class="lab__list lab__list--' + cls + '">' + items.map(function (i) {
      return '<li' + (i.bonus ? ' class="is-bonus"' : '') + '><b>' + esc(i.name) + '</b><span>' + esc(i.why) + '</span></li>';
    }).join('') + '</ul>';
  }
  function check() {
    var s = SCEN[state.id];
    if (!state.nodes.length) {
      result.innerHTML = '<p class="lab__nothing">Your canvas is empty. Drag in the components you think this system needs, connect them, then check again.</p>';
      result.hidden = false;
      return;
    }
    var r = score(s);
    var g = GRADES.filter(function (x) { return r.pct >= x[0]; })[0];
    result.innerHTML =
      '<div class="lab__grade lab__grade--' + g[1] + '">' +
        '<span class="lab__rank" aria-label="Rank ' + g[1] + '">' + g[1] + '</span>' +
        '<div class="lab__gradetext"><p class="lab__score">' + r.pct + ' / 100</p>' +
        '<p class="lab__verdict">' + esc(g[2]) + '</p>' +
        '<div class="lab__meter"><i style="width:' + r.pct + '%"></i></div></div>' +
      '</div>' +
      '<div class="lab__cols">' +
        '<div><h3>What works (' + r.ok.length + ')</h3>' + (r.ok.length ? list(r.ok, 'ok') : '<p class="lab__none">Nothing yet.</p>') + '</div>' +
        '<div><h3>What to add (' + r.miss.length + ')</h3>' + (r.miss.length ? list(r.miss, 'miss') : '<p class="lab__none">Nothing missing. Nice.</p>') + '</div>' +
      '</div>' +
      (r.bad.length ? '<h3>Watch out (' + r.bad.length + ')</h3>' + list(r.bad, 'bad') : '') +
      '<p class="lab__after"><button class="btn" type="button" data-lab-compare>Compare with the best design</button></p>';
    result.hidden = false;
    result.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  document.querySelector('[data-lab-check]').addEventListener('click', check);

  /* ---- The best design ----------------------------------------------------------------- */
  function showModel(on) {
    document.querySelectorAll('[data-model]').forEach(function (m) { m.hidden = !(on && m.dataset.model === state.id); });
    modelBtn.textContent = on ? 'Hide the best design' : 'Show the best design';
    modelBtn.setAttribute('aria-expanded', String(on));
    if (on) document.querySelector('[data-model="' + state.id + '"]').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  modelBtn.addEventListener('click', function () { showModel(modelBtn.getAttribute('aria-expanded') !== 'true'); });
  result.addEventListener('click', function (e) { if (e.target.closest('[data-lab-compare]')) showModel(true); });


  /* ---- Capacity calculator ------------------------------------------------------------------
     Peak QPS → app servers (by CPU and by memory for in-flight requests, +1 spare), load balancers,
     realtime gateways, database (primaries/shards/replicas or nodes for the chosen DB), Redis memory,
     object storage and workers. Rough planning numbers; every input and assumption is editable. */
  var form = document.querySelector('[data-calc-form]');
  var out = document.querySelector('[data-calc-out]');
  var SIZES = [2, 4, 8, 16, 32, 64];        // vCPU; RAM = 2 GB per vCPU

  function fmt(n) {
    if (!isFinite(n)) return '–';
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return n >= 10 || n === 0 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, '');
  }
  function fmtBytes(b) {
    var u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'], i = 0;
    while (b >= 1000 && i < u.length - 1) { b /= 1000; i++; }
    return (b >= 100 || i === 0 ? Math.round(b) : b.toFixed(1).replace(/\.0$/, '')) + ' ' + u[i];
  }
  function techOf(type) {
    var n = state.nodes.filter(function (x) { return x.t === type; })[0];
    return n ? (n.tech || COMP[type].tech[0].k) : null;
  }
  function serversFor(cores, ramGB, size) {
    var sizes = size === 'auto' ? SIZES : [Number(size)];
    var pick = null;
    for (var i = 0; i < sizes.length; i++) {
      var v = sizes[i];
      var n = Math.max(1, Math.ceil(cores / v), Math.ceil(ramGB / (v * 2 * 0.7)));
      pick = { vcpu: v, ram: v * 2, n: n, byRam: Math.ceil(ramGB / (v * 2 * 0.7)) > Math.ceil(cores / v) };
      if (n <= 24) break;                     // auto: smallest size that needs at most ~24 machines
    }
    pick.total = Math.max(2, pick.n + 1);     // N+1, and never a single machine
    return pick;
  }

  function compute(c) {
    var r = { tiles: [], warn: [], counts: {} };
    var reqDay = c.dau * c.rpu;
    var avg = reqDay / 86400, peak = avg * c.peak;
    var appQps = peak * (1 - c.edge / 100);
    var util = Math.max(5, Math.min(95, c.util)) / 100;

    r.tiles.push({ k: 'Traffic', v: fmt(peak) + ' req/s', d: 'at peak · ' + fmt(avg) + '/s average · ' + fmt(reqDay) + ' a day' + (c.edge ? ' · ' + fmt(peak - appQps) + '/s answered at the edge' : '') });

    if (appQps > 0) {
      var cores = appQps * c.cpuMs / 1000 / util;
      var inflight = appQps * c.respMs / 1000;
      var ramGB = inflight * c.mbReq / 1024;
      var s = serversFor(cores, ramGB, c.size);
      r.counts.app = s.total;
      r.tiles.push({ k: 'App servers', v: s.total + ' × ' + s.vcpu + ' vCPU · ' + s.ram + ' GB', d: s.n + ' needed + 1 spare · ' + fmt(cores) + ' cores of work at ' + Math.round(util * 100) + '% CPU · ' + fmt(inflight) + ' requests in flight' + (s.byRam ? ' (memory is the limit)' : '') });
      var lbTech = techOf('lb') || 'l7';
      var cap = lbTech === 'l4' ? c.l4rps : c.l7rps;
      var lbs = Math.max(2, Math.ceil(appQps / cap));
      r.counts.lb = lbs;
      r.counts.gateway = lbs;
      r.tiles.push({ k: 'Load balancers', v: lbs + ' × ' + data.profiles.lb[lbTech].label, d: fmt(cap) + ' req/s each; at least 2 so one can fail' + (state.nodes.some(function (n) { return n.t === 'lb'; }) ? '' : ' · none on your canvas yet') });
    }

    if (c.conns > 0) {
      var gws = Math.ceil(c.conns / c.connsPerGw) + 1;
      r.counts.ws = gws;
      r.tiles.push({ k: 'Realtime gateways', v: gws + ' servers', d: fmt(c.conns) + ' open connections at ' + fmt(c.connsPerGw) + ' each, + 1 spare' });
    }

    var hasCache = state.nodes.some(function (n) { return n.t === 'cache'; });
    var dbReads = appQps * c.reads * (1 - (hasCache ? c.hit : 0) / 100);
    var peakWrites = c.recDay / 86400 * c.peak;
    var raw = c.recDay * c.recBytes * 365 * c.years;
    var stored = raw * c.rf;
    if (c.recDay > 0 || dbReads > 0) {
      var dbType = techOf('nosql') && !techOf('sql') ? 'nosql' : 'sql';
      var key = techOf(dbType) || 'postgres';
      var prof = data.profiles.db[key];
      var detail = fmt(peakWrites) + ' writes/s and ' + fmt(dbReads) + ' reads/s at peak' + (hasCache ? ' after the cache' : ' (no cache on your canvas)') + ' · ' + fmtBytes(stored) + ' over ' + fmt(c.years) + ' y with ' + c.rf + ' copies';
      if (prof.managed) {
        r.tiles.push({ k: 'Database', v: prof.label + ': ' + fmt(Math.ceil(peakWrites)) + ' WCU · ' + fmt(Math.ceil(dbReads / 2)) + ' RCU', d: 'managed, scales by capacity units (1 KB writes, eventually consistent reads) · ' + detail });
        r.counts.nosql = null;
      } else if (prof.distributed) {
        var need = [[c.rf, 'one per copy'], [Math.ceil(peakWrites * c.rf / prof.writes), 'writes'], [Math.ceil(dbReads / prof.reads), 'reads'], [Math.ceil(stored / 1e12 / prof.tb), 'storage']]
          .sort(function (a, b) { return b[0] - a[0]; })[0];
        var nodes = need[0];
        r.counts[dbType] = nodes;
        r.tiles.push({ k: 'Database', v: prof.label + ': ' + nodes + ' nodes', d: (need[1] === 'one per copy' ? 'the minimum for ' + c.rf + ' copies' : need[1] + ' set the size') + ' · ≈' + fmt(prof.writes) + ' writes/s and ' + prof.tb + ' TB per node · ' + detail });
      } else {
        var shards = Math.max(1, Math.ceil(peakWrites / prof.writes), Math.ceil(raw / 1e12 / prof.tb));
        var replicas = Math.max(1, Math.ceil(dbReads / shards / prof.reads));
        r.counts.sql = shards;
        r.counts.replica = replicas * shards;
        r.tiles.push({ k: 'Database', v: prof.label + ': ' + (shards > 1 ? shards + ' shards, each 1 primary + ' : '1 primary + ') + replicas + ' replica' + (replicas > 1 ? 's' : ''), d: '≈' + fmt(prof.writes) + ' writes/s per primary, ' + fmt(prof.reads) + ' reads/s per replica, ' + prof.tb + ' TB per node · ' + detail });
        if (shards > 1) r.warn.push('One ' + prof.label + ' primary can\'t take ' + fmt(peakWrites) + ' writes/s or ' + fmtBytes(raw) + ' on its own: shard it ' + shards + ' ways, or pick a distributed database (Cassandra, DynamoDB, Spanner).');
      }
    }

    if (hasCache) {
      var cacheGB = Math.max(1, 0.2 * reqDay * c.reads * Math.max(c.recBytes, 100) / 1e9);
      var cnodes = Math.ceil(cacheGB / c.redisGB);
      r.counts.cache = cnodes;
      r.tiles.push({ k: 'Cache', v: (techOf('cache') === 'memcached' ? 'Memcached' : 'Redis') + ': ' + fmtBytes(cacheGB * 1e9) + ' → ' + cnodes + ' node' + (cnodes > 1 ? 's' : ''), d: '80/20 rule: hold 20% of a day\'s reads · ' + c.redisGB + ' GB usable per node (double it for replicas)' });
    } else if (dbReads > 20000) {
      r.warn.push(fmt(dbReads) + ' reads/s would hit the database directly. Add a cache to your design.');
    }

    if (c.filesDay > 0) {
      var perDay = c.filesDay * c.fileMB * 1e6;
      r.tiles.push({ k: 'Object storage', v: fmtBytes(perDay * 365) + ' a year', d: fmtBytes(perDay) + ' of new files a day · ' + fmt(c.filesDay * c.fileMB * 1e6 * 8 / 86400 / 1e9) + ' Gbps of uploads on average' });
    }

    if (c.jobsDay > 0) {
      var jobCores = c.jobsDay * c.jobCpuS / 86400 / util;
      var w = serversFor(jobCores, 0, c.size);
      r.counts.worker = w.total;
      r.tiles.push({ k: 'Workers', v: w.total + ' × ' + w.vcpu + ' vCPU', d: fmt(c.jobsDay * c.jobCpuS / 3600) + ' CPU-hours of jobs a day · ' + fmt(jobCores) + ' cores busy on average' });
    }
    if (!r.tiles.length || (reqDay === 0 && c.recDay === 0 && c.jobsDay === 0)) r.warn.push('Enter some traffic, data or jobs to size the system.');
    return r;
  }

  function readForm() {
    form.querySelectorAll('[data-calc]').forEach(function (inp) {
      var k = inp.dataset.calc;
      if (k === 'size') state.calc.size = inp.value;
      else { var v = parseFloat(inp.value); state.calc[k] = isFinite(v) && v >= 0 ? v : 0; }
    });
  }
  function fillForm() {
    form.querySelectorAll('[data-calc]').forEach(function (inp) { inp.value = state.calc[inp.dataset.calc]; });
  }
  function runCalc() {
    if (!state.calc) return;
    var r = compute(state.calc);
    out.innerHTML = r.tiles.map(function (x) {
      return '<div class="calc__tile"><p class="calc__k">' + esc(x.k) + '</p><p class="calc__v">' + esc(x.v) + '</p><p class="calc__d">' + esc(x.d) + '</p></div>';
    }).join('') + r.warn.map(function (w) { return '<p class="calc__warn">' + esc(w) + '</p>'; }).join('');
    canvas.querySelectorAll('.lab-node').forEach(function (el) {
      var n = nodeById(el.dataset.id), badge = el.querySelector('.lab-node__count');
      var v = n && r.counts[n.t];
      badge.hidden = !v;
      if (v) badge.textContent = '×' + v;
    });
  }
  form.addEventListener('input', function () { readForm(); save(); runCalc(); });
  document.querySelector('[data-calc-reset]').addEventListener('click', function () {
    state.calc = Object.assign({}, SCEN[state.id].calc, ASSUME);
    fillForm(); save(); runCalc();
  });

  /* ---- Scenarios ---------------------------------------------------------------------- */
  function choose(id) {
    if (!SCEN[id]) id = data.scenarios[0].id;
    pick.value = id;
    load(id);
    document.querySelectorAll('[data-brief]').forEach(function (b) { b.hidden = b.dataset.brief !== id; });
    showModel(false);
    hideVerdict();
    fillForm();
    render();
    try { history.replaceState(null, '', '?s=' + id); } catch (e) { /* fine */ }
  }
  pick.addEventListener('change', function () { choose(pick.value); });
  choose(new URLSearchParams(location.search).get('s'));
}());
