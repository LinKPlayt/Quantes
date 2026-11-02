// WarBreach — graphics engine: terrain, foliage, sprites, real-time lighting, bloom,
// color grading, weather and the particle renderer.
'use strict';

const GFX = { sprites: {}, glow: {}, foliage: [], lamps: [], river: null, geo: null, lightCv: null, bloomCv: null, grainPat: null, fog: null, snow: [], splashes: [] };

function gfxQuality() {
  if (S && S.settings && S.settings.lowfx) return 'low';
  return (S && S.settings && S.settings.gfx) || 'ultra';
}

/* ---------------- Small helpers ---------------- */
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbHex(c) { return '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }
function rgbStr(c, a = 1) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function mixRgb(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

// Smooth value noise with a few octaves (fractal Brownian motion).
function makeFbm(seed) {
  const r = mulberry(seed), N = 64, v = new Float32Array(N * N);
  for (let i = 0; i < v.length; i++) v[i] = r();
  const s = t => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const i = (a, b) => v[((b & (N - 1)) * N) + (a & (N - 1))];
    const a = i(xi, yi), b = i(xi + 1, yi), c = i(xi, yi + 1), d = i(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x, y) => {
    let t = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 4; o++) { t += noise(x * f, y * f) * amp; amp *= 0.5; f *= 2.03; }
    return t / 0.9375;
  };
}

// A low-resolution colour field, upscaled with smoothing to give soft natural variation.
function noiseField(w, h, seed, freq, lo, hi, alphaLo = 1, alphaHi = 1) {
  const c = makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const f = makeFbm(seed), a = hexRgb(lo), b = hexRgb(hi);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = Math.max(0, Math.min(1, (f(x / w * freq, y / h * freq) - 0.2) * 1.6));
    const i = (y * w + x) * 4;
    d[i] = a[0] + (b[0] - a[0]) * n; d[i + 1] = a[1] + (b[1] - a[1]) * n; d[i + 2] = a[2] + (b[2] - a[2]) * n;
    d[i + 3] = 255 * (alphaLo + (alphaHi - alphaLo) * n);
  }
  g.putImageData(img, 0, 0);
  return c;
}

function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
}

