// make become: the moving parts of the site.
// The hero is the animated outro, drawn live; a click switches it off, like an old TV, and the content comes in.
// The works' cards show their colour channels lining up once, and again lightly on hover; then the page is still.
// Everything draws only while on screen; reduced motion, or no WebGL 2, leaves the still page as it is.

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
const hh = (i) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
const GROUND = [21 / 255, 24 / 255, 28 / 255];

// ---------- WebGL 2 plumbing

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
    const a = gl.getActiveUniform(p, i);
    u[a.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, a.name);
  }
  return { p, u };
}

function texture(gl, source, mip) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}

// A picture as a canvas (SVGs too, which WebGL will not always take directly).
async function raster(img, maxW = 1600) {
  if (!img.complete || !img.naturalWidth) await new Promise((ok, no) => { img.addEventListener('load', ok, { once: true }); img.addEventListener('error', no, { once: true }); });
  const ratio = (+img.getAttribute('height') || img.naturalHeight || 1000) / (+img.getAttribute('width') || img.naturalWidth || 1600);
  const w = /\.svg/.test(img.src) ? maxW : Math.min(maxW, img.naturalWidth || maxW), h = Math.round(w * ratio);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c;
}

const VS_FULL = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;

// Shared fragment code: the disturbed-TV signal of the outro, one parameter k.
// q is in device pixels from the top left. pic(q) is what the screen shows before the signal is disturbed.
const FS_HEAD = `#version 300 es
precision highp float;
uniform sampler2D T;
uniform vec2 R;        // canvas size
uniform vec4 F;        // where the picture sits in the canvas: x, y, w, h
uniform float t, k, s, pr, base;
uniform vec3 P;        // pointer x, y, energy
uniform vec3 G;        // ground
uniform vec2 C0, C1, C2; // extra offset per channel
uniform float X, Z;    // the hero's way out: its progress, and how much of it has faded
uniform int TX;        // 2 while the hero switches off
uniform vec3 L;        // extra scale per channel, about the picture's centre
out vec4 o;
float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(float x) { float i = floor(x), f = fract(x); f = f * f * (3. - 2. * f); return mix(h1(i), h1(i + 1.), f); }
bool outside(vec2 u) { return u.x < 0. || u.y < 0. || u.x > 1. || u.y > 1.; }
vec2 lens(vec2 q, float l) { vec2 c = F.xy + F.zw * .5; return c + (q - c) / (1. + l); }
`;

const FS_TV = `
void main() {
  vec2 q = vec2(gl_FragCoord.x, R.y - gl_FragCoord.y);
  float rad = .26 * min(F.z, F.w);
  vec2 dp = q - P.xy;
  float kk = k + P.z * exp(-dot(dp, dp) / (rad * rad));
  float seed = floor(t * 30.), strip = max(1., 3. * s), i = floor(q.y / strip), n = R.y / strip;
  float j = (vn(i / 12. + seed * 17.31) - .5) * 18. * kk * s + sin(i * .11 + t * 9.) * 1.2 * kk * s;
  float tears = floor(kk * 2.2);
  for (int m = 0; m < 3; m++) {
    float fm = float(m);
    if (fm < tears) {
      float y0 = floor(h1(seed * 3.1 + fm) * n), len = 2. + floor(h1(seed * 5.7 + fm) * 14.);
      if (i >= y0 && i < y0 + len) j += (h1(seed * 9.3 + fm) - .5) * 70. * kk * s;
    }
  }
  vec4 pr4 = pic(lens(q, L.x) - vec2(-5.5 * kk * s + j * 1.15, 0.) - C0), pg4 = pic(lens(q, L.y) - vec2(.6 * kk * s + j * .6, 0.) - C1), pb4 = pic(lens(q, L.z) - vec2(6.5 * kk * s + j * 1.3, 0.) - C2);
  vec3 c = vec3(pr4.r, pg4.g, pb4.b);
  float al = max(pr4.a, max(pg4.a, pb4.a)) * (1. - Z);
  float a = clamp(base * .025 + .14 * kk, 0., .42);
  c = 1. - (1. - c) * (1. - h2(floor(q / max(1., 2. * s)) + seed * 1.7) * a);
  float sl = clamp(base * .1 + .07 * kk, 0., .35) * max(base, clamp(kk * 3., 0., 1.));
  if (mod(q.y, 4. * s) < 2. * s) c *= 1. - sl;
  float by = mod(t * .35, 1.) * (R.y + 300. * s) - 150. * s;
  c = 1. - (1. - c) * (1. - (1. - clamp(abs(q.y - by) / (150. * s), 0., 1.)) * clamp(.03 * kk, 0., .08));
  c *= 1. - clamp(.04 * kk * (.5 + .5 * sin(t * 61.)), 0., .1);
  o = vec4(c * al, al);
}`;

