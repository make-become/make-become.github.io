// The work, as banners that come out of noise: each piece's banner (its logo, where it has one, and a real picture of it)
// starts under fine film grain when it first comes into view and resolves into the banner, each in its own way (data-fx).
// The grain is fine and soft, and spills a little past the banner's edges as a halo; the edges of the banner itself are feathered.
// Red and blue are the TV split: a glowing fringe on the front of the reveal. Once resolved, a faint grain keeps moving on the
// banner while it is on screen; under the pointer the banner holds still and clean. Reduced motion draws the banner alone.

const MASK = 6; // css px per cell of the reveal mask; drawn smoothed, so its edges are soft
const GROUND = [21, 24, 28];
const RESOLVE = 1100; // ms
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const load = (src) => new Promise((ok) => { if (!src) return ok(null); const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
const canvas2d = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return [c, c.getContext('2d')]; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Fit an image into a box: cover crops, contain letterboxes. Returns the draw rectangle.
const fit = (img, x, y, w, h, mode) => {
  const ia = img.naturalWidth / img.naturalHeight, ba = w / h;
  const s = mode === 'contain' ? (ia > ba ? w / img.naturalWidth : h / img.naturalHeight) : (ia > ba ? h / img.naturalHeight : w / img.naturalWidth);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  return [x + (w - dw) / 2, y + (h - dh) / 2, dw, dh];
};

// The picture's own ground, read from its corner, so the banner is one seamless panel.
const corner = (img) => {
  if (!img) return GROUND;
  const [, x] = canvas2d(1, 1); x.drawImage(img, 0, 0, 4, 4, 0, 0, 1, 1);
  return [...x.getImageData(0, 0, 1, 1).data.slice(0, 3)];
};

// The banner: its ground, the picture on the right fading in from the left, the logo on the left.
function compose(cx, W, H, logo, visual, mode) {
  const [r, gr, b] = corner(visual), ground = `rgb(${r}, ${gr}, ${b})`;
  cx.fillStyle = ground; cx.fillRect(0, 0, W, H);
  if (visual) {
    const vx = logo ? W * 0.3 : 0, vw = W - vx;
    cx.save(); cx.beginPath(); cx.rect(vx, 0, vw, H); cx.clip();
    cx.drawImage(visual, ...fit(visual, vx, 0, vw, H, mode));
    cx.restore();
    if (logo) { // the picture fades in from the logo's side
      const g = cx.createLinearGradient(vx, 0, vx + vw * 0.35, 0);
      g.addColorStop(0, ground); g.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 0)`);
      cx.fillStyle = g; cx.fillRect(vx, 0, vw * 0.35, H);
    }
  }
  if (logo && !visual) { // the logo alone, centred
    const s = Math.min(W, H) * 0.56;
    cx.drawImage(logo, ...fit(logo, (W - s) / 2, (H - s) / 2, s, s, 'contain'));
  } else if (logo) {
    const s = Math.min(H * 0.62, W * 0.22);
    cx.drawImage(logo, ...fit(logo, W * 0.06, (H - s) / 2, s, s, 'contain'));
  }
}

// A soft-edged rounded rectangle as an alpha mask: drawn through a shadow, which every browser blurs.
function softRect(W, H, x, y, w, h, radius, blur) {
  const [c, m] = canvas2d(W, H), off = W + 4 * blur;
  m.shadowColor = '#000'; m.shadowBlur = blur; m.shadowOffsetX = off;
  m.beginPath(); m.roundRect(x - off, y, w, h, radius); m.fill();
  return c;
}

// Film grain: a few tiles of fine random greys, drawn at a random offset each frame.
const GRAIN = Array.from({ length: 4 }, () => {
  const [c, x] = canvas2d(256, 256), im = x.createImageData(256, 256);
  for (let q = 0; q < im.data.length; q += 4) { const v = Math.random(); const g = 40 + v * 215; im.data[q] = im.data[q + 1] = im.data[q + 2] = g; im.data[q + 3] = 255 * (0.35 + 0.65 * v); }
  x.putImageData(im, 0, 0);
  return c;
});

async function banner(canvas) {
  const [logo, visual] = await Promise.all([load(canvas.dataset.logo), load(canvas.dataset.visual)]);
  const mode = canvas.dataset.fit || 'cover', fx = canvas.dataset.fx || 'scatter';
  const cx = canvas.getContext('2d');
  let W = 0, H = 0, B = 0, d = 1, art, halo, layer, lx, mask, mx, edge, ex, cols = 0, rows = 0, due = null;
  let t0 = -1, held = false, raf = 0, last = 0;

  const size = () => {
    const r = canvas.getBoundingClientRect();
    d = Math.min(2, devicePixelRatio || 1);
    W = canvas.width = Math.max(1, Math.round(r.width * d)); H = canvas.height = Math.max(1, Math.round(r.height * d));
    // how far the canvas reaches past the banner on each side (set in the page's CSS), for the halo
    const pr = canvas.parentElement.getBoundingClientRect();
    B = Math.max(0, (r.width - pr.width) / 2) * d;
    const iw = Math.max(1, W - 2 * B), ih = Math.max(1, H - 2 * B);
    // the banner, feathered at its edges, inside the canvas
    const [pc, px] = canvas2d(iw, ih); compose(px, iw, ih, logo, visual, mode);
    let ax; [art, ax] = canvas2d(W, H);
    ax.drawImage(pc, B, B);
    ax.globalCompositeOperation = 'destination-in';
    ax.drawImage(softRect(W, H, B, B, iw, ih, 18 * d, 10 * d), 0, 0);
    // where grain may lie: the banner and a short halo around it
    halo = softRect(W, H, B * 0.45, B * 0.45, W - 0.9 * B, H - 0.9 * B, 28 * d, B * 0.9);
    [layer, lx] = canvas2d(W, H);
    cols = Math.ceil(W / (MASK * d)); rows = Math.ceil(H / (MASK * d));
    [mask, mx] = canvas2d(cols, rows); [edge, ex] = canvas2d(cols, rows);
    // when each cell resolves, 0 to 1, by the banner's own way
    due = new Float32Array(cols * rows);
    const seeds = [[0.72, 0.4], [0.86, 0.68], [0.2, 0.5]];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const u = i / cols, v = j / rows, rnd = Math.random();
      due[j * cols + i] = fx === 'scan' ? v // a wipe from the top, under a beam
        : fx === 'grow' ? Math.min(...seeds.map(([a, b]) => Math.hypot((u - a) * W / H, v - b))) / 1.3 + 0.02 * rnd // regions growing from seeds
        : fx === 'ripple' ? Math.hypot((u - 0.5) * W / H, v - 0.5) / 1.3 + 0.06 * rnd // rings from the centre
        : fx === 'diffuse' ? 0.5 // all at once: the grain thins out everywhere together
        : 0.05 + 0.6 * rnd + 0.35 * u;
    }
    paint(t0 >= 0 || reduced ? 1 : 0, 0);
  };

  // the mask of what is still unresolved, and the band at the front of the reveal, at cell resolution
  const masks = (p) => {
    const mi = mx.createImageData(cols, rows), ei = ex.createImageData(cols, rows), soft = fx === 'scan' ? 0.06 : 0.14;
    for (let n = 0, q = 3; n < due.length; n++, q += 4) {
      const k = fx === 'diffuse' ? Math.pow(1 - p, 1.4) : smooth(0, soft, due[n] - p * (1 + soft));
      mi.data[q] = 255 * k;
      ei.data[q] = fx === 'diffuse' ? 0 : 255 * Math.max(0, 1 - Math.abs(due[n] - p * (1 + soft)) / 0.035);
    }
    mx.putImageData(mi, 0, 0); ex.putImageData(ei, 0, 0);
  };
  const grain = (ctx, alpha) => {
    const t = GRAIN[(Math.random() * GRAIN.length) | 0], s = d >= 2 ? 1.5 : 1;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.setTransform(s, 0, 0, s, -Math.random() * 256, -Math.random() * 256);
    ctx.fillStyle = ctx.createPattern(t, 'repeat'); ctx.fillRect(0, 0, (W + 512) / s, (H + 512) / s);
    ctx.restore();
  };
  // p: how far the reveal has come, 0 to 1; still: no living grain (the banner under the pointer)
  const paint = (p, still = false) => {
    cx.clearRect(0, 0, W, H);
    cx.drawImage(art, 0, 0);
    if (p < 1) {
      masks(p);
      // the unresolved part: ground, then grain, inside the halo
      lx.globalCompositeOperation = 'source-over'; lx.clearRect(0, 0, W, H);
      lx.fillStyle = `rgb(${GROUND})`; lx.fillRect(0, 0, W, H);
      grain(lx, 0.9);
      lx.globalCompositeOperation = 'destination-in'; lx.imageSmoothingEnabled = true; lx.drawImage(mask, 0, 0, W, H);
      lx.drawImage(halo, 0, 0);
      cx.drawImage(layer, 0, 0);
      // the front of the reveal glows, split red and blue
      if (fx !== 'diffuse') {
        const o = 3 * d;
        for (const [col, dx] of [['#ff3b3b', -o], ['#4d8dff', o], ['#eef1f4', 0]]) {
          lx.globalCompositeOperation = 'source-over'; lx.clearRect(0, 0, W, H);
          lx.drawImage(edge, 0, 0, W, H);
          lx.globalCompositeOperation = 'source-in'; lx.fillStyle = col; lx.fillRect(0, 0, W, H);
          lx.globalCompositeOperation = 'destination-in'; lx.drawImage(halo, 0, 0);
          cx.save(); cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = col === '#eef1f4' ? 0.35 : 0.8;
          cx.shadowColor = col; cx.shadowBlur = 14 * d; cx.drawImage(layer, dx, 0); cx.restore();
        }
      }
      if (fx === 'scan') { // the beam
        const y = Math.min(H, p * (1 + 0.06) * H);
        cx.save(); cx.globalCompositeOperation = 'lighter'; cx.shadowBlur = 18 * d;
        for (const [col, dy] of [['#ff3b3b', -2 * d], ['#4d8dff', 2 * d], ['#eef1f4', 0]]) { cx.shadowColor = col; cx.fillStyle = col; cx.globalAlpha = 0.5; cx.fillRect(B * 0.4, y + dy, W - 0.8 * B, 1.5 * d); }
        cx.restore();
      }
    }
    // the living grain: faint on the banner while it is on screen; none while the pointer rests on it
    if (!still) { cx.save(); cx.globalCompositeOperation = 'source-atop'; grain(cx, 0.06); cx.restore(); }
  };

  const onScreen = () => { const r = canvas.getBoundingClientRect(); return r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  const frame = (now) => {
    raf = 0;
    if (t0 < 0) t0 = now;
    const p = Math.min(1, (now - t0) / RESOLVE);
    if (p >= 1 && held) { paint(1, true); return; } // the pointer rests on it: clean and still until it leaves
    if (p < 1 || now - last > 80) { paint(p < 1 ? 1 - Math.pow(1 - p, 2.2) : 1); last = now; } // grain at about 12 frames a second when settled
    if (p < 1 || onScreen()) raf = requestAnimationFrame(frame);
  };
  const wake = () => { if (!raf && !reduced) raf = requestAnimationFrame(frame); };

  // starts once the banner is on screen; checked on scroll and on layout, since the page may open hidden
  const check = () => {
    if (raf) return;
    const r = canvas.getBoundingClientRect();
    if (r.height > 0 && r.top < innerHeight * 0.92 && r.bottom > innerHeight * 0.08) wake();
  };
  size();
  new ResizeObserver(() => { size(); if (!reduced) check(); }).observe(canvas);
  if (reduced) return;
  addEventListener('scroll', check, { passive: true });
  check();
  const piece = canvas.closest('.piece') || canvas;
  piece.addEventListener('pointerenter', () => { held = true; wake(); });
  piece.addEventListener('pointerleave', () => { held = false; wake(); });
}

document.querySelectorAll('canvas[data-banner]').forEach(banner);