/* ---------------- Sprites ---------------- */
function radialSprite(size, stops) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
function puffSprite(size, base, seed) {
  // a lumpy smoke puff: several soft blobs
  const c = makeCanvas(size, size), g = c.getContext('2d'), r = mulberry(seed);
  const col = hexRgb(base);
  for (let i = 0; i < 7; i++) {
    const x = size * (0.3 + r() * 0.4), y = size * (0.3 + r() * 0.4), rad = size * (0.18 + r() * 0.16);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, rgbStr(mixRgb(col, [255, 255, 255], 0.12), 0.55)); gr.addColorStop(1, rgbStr(col, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  return c;
}
function glowSprite(color) {
  if (GFX.glow[color]) return GFX.glow[color];
  let rgb;
  if (color[0] === '#') rgb = hexRgb(color);
  else { const m = color.match(/\d+/g); rgb = m ? m.slice(0, 3).map(Number) : [255, 200, 120]; }
  return (GFX.glow[color] = radialSprite(64, [[0, rgbStr(rgb, 1)], [0.35, rgbStr(rgb, 0.45)], [1, rgbStr(rgb, 0)]]));
}
function initSprites() {
  const S2 = GFX.sprites;
  S2.light = radialSprite(128, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  S2.ao = radialSprite(128, [[0, 'rgba(0,0,0,0.55)'], [0.6, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]);
  S2.fireball = radialSprite(128, [[0, 'rgba(255,255,240,1)'], [0.18, 'rgba(255,236,150,1)'], [0.42, 'rgba(255,150,40,0.9)'], [0.7, 'rgba(200,60,20,0.45)'], [1, 'rgba(80,20,10,0)']]);
  S2.puffLight = puffSprite(96, '#cfcabb', 11);
  S2.puffDark = puffSprite(96, '#3a3632', 23);
  S2.puffFire = radialSprite(64, [[0, 'rgba(255,240,180,1)'], [0.35, 'rgba(255,150,50,0.8)'], [1, 'rgba(200,50,10,0)']]);
  const warm = 'rgba(255,190,110,1)';
  GFX.lightColors = { warm, fire: 'rgba(255,140,50,1)', white: 'rgba(230,240,255,1)', blue: 'rgba(110,190,255,1)', red: 'rgba(255,80,60,1)', green: 'rgba(140,255,140,1)' };
  // film grain tile
  const gc = makeCanvas(160, 160), gg = gc.getContext('2d'), gi = gg.createImageData(160, 160), r = mulberry(5);
  for (let i = 0; i < gi.data.length; i += 4) { const v = 110 + r() * 60; gi.data[i] = gi.data[i + 1] = gi.data[i + 2] = v; gi.data[i + 3] = 255; }
  gg.putImageData(gi, 0, 0);
  GFX.grainCv = gc;
  // fog texture
  GFX.fog = noiseField(128, 128, 77, 3, '#d8dcd2', '#ffffff', 0, 0.9);
}

/* ---------------- Foliage sprites ---------------- */
function treeSprite(kind, T, seed) {
  const W = 120, H = 140, c = makeCanvas(W, H), g = c.getContext('2d'), r = mulberry(seed);
  const dark = hexRgb(T.trees[0]), mid = hexRgb(T.trees[1]), light = hexRgb(T.trees[2]);
  const winter = T === THEMES.winter, desert = T === THEMES.desert;
  const blob = (x, y, rad) => {
    const gr = g.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
    gr.addColorStop(0, rgbStr(mixRgb(light, [255, 255, 220], 0.18)));
    gr.addColorStop(0.55, rgbStr(mid));
    gr.addColorStop(1, rgbStr(mixRgb(dark, [0, 0, 0], 0.25)));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  if (kind === 'pine') {
    g.fillStyle = '#3b2c1c'; g.fillRect(W / 2 - 4, H - 30, 8, 26);
    for (let i = 0; i < 4; i++) {
      const y = H - 28 - i * 24, w = 46 - i * 9;
      const gr = g.createLinearGradient(W / 2 - w, 0, W / 2 + w, 0);
      gr.addColorStop(0, rgbStr(mixRgb(light, [255, 255, 220], 0.1))); gr.addColorStop(0.5, rgbStr(mid)); gr.addColorStop(1, rgbStr(mixRgb(dark, [0, 0, 0], 0.3)));
      g.fillStyle = gr; g.beginPath(); g.moveTo(W / 2 - w, y); g.lineTo(W / 2, y - 40); g.lineTo(W / 2 + w, y); g.quadraticCurveTo(W / 2, y + 8, W / 2 - w, y); g.fill();
      if (winter) { g.fillStyle = 'rgba(245,250,255,0.92)'; g.beginPath(); g.moveTo(W / 2 - w * 0.55, y - 16); g.lineTo(W / 2, y - 40); g.lineTo(W / 2 + w * 0.3, y - 22); g.quadraticCurveTo(W / 2, y - 14, W / 2 - w * 0.55, y - 16); g.fill(); }
    }
  } else if (kind === 'palm') {
    g.strokeStyle = '#6b5236'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(W / 2 + 6, H - 6); g.quadraticCurveTo(W / 2 - 14, H - 60, W / 2 - 2, H - 98); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const t = i / 7, y = H - 10 - t * 86, x = W / 2 + 6 - Math.sin(t * 2.2) * 14; g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y - 2); g.stroke(); }
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.5, len = 40 + r() * 12, cx = W / 2 - 2, cy = H - 98;
      const ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len * 0.6 + 18;
      g.strokeStyle = rgbStr(i % 2 ? mid : light); g.lineWidth = 7;
      g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo((cx + ex) / 2, cy - 18, ex, ey); g.stroke();
    }
    g.fillStyle = '#7a5a2a'; g.beginPath(); g.arc(W / 2 - 2, H - 96, 6, 0, Math.PI * 2); g.fill();
  } else if (kind === 'bush') {
    for (let i = 0; i < 5; i++) blob(W / 2 + (r() - 0.5) * 40, H - 26 - r() * 18, 16 + r() * 8);
    if (!winter && !desert) { g.fillStyle = r() < 0.5 ? '#e8d24a' : '#e86a6a'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(W / 2 + (r() - 0.5) * 50, H - 30 - r() * 22, 2, 0, Math.PI * 2); g.fill(); } }
  } else {
    // broadleaf tree
    g.fillStyle = '#3b2c1c'; g.beginPath(); g.moveTo(W / 2 - 6, H - 4); g.lineTo(W / 2 - 3, H - 50); g.lineTo(W / 2 + 3, H - 50); g.lineTo(W / 2 + 6, H - 4); g.fill();
    const pts = [[0, -78, 30], [-22, -64, 24], [22, -62, 25], [-10, -96, 22], [14, -92, 21], [0, -58, 24]];
    for (const [ox, oy, rad] of pts) blob(W / 2 + ox + (r() - 0.5) * 6, H + oy, rad * (0.9 + r() * 0.2));
    // dappled highlights
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(255,255,210,${0.08 + r() * 0.1})`; g.beginPath(); g.arc(W / 2 - 20 + r() * 34, H - 110 + r() * 50, 2 + r() * 3, 0, Math.PI * 2); g.fill(); }
    if (winter) { g.fillStyle = 'rgba(245,250,255,0.85)'; for (const [ox, oy, rad] of pts) { g.beginPath(); g.ellipse(W / 2 + ox - rad * 0.2, H + oy - rad * 0.55, rad * 0.65, rad * 0.32, 0, 0, Math.PI * 2); g.fill(); } }
  }
  return c;
}

/* ---------------- Terrain (cached) ---------------- */
function buildGroundCanvas(scale, themeId) {
  const T = THEMES[themeId] || THEMES.forest;
  const winter = T === THEMES.winter, desert = T === THEMES.desert;
  const W = MAP_W * TILE, H = MAP_H * TILE;
  const c = makeCanvas(W * scale, H * scale), g = c.getContext('2d');
  g.scale(scale, scale);
  const rnd = mulberry(1944);
  const bx = BORDER * TILE, by = BORDER * TILE, bw = (MAP_W - BORDER * 2) * TILE, bh = (MAP_H - BORDER * 2) * TILE;
  const midY = (MAP_H / 2) * TILE;
  const fx0 = bx - 14, fy0 = by - 14, fx1 = bx + bw + 14, fy1 = by + bh + 14;
  GFX.geo = { W, H, bx, by, bw, bh, midY, fx0, fy0, fx1, fy1 };

  // 1. wild ground with soft noise variation
  g.fillStyle = T.wild; g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = true;
  g.globalAlpha = 0.9; g.drawImage(noiseField(160, 116, 31, 5, T.wild2, rgbHex(mixRgb(hexRgb(T.wild), [255, 255, 220], 0.12))), 0, 0, W, H);
  g.globalAlpha = 0.35; g.drawImage(noiseField(220, 160, 57, 14, T.wild2, T.wild), 0, 0, W, H);
  g.globalAlpha = 1;

  // 2. river along the southern edge, with sandy banks
  const pts = [];
  for (let x = -40; x <= W + 40; x += 20) pts.push({ x, y: H - 62 + Math.sin(x / 150) * 14 + Math.sin(x / 47) * 4 });
  const riverPath = new Path2D();
  pts.forEach((p, i) => (i ? riverPath.lineTo(p.x, p.y - 20) : riverPath.moveTo(p.x, p.y - 20)));
  for (let i = pts.length - 1; i >= 0; i--) riverPath.lineTo(pts[i].x, pts[i].y + 22);
  riverPath.closePath();
  const bank = new Path2D();
  pts.forEach((p, i) => (i ? bank.lineTo(p.x, p.y - 34) : bank.moveTo(p.x, p.y - 34)));
  for (let i = pts.length - 1; i >= 0; i--) bank.lineTo(pts[i].x, pts[i].y + 36);
  bank.closePath();
  g.fillStyle = winter ? '#c9d2d8' : desert ? '#d8c08a' : '#a8946a'; g.fill(bank);
  g.save(); g.clip(bank);
  for (let i = 0; i < 260; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'; g.beginPath(); g.arc(rnd() * W, H - 100 + rnd() * 90, 1 + rnd() * 2, 0, Math.PI * 2); g.fill(); }
  g.restore();
  const wg = g.createLinearGradient(0, H - 90, 0, H - 30);
  wg.addColorStop(0, winter ? '#9fc2d4' : '#3f7a8c'); wg.addColorStop(0.5, winter ? '#7aa6bf' : '#2c5f73'); wg.addColorStop(1, winter ? '#9fc2d4' : '#3f7a8c');
  g.fillStyle = wg; g.fill(riverPath);
  g.save(); g.clip(riverPath);
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3;
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y - 17) : g.moveTo(p.x, p.y - 17))); g.stroke();
  g.strokeStyle = 'rgba(0,30,40,0.25)'; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y + 19) : g.moveTo(p.x, p.y + 19))); g.stroke();
  if (winter) { g.fillStyle = 'rgba(235,245,250,0.55)'; for (let i = 0; i < 30; i++) { g.beginPath(); g.ellipse(rnd() * W, H - 62 + (rnd() - 0.5) * 30, 20 + rnd() * 40, 6 + rnd() * 6, 0, 0, Math.PI * 2); g.fill(); } }
  g.restore();
  GFX.river = { path: riverPath, pts };

  // 3. roads with verges, gravel and tyre ruts
  const roads = [
    [{ x: -20, y: midY - 30 }, { x: W * 0.06, y: midY - 60 }, { x: W * 0.09, y: midY + 20 }, { x: bx + 10, y: midY }],
    [{ x: W + 20, y: midY + 40 }, { x: W * 0.94, y: midY + 70 }, { x: W * 0.91, y: midY - 10 }, { x: W - bx - 10, y: midY }],
    [{ x: W * 0.5 + 30, y: -20 }, { x: W * 0.52, y: H * 0.07 }, { x: W * 0.47, y: H * 0.1 }, { x: W * 0.5, y: by + 10 }],
  ];
  const strokeRoad = (rd, width, style, dash) => {
    g.strokeStyle = style; g.lineWidth = width; g.lineCap = 'round'; g.setLineDash(dash || []);
    g.beginPath(); g.moveTo(rd[0].x, rd[0].y); g.bezierCurveTo(rd[1].x, rd[1].y, rd[2].x, rd[2].y, rd[3].x, rd[3].y); g.stroke();
  };
  for (const rd of roads) strokeRoad(rd, TILE * 2.3, 'rgba(0,0,0,0.12)');
  for (const rd of roads) strokeRoad(rd, TILE * 1.9, T.dirtDark);
  for (const rd of roads) strokeRoad(rd, TILE * 1.45, T.road);
  for (const rd of roads) {
    for (let i = 0; i < 160; i++) {
      const p = bez(rd[0], rd[1], rd[2], rd[3], rnd());
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,240,0.12)' : 'rgba(30,20,10,0.16)';
      g.beginPath(); g.arc(p.x + (rnd() - 0.5) * TILE * 1.2, p.y + (rnd() - 0.5) * TILE * 1.2, 0.8 + rnd() * 1.8, 0, Math.PI * 2); g.fill();
    }
    for (const off of [-10, 10]) {
      const o = rd.map(p => ({ x: p.x, y: p.y + off }));
      strokeRoad(o, 4, 'rgba(40,28,16,0.28)', [14, 6]);
    }
    // puddles
    for (let i = 0; i < 4; i++) {
      const p = bez(rd[0], rd[1], rd[2], rd[3], 0.15 + rnd() * 0.7);
      g.fillStyle = winter ? 'rgba(200,225,240,0.6)' : 'rgba(70,90,100,0.45)'; g.beginPath(); g.ellipse(p.x + (rnd() - 0.5) * 20, p.y + (rnd() - 0.5) * 12, 10 + rnd() * 10, 4 + rnd() * 3, rnd(), 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(p.x - 3, p.y - 1, 5, 1.5, 0, 0, Math.PI * 2); g.fill();
    }
  }
  g.setLineDash([]);
  GFX.roads = roads;

  // 4. the compound: a gravel rim and mown lawn with stripes
  g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, bx - 8, by - 4, bw + 16, bh + 16, 12); g.fill();
  g.fillStyle = T.dirt; rr(g, bx - 8, by - 8, bw + 16, bh + 16, 12); g.fill();
  for (let i = 0; i < 500; i++) {
    const side = rnd() * 4 | 0, t = rnd();
    const x = side < 2 ? bx - 6 + t * (bw + 12) : (side === 2 ? bx - 4 : bx + bw + 4), y = side >= 2 ? by - 6 + t * (bh + 12) : (side === 0 ? by - 4 : by + bh + 4);
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,240,0.18)' : 'rgba(0,0,0,0.18)'; g.fillRect(x, y, 2, 2);
  }
  g.save(); rr(g, bx, by, bw, bh, 6); g.clip();
  g.fillStyle = T.a; g.fillRect(bx, by, bw, bh);
  const stripeW = TILE * 2;
  for (let i = -bh; i < bw + bh; i += stripeW * 2) {
    g.fillStyle = rgbStr(hexRgb(T.b), 0.85);
    g.beginPath(); g.moveTo(bx + i, by); g.lineTo(bx + i + stripeW, by); g.lineTo(bx + i + stripeW - bh * 0.5, by + bh); g.lineTo(bx + i - bh * 0.5, by + bh); g.closePath(); g.fill();
  }
  g.globalAlpha = 0.45; g.drawImage(noiseField(140, 90, 91, 9, T.wild2, T.a, 0, 0.6), bx, by, bw, bh); g.globalAlpha = 1;
  // faint survey grid so tiles stay readable
  g.strokeStyle = 'rgba(0,0,0,0.045)'; g.lineWidth = 1; g.beginPath();
  for (let x = BORDER; x <= MAP_W - BORDER; x++) { g.moveTo(x * TILE, by); g.lineTo(x * TILE, by + bh); }
  for (let y = BORDER; y <= MAP_H - BORDER; y++) { g.moveTo(bx, y * TILE); g.lineTo(bx + bw, y * TILE); }
  g.stroke();
  // inner shadow along the rim
  const edge = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); return gr; };
  g.fillStyle = edge(bx, by, bx, by + 30); g.fillRect(bx, by, bw, 30);
  g.fillStyle = edge(bx, by, bx + 30, by); g.fillRect(bx, by, 30, bh);
  g.restore();

  // 5. grass blades, flowers and pebbles
  const bladeA = winter ? 'rgba(255,255,255,0.55)' : T.tuftA, bladeB = T.tuftB;
  const blades = desert ? 900 : 4200;
  for (let i = 0; i < blades; i++) {
    const x = rnd() * W, y = rnd() * H;
    const inside = x > bx && x < bx + bw && y > by && y < by + bh;
    const len = inside ? 2.5 + rnd() * 2 : 3 + rnd() * 5;
    g.strokeStyle = rnd() < 0.5 ? bladeA : bladeB; g.lineWidth = inside ? 0.8 : 1.1;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - 1, y - len * 0.6, x - 2 + rnd() * 4, y - len);
    g.moveTo(x + 1.5, y); g.quadraticCurveTo(x + 2, y - len * 0.5, x + 3 + rnd() * 2, y - len * 0.85); g.stroke();
  }
  const dotCols = winter ? ['#ffffff', '#e8f2f8'] : desert ? ['#a88a55', '#e8d8b0', '#8a6f45'] : ['#f2e8c0', '#e8d24a', '#c8a0e0', '#ffffff'];
  for (let i = 0; i < 420; i++) {
    const x = rnd() * W, y = rnd() * H;
    if (x > fx0 - 10 && x < fx1 + 10 && y > fy0 - 10 && y < fy1 + 10) continue;
    g.fillStyle = dotCols[(rnd() * dotCols.length) | 0]; g.beginPath(); g.arc(x, y, 1 + rnd() * 1.4, 0, Math.PI * 2); g.fill();
  }

  // 6. fence with posts, barbed wire, gate booms and lamp posts
  const gap = TILE * 1.2;
  GFX.lamps = [];
  const fenceLine = (x0, y0, x1, y1, gateAt, horiz) => {
    const len = horiz ? x1 - x0 : y1 - y0, step = 22;
    let k = 0;
    for (let d = 0; d <= len; d += step, k++) {
      const p = (horiz ? x0 : y0) + d;
      if (gateAt != null && Math.abs(p - gateAt) < gap) continue;
      const x = horiz ? p : x0, y = horiz ? y0 : p;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 1, y + 1, 3, 4);
      g.fillStyle = '#3b2f22'; g.fillRect(x - 1.5, y - 8, 3, 10);
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x - 1.5, y - 8, 1, 10);
      const n = p + step;
      if (d + step <= len && !(gateAt != null && Math.abs(n - gateAt) < gap)) {
        const nx = horiz ? n : x0, ny = horiz ? y0 : n;
        g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x + 2, y - 2); g.lineTo(nx + 2, ny - 2); g.stroke();
        g.strokeStyle = 'rgba(210,210,200,0.7)';
        g.beginPath(); g.moveTo(x, y - 6); g.lineTo(nx, ny - 6); g.moveTo(x, y - 2); g.lineTo(nx, ny - 2); g.stroke();
        const mx = (x + nx) / 2, my = (y + ny) / 2;
        g.beginPath(); g.moveTo(mx - 2, my - 8); g.lineTo(mx + 2, my - 4); g.moveTo(mx + 2, my - 8); g.lineTo(mx - 2, my - 4); g.stroke();
      }
      if (k % 9 === 4) {
        // lamp post: pole and lamp head (the bulb glows at night)
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 3, y + 1, 10, 3);
        g.fillStyle = '#2b2e33'; g.fillRect(x - 1.5, y - 26, 3, 26);
        g.fillStyle = '#3c4148'; rr(g, x - 5, y - 30, 10, 5, 2); g.fill();
        g.fillStyle = '#e8e0b8'; g.fillRect(x - 3, y - 25.5, 6, 1.5);
        GFX.lamps.push({ x, y: y - 24 });
      }
    }
  };
  fenceLine(fx0, fy0, fx1, fy0, W * 0.5, true);
  fenceLine(fx0, fy1, fx1, fy1, null, true);
  fenceLine(fx0, fy0, fx0, fy1, midY, false);
  fenceLine(fx1, fy0, fx1, fy1, midY, false);
  const boom = (x, y, vertical) => {
    g.save(); g.translate(x, y);
    if (vertical) g.rotate(Math.PI / 2);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-gap - 2, -4, gap * 2, 10);
    g.fillStyle = '#2b2b25'; g.fillRect(-gap - 4, -7, 9, 14);
    g.fillStyle = PAL.hazard; g.fillRect(-gap - 4, -7, 9, 2);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? PAL.red : '#e9e4d4'; g.fillRect(-gap + 5 + i * ((gap * 2 - 10) / 6), -2.5, (gap * 2 - 10) / 6, 5); }
    g.restore();
  };
  boom(fx0, midY, true); boom(fx1, midY, true); boom(W * 0.5, fy0, false);

  // 7. foliage positions (drawn live so they sway) with their shadows baked in, plus rocks
  const inCompound = (x, y) => x > fx0 - 30 && x < fx1 + 30 && y > fy0 - 30 && y < fy1 + 40;
  const onRoad = (x, y) => roads.some(rd => { for (let t = 0; t <= 1; t += 0.05) { const p = bez(rd[0], rd[1], rd[2], rd[3], t); if (Math.hypot(p.x - x, p.y - y) < 52) return true; } return false; });
  const inRiver = (x, y) => y > H - 104;
  const kinds = desert ? ['palm', 'bush', 'palm', 'bush', 'oak'] : winter ? ['pine', 'pine', 'oak', 'bush'] : ['oak', 'oak', 'pine', 'bush', 'oak'];
  GFX.foliage = [];
  for (let i = 0; i < 420 && GFX.foliage.length < 190; i++) {
    const x = rnd() * W, y = rnd() * (H - 20);
    if (inCompound(x, y) || onRoad(x, y) || inRiver(x, y)) continue;
    const kind = kinds[(rnd() * kinds.length) | 0];
    const s = (kind === 'bush' ? 0.32 : 0.42) + rnd() * 0.16;
    GFX.foliage.push({ x, y, kind, v: (rnd() * 3) | 0, s, ph: rnd() * 6 });
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(x + 14 * s * 2, y + 4, (kind === 'bush' ? 22 : 30) * s * 1.6, 9 * s * 1.6, -0.2, 0, Math.PI * 2); g.fill();
  }
  GFX.foliage.sort((a, b) => a.y - b.y);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * W, y = rnd() * (H - 110);
    if (inCompound(x, y) || onRoad(x, y)) continue;
    const r = 6 + rnd() * 10, a = rnd();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 4, y + 4, r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 1, x, y, r);
    gr.addColorStop(0, winter ? '#f4f8fb' : '#a4a396'); gr.addColorStop(1, winter ? '#a8b4bc' : '#5e5d53');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.75, a, 0, Math.PI * 2); g.fill();
  }

  // 8. lighting: warm sun from the top-left, darker toward the edges
  const light = g.createLinearGradient(0, 0, W, H);
  light.addColorStop(0, 'rgba(255,236,180,0.12)'); light.addColorStop(0.55, 'rgba(255,236,180,0)'); light.addColorStop(1, 'rgba(0,10,0,0.2)');
  g.fillStyle = light; g.fillRect(0, 0, W, H);
  const vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = vig; g.fillRect(0, 0, W, H);

  g.save(); g.globalAlpha = 0.13; g.fillStyle = '#e8e2c8';
  g.font = `bold ${TILE * 0.9}px "Black Ops One", Impact, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText('SECTOR 7', bx + 10, by + bh - TILE * 1.1);
  g.restore();

  // foliage sprites for this theme
  GFX.treeSprites = {};
  for (const k of ['oak', 'pine', 'bush', 'palm']) GFX.treeSprites[k] = [0, 1, 2].map(v => treeSprite(k, T, 400 + v * 17 + k.length));
  return c;
}

/* ---------------- Live world layers ---------------- */
function viewRect(pad = 60) {
  const hw = vw / 2 / cam.z + pad, hh = vh / 2 / cam.z + pad;
  return { x0: cam.x - hw, x1: cam.x + hw, y0: cam.y - hh, y1: cam.y + hh };
}

function drawWater(ctx) {
  if (!GFX.river || gfxQuality() === 'low') return;
  const v = viewRect();
  if (v.y1 < MAP_H * TILE - 110) return;
  ctx.save(); ctx.clip(GFX.river.path);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const p = GFX.river.pts[(i * 7) % GFX.river.pts.length];
    const off = ((tSec * 18 + i * 37) % 120) - 60;
    const y = p.y + Math.sin(i * 2.3) * 12;
    ctx.beginPath(); ctx.moveTo(p.x + off, y); ctx.quadraticCurveTo(p.x + off + 8, y - 2 + Math.sin(tSec * 2 + i), p.x + off + 18, y); ctx.stroke();
  }
  ctx.restore();
}

function drawFoliage(ctx) {
  if (!GFX.treeSprites) return;
  const v = viewRect(80), q = gfxQuality();
  for (const f of GFX.foliage) {
    if (f.x < v.x0 || f.x > v.x1 || f.y < v.y0 || f.y > v.y1 + 60) continue;
    const spr = GFX.treeSprites[f.kind][f.v];
    const w = spr.width * f.s, h = spr.height * f.s;
    if (q === 'low') { ctx.drawImage(spr, f.x - w / 2, f.y - h + 4 * f.s, w, h); continue; }
    const sway = Math.sin(tSec * 1.2 + f.ph) * 0.035 + Math.sin(tSec * 2.9 + f.ph * 2) * 0.012;
    ctx.save(); ctx.translate(f.x, f.y + 4 * f.s); ctx.transform(1, 0, sway, 1, 0, 0);
    ctx.drawImage(spr, -w / 2, -h, w, h);
    ctx.restore();
  }
}

// Soft contact shadows ground every building.
function drawContactShadows(ctx, list) {
  const spr = GFX.sprites.ao;
  for (const b of list) {
    if (b._dead || DEFS[b.type].trap) continue;
    const n = DEFS[b.type].size * TILE, x = b.x * TILE, y = b.y * TILE;
    if (n <= TILE) { ctx.globalAlpha = 0.5; ctx.drawImage(spr, x - 4, y + 2, n + 8, n + 4); continue; }
    ctx.globalAlpha = 0.85; ctx.drawImage(spr, x - n * 0.12 + 6, y - n * 0.04 + 6, n * 1.24, n * 1.2);
  }
  ctx.globalAlpha = 1;
}

/* ---------------- Particles ---------------- */
function drawParticlesFX(ctx) {
  const v = viewRect(30), q = gfxQuality();
  for (const p of particles) {
    if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
    const a = clamp(p.life / p.max, 0, 1);
    if (p.color === 'smoke' || p.color === 'smoke-dark') {
      const spr = p.color === 'smoke' ? GFX.sprites.puffLight : GFX.sprites.puffDark;
      const r = p.r * 2.6;
      ctx.globalAlpha = a * (p.color === 'smoke' ? 0.55 : 0.75);
      if (q !== 'low' && p.rot != null) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.drawImage(spr, -r, -r, r * 2, r * 2); ctx.restore();
      } else ctx.drawImage(spr, p.x - r, p.y - r, r * 2, r * 2);
      continue;
    }
    if (p.kind === 'debris') {
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
      ctx.fillStyle = p.color; ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
      ctx.restore();
      continue;
    }
    if (p.kind === 'spark') {
      ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = p.color; ctx.lineWidth = p.r; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      continue;
    }
    if (p.kind === 'casing') {
      ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = '#d9a33a';
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0); ctx.fillRect(-1.6, -0.7, 3.2, 1.4); ctx.restore();
      continue;
    }
    if (p.glow && q !== 'low') {
      ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter';
      const r = p.r * 2.2, spr = glowSprite(p.color);
      ctx.drawImage(spr, p.x - r, p.y - r, r * 2, r * 2);
      ctx.globalCompositeOperation = 'source-over';
      continue;
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function updateParticle(p, dt) {
  p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
  if (p.grow) p.r += p.grow * dt;
  if (p.vr) p.rot = (p.rot || 0) + p.vr * dt;
  if (p.floor != null && p.y > p.floor) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.55; if (p.vr) p.vr *= 0.5; if (Math.abs(p.vy) < 12) { p.vy = 0; p.g = 0; } }
}

// The big upgrade for explosions: fireball, rolling smoke, debris and sparks.
function gfxExplosion(x, y, size) {
  const q = gfxQuality(), k = q === 'low' ? 0.4 : q === 'high' ? 0.75 : 1;
  B.fx.push({ kind: 'fireball', x, y, r: size * 1.25, life: 0.55, max: 0.55 });
  for (let i = 0; i < Math.round(8 * k); i++) {
    const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 50;
    particles.push({ x: x + Math.cos(a) * size * 0.3, y: y + Math.sin(a) * size * 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - 30, g: -6, life: 1.6 + Math.random(), max: 2.4, r: size * 0.22 + Math.random() * 6, grow: 10 + size * 0.3, color: 'smoke-dark', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 1.5 });
  }
  for (let i = 0; i < Math.round(10 * k); i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 160;
    particles.push({ kind: 'debris', x, y: y - 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - 120 - Math.random() * 80, g: 420, floor: y + 6 + Math.random() * 16, life: 1.4 + Math.random(), max: 2.4, r: 1.5 + Math.random() * 2.5, color: Math.random() < 0.5 ? '#3a342c' : '#5e5446', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18 });
  }
  for (let i = 0; i < Math.round(12 * k); i++) {
    const a = Math.random() * Math.PI * 2, s = 140 + Math.random() * 260;
    particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, g: 380, life: 0.35 + Math.random() * 0.35, max: 0.7, r: 1.4, color: Math.random() < 0.5 ? '#ffe08a' : '#ffb347' });
  }
}

