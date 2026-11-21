// The work, as banners that come out of noise: each piece's banner (its logo, where it has one, and a real picture of it)
// starts as one-bit noise when it first comes into view and resolves into the banner fast, cell by cell, left first.
// Red and blue are the TV split, a few of the noise pixels. Once resolved the banner stays still and clean;
// hovering stirs a little noise back for a moment. Reduced motion draws the banner alone.

const CELL = 4; // css pixels per noise cell
const GROUND = '#15181c', NOISE = ['#eef1f4', '#eef1f4', '#7d8590', '#7d8590', '#ff3b3b', '#4d8dff'];
const RESOLVE = 900, STIR = 380; // ms
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const load = (src) => new Promise((ok) => { if (!src) return ok(null); const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

// Fit an image into a box: cover crops, contain letterboxes. Returns the draw rectangle.
const fit = (img, x, y, w, h, mode) => {
  const ia = img.naturalWidth / img.naturalHeight, ba = w / h;
  const s = mode === 'contain' ? (ia > ba ? w / img.naturalWidth : h / img.naturalHeight) : (ia > ba ? h / img.naturalHeight : w / img.naturalWidth);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  return [x + (w - dw) / 2, y + (h - dh) / 2, dw, dh];
};

// The picture's own ground, read from its corner, so the banner is one seamless panel.
const corner = (img) => {
  if (!img) return [21, 24, 28];
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, 4, 4, 0, 0, 1, 1);
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

async function banner(canvas) {
  const [logo, visual] = await Promise.all([load(canvas.dataset.logo), load(canvas.dataset.visual)]);
  const mode = canvas.dataset.fit || 'cover', fx = canvas.dataset.fx || 'scatter';
  const cx = canvas.getContext('2d');
  const art = document.createElement('canvas'), ax = art.getContext('2d');
  let W = 0, H = 0, cols = 0, rows = 0, due = null, t0 = -1, stir = -1, raf = 0;

  const size = () => {
    const r = canvas.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    W = canvas.width = art.width = Math.max(1, Math.round(r.width * d));
    H = canvas.height = art.height = Math.max(1, Math.round(r.height * d));
    compose(ax, W, H, logo, visual, mode);
    const c = CELL * d; cols = Math.ceil(W / c); rows = Math.ceil(H / c);
    // when each cell resolves, 0 to 1, by the banner's own way (data-fx)
    due = new Float32Array(cols * rows);
    const seeds = [[0.72, 0.4], [0.86, 0.68], [0.2, 0.5]]; // where regions start growing, as fractions of the banner
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const u = i / cols, v = j / rows, rnd = Math.random();
      due[j * cols + i] = fx === 'scan' ? 0.82 * v + 0.12 * rnd // line by line, top to bottom
        : fx === 'grow' ? Math.min(...seeds.map(([a, b]) => Math.hypot((u - a) * W / H, v - b))) / 1.4 + 0.015 * rnd // regions growing from seeds
        : fx === 'ripple' ? Math.hypot((u - 0.5) * W / H, v - 0.5) / 1.3 + 0.08 * rnd // rings from the centre
        : 0.05 + 0.6 * rnd + 0.35 * u; // scattered, a little left first
    }
    if (t0 >= 0 || reduced) cx.drawImage(art, 0, 0); else draw(0);
  };
  // p: how far the resolve has come, 0 to 1. Each banner has its own way (data-fx); the hover stir is shared.
  const cellAt = (n, c) => [(n % cols) * c, Math.floor(n / cols) * c];
  const draw = (p, only = 1) => {
    cx.drawImage(art, 0, 0);
    const c = W / cols;
    if (only < 1) { // the hover stir: a few cells of noise, everywhere
      for (let n = 0; n < due.length; n++) if (Math.random() < only) { const [x, y] = cellAt(n, c); cx.fillStyle = NOISE[(Math.random() * NOISE.length) | 0]; cx.fillRect(x, y, Math.ceil(c), Math.ceil(c)); }
      return;
    }
    (WAYS[fx] || WAYS.scatter)(p, c);
  };
  const WAYS = {
    // cell by cell, at random, a little left first
    scatter: (p, c) => {
      for (let n = 0; n < due.length; n++) {
        if (due[n] <= p) continue;
        const [x, y] = cellAt(n, c);
        cx.fillStyle = Math.random() < 0.5 ? GROUND : NOISE[(Math.random() * NOISE.length) | 0];
        cx.fillRect(x, y, Math.ceil(c), Math.ceil(c));
      }
    },
    // Anymatix: the whole picture under television static that thins out, the way a diffusion model removes noise
    diffuse: (p, c) => {
      const a = Math.pow(1 - p, 1.6);
      if (a < 0.01) return;
      cx.globalAlpha = a;
      cx.fillStyle = GROUND; cx.fillRect(0, 0, W, H);
      for (let n = 0; n < due.length; n++) {
        const v = Math.random();
        if (v < 0.35) continue;
        const [x, y] = cellAt(n, c);
        cx.fillStyle = v > 0.97 ? '#ff3b3b' : v > 0.94 ? '#4d8dff' : `rgb(${(v - 0.35) * 380 | 0}, ${(v - 0.35) * 385 | 0}, ${(v - 0.35) * 392 | 0})`;
        cx.fillRect(x, y, Math.ceil(c), Math.ceil(c));
      }
      cx.globalAlpha = 1;
    },
    // NAIMA: printed line by line under a bright beam, the lines just printed still shaking sideways
    scan: (p, c) => {
      const yb = Math.round(p * 1.08 * H);
      if (yb >= H + 8) return;
      cx.fillStyle = GROUND; cx.fillRect(0, yb, W, H - yb);
      cx.fillStyle = 'rgba(238, 241, 244, 0.07)';
      for (let y = yb + 3; y < H; y += 6) cx.fillRect(0, y, W, 1);
      for (let k = 0; k < 6; k++) { // the fresh lines, shifted
        const y = yb - (k + 1) * c * 2, h = c * 2, dx = (Math.random() - 0.5) * c * 6 * (6 - k) / 6;
        if (y < 0) break;
        cx.drawImage(art, 0, y, W, h, dx, y, W, h);
      }
      cx.fillStyle = '#ff3b3b'; cx.fillRect(0, yb - 2, W, 2);
      cx.fillStyle = '#4d8dff'; cx.fillRect(0, yb + 2, W, 2);
      cx.fillStyle = '#eef1f4'; cx.fillRect(0, yb, W, 2);
    },
    // VoxLogicA: regions grow from seeds over a dark field of sparse dots, their growing edge split red and blue
    grow: (p, c) => {
      for (let n = 0; n < due.length; n++) {
        const d = due[n] - p;
        if (d <= 0) continue;
        const [x, y] = cellAt(n, c);
        cx.fillStyle = d < 0.025 ? (Math.random() < 0.5 ? '#ff3b3b' : '#4d8dff') : d < 0.045 ? '#eef1f4' : Math.random() < 0.08 ? '#7d8590' : GROUND;
        cx.fillRect(x, y, Math.ceil(c), Math.ceil(c));
      }
    },
  };
  WAYS.ripple = WAYS.scatter; // Learn With Love: the same cells, in rings from the centre (its due order)

  const frame = (now) => {
    raf = 0;
    if (t0 < 0) t0 = now;
    const p = Math.min(1, (now - t0) / RESOLVE);
    if (p < 1) { draw(1 - Math.pow(1 - p, 2)); raf = requestAnimationFrame(frame); return; }
    if (stir >= 0 && now - stir < STIR) { draw(1, 0.16 * (1 - (now - stir) / STIR)); raf = requestAnimationFrame(frame); return; }
    stir = -1; cx.drawImage(art, 0, 0);
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

  // starts once a good part of the banner is on screen; checked on scroll and on layout, since the page may open hidden
  const check = () => {
    if (t0 >= 0 || raf) return;
    const r = canvas.getBoundingClientRect();
    if (r.height > 0 && r.top < innerHeight * 0.92 && r.bottom > innerHeight * 0.08) { removeEventListener('scroll', check); wake(); }
  };
  size();
  new ResizeObserver(() => { size(); if (!reduced) check(); }).observe(canvas);
  if (reduced) return;
  addEventListener('scroll', check, { passive: true });
  check();
  (canvas.closest('.piece') || canvas).addEventListener('pointerenter', () => { if (t0 >= 0 && !raf) { stir = performance.now(); wake(); } });
}

document.querySelectorAll('canvas[data-banner]').forEach(banner);
