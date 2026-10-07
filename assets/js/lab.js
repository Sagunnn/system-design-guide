/* Design Lab: drag components onto a canvas, connect them, and get the design rated.
   Data (components + scoring rules per scenario) comes from <script id="lab-data">, written by the build.
   Each scenario's canvas is saved in localStorage ("sdg-lab:<id>"). Links are scored undirected. */

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

  var state = { id: null, nodes: [], edges: [], seq: 0 };

  /* ---- Storage ------------------------------------------------------------- */
  function save() {
    try { localStorage.setItem('sdg-lab:' + state.id, JSON.stringify({ nodes: state.nodes, edges: state.edges, seq: state.seq })); } catch (e) { /* not saved */ }
  }
  function load(id) {
    state.id = id;
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('sdg-lab:' + id)); } catch (e) { saved = null; }
    state.nodes = (saved && saved.nodes) || [];
    state.edges = (saved && saved.edges) || [];
    state.seq = (saved && saved.seq) || 0;
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
    n.x = Math.max(56, Math.min(w - 56, n.x));
    n.y = Math.max(26, Math.min(h - 26, n.y));
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
        '<span class="lab-node__out" title="Drag to another box to connect"></span>';
      el.firstChild.textContent = displayName(n);
      canvas.appendChild(el);
    });
    empty.hidden = state.nodes.length > 0;
    drawEdges();
    fillSelects();
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
    return { x: 80 + (i % cols) * 150, y: 50 + Math.floor(i / cols) * 86 };
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
    if (!el || e.target.closest('.lab-node__x')) return;
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
  canvas.addEventListener('keydown', function (e) {
    var el = e.target.closest('.lab-node');
    if (el && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeNode(el.dataset.id); }
  });
  document.querySelector('[data-lab-link]').addEventListener('click', function () {
    addEdge(fromSel.value, toSel.value);
    toSel.value = '';
  });
  document.querySelector('[data-lab-clear]').addEventListener('click', function () {
    if (state.nodes.length && !window.confirm('Clear the canvas for this scenario?')) return;
    state.nodes = []; state.edges = []; state.seq = 0;
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

  /* ---- Scenarios ---------------------------------------------------------------------- */
  function choose(id) {
    if (!SCEN[id]) id = data.scenarios[0].id;
    pick.value = id;
    load(id);
    document.querySelectorAll('[data-brief]').forEach(function (b) { b.hidden = b.dataset.brief !== id; });
    showModel(false);
    hideVerdict();
    render();
    try { history.replaceState(null, '', '?s=' + id); } catch (e) { /* fine */ }
  }
  pick.addEventListener('change', function () { choose(pick.value); });
  choose(new URLSearchParams(location.search).get('s'));
}());