/* ---------------- Time of day, lighting and bloom ---------------- */
function timeOfDay() {
  if (B && B.daytime) {
    const id = B.daytime.id;
    return id === 'night' ? { dark: 0.62, grade: [70, 100, 190], gradeA: 0.45, id } : id === 'dusk' ? { dark: 0.32, grade: [255, 140, 70], gradeA: 0.4, id } : { dark: 0, grade: [255, 225, 170], gradeA: 0.18, id };
  }
  if (S.settings.daycycle === false) return { dark: 0, grade: [255, 225, 170], gradeA: 0.18, id: 'day' };
  const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
  // dawn 5-7, day 7-17.5, dusk 17.5-20, night 20-5
  if (h >= 7 && h < 17.5) return { dark: 0, grade: [255, 225, 170], gradeA: 0.18, id: 'day' };
  if (h >= 17.5 && h < 20) { const t = (h - 17.5) / 2.5; return { dark: 0.12 + t * 0.4, grade: [255, 140 - t * 40, 70 + t * 60], gradeA: 0.38, id: 'dusk' }; }
  if (h >= 5 && h < 7) { const t = (7 - h) / 2; return { dark: 0.1 + t * 0.4, grade: [255, 170, 140], gradeA: 0.34, id: 'dawn' }; }
  return { dark: 0.55, grade: [70, 100, 190], gradeA: 0.45, id: 'night' };
}