// ---------- the render loop: one for the page, each effect draws only when something changed

const effects = new Set();
let raf = 0, last = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 1 / 60);
  last = now;
  let any = false;
  for (const e of effects) if (e.visible) { any = true; e.step(dt, now / 1000); }
  raf = any ? requestAnimationFrame(loop) : 0;
}
function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
const watcher = new IntersectionObserver((entries) => {
  for (const en of entries) { const e = en.target.__fx; if (e) { e.visible = en.isIntersecting; if (e.visible) wake(); } }
}, { rootMargin: '15% 0px 15% 0px' });
function register(el, e) { el.__fx = e; effects.add(e); watcher.observe(el); }

// Pointer energy: how fast the pointer moves over an element, decaying back to calm.
function pointer(el, toCanvas) {
  const st = { x: -1e4, y: -1e4, e: 0, over: 0, lx: 0, ly: 0, lt: 0 };
  el.addEventListener('pointermove', (ev) => {
    const r = el.getBoundingClientRect(), now = performance.now() / 1000;
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    if (st.lt) { const d = Math.hypot(x - st.lx, y - st.ly), dt = Math.max(0.008, now - st.lt); st.e = Math.max(st.e, Math.min(1.3, d / dt / 1800)); }
    st.lx = x; st.ly = y; st.lt = now;
    [st.x, st.y] = toCanvas(x, y, r);
    st.over = 1;
    wake();
  });
  el.addEventListener('pointerleave', () => { st.over = 0; st.lt = 0; });
  st.decay = (dt) => { st.e *= Math.exp(-dt / 0.3); if (st.e < 0.002) st.e = 0; };
  return st;
}

// ---------- the works

// Whether a work should be there: as soon as its frame is in view (and the content has been shown).
function arrival(el) {
  const c = document.documentElement.classList;
  if (c.contains('leaving') && !c.contains('shown')) return 0;
  const r = el.getBoundingClientRect(), vh = window.innerHeight;
  return r.top < vh * 0.92 && r.bottom > 0 ? 1 : 0;
}

// One vocabulary for every work: the TV split taken to its end. The three colour channels arrive apart and
// register as the work scrolls in; the pointer disturbs the signal around itself and fans the channels out along
// its own direction. Each work has its own variation: where the channels come from, and how much the signal shakes.
// Offsets are fractions of the picture's width; L spreads the channels in scale (red larger, blue smaller).
const WAYS = {
  split:    { C: [[-0.16, 0], [0, 0], [0.16, 0]], L: [0, 0, 0], k: 2.6 },          // Anymatix: side by side, a TV tuning in
  rise:     { C: [[0, -0.1], [0.015, 0], [0, 0.1]], L: [0, 0, 0], k: 0.9 },        // Naima: from above and below
  lens:     { C: [[0, 0], [0, 0], [0, 0]], L: [0.16, 0.05, -0.1], k: 0.5 },         // VoxLogicA 2: in depth, as through a lens
  register: { C: [[-0.24, -0.06], [0.02, 0.09], [0.26, 0.04]], L: [0, 0, 0], k: 2.2 }, // Learn With Love: from three sides
};
const FS_WORK = FS_HEAD + `
uniform vec4 UV; // the picture's crop in the card: scale, offset (object-fit: cover)
vec4 pic(vec2 q) { vec2 r = (q - F.xy) / F.zw; if (outside(r)) return vec4(G, 0.); vec2 u = UV.zw + r * UV.xy; return outside(u) ? vec4(G, 0.) : vec4(textureLod(T, u, max(0., log2(float(textureSize(T, 0).x) / F.z))).rgb, 1.); }` + FS_TV;


