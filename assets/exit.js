// Leaving through a piece: the projects live on other sites, so the page cannot morph into them (view transitions work
// only within one site). The exit is ours, the reveal in reverse: from where the click lands, a wave spreads across the
// screen like ink in water, its front irregular and soft, glowing red and blue where it moves; behind it the page turns
// into film grain while what is left of it blurs and sinks back; then the grain fades to black and the project opens.
// About 1 s; the project's page is fetched ahead while the pointer rests on the piece. A modified click (new tab, new
// window) and reduced motion skip it. Coming back opens the page where it was left, without the hero.

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DURATION = 1000, FIELD = 6; // ms; css px per cell of the wave's field, drawn smoothed

// back from a project opened from here: the content, where it was left, not the hero
if (history.state?.back) {
  document.documentElement.classList.add('inside');
  if (typeof history.state.y === 'number') { history.scrollRestoration = 'manual'; requestAnimationFrame(() => scrollTo(0, history.state.y)); }
}

// film grain tiles, as on the banners
const GRAIN = Array.from({ length: 3 }, () => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), im = x.createImageData(256, 256);
  for (let q = 0; q < im.data.length; q += 4) { const v = Math.random(); const g = 40 + v * 215; im.data[q] = im.data[q + 1] = im.data[q + 2] = g; im.data[q + 3] = 255 * (0.35 + 0.65 * v); }
  x.putImageData(im, 0, 0);
  return c;
});

// smooth value noise, for the wave's irregular front
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vnoise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function leave(href, x0, y0) {
  const d = Math.min(2, devicePixelRatio || 1), W = Math.round(innerWidth * d), H = Math.round(innerHeight * d);
  const veil = document.createElement('canvas');
  veil.className = 'exit-veil'; veil.width = W; veil.height = H;
  document.body.append(veil);
  const cx = veil.getContext('2d');
  // the wave's field at low resolution: for each cell, its distance from the click, roughened by noise
  const cols = Math.ceil(innerWidth / FIELD), rows = Math.ceil(innerHeight / FIELD);
  const dist = new Float32Array(cols * rows), seed = Math.random() * 100;
  let far = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * FIELD, y = j * FIELD, a = Math.atan2(y - y0, x - x0);
    const r = Math.hypot(x - x0, y - y0);
    // the front bulges and lags by direction, and frays in small eddies
    const v = r * (1 + 0.28 * (vnoise(Math.cos(a) * 1.6 + seed, Math.sin(a) * 1.6) - 0.5)) + 110 * (vnoise(x / 140 + seed, y / 140) - 0.5) + 30 * (vnoise(x / 32, y / 32 + seed) - 0.5);
    dist[j * cols + i] = v; if (v > far) far = v;
  }
  far += 160;
  const [mask, mx] = (() => { const c = document.createElement('canvas'); c.width = cols; c.height = rows; return [c, c.getContext('2d')]; })();
  const [glow, gx] = (() => { const c = document.createElement('canvas'); c.width = cols; c.height = rows; return [c, c.getContext('2d')]; })();
  const mi = mx.createImageData(cols, rows), gi = gx.createImageData(cols, rows);
  const layer = document.createElement('canvas'); layer.width = W; layer.height = H; const lx = layer.getContext('2d');

  document.documentElement.classList.add('exiting');
  document.querySelector('main')?.animate([{ filter: 'blur(0) brightness(1)', transform: 'scale(1)' }, { filter: 'blur(10px) brightness(0.55)', transform: 'scale(0.965)' }], { duration: DURATION * 0.8, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });
  const t0 = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - t0) / DURATION), w = Math.min(1, t / 0.78);
    const R = far * (w < 0.5 ? 4 * w * w * w : 1 - Math.pow(-2 * w + 2, 3) / 2), soft = 70 + 160 * w, fade = Math.max(0, (t - 0.7) / 0.3);
    for (let n = 0, q = 3; n < dist.length; n++, q += 4) {
      const k = R - dist[n];
      mi.data[q] = 255 * smooth(-soft * 0.5, soft * 0.5, k); // behind the front: grain, with a long soft edge
      gi.data[q] = 255 * Math.max(0, 1 - Math.abs(k) / (soft * 0.6)) ** 2; // the front itself: a soft band
    }
    mx.putImageData(mi, 0, 0); gx.putImageData(gi, 0, 0);
    cx.clearRect(0, 0, W, H);
    // ground and grain where the wave has passed
    lx.globalCompositeOperation = 'source-over'; lx.fillStyle = '#15181c'; lx.fillRect(0, 0, W, H);
    const tile = GRAIN[(Math.random() * GRAIN.length) | 0], s = d >= 2 ? 1.5 : 1;
    lx.save(); lx.globalAlpha = 0.5 * (1 - fade); lx.setTransform(s, 0, 0, s, -Math.random() * 256, -Math.random() * 256);
    lx.fillStyle = lx.createPattern(tile, 'repeat'); lx.fillRect(0, 0, (W + 512) / s, (H + 512) / s); lx.restore();
    lx.globalCompositeOperation = 'destination-in'; lx.imageSmoothingEnabled = true; lx.drawImage(mask, 0, 0, W, H);
    cx.drawImage(layer, 0, 0);
    // the front glows, split red and blue, brighter where it moves fast
    if (w < 1) {
      for (const [col, dx, a] of [['#ff3b3b', -5 * d, 0.55], ['#4d8dff', 5 * d, 0.55], ['#eef1f4', 0, 0.22]]) {
        lx.globalCompositeOperation = 'source-over'; lx.clearRect(0, 0, W, H);
        lx.drawImage(glow, 0, 0, W, H);
        lx.globalCompositeOperation = 'source-in'; lx.fillStyle = col; lx.fillRect(0, 0, W, H);
        cx.save(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = a * (1 - w * 0.6); cx.drawImage(layer, dx, 0); cx.restore();
      }
    }
    if (fade > 0) { cx.globalAlpha = fade; cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H); cx.globalAlpha = 1; }
    if (t < 1) requestAnimationFrame(frame); else location.href = href;
  };
  requestAnimationFrame(frame);
}