function gatherLights(dark) {
  const L = [], C = GFX.lightColors;
  if (dark > 0.05) {
    for (const l of GFX.lamps) L.push({ x: l.x, y: l.y + 14, r: 80, i: 0.95, c: C.warm });
    for (const b of S.buildings) {
      if (b._dead || b.level < 1) continue;
      const d = DEFS[b.type], c = centerOf(b), n = d.size * TILE;
      if (b.type === 'searchlight') { L.push({ x: c.x, y: c.y, r: 70, i: 1, c: C.white }); continue; }
      if (b.type === 'radio') { L.push({ x: c.x, y: c.y - 40, r: 26, i: 0.9, c: C.red }); continue; }
      if (d.trap || b.type === 'wall' || d.deco) continue;
      if (b.type === 'hq') {
        L.push({ x: c.x, y: c.y + n * 0.2, r: 150, i: 1, c: C.warm });
        L.push({ x: c.x - n * 0.45, y: c.y + n * 0.55, r: 80, i: 0.8, c: C.white }, { x: c.x + n * 0.45, y: c.y + n * 0.55, r: 80, i: 0.8, c: C.white });
        continue;
      }
      const col = b.type === 'steelworks' ? C.fire : b.type === 'lab' || b.type === 'radar' || b.type === 'railgun' ? C.blue : b.type === 'laser' || b.type === 'tesla' ? C.blue : C.warm;
      L.push({ x: c.x, y: c.y + n * 0.1, r: n * 0.95, i: 0.75, c: col });
    }
    if (B && B.hero && !B.hero.dead) L.push({ x: B.hero.x, y: B.hero.y, r: 60, i: 0.6, c: C.white });
  }
  if (B) {
    for (const f of B.fx) {
      if (f.kind === 'light') L.push({ x: f.x, y: f.y, r: f.r * 2.2, i: f.life / f.max, c: C.warm, hot: true });
      else if (f.kind === 'boom' || f.kind === 'fireball') L.push({ x: f.x, y: f.y, r: f.r * 4, i: f.life / f.max, c: C.fire, hot: true });
      else if (f.kind === 'beam' || f.kind === 'rail' || f.kind === 'bolt') L.push({ x: (f.x1 + f.x2) / 2, y: (f.y1 + f.y2) / 2, r: 90, i: 0.8, c: f.kind === 'beam' ? C.red : C.blue, hot: true });
    }
    for (const fire of (B.fires || [])) L.push({ x: fire.x, y: fire.y, r: 70 + Math.sin(tSec * 13 + fire.x) * 8, i: Math.min(1, fire.life / 2), c: C.fire, hot: true });
    for (const b of S.buildings) if (!b._dead && b._maxhp && b._hp < b._maxhp * 0.3 && !isPassive(b.type) && b.type !== 'wall') { const c = centerOf(b); L.push({ x: c.x, y: c.y, r: 70, i: 0.7, c: C.fire, hot: true }); }
  }
  for (let i = 0; i < particles.length; i += 3) { const p = particles[i]; if (p.glow) L.push({ x: p.x, y: p.y, r: p.r * 7, i: 0.35 * clamp(p.life / p.max, 0, 1), c: C.fire, hot: true }); }
  return L;
}

