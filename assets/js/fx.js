/* Pixel effects shared by the Design Lab and the demos:
   sdgFx(el, host, x, y, kind) where kind is "over" (blast), "under" (meltdown) or "spot" (nice).
   host is the positioned element the debris is drawn in; x, y are in host coordinates. */

(function () {
  'use strict';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fx(el, host, x, y, kind) {
    var cls = { over: 'fx-blast', under: 'fx-melt', spot: 'fx-spot' }[kind];
    if (!cls) return;
    el.classList.remove('fx-blast', 'fx-melt', 'fx-spot', 'fx-charred');
    void el.offsetWidth;                        // restart the animation
    el.classList.add(cls);
    var label = { over: 'BOOM!', under: 'OVERLOAD', spot: 'NICE!' }[kind];
    var bits = [];
    var text = document.createElement('span');
    text.className = 'fx-text fx-text--' + kind;
    text.textContent = label;
    text.style.left = x + 'px';
    text.style.top = y + 'px';
    bits.push(text);
    if (!reduceMotion && kind === 'over') {
      var colours = ['#ffd447', '#ff8a2f', '#e0442f', '#1f2330', '#fff3b0'];
      for (var i = 0; i < 20; i++) {
        var a = Math.random() * Math.PI * 2, d = 45 + Math.random() * 85, s = 5 + Math.round(Math.random() * 5);
        var b = document.createElement('span');
        b.className = 'fx-bit';
        b.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + s + 'px;height:' + s + 'px;background:' + colours[i % colours.length] +
          ';--dx:' + Math.round(Math.cos(a) * d) + 'px;--dy:' + Math.round(Math.sin(a) * d) + 'px';
        bits.push(b);
      }
      if (el.classList.contains('lab-node')) setTimeout(function () { el.classList.add('fx-charred'); }, 320);
    }
    if (!reduceMotion && kind === 'under') {
      for (var j = 0; j < 7; j++) {
        var sm = document.createElement('span');
        sm.className = 'fx-smoke';
        sm.style.cssText = 'left:' + (x - 30 + j * 10) + 'px;top:' + (y - 10) + 'px;animation-delay:' + (j * 120) + 'ms;--dx:' + Math.round(Math.random() * 24 - 12) + 'px';
        bits.push(sm);
      }
    }
    bits.forEach(function (b) { host.appendChild(b); });
    setTimeout(function () { bits.forEach(function (b) { b.remove(); }); }, kind === 'under' ? 2400 : 1300);
    setTimeout(function () { el.classList.remove(cls, 'fx-charred'); }, 4200);
  }

  window.sdgFx = fx;
}());