async function work(frame) {
  const mode = frame.dataset.fx, img = frame.querySelector('img');
  const cv = document.createElement('canvas');
  cv.setAttribute('aria-hidden', 'true');
  frame.appendChild(cv);
  const gl = cv.getContext('webgl2', { antialias: false, premultipliedAlpha: true, alpha: true });
  const off = () => { cv.remove(); frame.classList.add('off'); };
  if (!gl) { off(); return; }
  const src = await raster(img).catch(() => null);
  if (!src) { off(); return; }
  const cs = getComputedStyle(frame), bleed = ['--bl', '--br', '--bt', '--bb'].map((v) => parseFloat(cs.getPropertyValue(v)) || 0);
  const geo = { W: 0, H: 0, F: [0, 0, 0, 0], d: 1 };
  const size = () => {
    const r = { width: frame.offsetWidth, height: frame.offsetHeight }, d = dpr(); // layout size: the content may be mid-transform
    geo.d = d;
    geo.W = cv.width = Math.round(r.width * (1 + bleed[0] + bleed[1]) * d);
    geo.H = cv.height = Math.round(r.height * (1 + bleed[2] + bleed[3]) * d);
    geo.F = [bleed[0] * r.width * d, bleed[2] * r.height * d, r.width * d, r.height * d];
    st.dirty = true;
  };
  const st = { p: 0, dirty: true, pulse: 0, visible: false };
  // hovering a card plays the split once more, lightly
  (frame.closest('.card') || frame).addEventListener('pointerenter', () => { st.pulse = 1; wake(); });
  const tex = texture(gl, src, true);

  const way = WAYS[mode];
  if (!way) { off(); return; }
  const pg = program(gl, VS_FULL, FS_WORK), kOf = (p) => 0.45 * way.k * Math.pow(1 - p, 1.5);
  const draw = (t) => {
    const [x, y, w, h] = geo.F, p = st.p, D = 0.45 * Math.pow(1 - p, 2) + 0.12 * st.pulse;
    const ia = src.width / src.height, fa = w / h, sx = ia > fa ? fa / ia : 1, sy = ia > fa ? 1 : ia / fa;
    gl.viewport(0, 0, geo.W, geo.H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(pg.p);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform2f(pg.u.R, geo.W, geo.H);
    gl.uniform4f(pg.u.F, x, y, w, h);
    gl.uniform1f(pg.u.t, t);
    gl.uniform1f(pg.u.k, kOf(p) + 0.15 * st.pulse);
    gl.uniform1f(pg.u.s, w / 1600);
    gl.uniform1f(pg.u.pr, p);
    gl.uniform1f(pg.u.base, 0);
    gl.uniform3f(pg.u.P, 0, 0, 0);
    gl.uniform4f(pg.u.UV, sx, sy, (1 - sx) / 2, (1 - sy) / 2);
    gl.uniform3f(pg.u.G, ...GROUND);
    ['C0', 'C1', 'C2'].forEach((n, i) => gl.uniform2f(pg.u[n], way.C[i][0] * D * w, way.C[i][1] * D * w));
    gl.uniform3f(pg.u.L, way.L[0] * D, way.L[1] * D, way.L[2] * D);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  st.live = () => st.pulse > 0 || kOf(st.p) > 0.004; // after the arrival and a hover, nothing moves

  size();
  new ResizeObserver(size).observe(frame);
  let lastP = -1, lastT = 0;
  const e = {
    visible: false,
    step(dt, t) {
      const target = arrival(frame);
      // a quick accent, about half a second, once: the content leads, the effect does not hold up reading
      if (st.arrived) st.p = 1; else st.p += (target - st.p) * (1 - Math.exp(-dt * 7));
      if (st.p > 0.985) st.arrived = true;
      if (Math.abs(target - st.p) < 0.0005) st.p = target;
      st.pulse = st.pulse > 0.004 ? st.pulse * Math.exp(-dt / 0.16) : 0;
      const moving = st.live() || Math.abs(st.p - lastP) > 0.0002;
      if (!st.dirty && !moving) return;
      if (!st.dirty && t - lastT < 1 / 61) return;
      lastP = st.p; lastT = t; st.dirty = false;
      draw(t);
      if (!frame.classList.contains('on')) frame.classList.add('on');
    },
  };
  register(frame, e);
  cv.addEventListener('webglcontextlost', () => { frame.classList.remove('on'); frame.classList.add('off'); effects.delete(e); });
}

// ---------- the hero: the outro (v8), drawn live, then kept alive by the pointer and the scroll

async function hero(el) {
  const cv = el.querySelector('canvas');
  const gl = cv.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) throw new Error('no WebGL 2');
  const FONT = "Manrope, 'Helvetica Neue', Helvetica, Arial, sans-serif";
  const fonts = Promise.all(['800 100px Manrope', '600 100px Manrope', '400 100px Manrope'].map((f) => document.fonts.load(f)));
  const ok = await Promise.race([fonts.then(() => document.fonts.check('800 100px Manrope')), new Promise((r) => setTimeout(() => r(false), 2500))]);
  if (!ok) throw new Error('Manrope did not load');

  const S = document.createElement('canvas'), sx = S.getContext('2d');
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return [c, c.getContext('2d')]; };
  let laid = false, W, H, F, K, s, X0, INKL, B, ASC, VY, M, MX, MY, px, wp, RX, RY, RW, RH, LV, C12;

  function layout() {
    const r = el.getBoundingClientRect(), d = dpr();
    laid = r.width > 2 && r.height > 2;
    if (!laid) return;
    W = cv.width = S.width = Math.round(r.width * d);
    H = cv.height = S.height = Math.round(r.height * d);
    const frac = clamp(0.84 - (r.width - 360) * 0.00034, 0.5, 0.84); // become's share of the width
    const build = (shift) => {
      K = F / 100; s = F / 200;
      X0 = W / 2 - 394 * K / 2 + shift; INKL = X0 + 6.9 * K; B = H / 2 + 0.36 * F; ASC = 0.72 * F; VY = B - ASC * 0.42;
      const ROWS = 6, CELL = ASC / ROWS, SQ = CELL - 1.6 * K, COLS = 14;
      M = F / 1.618; const Gp = 0.105 * M; MX = INKL + 13.6 * K + Gp - 0.0693 * M; MY = B - 0.54 * F - Gp;
      // the pixel trail behind become, receding in depth
      px = []; let cx = INKL - 3 * K;
      for (let c = 0; c < COLS; c++) {
        const sc = 1 - 0.058 * c; if (c > 0) cx -= CELL * (sc + (1 - 0.058 * (c - 1))) / 2;
        for (let rr = 0; rr < ROWS; rr++) {
          if (c > 0 && hh(c * 17 + rr * 5 + 3) > 1 - 0.062 * c) continue;
          const ry = B - ASC + CELL * (rr + 0.5);
          px.push({ x: cx, y: VY + (ry - VY) * sc, size: SQ * sc, c, o: Math.max(0.1, 1 - 0.07 * c), blur: c >= 7 ? (c - 6) * 0.35 * K : 0, delay: 0.4 + 0.55 * hh(c * 31 + rr * 7 + 11) + 0.015 * (COLS - c) });
        }
      }
    };
    // keep the whole lockup, trail included, inside the screen with its clear space (one x-height of become):
    // on a phone the trail would otherwise leave by the left edge
    F = Math.min(W * frac / 3.94, H * 0.26); build(0);
    let XH = 0.54 * F, left = Math.min(...px.map((p) => p.x - p.size / 2)), right = X0 + 380 * K;
    if (right - left + 2 * XH > W) { F *= W / (right - left + 2 * XH); build(0); XH = 0.54 * F; left = Math.min(...px.map((p) => p.x - p.size / 2)); }
    if (left < XH) build(XH - left);
    // the word as a coarse mosaic: each cell becomes a flying pixel
    C12 = 12 * s;
    const word = (ctx, sc, ox, oy) => { ctx.font = `800 ${F * sc}px ${FONT}`; if ('letterSpacing' in ctx) ctx.letterSpacing = `${-3 * K * sc}px`; ctx.fillText('become', ox * sc, oy * sc); };
    const [m12, m12x] = mk(W / C12, H / C12); m12x.fillStyle = '#EEF1F4'; word(m12x, 1 / C12, X0, B);
    wp = [];
    const dd = m12x.getImageData(0, 0, m12.width, m12.height).data;
    for (let j = 0; j < m12.height; j++) for (let i = 0; i < m12.width; i++) if (dd[(j * m12.width + i) * 4 + 3] > 110) {
      const tx = i * C12 + C12 / 2, ty = j * C12 + C12 / 2, k = wp.length;
      wp.push({ tx, ty, sx: -(60 + 420 * hh(k * 3 + 1)) * s, sy: VY + (hh(k * 7 + 2) - 0.5) * 140 * s, delay: 0.3 + 1.0 * (tx - X0) / (394 * K) + 0.18 * hh(k * 5 + 3) }); // v9: the v4 pace
    }
    // the resolution levels: pixels with gaps, ever finer mosaics, the sharp word
    RX = Math.floor((X0 - C12) / C12) * C12; RY = Math.floor((B - ASC - 30 * s) / C12) * C12;
    RW = Math.ceil((394 * K + 40 * s) / C12) * C12; RH = Math.ceil((ASC + 70 * s) / C12) * C12;
    const level = (cell) => {
      const [c, x] = mk(RW, RH); x.fillStyle = '#EEF1F4';
      if (cell === 'gap') { const g = 10.4 * s; for (const q of wp) x.fillRect(q.tx - RX - g / 2, q.ty - RY - g / 2, g, g); return c; }
      if (cell === 0) { word(x, 1, X0 - RX, B - RY); return c; }
      const cc = cell * s, [m, mx] = mk(RW / cc, RH / cc); mx.fillStyle = '#EEF1F4'; word(mx, 1 / cc, X0 - RX, B - RY);
      x.imageSmoothingEnabled = false; x.drawImage(m, 0, 0, m.width * cc, m.height * cc); return c;
    };
    LV = ['gap', 12, 10, 8, 6.5, 5, 4, 3, 2.2, 1.6, 0].map(level);
  }

  function blurred(ctx, blur, draw) { if (blur < 0.3) { draw(0); return; } ctx.save(); ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = blur; ctx.shadowOffsetX = 10000; draw(-10000); ctx.restore(); }

  function scene(t) {
    sx.globalCompositeOperation = 'source-over'; sx.globalAlpha = 1;
    { const L = ease((t - 1.3) / 0.7), a = [7, 8, 10], b = [21, 24, 28]; sx.fillStyle = `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * L)).join(',')})`; }
    sx.fillRect(0, 0, W, H);
    const m = ease(t / 0.9); sx.globalAlpha = m; sx.fillStyle = '#7D8590'; sx.font = `600 ${M.toFixed(1)}px ${FONT}`;
    if ('letterSpacing' in sx) sx.letterSpacing = '0px';
    sx.fillText('make', MX, MY - 26 * s * (1 - m));
    sx.fillStyle = '#EEF1F4';
    for (const p of px) {
      const a = ease((t - p.delay) / 0.9), z = 1 - a, size = p.size * (0.25 + 0.75 * a), x = p.x - (260 + 38 * p.c) * K * z * 0.5, y = VY + (p.y - VY) * (0.4 + 0.6 * a);
      if (a <= 0) continue; sx.globalAlpha = a * p.o; blurred(sx, p.blur, (dx) => sx.fillRect(x - size / 2 + dx, y - size / 2, size, size));
    }
    const front = (u) => clamp((t - (1.62 + 0.33 * u)) / 0.25, 0, 1); // v9
    const g = 10.4 * s;
    for (const q of wp) {
      const u = (q.tx - RX) / RW; if (front(u) > 0) continue; const a = ease((t - q.delay) / 0.55); if (a <= 0) continue;
      const size = g * (0.3 + 0.7 * a), x = q.sx + (q.tx - q.sx) * a, y = q.sy + (q.ty - q.sy) * a; sx.globalAlpha = 0.35 + 0.65 * a; sx.fillRect(x - size / 2, y - size / 2, size, size);
    }
    sx.globalAlpha = 1; const SL = Math.max(2, Math.round(4 * s));
    for (let x0 = 0; x0 < RW; x0 += SL) {
      const f = front((x0 + SL / 2) / RW); if (f <= 0) continue;
      const li = Math.min(LV.length - 1, Math.floor(f * (LV.length - 1) + 0.5)), w = Math.min(SL, RW - x0);
      sx.drawImage(LV[li], x0, 0, w, RH, RX + x0, RY, w, RH);
    }
    // the slogan types itself in: right edge on the last e of become, one x-height below, at become x 0.618^4
    const TAG = "we don't just make", ALL = TAG + '.', TS = F * Math.pow(0.618, 4), T0 = 2.9, CPS = 16, END = T0 + ALL.length / CPS;
    if (t >= T0 - 0.45) {
      sx.fillStyle = '#6B727C'; sx.font = `400 ${TS.toFixed(1)}px ${FONT}`;
      const mm = sx.measureText(TAG), TX = X0 + 375.7 * K - mm.actualBoundingBoxRight, TY = B + 0.54 * F;
      const n = clamp(Math.floor((t - T0) * CPS), 0, ALL.length), typed = ALL.slice(0, n); sx.fillText(typed, TX, TY);
      const on = (t >= T0 && n < ALL.length) || Math.floor((t - T0 + 1) * 2.4) % 2 === 0;
      if (on && t < END + 1.25) sx.fillRect(TX + sx.measureText(typed).width + 2 * s, TY - 0.74 * TS, Math.max(1, 2 * s), 0.96 * TS);
    }
    sx.globalAlpha = 1;
  }

  // the outro's one parameter: almost still at first, one fast burst when the b is formed, then calm
  const param = (t) => {
    const on = ease(t / 0.3), u = (t - 2.05) / 0.75; let burst = 0;
    if (u >= 0 && u <= 1) burst = 2.4 * (u < 0.12 ? u / 0.12 : Math.exp(-(u - 0.12) * 5.2));
    return Math.max(0, on * (0.06 + (t > 2.0 ? 0.04 : 0) + burst + 0.035 * Math.sin(t * 23) * Math.sin(t * 7)));
  };

  const pg = program(gl, VS_FULL, FS_HEAD + `
bool off(vec2 p) { return p.x < 0. || p.y < 0. || p.x > R.x || p.y > R.y; }
vec4 pic(vec2 q) {
  if (TX == 2 && X > 0.) {
    // switched off: the picture folds into a bright line, then into a point, then nothing
    float a = clamp((X - .3) / .3, 0., 1.), b = clamp((X - .6) / .18, 0., 1.);
    a = a * a * (3. - 2. * a); b = b * b * (3. - 2. * b);
    vec2 c = R * .5, p = c + (q - c) / vec2(mix(1., .002, b), mix(1., .003, a));
    if (off(p)) return vec4(G, 1.);
    vec3 col = mix(texture(T, p / R).rgb, vec3(.93, .95, 1.), a * .85);
    return vec4(mix(col, G, clamp((X - .8) / .08, 0., 1.)), 1.);
  }
  return vec4(texture(T, q / R).rgb, 1.);
}` + FS_TV);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const DUR = 5.8, SPEED = 1.6; // the outro's timeline, played 1.6 times faster on the site: about 3.6 s
  let t0 = performance.now() / 1000, uploaded = -1, energy = 0, lastY = window.scrollY, frame = 0;
  const ptr = pointer(el, (x, y) => [x * dpr(), y * dpr()]);
  layout();
  let resizeT = 0;
  new ResizeObserver(() => { clearTimeout(resizeT); resizeT = setTimeout(() => { layout(); uploaded = -1; wake(); }, 120); }).observe(el);

  const again = () => { t0 = performance.now() / 1000; uploaded = -1; wake(); };

  // The gate: the page opens on the hero alone; activating it plays the way out and brings the content in.
  // The way out (the owner's pick): the picture is switched off like an old TV, and the content switches on.
  const html = document.documentElement, way = 2, TXDUR = 0.75, SHOW = 0.8;
  let tx0 = -1;
  const gated = () => html.classList.contains('gate');
  const enter = () => {
    if (!gated()) return;
    tx0 = performance.now() / 1000;
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    html.classList.remove('gate'); html.classList.add('leaving');
    window.scrollTo(0, 0);
    if (!history.state?.inside) history.pushState({ inside: true }, ''); // same address: a reload opens on the hero again
    wake();
  };
  const back = () => {
    tx0 = -1;
    html.classList.remove('leaving', 'shown', 'inside'); html.classList.add('gate');
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    window.scrollTo(0, 0);
    e.visible = true; again();
  };
  el.addEventListener('click', (ev) => { if (!ev.target.closest('a, button')) enter(); });
  el.querySelector('.enter').addEventListener('click', enter);
  el.querySelector('.nav a[href="#work"]')?.addEventListener('click', (ev) => { if (gated()) { ev.preventDefault(); enter(); } });
  document.querySelector('.skip')?.addEventListener('click', (ev) => { if (gated()) { ev.preventDefault(); enter(); } });
  document.querySelector('.mark')?.addEventListener('click', (ev) => { ev.preventDefault(); if (history.state?.inside) history.back(); else { history.replaceState(null, '', location.pathname + location.search); back(); } });
  window.addEventListener('popstate', (ev) => {
    if (gated() && ev.state?.inside) enter();
    else if (html.classList.contains('inside') && !ev.state?.inside && !location.hash) back();
  });
  window.addEventListener('keydown', (ev) => { if (gated() && ['Enter', ' ', 'ArrowDown', 'PageDown'].includes(ev.key) && !ev.target.closest('a, button')) { ev.preventDefault(); enter(); } });
  window.addEventListener('wheel', (ev) => { if (gated() && ev.deltaY > 4) enter(); }, { passive: true });
  let ty = null;
  window.addEventListener('touchstart', (ev) => { ty = ev.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchmove', (ev) => { if (gated() && ty !== null && ty - ev.touches[0].clientY > 30) { ty = null; enter(); } }, { passive: true });

  const e = {
    visible: true,
    step(dt, now) {
      if (!laid) return;
      const t = (now - t0) * SPEED, intro = t < DUR;
      const tt = Math.min(t, DUR);
      if (intro || uploaded !== DUR) {
        scene(tt);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, S);
        uploaded = intro ? tt : DUR;
      }
      // after the outro: the signal breathes, the pointer's speed and the scroll disturb it, leaving changes channel
      const y = window.scrollY, dy = Math.abs(y - lastY); lastY = y;
      energy = Math.min(1.6, energy * Math.exp(-dt / 0.35) + dy / 900);
      ptr.decay(dt);
      const leave = tx0 < 0 ? 1.4 * ease(clamp((y / el.offsetHeight - 0.25) / 0.6, 0, 1)) : 0;
      let k = intro ? param(t) : 0.06 + 0.035 * Math.sin(now * 23) * Math.sin(now * 7) + energy + leave, X = 0, Z = 0;
      if (tx0 >= 0) {
        X = clamp((now - tx0) / TXDUR, 0, 1);
        { k += X < 0.3 ? 2.6 * X / 0.3 : 2.6 * (1 - clamp((X - 0.3) / 0.3, 0, 1)); Z = clamp((X - 0.86) / 0.1, 0, 1); }
        if (X >= SHOW && !html.classList.contains('shown')) html.classList.add('shown');
        if (X >= 1) { html.classList.remove('leaving'); html.classList.add('inside'); tx0 = -1; e.visible = false; return; }
      }
      // idle and settled: half the frame rate is enough for the grain
      frame++;
      if (!intro && tx0 < 0 && energy < 0.01 && ptr.e < 0.01 && leave < 0.01 && frame % 2) return;
      gl.viewport(0, 0, W, H);
      gl.useProgram(pg.p);
      gl.uniform2f(pg.u.R, W, H);
      gl.uniform4f(pg.u.F, 0, 0, W, H);
      gl.uniform1f(pg.u.t, now);
      gl.uniform1f(pg.u.k, k);
      gl.uniform1f(pg.u.s, s);
      gl.uniform1f(pg.u.pr, 1);
      gl.uniform1f(pg.u.base, 1);
      gl.uniform3f(pg.u.P, ptr.x, ptr.y, ptr.e * 1.2);
      gl.uniform3f(pg.u.G, ...GROUND);
      gl.uniform2f(pg.u.C0, 0, 0); gl.uniform2f(pg.u.C1, 0, 0); gl.uniform2f(pg.u.C2, 0, 0);
      gl.uniform1f(pg.u.X, X); gl.uniform1f(pg.u.Z, Z); gl.uniform1i(pg.u.TX, tx0 >= 0 ? way : 0);
      gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!el.classList.contains('on')) {
        el.classList.add('on');
        // close the gate only when the hero really runs, the page is at its top and no section was asked for
        if (!location.hash && window.scrollY < 10) { html.classList.add('gate'); el.querySelector('.enter').hidden = false; }
      }
    },
  };
  register(el, e);
  cv.addEventListener('webglcontextlost', () => { el.classList.remove('on'); effects.delete(e); });
  wake();
}

if (reduced) document.documentElement.classList.add('still');
else {
  const h = document.querySelector('.hero');
  if (h) hero(h).catch((err) => { console.warn('hero:', err.message); h.classList.remove('on'); document.documentElement.classList.add('still'); });
  for (const f of document.querySelectorAll('.frame[data-fx]')) work(f).catch((err) => { console.warn('work:', err); f.classList.remove('on'); f.classList.add('off'); });
}