function ensureBuffers() {
  const lw = Math.ceil(vw / 2), lh = Math.ceil(vh / 2);
  if (!GFX.lightCv || GFX.lightCv.width !== lw || GFX.lightCv.height !== lh) { GFX.lightCv = makeCanvas(lw, lh); GFX.lightCtx = GFX.lightCv.getContext('2d'); }
  const bw = Math.ceil(vw / 5), bh = Math.ceil(vh / 5);
  if (!GFX.bloomCv || GFX.bloomCv.width !== bw || GFX.bloomCv.height !== bh) { GFX.bloomCv = makeCanvas(bw, bh); GFX.bloomCtx = GFX.bloomCv.getContext('2d'); }
}

function worldTransform(c2, k) {
  const z = cam.z * k;
  c2.setTransform(z, 0, 0, z, k * (vw / 2 - cam.x * cam.z), k * (vh / 2 - cam.y * cam.z));
}

// Post-processing: darkness with real light cut-outs, coloured glow, bloom, grade, grain.
function drawPostFX() {
  const q = gfxQuality(), tod = timeOfDay();
  ensureBuffers();
  const lights = (tod.dark > 0.02 || (B && q !== 'low')) ? gatherLights(tod.dark) : [];

  if (tod.dark > 0.02) {
    const lc = GFX.lightCtx, k = 0.5;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, GFX.lightCv.width, GFX.lightCv.height);
    lc.fillStyle = `rgba(6,12,30,${tod.dark})`; lc.fillRect(0, 0, GFX.lightCv.width, GFX.lightCv.height);
    lc.globalCompositeOperation = 'destination-out';
    worldTransform(lc, k);
    for (const l of lights) { lc.globalAlpha = Math.min(1, l.i); lc.drawImage(GFX.sprites.light, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2); }
    lc.globalAlpha = 1; lc.globalCompositeOperation = 'source-over';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(GFX.lightCv, 0, 0, vw, vh);
    // coloured light spill
    worldTransform(ctx, dpr);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) { ctx.globalAlpha = Math.min(1, l.i) * tod.dark * 0.45; const r = l.r * 0.9; ctx.drawImage(glowSprite(l.c), l.x - r, l.y - r, r * 2, r * 2); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    drawSearchBeams(tod.dark);
  }

  // bloom: bright things bleed light (a tiny buffer upscaled acts as a free blur)
  if (q !== 'low' && B) {
    const bc = GFX.bloomCtx;
    bc.setTransform(1, 0, 0, 1, 0, 0); bc.clearRect(0, 0, GFX.bloomCv.width, GFX.bloomCv.height);
    bc.globalCompositeOperation = 'lighter';
    worldTransform(bc, 0.2);
    for (const l of lights) { if (!l.hot) continue; bc.globalAlpha = Math.min(1, l.i); const r = l.r * 0.7; bc.drawImage(glowSprite(l.c), l.x - r, l.y - r, r * 2, r * 2); }
    for (const f of B.fx) {
      if (f.kind !== 'tracer' && f.kind !== 'beam' && f.kind !== 'rail') continue;
      bc.globalAlpha = 0.9; bc.strokeStyle = f.kind === 'beam' ? '#ff5a3c' : f.kind === 'rail' ? '#6ec0ff' : f.color || '#ffe08a'; bc.lineWidth = f.kind === 'tracer' ? 5 : 12;
      bc.beginPath(); bc.moveTo(f.x1, f.y1); bc.lineTo(f.x2, f.y2); bc.stroke();
    }
    bc.globalAlpha = 1; bc.globalCompositeOperation = 'source-over';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = q === 'ultra' ? 0.7 : 0.5;
    ctx.drawImage(GFX.bloomCv, 0, 0, vw, vh);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // colour grade
  if (q !== 'low') {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = rgbStr(tod.grade, tod.gradeA); ctx.fillRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'source-over';
  }
  drawWeather();
  if (q === 'ultra') {
    if (!GFX.grainPat) GFX.grainPat = ctx.createPattern(GFX.grainCv, 'repeat');
    ctx.save(); ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay';
    ctx.translate((Math.random() * 160) | 0, (Math.random() * 160) | 0);
    ctx.fillStyle = GFX.grainPat; ctx.fillRect(-160, -160, vw + 320, vh + 320);
    ctx.restore();
  }
  if (B && B.empFlash > 0) { ctx.fillStyle = `rgba(150,210,255,${B.empFlash})`; ctx.fillRect(0, 0, vw, vh); }
}