for (const piece of document.querySelectorAll('.piece')) {
  const link = piece.querySelector('.name a');
  if (!link) continue;
  piece.addEventListener('pointerenter', () => { // fetch the project's page ahead, once
    const l = document.createElement('link'); l.rel = 'prefetch'; l.href = link.href; document.head.append(l);
  }, { once: true });
  // the whole piece opens the project: its name is the link, the banner and the text answer clicks too
  piece.addEventListener('click', (ev) => {
    if (ev.defaultPrevented || ev.button !== 0) return;
    const onLink = ev.target.closest('a');
    if (onLink && onLink !== link) return; // another link inside the piece
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) { if (!onLink) window.open(link.href, '_blank', 'noopener'); return; } // new tab or window
    ev.preventDefault();
    // remember where the page was, so coming back opens it there, past the hero
    history.replaceState({ ...(history.state || {}), back: true, y: scrollY }, '');
    if (reduced) { location.href = link.href; return; }
    setTimeout(() => { location.href = link.href; }, DURATION + 500); // whatever happens to the animation, the project opens
    // from the click, or from the banner's centre when the link was activated from the keyboard
    let x = ev.clientX, y = ev.clientY;
    if (!ev.detail) { const b = piece.querySelector('.banner').getBoundingClientRect(); x = b.left + b.width / 2; y = b.top + b.height / 2; }
    try { leave(link.href, x, y); } catch { location.href = link.href; }
  });
}

// back from the project, restored from the browser's cache as it was left: put it back as it was before the exit
addEventListener('pageshow', (ev) => {
  if (!ev.persisted) return;
  document.querySelectorAll('.exit-veil').forEach((v) => v.remove());
  document.documentElement.classList.remove('exiting');
  document.querySelector('main')?.getAnimations().forEach((a) => a.cancel());
});