// Searchlight decorations sweep the dark.
function drawSearchBeams(dark) {
  worldTransform(ctx, dpr);
  ctx.globalCompositeOperation = 'lighter';
  for (const b of S.buildings) {
    if (b.type !== 'searchlight' || b._dead) continue;
    const c = centerOf(b), a = Math.sin(tSec * 0.7 + b.id) * 1.2 - Math.PI / 2;
    const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, 260);
    g.addColorStop(0, `rgba(255,250,220,${0.45 * dark})`); g.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, 260, a - 0.16, a + 0.16); ctx.closePath(); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ---------------- Weather (screen space) ---------------- */
function drawWeather() {
  const q = gfxQuality();
  const rain = B && B.weather && B.weather.id === 'rain', fog = B && B.weather && B.weather.id === 'fog';
  const snow = S.theme === 'winter';
  if (fog) {
    const t = tSec * 8;
    ctx.globalAlpha = 0.34;
    const s = 420;
    for (let i = -1; i < Math.ceil(vw / s) + 1; i++) for (let j = -1; j < Math.ceil(vh / s) + 1; j++) ctx.drawImage(GFX.fog, i * s + (t % s), j * s + ((t * 0.4) % s), s, s);
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.2, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
    g.addColorStop(0, 'rgba(220,225,215,0)'); g.addColorStop(1, 'rgba(220,225,215,0.34)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  }
  if (rain && q !== 'low') {
    while (rainDrops.length < (q === 'ultra' ? 140 : 90)) rainDrops.push({ x: Math.random() * vw, y: Math.random() * vh, s: 600 + Math.random() * 300, l: 10 + Math.random() * 8 });
    ctx.strokeStyle = 'rgba(200,215,230,0.38)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const r of rainDrops) {
      r.y += r.s * frameDt; r.x -= r.s * 0.18 * frameDt;
      if (r.y > vh || (r.y > vh * 0.15 && Math.random() < 0.012)) {
        GFX.splashes.push({ x: r.x, y: r.y, life: 0.25 });
        r.y = -12; r.x = Math.random() * (vw + 80);
      }
      ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - r.l * 0.2, r.y + r.l);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(210,225,235,0.5)';
    for (const s of GFX.splashes) { s.life -= frameDt; const k = 1 - s.life / 0.25; ctx.beginPath(); ctx.ellipse(s.x, s.y, 2 + k * 6, 1 + k * 2, 0, 0, Math.PI * 2); ctx.stroke(); }
    GFX.splashes = GFX.splashes.filter(s => s.life > 0);
    ctx.fillStyle = 'rgba(40,55,70,0.14)'; ctx.fillRect(0, 0, vw, vh);
  }
  if (snow && q !== 'low') {
    while (GFX.snow.length < (q === 'ultra' ? 110 : 60)) GFX.snow.push({ x: Math.random() * vw, y: Math.random() * vh, s: 25 + Math.random() * 45, r: 0.8 + Math.random() * 2, ph: Math.random() * 6 });
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const f of GFX.snow) {
      f.y += f.s * frameDt; f.x += Math.sin(tSec + f.ph) * 12 * frameDt;
      if (f.y > vh + 4) { f.y = -4; f.x = Math.random() * vw; }
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/* ---------------- Placement hologram ---------------- */
function drawHologram(ctx, x, y, w, h, valid) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = valid ? 'rgba(127,230,140,0.12)' : 'rgba(255,90,70,0.14)';
  for (let yy = y + ((tSec * 30) % 6); yy < y + h; yy += 6) ctx.fillRect(x, yy, w, 2);
  ctx.restore();
  ctx.strokeStyle = valid ? 'rgba(160,255,170,0.9)' : 'rgba(255,120,100,0.9)'; ctx.lineWidth = 2;
  ctx.shadowColor = valid ? '#7fff8a' : '#ff5a3c'; ctx.shadowBlur = 10;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.shadowBlur = 0;
}

/* ---------------- Adaptive quality ----------------
   If the player never picked a graphics level, watch how long frames take to
   draw and step down from Ultra to High (then Low) on slower phones. */
const perfGuard = { n: 0, sum: 0, t: 0, done: false };
function perfSample(ms, dt) {
  if (perfGuard.done || !S || !S.settings || S.settings.gfxManual) return;
  perfGuard.t += dt;
  if (perfGuard.t < 2) return; // ignore start-up hitches
  perfGuard.n++; perfGuard.sum += Math.max(ms, dt * 1000 * 0.5);
  if (perfGuard.n < 150) return;
  const avg = perfGuard.sum / perfGuard.n;
  perfGuard.n = 0; perfGuard.sum = 0;
  const q = gfxQuality();
  if (avg > 30 && q === 'ultra') { S.settings.gfx = 'high'; toast('Graphics set to High for smoother play'); }
  else if (avg > 40 && q === 'high') { S.settings.gfx = 'low'; S.settings.lowfx = true; toast('Graphics set to Low for smoother play'); perfGuard.done = true; }
  else perfGuard.done = true;
}

/* ---------------- Camera glide ---------------- */
const camVel = { x: 0, y: 0 };
function updateCameraGlide(dt) {
  if (pointers.size || (!camVel.x && !camVel.y)) return;
  cam.x += camVel.x * dt; cam.y += camVel.y * dt;
  const k = Math.pow(0.03, dt);
  camVel.x *= k; camVel.y *= k;
  if (Math.hypot(camVel.x, camVel.y) < 8) camVel.x = camVel.y = 0;
  clampCam();
}
