// WarBreach — procedural drawing of terrain and buildings (top-down, oblique depth).
'use strict';

const PAL = {
  grassA: '#55703a', grassB: '#5b773e', grassWild: '#41582d', grassWild2: '#3a4f28',
  dirt: '#7a6646', dirtDark: '#5f4f36', road: '#6e5f45',
  concrete: '#9a9a8c', concreteDark: '#6f6f63', concreteTop: '#b3b2a3',
  olive: '#5d6b3a', oliveDark: '#3f4a27', oliveLight: '#7a8a4c',
  sand: '#c9b27a', sandDark: '#9c8657',
  steel: '#7d8a96', steelDark: '#4f5961', steelLight: '#a9b6c1',
  rust: '#8a4b2a', gold: '#f5c542', goldDark: '#b88a1c',
  hazard: '#f2b632', black: '#1b1d17', red: '#c8402a',
  shadow: 'rgba(10,14,6,0.32)',
};

// Deterministic RNG so the terrain looks the same every load.
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Oblique box: footprint (x,y,w,d) on the ground, raised by h. Top face drawn h px higher.
// Oblique box: footprint (x,y,w,d) on the ground, raised by h. Top face drawn h px higher.
// On higher graphics settings faces get sunlit gradients and a highlighted top edge.
let BOX_FANCY = true;
function box(ctx, x, y, w, d, h, top, side, radius = 3) {
  // soft cast shadow toward the bottom-right
  ctx.fillStyle = PAL.shadow;
  ctx.beginPath();
  ctx.moveTo(x + 2, y + d);
  ctx.lineTo(x + w, y + d);
  ctx.lineTo(x + w + h * 0.55, y + d - h * 0.15);
  ctx.lineTo(x + w + h * 0.55, y - h * 0.15 + 4);
  ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fill();
  if (BOX_FANCY && h > 3 && w > 8) {
    const sg = ctx.createLinearGradient(x, 0, x + w, 0);
    sg.addColorStop(0, tintCol(side, 0.1)); sg.addColorStop(1, tintCol(side, -0.25));
    ctx.fillStyle = sg;
  } else ctx.fillStyle = side;
  rr(ctx, x, y - h + 2, w, d + h - 2, radius); ctx.fill();
  if (BOX_FANCY && w > 8) {
    const tg = ctx.createLinearGradient(x, y - h, x + w * 0.7, y - h + d);
    tg.addColorStop(0, tintCol(top, 0.16)); tg.addColorStop(1, tintCol(top, -0.1));
    ctx.fillStyle = tg;
  } else ctx.fillStyle = top;
  rr(ctx, x, y - h, w, d, radius); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
  rr(ctx, x + 0.5, y - h + 0.5, w - 1, d - 1, radius); ctx.stroke();
  if (BOX_FANCY && w > 8) {
    // sunlit top and left edges
    ctx.strokeStyle = 'rgba(255,250,225,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 1.5, y - h + d - radius); ctx.lineTo(x + 1.5, y - h + radius); ctx.quadraticCurveTo(x + 1.5, y - h + 1.5, x + radius, y - h + 1.5); ctx.lineTo(x + w - radius, y - h + 1.5); ctx.stroke();
  }
}

// Lighten (amt > 0) or darken (amt < 0) a colour given as #hex or rgb()/rgba().
const _tintCache = new Map();
function tintCol(col, amt) {
  const key = col + amt;
  let v = _tintCache.get(key);
  if (v) return v;
  let r, g, b, a = 1;
  if (col[0] === '#') { const n = parseInt(col.slice(1), 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  else { const m = col.match(/[\d.]+/g) || [0, 0, 0]; [r, g, b] = m.slice(0, 3).map(Number); if (m[3] != null) a = +m[3]; }
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; } else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  v = `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  if (_tintCache.size > 4000) _tintCache.clear();
  _tintCache.set(key, v);
  return v;
}

function pad(ctx, x, y, s, color = PAL.concrete, inset = 3) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  rr(ctx, x + inset, y + inset + 2, s - inset * 2, s - inset * 2, 5); ctx.fill();
  ctx.fillStyle = color;
  rr(ctx, x + inset, y + inset, s - inset * 2, s - inset * 2, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  rr(ctx, x + inset + 0.5, y + inset + 0.5, s - inset * 2 - 1, s - inset * 2 - 1, 5); ctx.stroke();
}

function sandbagRing(ctx, cx, cy, R, count, color = PAL.sand) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * 0.92;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = shade(color, -0.35);
    ctx.beginPath(); ctx.ellipse(0, 2, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = (i % 2) ? color : shade(color, -0.08);
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function levelChevrons(ctx, x, y, level, color = PAL.hazard) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(20,22,16,0.85)';
  rr(ctx, -8, -4, 16, 6 + level * 4, 3); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 1.6;
  for (let i = 0; i < level; i++) {
    const yy = i * 4;
    ctx.beginPath(); ctx.moveTo(-5, yy); ctx.lineTo(0, yy + 2.5); ctx.lineTo(5, yy); ctx.stroke();
  }
  ctx.restore();
}

/* ---------------- Terrain ---------------- */

// Original flat terrain, kept for reference; gfx.js provides the live version.
function buildGroundCanvasClassic(scale, themeId) {
  const T = THEMES[themeId] || THEMES.forest;
  const W = MAP_W * TILE, H = MAP_H * TILE;
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * scale); c.height = Math.ceil(H * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  const rnd = mulberry(1944);

  // wild grass everywhere
  g.fillStyle = T.wild; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W, y = rnd() * H, r = 8 + rnd() * 40;
    g.fillStyle = rnd() < 0.5 ? 'rgba(30,45,20,0.18)' : 'rgba(110,130,70,0.10)';
    g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2); g.fill();
  }

  // approach roads from the west and east edges (enemy lanes in battle mode)
  const midY = (MAP_H / 2) * TILE;
  g.strokeStyle = T.dirtDark; g.lineCap = 'round';
  g.lineWidth = TILE * 1.8;
  g.beginPath(); g.moveTo(-20, midY - 30); g.bezierCurveTo(W * 0.06, midY - 60, W * 0.09, midY + 20, BORDER * TILE + 10, midY); g.stroke();
  g.beginPath(); g.moveTo(W + 20, midY + 40); g.bezierCurveTo(W * 0.94, midY + 70, W * 0.91, midY - 10, W - BORDER * TILE - 10, midY); g.stroke();
  g.beginPath(); g.moveTo(W * 0.5 + 30, -20); g.bezierCurveTo(W * 0.52, H * 0.07, W * 0.47, H * 0.1, W * 0.5, BORDER * TILE + 10); g.stroke();
  g.strokeStyle = T.road; g.lineWidth = TILE * 1.3;
  g.beginPath(); g.moveTo(-20, midY - 30); g.bezierCurveTo(W * 0.06, midY - 60, W * 0.09, midY + 20, BORDER * TILE + 10, midY); g.stroke();
  g.beginPath(); g.moveTo(W + 20, midY + 40); g.bezierCurveTo(W * 0.94, midY + 70, W * 0.91, midY - 10, W - BORDER * TILE - 10, midY); g.stroke();
  g.beginPath(); g.moveTo(W * 0.5 + 30, -20); g.bezierCurveTo(W * 0.52, H * 0.07, W * 0.47, H * 0.1, W * 0.5, BORDER * TILE + 10); g.stroke();
  // tyre tracks
  g.strokeStyle = 'rgba(40,30,18,0.35)'; g.lineWidth = 2; g.setLineDash([6, 5]);
  for (const off of [-9, 9]) {
    g.beginPath(); g.moveTo(-20, midY - 30 + off); g.bezierCurveTo(W * 0.06, midY - 60 + off, W * 0.09, midY + 20 + off, BORDER * TILE + 10, midY + off); g.stroke();
    g.beginPath(); g.moveTo(W + 20, midY + 40 + off); g.bezierCurveTo(W * 0.94, midY + 70 + off, W * 0.91, midY - 10 + off, W - BORDER * TILE - 10, midY + off); g.stroke();
  }
  g.setLineDash([]);

  // compound: mown checker grass
  const bx = BORDER * TILE, by = BORDER * TILE, bw = (MAP_W - BORDER * 2) * TILE, bh = (MAP_H - BORDER * 2) * TILE;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  rr(g, bx - 6, by - 4, bw + 12, bh + 14, 10); g.fill();
  g.fillStyle = T.dirt;
  rr(g, bx - 6, by - 6, bw + 12, bh + 12, 10); g.fill();
  for (let ty = BORDER; ty < MAP_H - BORDER; ty++) {
    for (let tx = BORDER; tx < MAP_W - BORDER; tx++) {
      g.fillStyle = ((tx + ty) & 1) ? T.a : T.b;
      g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
  }
  for (let i = 0; i < 260; i++) {
    const x = bx + rnd() * bw, y = by + rnd() * bh;
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,220,0.05)' : 'rgba(0,0,0,0.05)';
    g.beginPath(); g.ellipse(x, y, 10 + rnd() * 30, 6 + rnd() * 16, rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  // grass tufts
  for (let i = 0; i < 500; i++) {
    const x = rnd() * W, y = rnd() * H;
    g.strokeStyle = rnd() < 0.5 ? T.tuftA : T.tuftB;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y - 4); g.moveTo(x, y); g.lineTo(x + 2, y - 5); g.stroke();
  }

  // perimeter fence: posts + barbed wire
  const fx0 = bx - 14, fy0 = by - 14, fx1 = bx + bw + 14, fy1 = by + bh + 14;
  const gates = [
    { side: 'l', at: midY }, { side: 'r', at: midY }, { side: 't', at: W * 0.5 },
  ];
  const gap = TILE * 1.2;
  function fenceLine(x0, y0, x1, y1, gateAt, horiz) {
    const len = horiz ? x1 - x0 : y1 - y0;
    const step = 22;
    for (let d = 0; d <= len; d += step) {
      const p = (horiz ? x0 : y0) + d;
      if (gateAt != null && Math.abs(p - gateAt) < gap) continue;
      const x = horiz ? p : x0, y = horiz ? y0 : p;
      g.fillStyle = '#3b2f22'; g.fillRect(x - 1.5, y - 7, 3, 9);
      const n = horiz ? p + step : p + step;
      if (d + step <= len && !(gateAt != null && Math.abs(n - gateAt) < gap)) {
        g.strokeStyle = 'rgba(200,200,190,0.55)'; g.lineWidth = 1;
        const nx = horiz ? n : x0, ny = horiz ? y0 : n;
        g.beginPath(); g.moveTo(x, y - 5); g.lineTo(nx, ny - 5); g.moveTo(x, y - 1); g.lineTo(nx, ny - 1); g.stroke();
        // barbs
        const mx = (x + nx) / 2, my = (y + ny) / 2;
        g.beginPath(); g.moveTo(mx - 2, my - 7); g.lineTo(mx + 2, my - 3); g.moveTo(mx + 2, my - 7); g.lineTo(mx - 2, my - 3); g.stroke();
      }
    }
  }
  fenceLine(fx0, fy0, fx1, fy0, gates[2].at, true);
  fenceLine(fx0, fy1, fx1, fy1, null, true);
  fenceLine(fx0, fy0, fx0, fy1, gates[0].at, false);
  fenceLine(fx1, fy0, fx1, fy1, gates[1].at, false);

  // gate barriers (striped booms)
  function boom(x, y, vertical) {
    g.save(); g.translate(x, y);
    if (vertical) g.rotate(Math.PI / 2);
    g.fillStyle = '#2b2b25'; g.fillRect(-gap - 4, -6, 8, 12);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? PAL.red : '#e9e4d4';
      g.fillRect(-gap + 4 + i * ((gap * 2 - 8) / 6) - gap * 0.0, -2, (gap * 2 - 8) / 6, 4);
    }
    g.restore();
  }
  boom(fx0, midY, true); boom(fx1, midY, true); boom(W * 0.5, fy0, false);

  // trees and rocks in the wilderness
  const inCompound = (x, y) => x > fx0 - 30 && x < fx1 + 30 && y > fy0 - 30 && y < fy1 + 30;
  const onRoad = (x, y) => Math.abs(y - midY) < 70 && (x < bx || x > bx + bw) || (Math.abs(x - W * 0.5) < 70 && y < by);
  const items = [];
  for (let i = 0; i < 160; i++) {
    const x = rnd() * W, y = rnd() * H;
    if (inCompound(x, y) || onRoad(x, y)) continue;
    items.push({ x, y, k: rnd() < 0.8 ? 'tree' : 'rock', r: rnd() });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    if (it.k === 'tree') {
      const r = 12 + it.r * 10;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.ellipse(it.x + 6, it.y + 6, r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3b2c1c'; g.fillRect(it.x - 2, it.y - 2, 4, 8);
      const cols = T.trees;
      for (let k = 0; k < 3; k++) {
        g.fillStyle = cols[k];
        g.beginPath(); g.arc(it.x - k * 2, it.y - 6 - k * 4, r * (1 - k * 0.25), 0, Math.PI * 2); g.fill();
      }
    } else {
      const r = 6 + it.r * 9;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.ellipse(it.x + 3, it.y + 3, r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6f6e63';
      g.beginPath(); g.ellipse(it.x, it.y, r, r * 0.75, it.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8b8a7d';
      g.beginPath(); g.ellipse(it.x - r * 0.25, it.y - r * 0.25, r * 0.55, r * 0.4, it.r, 0, Math.PI * 2); g.fill();
    }
  }

  // soft late-afternoon light: warm from the top-left, shade toward the bottom-right
  const light = g.createLinearGradient(0, 0, W, H);
  light.addColorStop(0, 'rgba(255,236,180,0.10)');
  light.addColorStop(0.55, 'rgba(255,236,180,0)');
  light.addColorStop(1, 'rgba(0,10,0,0.18)');
  g.fillStyle = light; g.fillRect(0, 0, W, H);

  // stencilled compound marking
  g.save();
  g.globalAlpha = 0.14; g.fillStyle = '#e8e2c8';
  g.font = `bold ${TILE * 0.9}px "Black Ops One", Impact, sans-serif`;
  g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText('SECTOR 7', bx + 10, by + bh - TILE * 1.1);
  g.restore();
  return c;
}

/* ---------------- Buildings ---------------- */

const DRAW = {};

DRAW.hq = function (ctx, b, t) {
  const S = 3 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S, PAL.concreteDark, 2);
  // hazard stripes along the pad edge
  ctx.save(); rr(ctx, x + 6, y + S - 14, S - 12, 7, 2); ctx.clip();
  for (let i = -2; i < 20; i++) { ctx.fillStyle = i % 2 ? PAL.hazard : PAL.black; ctx.beginPath(); ctx.moveTo(x + i * 10, y + S - 14); ctx.lineTo(x + i * 10 + 10, y + S - 14); ctx.lineTo(x + i * 10 + 3, y + S); ctx.lineTo(x + i * 10 - 7, y + S); ctx.fill(); }
  ctx.restore();
  const skin = typeof S !== 'undefined' && S && S.cosmetic ? HQ_SKINS[S.cosmetic.hq] : null;
  const roof = (skin && skin.roof) || [null, PAL.olive, '#62703d', '#556347', '#4b5a52', '#3f4c55', '#45503c', '#3c4634', '#33392b'][Math.min(L, 8)];
  const h = 18 + L * 3;
  box(ctx, x + 14, y + 22, S - 28, S - 46, h, roof, shade(roof, -0.35), 6);
  // roof details
  const tx = x + 14, ty = y + 22 - h;
  ctx.fillStyle = shade(roof, -0.15);
  rr(ctx, tx + 8, ty + 8, 26, 18, 3); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 3; i++) ctx.fillRect(tx + 12 + i * 7, ty + 12, 3, 10);
  // star insignia
  ctx.save(); ctx.translate(tx + (S - 28) * 0.65, ty + (S - 46) * 0.55);
  ctx.fillStyle = '#e9e4d4'; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.5 : 11; const a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.fill(); ctx.restore();
  // front door
  ctx.fillStyle = '#23261c'; rr(ctx, x + S / 2 - 9, y + S - 24 - 12, 18, 12, 2); ctx.fill();
  ctx.fillStyle = PAL.hazard; ctx.fillRect(x + S / 2 - 9, y + S - 24 - 13, 18, 2);
  // radar dish (rotates)
  const rx = tx + 20, ry = ty + 14 - 6;
  ctx.strokeStyle = '#2a2d24'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(rx, ry + 8); ctx.lineTo(rx, ry); ctx.stroke();
  const a = t * 1.2;
  ctx.save(); ctx.translate(rx, ry); ctx.scale(Math.cos(a), 1);
  ctx.fillStyle = '#d9d6c6'; ctx.beginPath(); ctx.ellipse(0, -2, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8f8c7e'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  // flag
  const fx = tx + S - 28 - 8, fy = ty + 4;
  ctx.strokeStyle = '#d8d4c4'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(fx, fy + 6); ctx.lineTo(fx, fy - 30); ctx.stroke();
  ctx.fillStyle = flagColor(); ctx.beginPath(); ctx.moveTo(fx, fy - 30);
  for (let i = 0; i <= 8; i++) ctx.lineTo(fx - i * 3, fy - 30 + Math.sin(t * 5 + i * 0.7) * 1.8 * (i / 8));
  for (let i = 8; i >= 0; i--) ctx.lineTo(fx - i * 3, fy - 18 + Math.sin(t * 5 + i * 0.7) * 1.8 * (i / 8));
  ctx.fill();
  // antenna blink
  ctx.fillStyle = (Math.sin(t * 4) > 0) ? '#ff5a3c' : '#5a2a20';
  ctx.beginPath(); ctx.arc(rx + 46, ry - 14, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a2d24'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(rx + 46, ry + 10); ctx.lineTo(rx + 46, ry - 12); ctx.stroke();
  // sandbags at corners
  for (const [sx, sy] of [[x + 10, y + 12], [x + S - 10, y + 12]]) {
    ctx.fillStyle = PAL.sandDark; ctx.beginPath(); ctx.ellipse(sx, sy + 2, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.sand; ctx.beginPath(); ctx.ellipse(sx, sy, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
};

DRAW.goldmine = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S, PAL.dirt, 3);
  // pit
  ctx.fillStyle = PAL.dirtDark; ctx.beginPath(); ctx.ellipse(x + S * 0.38, y + S * 0.62, 22, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2c2418'; ctx.beginPath(); ctx.ellipse(x + S * 0.38, y + S * 0.64, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
  // gold pile
  const gx = x + S * 0.74, gy = y + S * 0.72;
  for (let i = 0; i < 4 + L; i++) {
    const a = i * 2.4, r = (i % 3) * 4;
    ctx.fillStyle = i % 2 ? PAL.gold : PAL.goldDark;
    ctx.beginPath(); ctx.arc(gx + Math.cos(a) * r, gy + Math.sin(a) * r * 0.6 - i * 0.6, 4, 0, Math.PI * 2); ctx.fill();
  }
  if (Math.sin(t * 3 + b.id) > 0.85) { ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(gx - 2, gy - 6, 1.6, 0, Math.PI * 2); ctx.fill(); }
  // headframe
  const hx = x + S * 0.38, hy = y + S * 0.6;
  const tall = 34 + L * 3;
  ctx.strokeStyle = shade(PAL.steel, -0.3); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(hx - 14, hy); ctx.lineTo(hx, hy - tall); ctx.lineTo(hx + 14, hy); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx - 9, hy - tall * 0.35); ctx.lineTo(hx + 9, hy - tall * 0.35); ctx.moveTo(hx - 5, hy - tall * 0.65); ctx.lineTo(hx + 5, hy - tall * 0.65); ctx.stroke();
  // wheel
  const wy = hy - tall;
  ctx.save(); ctx.translate(hx, wy); ctx.rotate(t * 3);
  ctx.strokeStyle = L >= 3 ? PAL.steelLight : '#9e8a62'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = '#2a2a22'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx + 8, wy); ctx.lineTo(hx + 8, hy - 2); ctx.stroke();
  // mine cart on rails
  const cx = x + S * 0.6 + Math.sin(t * 0.8 + b.id) * 6, cy = y + S * 0.3;
  ctx.strokeStyle = '#4a3c2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 36, cy + 8); ctx.lineTo(x + S - 6, cy + 8); ctx.stroke();
  box(ctx, cx - 9, cy - 2, 18, 10, 6, '#6b6155', '#4a4339', 2);
  ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.ellipse(cx, cy - 7, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
};

DRAW.steelworks = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S, PAL.concreteDark, 3);
  const body = [null, '#6c747a', '#68737d', '#5f6d7a', '#566679', '#4c5e75', '#45576f', '#3f5069', '#394963'][Math.min(L, 8)];
  box(ctx, x + 8, y + 26, 50, 42, 20, shade(body, 0.12), shade(body, -0.35), 3);
  // corrugated roof lines
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(x + 8 + i * 6.2, y + 7); ctx.lineTo(x + 8 + i * 6.2, y + 47); ctx.stroke(); }
  // furnace glow window
  const glow = 0.55 + Math.sin(t * 6 + b.id) * 0.25;
  ctx.fillStyle = `rgba(255,${120 + L * 10},40,${glow})`;
  rr(ctx, x + 18, y + 54, 24, 8, 2); ctx.fill();
  // chimney
  const ch = 40 + L * 3;
  box(ctx, x + 60, y + 18, 12, 12, ch, '#59544c', '#3b3731', 2);
  ctx.fillStyle = PAL.red; ctx.fillRect(x + 60, y + 18 - ch + 14, 12, 3);
  // steel plates
  for (let i = 0; i < Math.min(4, L + 1); i++) {
    ctx.fillStyle = i % 2 ? PAL.steelLight : PAL.steel;
    rr(ctx, x + 54, y + 62 - i * 3, 18, 6, 1); ctx.fill();
  }
  b._chimney = { x: x + 66, y: y + 18 - ch };
};

DRAW.depot = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S, PAL.concrete, 3);
  // pallets of crates, more with level
  const spots = [[10, 40], [42, 40], [10, 12], [42, 12], [26, 26]];
  const n = Math.min(spots.length, 2 + L);
  for (let i = 0; i < n; i++) {
    const [ox, oy] = spots[i];
    const tall = (i === 4 ? 26 : 14 + (i % 2) * 6);
    const col = i % 2 ? PAL.olive : '#6b7443';
    box(ctx, x + ox, y + oy + 12, 28, 22, tall, shade(col, 0.1), shade(col, -0.35), 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
    const ty = y + oy + 12 - tall;
    ctx.strokeRect(x + ox + 4, ty + 4, 20, 14);
    ctx.fillStyle = 'rgba(240,235,210,0.55)';
    ctx.font = 'bold 7px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(i % 2 ? 'AU' : 'FE', x + ox + 14, ty + 11);
  }
  // tarp over centre at higher levels
  if (L >= 3) {
    ctx.fillStyle = 'rgba(58,74,39,0.85)';
    rr(ctx, x + 20, y + 4, 40, 20, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.moveTo(x + 40, y + 4); ctx.lineTo(x + 40, y + 24); ctx.stroke();
  }
};

function turretBase(ctx, b, color, h) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE;
  const cx = x + S / 2, cy = y + S / 2;
  ctx.fillStyle = PAL.shadow;
  ctx.beginPath(); ctx.ellipse(cx + h * 0.4, cy + 4, 26, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(color, -0.4);
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, 26, 23, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(cx - 26, cy + 2 - h, 52, h);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(cx, cy + 2 - h, 26, 23, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.stroke();
  return { cx, cy: cy + 2 - h };
}

DRAW.mg = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  const cx = x + S / 2, cy = y + S / 2;
  ctx.fillStyle = PAL.dirtDark; ctx.beginPath(); ctx.ellipse(cx, cy + 2, 30, 27, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4a3d29'; ctx.beginPath(); ctx.ellipse(cx, cy + 2, 18, 15, 0, 0, Math.PI * 2); ctx.fill();
  const bag = L >= 4 ? PAL.concrete : PAL.sand;
  sandbagRing(ctx, cx, cy + 2, 24, 14, bag);
  // gun
  ctx.save(); ctx.translate(cx, cy - 2); ctx.rotate(b.angle);
  ctx.fillStyle = PAL.shadow; ctx.fillRect(2, 2, 26, 6);
  ctx.fillStyle = '#2b2e25';
  const barrels = L >= 3 ? [-3, 3] : [0];
  for (const o of barrels) { ctx.fillRect(4, o - 1.5, 22 + L, 3); ctx.fillStyle = '#16180f'; ctx.fillRect(24 + L, o - 2, 3, 4); ctx.fillStyle = '#2b2e25'; }
  ctx.fillStyle = L >= 5 ? PAL.steel : PAL.oliveDark;
  rr(ctx, -9, -8, 18, 16, 4); ctx.fill();
  ctx.fillStyle = '#7d6b3c'; ctx.fillRect(-4, 6, 8, 5); // ammo box
  ctx.fillStyle = shade(PAL.olive, 0.1); ctx.beginPath(); ctx.arc(-3, 0, 4.5, 0, Math.PI * 2); ctx.fill(); // gunner helmet
  if (b._flash > 0) { ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(30 + L, 0, 4, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
};

DRAW.cannon = function (ctx, b, t) {
  const L = Math.max(1, b.level);
  const col = [null, '#8b8b7d', '#858c8f', '#7a8794', '#6f8298', '#617895', '#57708f', '#4e6888', '#455f80'][Math.min(L, 8)];
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE;
  // octagon concrete pad
  const pcx = x + S / 2, pcy = y + S / 2 + 2;
  ctx.fillStyle = PAL.concreteDark; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; ctx.lineTo(pcx + Math.cos(a) * 36, pcy + Math.sin(a) * 34); }
  ctx.fill();
  const { cx, cy } = turretBase(ctx, b, col, 9);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.angle);
  ctx.fillStyle = PAL.shadow; ctx.fillRect(6, 0, 32, 10);
  ctx.fillStyle = '#34372f'; rr(ctx, 6, -5, 26 + L * 2, 10, 3); ctx.fill();
  ctx.fillStyle = '#1e201a'; rr(ctx, 28 + L * 2, -6.5, 7, 13, 2); ctx.fill();
  ctx.fillStyle = shade(col, -0.2); ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(col, 0.15); ctx.beginPath(); ctx.arc(-2, -2, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-8, -1, 8, 2);
  if (b._flash > 0) { ctx.fillStyle = '#ffcf5a'; ctx.beginPath(); ctx.arc(40 + L * 2, 0, 7, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
};

DRAW.mortar = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  const cx = x + S / 2, cy = y + S / 2;
  ctx.fillStyle = PAL.dirtDark; ctx.beginPath(); ctx.ellipse(cx, cy + 2, 32, 29, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a2f20'; ctx.beginPath(); ctx.ellipse(cx, cy + 4, 22, 19, 0, 0, Math.PI * 2); ctx.fill();
  sandbagRing(ctx, cx, cy + 2, 27, 16, L >= 4 ? PAL.concrete : PAL.sandDark);
  // ammo crates
  box(ctx, cx + 8, cy + 8, 12, 8, 5, '#7d6b3c', '#57492a', 1);
  box(ctx, cx - 20, cy + 8, 12, 8, 5, '#7d6b3c', '#57492a', 1);
  // tube: stubby ellipse pointing up/aim direction
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.angle);
  ctx.fillStyle = '#23251e'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = L >= 3 ? PAL.steelDark : PAL.oliveDark;
  rr(ctx, -2, -6, 18 + L, 12, 5); ctx.fill();
  ctx.fillStyle = '#121310'; ctx.beginPath(); ctx.ellipse(16 + L, 0, 3.5, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2b2e25'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, 6); ctx.lineTo(-6, 13); ctx.moveTo(4, -6); ctx.lineTo(-6, -13); ctx.stroke();
  ctx.restore();
};

DRAW.sniper = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  const cx = x + S / 2, cy = y + S / 2;
  const h = 34 + L * 4;
  // shadow
  ctx.fillStyle = PAL.shadow;
  ctx.beginPath(); ctx.moveTo(cx - 18, cy + 18); ctx.lineTo(cx + 18, cy + 18); ctx.lineTo(cx + 18 + h * 0.6, cy + 6); ctx.lineTo(cx - 18 + h * 0.6, cy + 6); ctx.fill();
  // legs
  const wood = L >= 4 ? PAL.steelDark : '#5a4430';
  ctx.strokeStyle = wood; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy + 20); ctx.lineTo(cx - 13, cy - h + 18);
  ctx.moveTo(cx + 20, cy + 20); ctx.lineTo(cx + 13, cy - h + 18);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy + 8); ctx.lineTo(cx + 15, cy - h * 0.45 + 12);
  ctx.moveTo(cx + 18, cy + 8); ctx.lineTo(cx - 15, cy - h * 0.45 + 12);
  ctx.stroke();
  // platform
  box(ctx, cx - 20, cy - 18, 40, 24, 8, L >= 4 ? PAL.steel : '#7a5c3d', L >= 4 ? PAL.steelDark : '#4e3a26', 2);
  // roof canopy
  const top = cy - 18 - 8;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; rr(ctx, cx - 20, top - h + 30, 40, 8, 2); ctx.fill();
  ctx.fillStyle = PAL.oliveDark; rr(ctx, cx - 22, top - 20, 44, 10, 3); ctx.fill();
  ctx.strokeStyle = wood; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 18, top - 10); ctx.lineTo(cx - 18, top + 4); ctx.moveTo(cx + 18, top - 10); ctx.lineTo(cx + 18, top + 4); ctx.stroke();
  // rifle
  ctx.save(); ctx.translate(cx, top + 8); ctx.rotate(b.angle);
  ctx.fillStyle = '#1d1f19'; ctx.fillRect(0, -1.2, 26, 2.4);
  ctx.fillStyle = '#3f4a27'; ctx.beginPath(); ctx.arc(-1, 0, 4, 0, Math.PI * 2); ctx.fill();
  if (Math.sin(t * 2 + b.id) > 0.92) { ctx.fillStyle = '#e8f7ff'; ctx.beginPath(); ctx.arc(10, -3, 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
};

DRAW.missile = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S, PAL.concreteDark, 3);
  ctx.save(); rr(ctx, x + 6, y + 6, S - 12, 6, 2); ctx.clip();
  for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? PAL.hazard : PAL.black; ctx.fillRect(x + 6 + i * 6, y + 6, 6, 6); }
  ctx.restore();
  const { cx, cy } = turretBase(ctx, b, '#5f6b49', 8);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.angle);
  ctx.fillStyle = PAL.shadow; rr(ctx, -10, -10, 36, 24, 3); ctx.fill();
  ctx.fillStyle = L >= 3 ? PAL.steel : PAL.olive; rr(ctx, -12, -13, 34, 26, 4); ctx.fill();
  ctx.fillStyle = shade(L >= 3 ? PAL.steel : PAL.olive, -0.3); ctx.fillRect(14, -13, 8, 26);
  const n = L >= 4 ? 3 : 2;
  for (let c = 0; c < n; c++) {
    const oy = -8 + c * (16 / (n - 1));
    ctx.fillStyle = '#1b1d17'; ctx.beginPath(); ctx.arc(22, oy, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.red; ctx.beginPath(); ctx.arc(22, oy, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
};

DRAW.flame = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S, PAL.concreteDark, 3);
  // fuel tanks behind the bunker
  for (let i = 0; i < Math.min(3, 1 + Math.ceil(L / 2)); i++) {
    const tx = x + 10 + i * 13, ty = y + 18;
    ctx.fillStyle = PAL.shadow; ctx.beginPath(); ctx.ellipse(tx + 8, ty + 3, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a2a1c'; rr(ctx, tx - 5, ty - 16, 10, 18, 4); ctx.fill();
    ctx.fillStyle = '#b8432b'; rr(ctx, tx - 5, ty - 16, 6, 18, 4); ctx.fill();
    ctx.fillStyle = PAL.hazard; ctx.fillRect(tx - 5, ty - 9, 10, 2);
  }
  const body = L >= 4 ? '#6f7a80' : '#8a8676';
  box(ctx, x + 12, y + 34, 56, 34, 12, shade(body, 0.1), shade(body, -0.35), 10);
  ctx.fillStyle = '#1d1f19'; rr(ctx, x + 22, y + 52, 36, 5, 2); ctx.fill(); // firing slit
  // nozzle turret
  const cx = x + S / 2, cy = y + 40;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.angle);
  ctx.fillStyle = '#2b2e25'; rr(ctx, 4, -3.5, 18 + L, 7, 2); ctx.fill();
  ctx.fillStyle = '#c8402a'; ctx.fillRect(18 + L, -4, 4, 8);
  ctx.fillStyle = shade(body, -0.2); ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(body, 0.15); ctx.beginPath(); ctx.arc(-1.5, -1.5, 7, 0, Math.PI * 2); ctx.fill();
  // pilot light
  ctx.fillStyle = Math.sin(t * 12 + b.id) > 0 ? '#ffb347' : '#ff7a2f';
  ctx.beginPath(); ctx.arc(24 + L, 0, 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};

DRAW.tesla = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  const cx = x + S / 2, cy = y + S / 2;
  pad(ctx, x, y, S, '#4a4f55', 3);
  // insulated base
  ctx.fillStyle = PAL.shadow; ctx.beginPath(); ctx.ellipse(cx + 14, cy + 10, 22, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b2f35'; ctx.beginPath(); ctx.ellipse(cx, cy + 12, 22, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a4048'; ctx.beginPath(); ctx.ellipse(cx, cy + 8, 22, 14, 0, 0, Math.PI * 2); ctx.fill();
  // copper coil stack
  const h = 40 + L * 3;
  for (let i = 0; i < 9; i++) {
    const yy = cy + 6 - i * (h / 10), r = 11 - i * 0.5;
    ctx.fillStyle = i % 2 ? '#b8743a' : '#d98b45';
    ctx.beginPath(); ctx.ellipse(cx, yy, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#20242a'; ctx.fillRect(cx - 2, cy + 6 - h, 4, h - 4);
  // top sphere
  const ty = cy + 6 - h;
  ctx.fillStyle = '#9fb3c8'; ctx.beginPath(); ctx.arc(cx, ty, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e4f1ff'; ctx.beginPath(); ctx.arc(cx - 3, ty - 3, 4, 0, Math.PI * 2); ctx.fill();
  // idle sparks
  const glow = (b._flash > 0 ? 1 : 0.35 + Math.sin(t * 9 + b.id) * 0.25);
  ctx.strokeStyle = `rgba(150,220,255,${glow})`; ctx.lineWidth = 1.5;
  const rnd = mulberry(Math.floor(t * 12) + b.id * 31);
  for (let k = 0; k < 2; k++) {
    let px = cx, py = ty; ctx.beginPath(); ctx.moveTo(px, py);
    const a = rnd() * Math.PI * 2;
    for (let j = 1; j <= 4; j++) { px = cx + Math.cos(a) * j * 5 + (rnd() - 0.5) * 6; py = ty + Math.sin(a) * j * 4 + (rnd() - 0.5) * 6; ctx.lineTo(px, py); }
    ctx.stroke();
  }
  b._top = { x: cx, y: ty };
};

DRAW.howitzer = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S, PAL.concreteDark, 2);
  ctx.save(); rr(ctx, x + 4, y + S - 10, S - 8, 6, 2); ctx.clip();
  for (let i = 0; i < 14; i++) { ctx.fillStyle = i % 2 ? PAL.hazard : PAL.black; ctx.fillRect(x + 4 + i * 6, y + S - 10, 6, 6); }
  ctx.restore();
  // sandbag corners and shell crates
  for (const [sx, sy] of [[x + 10, y + 10], [x + S - 10, y + 10]]) {
    ctx.fillStyle = PAL.sandDark; ctx.beginPath(); ctx.ellipse(sx, sy + 2, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.sand; ctx.beginPath(); ctx.ellipse(sx, sy, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
  }
  box(ctx, x + 6, y + S - 24, 14, 9, 6, '#7d6b3c', '#57492a', 1);
  const { cx, cy } = turretBase(ctx, b, L >= 5 ? '#5a6a74' : '#646b4a', 10);
  const recoil = b._flash > 0 ? -6 : 0;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.angle);
  ctx.fillStyle = PAL.shadow; ctx.fillRect(8, 2, 44, 9);
  ctx.fillStyle = '#2b2e25'; rr(ctx, 6 + recoil, -4.5, 40 + L, 9, 3); ctx.fill();
  ctx.fillStyle = '#1b1d17'; rr(ctx, 40 + L + recoil, -6.5, 9, 13, 2); ctx.fill();
  ctx.fillStyle = L >= 5 ? '#4c5a63' : '#545b3c'; rr(ctx, -16, -14, 30, 28, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, -14, -12, 26, 10, 4); ctx.fill();
  ctx.fillStyle = PAL.red; ctx.fillRect(-14, 8, 6, 3);
  if (b._flash > 0) { ctx.fillStyle = '#ffcf5a'; ctx.beginPath(); ctx.arc(54 + L, 0, 10, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
};

DRAW.lab = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S, '#8d9096', 3);
  // main block
  box(ctx, x + 8, y + 30, 46, 40, 16, '#c9ccd0', '#7e8389', 4);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x + 8, y + 22, 46, 3);
  // glass dome with a glowing experiment
  const dx = x + 31, dy = y + 22;
  const g = ctx.createRadialGradient(dx - 4, dy - 6, 2, dx, dy, 15);
  g.addColorStop(0, 'rgba(220,245,255,0.95)'); g.addColorStop(1, 'rgba(110,180,220,0.75)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dx, dy, 13, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#5e646b'; ctx.fillRect(dx - 14, dy - 1, 28, 3);
  const pulse = 0.5 + Math.sin(t * 3 + b.id) * 0.4;
  ctx.fillStyle = `rgba(127,255,170,${pulse})`; ctx.beginPath(); ctx.arc(dx, dy - 5, 4, 0, Math.PI * 2); ctx.fill();
  // windows
  for (let i = 0; i < 3; i++) { ctx.fillStyle = 'rgba(110,190,255,0.75)'; ctx.fillRect(x + 13 + i * 13, y + 56, 8, 6); }
  // dish antenna on a mast
  const mx = x + 64, my = y + 26;
  ctx.strokeStyle = '#4a4f55'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(mx, my + 30); ctx.lineTo(mx, my); ctx.stroke();
  ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.sin(t * 0.6 + b.id) * 0.5 - 0.6);
  ctx.fillStyle = '#e4e6e8'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#c8402a'; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // level stripes on the door
  ctx.fillStyle = '#3a3f45'; rr(ctx, x + 50, y + 54, 6, 12, 1); ctx.fill();
  ctx.fillStyle = L >= 6 ? PAL.hazard : '#7fbf4d'; ctx.fillRect(x + 50, y + 52, 6, 2);
};

DRAW.barracks = function (ctx, b, t) {
  const S = 3 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S, '#7d7a63', 2);
  // parade ground markings
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
  rr(ctx, x + 10, y + S - 34, S - 20, 24, 3); ctx.stroke(); ctx.setLineDash([]);
  // two long huts with curved roofs (Quonset style)
  for (const [ox, w] of [[8, 50], [64, 48]]) {
    const hx = x + ox, hy = y + 14;
    ctx.fillStyle = PAL.shadow; rr(ctx, hx + 8, hy + 12, w, 46, 10); ctx.fill();
    ctx.fillStyle = '#4c5a32'; rr(ctx, hx, hy + 6, w, 50, 12); ctx.fill();
    ctx.fillStyle = '#5f7040'; rr(ctx, hx, hy, w, 46, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(hx + 3, hy + i * 7.5); ctx.lineTo(hx + w - 3, hy + i * 7.5); ctx.stroke(); }
    ctx.fillStyle = '#2b2e22'; rr(ctx, hx + w / 2 - 6, hy + 44, 12, 10, 2); ctx.fill();
  }
  // flag and training dummies
  ctx.strokeStyle = '#d8d4c4'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + S - 10, y + S - 12); ctx.lineTo(x + S - 10, y + S - 44); ctx.stroke();
  ctx.fillStyle = '#55703a'; ctx.beginPath(); ctx.moveTo(x + S - 10, y + S - 44);
  for (let i = 0; i <= 6; i++) ctx.lineTo(x + S - 10 - i * 3, y + S - 44 + Math.sin(t * 5 + i * 0.7) * 1.5 * (i / 6));
  for (let i = 6; i >= 0; i--) ctx.lineTo(x + S - 10 - i * 3, y + S - 35 + Math.sin(t * 5 + i * 0.7) * 1.5 * (i / 6));
  ctx.fill();
  for (let i = 0; i < Math.min(5, 1 + L); i++) {
    const dx = x + 20 + i * 14, dy = y + S - 20 + Math.sin(t * 3 + i) * 0.5;
    ctx.fillStyle = '#55703a'; ctx.beginPath(); ctx.ellipse(dx, dy, 3.5, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f3a1e'; ctx.beginPath(); ctx.arc(dx, dy, 2.6, 0, Math.PI * 2); ctx.fill();
  }
};

function auraBuilding(ctx, b, t, base, accent, drawTop) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE;
  pad(ctx, x, y, S, base, 3);
  drawTop(x, y, S);
  // aura pulse ring
  const k = (t * 0.6 + b.id * 0.13) % 1;
  ctx.strokeStyle = accent.replace('A', (0.35 * (1 - k)).toFixed(3)); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x + S / 2, y + S / 2, S * 0.3 + k * S * 0.35, (S * 0.3 + k * S * 0.35) * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
}

DRAW.ammo = function (ctx, b, t) {
  const L = Math.max(1, b.level);
  auraBuilding(ctx, b, t, '#6f6c58', 'rgba(242,182,50,A)', (x, y, S) => {
    // half-buried bunker with crates of shells
    box(ctx, x + 10, y + 34, 60, 30, 10, '#7d7a63', '#545240', 12);
    ctx.fillStyle = '#1e2016'; rr(ctx, x + 32, y + 50, 16, 8, 2); ctx.fill();
    ctx.fillStyle = PAL.hazard; ctx.fillRect(x + 32, y + 48, 16, 2);
    for (let i = 0; i < Math.min(4, 1 + Math.ceil(L / 3)); i++) {
      const cx = x + 12 + i * 15, cy = y + 16;
      box(ctx, cx, cy, 13, 9, 6, '#6b7443', '#4a522c', 1);
      ctx.fillStyle = '#c9a646'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(cx + 3 + k * 3.5, cy - 3, 1.3, 0, Math.PI * 2); ctx.fill(); }
    }
  });
};

DRAW.radar = function (ctx, b, t) {
  const L = Math.max(1, b.level);
  auraBuilding(ctx, b, t, '#5a6068', 'rgba(110,190,255,A)', (x, y, S) => {
    box(ctx, x + 14, y + 44, 30, 24, 10, '#9aa3ab', '#5e666e', 3);
    ctx.fillStyle = 'rgba(110,190,255,0.8)'; ctx.fillRect(x + 18, y + 54, 22, 4);
    // lattice tower
    const tx = x + S - 24, ty = y + S - 14, h = 42 + L * 1.5;
    ctx.strokeStyle = '#3c4148'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx - 9, ty); ctx.lineTo(tx, ty - h); ctx.lineTo(tx + 9, ty); ctx.stroke();
    ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { const yy = ty - h * i / 4, w = 9 * (1 - i / 4); ctx.beginPath(); ctx.moveTo(tx - w, yy); ctx.lineTo(tx + w, yy); ctx.stroke(); }
    // rotating radar bar
    ctx.save(); ctx.translate(tx, ty - h); ctx.scale(Math.cos(t * 2 + b.id), 1);
    ctx.fillStyle = '#d9dde0'; rr(ctx, -14, -4, 28, 8, 3); ctx.fill();
    ctx.restore();
    ctx.fillStyle = Math.sin(t * 5) > 0 ? '#ff5a3c' : '#5a2a20'; ctx.beginPath(); ctx.arc(tx, ty - h - 6, 2, 0, Math.PI * 2); ctx.fill();
  });
};

/* ----- Decorations (cosmetic only) ----- */
DRAW.flagpole = function (ctx, b, t) {
  const x = b.x * TILE + TILE / 2, y = b.y * TILE + TILE - 6;
  ctx.fillStyle = PAL.shadow; ctx.beginPath(); ctx.ellipse(x + 10, y, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a8676'; rr(ctx, x - 6, y - 4, 12, 6, 2); ctx.fill();
  ctx.strokeStyle = '#e4e0d0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x, y - 46); ctx.stroke();
  ctx.fillStyle = flagColor(); ctx.beginPath(); ctx.moveTo(x, y - 46);
  for (let i = 0; i <= 8; i++) ctx.lineTo(x + i * 3, y - 46 + Math.sin(t * 5 + i * 0.7) * 2 * (i / 8));
  for (let i = 8; i >= 0; i--) ctx.lineTo(x + i * 3, y - 34 + Math.sin(t * 5 + i * 0.7) * 2 * (i / 8));
  ctx.fill();
  ctx.fillStyle = '#f2b632'; ctx.beginPath(); ctx.arc(x, y - 47, 2, 0, Math.PI * 2); ctx.fill();
};
DRAW.sandbags = function (ctx, b) {
  const x = b.x * TILE + TILE / 2, y = b.y * TILE + TILE / 2;
  const rows = [[-9, 6], [0, 6], [9, 6], [-4.5, 0], [4.5, 0], [0, -6]];
  for (const [ox, oy] of rows) {
    ctx.fillStyle = PAL.sandDark; ctx.beginPath(); ctx.ellipse(x + ox, y + oy + 2, 6.5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.sand; ctx.beginPath(); ctx.ellipse(x + ox, y + oy, 6.5, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
};
DRAW.searchlight = function (ctx, b, t) {
  const x = b.x * TILE + TILE / 2, y = b.y * TILE + TILE / 2 + 4;
  const a = Math.sin(t * 0.7 + b.id) * 1.2 - Math.PI / 2;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 4, x, y, 90);
  g.addColorStop(0, 'rgba(255,250,220,0.35)'); g.addColorStop(1, 'rgba(255,250,220,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 90, a - 0.18, a + 0.18); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = PAL.shadow; ctx.beginPath(); ctx.ellipse(x + 4, y + 4, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3c4148'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = '#6a7078'; rr(ctx, -5, -6, 14, 12, 3); ctx.fill();
  ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(9, 0, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};
DRAW.radio = function (ctx, b, t) {
  const x = b.x * TILE + TILE / 2, y = b.y * TILE + TILE - 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34, y - 6); ctx.stroke();
  ctx.strokeStyle = '#4a4f55'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x, y - 62); ctx.lineTo(x + 7, y); ctx.stroke();
  ctx.lineWidth = 1; for (let i = 1; i < 6; i++) { const yy = y - i * 11, w = 7 * (1 - i / 6); ctx.beginPath(); ctx.moveTo(x - w, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(200,200,190,0.5)'; ctx.beginPath(); ctx.moveTo(x, y - 40); ctx.lineTo(x - 16, y); ctx.moveTo(x, y - 40); ctx.lineTo(x + 16, y); ctx.stroke();
  ctx.fillStyle = Math.sin(t * 3 + b.id) > 0 ? '#ff3a2a' : '#5a1810'; ctx.beginPath(); ctx.arc(x, y - 64, 2.5, 0, Math.PI * 2); ctx.fill();
};
DRAW.camonet = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE;
  box(ctx, x + 14, y + 30, 22, 16, 10, '#6b7443', '#4a522c', 2);
  box(ctx, x + 40, y + 34, 26, 18, 12, '#5d6b3a', '#3f4a27', 2);
  ctx.fillStyle = 'rgba(58,74,39,0.82)';
  ctx.beginPath(); ctx.moveTo(x + 6, y + 52); ctx.lineTo(x + 16, y + 12); ctx.lineTo(x + 64, y + 10); ctx.lineTo(x + 76, y + 50); ctx.closePath(); ctx.fill();
  const rnd = mulberry(b.id * 7 + 3);
  for (let i = 0; i < 26; i++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(90,110,55,0.8)' : 'rgba(40,52,26,0.8)'; ctx.beginPath(); ctx.arc(x + 14 + rnd() * 54, y + 14 + rnd() * 34, 3 + rnd() * 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#3b2f22'; ctx.lineWidth = 2;
  for (const [px, py] of [[x + 16, y + 12], [x + 64, y + 10]]) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + 40); ctx.stroke(); }
  void S; void t;
};
DRAW.statue = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE;
  pad(ctx, x, y, S, '#a7a597', 6);
  box(ctx, x + 24, y + 44, 32, 26, 14, '#c2bfae', '#8a8676', 3);
  const cx = x + S / 2, cy = y + 30;
  ctx.fillStyle = PAL.shadow; ctx.beginPath(); ctx.ellipse(cx + 10, cy + 14, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.ellipse(cx, cy, 8, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a5824a'; ctx.beginPath(); ctx.arc(cx, cy - 13, 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx + 5, cy - 4); ctx.lineTo(cx + 13, cy - 18); ctx.stroke();
  ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(cx + 13, cy - 20, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,200,0.35)'; ctx.beginPath(); ctx.arc(cx - 3, cy - 15, 2, 0, Math.PI * 2); ctx.fill();
  void t;
};

/* ----- Obstacles ----- */
function drawObstacle(ctx, o, t) {
  const x = o.x * TILE + TILE / 2, y = o.y * TILE + TILE / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x + 5, y + 6, 15, 8, 0, 0, Math.PI * 2); ctx.fill();
  if (o.kind === 'rock') {
    ctx.fillStyle = '#6f6e63'; ctx.beginPath(); ctx.ellipse(x, y, 15, 11, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8b8a7d'; ctx.beginPath(); ctx.ellipse(x - 4, y - 4, 8, 5, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5e5d53'; ctx.beginPath(); ctx.ellipse(x + 9, y + 4, 6, 5, 0, 0, Math.PI * 2); ctx.fill();
  } else if (o.kind === 'tree') {
    ctx.fillStyle = '#3b2c1c'; ctx.fillRect(x - 2, y - 2, 4, 9);
    const cols = (THEMES[S.theme] || THEMES.forest).trees;
    for (let k = 0; k < 3; k++) { ctx.fillStyle = cols[k]; ctx.beginPath(); ctx.arc(x - k * 2, y - 8 - k * 4, 14 - k * 3.5, 0, Math.PI * 2); ctx.fill(); }
  } else if (o.kind === 'bush') {
    for (const [ox, oy, r] of [[-6, 2, 7], [5, 1, 8], [0, -4, 7]]) { ctx.fillStyle = '#4c6f33'; ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#c8402a'; for (const [ox, oy] of [[-4, -2], [4, -3], [1, 3]]) { ctx.beginPath(); ctx.arc(x + ox, y + oy, 1.3, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.4);
    ctx.fillStyle = '#2a2622'; rr(ctx, -15, -9, 30, 18, 3); ctx.fill();
    ctx.fillStyle = '#4a3a2f'; rr(ctx, -9, -6, 16, 12, 2); ctx.fill();
    ctx.fillStyle = '#6b4a3a'; ctx.fillRect(5, -1.5, 14, 3);
    ctx.restore();
    if (Math.random() < 0.3) particles.push({ x: x + (Math.random() - 0.5) * 10, y: y - 6, vx: 4, vy: -14, g: 0, life: 1.4, max: 1.4, r: 3, grow: 4, color: 'smoke' });
  }
  void t;
}

function flagColor() { return (typeof S !== 'undefined' && S && S.cosmetic && FLAGS[S.cosmetic.flag]) ? FLAGS[S.cosmetic.flag].color : PAL.red; }

DRAW.derrick = function (ctx, b, t) {
  const S2 = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S2, '#4a4438', 3);
  ctx.fillStyle = 'rgba(15,12,8,0.6)'; ctx.beginPath(); ctx.ellipse(x + 20, y + 58, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
  // storage tank
  box(ctx, x + 50, y + 50, 22, 18, 16, '#7d8389', '#545a60', 9);
  ctx.fillStyle = PAL.hazard; ctx.fillRect(x + 50, y + 40, 22, 2);
  // pump jack: rocking beam
  const a = Math.sin(t * 2.2 + b.id) * 0.35;
  const px = x + 30, py = y + 34;
  ctx.strokeStyle = '#2b2e25'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(px - 8, py + 22); ctx.lineTo(px, py); ctx.lineTo(px + 8, py + 22); ctx.stroke();
  ctx.save(); ctx.translate(px, py); ctx.rotate(a);
  ctx.fillStyle = L >= 6 ? '#c8402a' : '#d9a33a'; rr(ctx, -26, -3, 44, 6, 2); ctx.fill();
  ctx.fillStyle = '#2b2e25'; ctx.beginPath(); ctx.ellipse(-26, 0, 5, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#1b1d17'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(px - 26 * Math.cos(a), py - 26 * Math.sin(a)); ctx.lineTo(x + 20, y + 56); ctx.stroke();
  ctx.fillStyle = '#3a3f45'; rr(ctx, px + 10, py + 10, 12, 12, 2); ctx.fill();
};

DRAW.guardpost = function (ctx, b, t) {
  const S2 = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S2, '#6f6c58', 3);
  sandbagRing(ctx, x + S2 / 2, y + S2 / 2 + 4, 30, 18, L >= 6 ? PAL.concrete : PAL.sand);
  box(ctx, x + 22, y + 46, 36, 22, 16, '#5d6b3a', '#3f4a27', 4);
  ctx.fillStyle = '#1e2016'; rr(ctx, x + 28, y + 34, 24, 5, 2); ctx.fill();
  // helmets peeking over the parapet
  for (let i = 0; i < Math.min(4, 1 + Math.ceil(L / 3)); i++) {
    const hx = x + 28 + i * 8, hy = y + 26 + Math.sin(t * 2 + i + b.id) * 0.6;
    ctx.fillStyle = '#2f3a1e'; ctx.beginPath(); ctx.arc(hx, hy, 3.5, Math.PI, 0); ctx.fill();
  }
  ctx.fillStyle = flagColor(); ctx.fillRect(x + 60, y + 12, 9, 6);
  ctx.strokeStyle = '#d8d4c4'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 60, y + 30); ctx.lineTo(x + 60, y + 12); ctx.stroke();
};

DRAW.workshop = function (ctx, b, t) {
  const S2 = 2 * TILE, x = b.x * TILE, y = b.y * TILE;
  pad(ctx, x, y, S2, '#7d7a63', 3);
  box(ctx, x + 8, y + 34, 64, 34, 14, '#8a7a56', '#5e5238', 4);
  // saw-tooth roof
  ctx.fillStyle = '#6b5f44';
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + 8 + i * 16, y + 20); ctx.lineTo(x + 24 + i * 16, y + 8); ctx.lineTo(x + 24 + i * 16, y + 20); ctx.fill(); }
  ctx.fillStyle = 'rgba(160,210,230,0.6)'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 21 + i * 16, y + 10, 2, 9);
  ctx.fillStyle = '#2b2e22'; rr(ctx, x + 30, y + 52, 20, 14, 2); ctx.fill();
  // sparks from the welding inside
  if (Math.sin(t * 9 + b.id) > 0.4) { ctx.fillStyle = '#fff1b0'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + 38 + Math.random() * 6, y + 58 + Math.random() * 4, 1.2, 0, Math.PI * 2); ctx.fill(); } }
  ctx.strokeStyle = '#3c4148'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 66, y + 60); ctx.lineTo(x + 66, y + 28); ctx.lineTo(x + 54, y + 28); ctx.stroke();
};

DRAW.watchtower = function (ctx, b, t) {
  const x = b.x * TILE + TILE / 2, y = b.y * TILE + TILE / 2 + 6, L = Math.max(1, b.level);
  const h = 22 + Math.min(L, 8) * 1.5;
  ctx.fillStyle = PAL.shadow; ctx.beginPath(); ctx.ellipse(x + 10, y + 6, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = L >= 6 ? PAL.steelDark : '#5a4430'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x - 10, y + 6); ctx.lineTo(x - 7, y - h + 6); ctx.moveTo(x + 10, y + 6); ctx.lineTo(x + 7, y - h + 6); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 9, y - 2); ctx.lineTo(x + 8, y - h * 0.5); ctx.moveTo(x + 9, y - 2); ctx.lineTo(x - 8, y - h * 0.5); ctx.stroke();
  box(ctx, x - 11, y - h + 2, 22, 14, 5, L >= 6 ? PAL.steel : '#7a5c3d', L >= 6 ? PAL.steelDark : '#4e3a26', 2);
  ctx.save(); ctx.translate(x, y - h - 2); ctx.rotate(b.angle || 0);
  ctx.fillStyle = '#1d1f19'; ctx.fillRect(0, -1, 14, 2);
  ctx.fillStyle = '#3f4a27'; ctx.beginPath(); ctx.arc(-1, 0, 3.5, 0, Math.PI * 2); ctx.fill();
  if (b._flash > 0) { ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(16, 0, 2.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
};

DRAW.gate = function (ctx, b, t, neighbors) {
  const x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  const n = neighbors || {};
  const top = [null, '#8a7a56', '#9a9a8c', '#8f8f84', '#7f8c97', '#5c6670', '#4d5560', '#40464f', '#33373d'][Math.min(L, 8)];
  if (n.r) box(ctx, x + TILE / 2, y + 12, TILE, TILE - 24, 9, shade(top, -0.06), shade(top, -0.4), 2);
  // two posts and a striped barrier
  box(ctx, x + 4, y + 8, 9, TILE - 16, 16, top, shade(top, -0.4), 2);
  box(ctx, x + TILE - 13, y + 8, 9, TILE - 16, 16, top, shade(top, -0.4), 2);
  ctx.save(); rr(ctx, x + 12, y + TILE / 2 - 9, TILE - 24, 6, 1); ctx.clip();
  for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? PAL.red : '#e9e4d4'; ctx.fillRect(x + 12 + i * 3, y + TILE / 2 - 9, 3, 6); }
  ctx.restore();
  ctx.fillStyle = PAL.hazard; ctx.fillRect(x + 6, y - 6, 5, 2); ctx.fillRect(x + TILE - 11, y - 6, 5, 2);
  void t;
};

DRAW.snowtank = function (ctx, b, t) {
  const x = b.x * TILE + TILE, y = b.y * TILE + TILE;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x + 6, y + 10, 30, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#eef3f6'; rr(ctx, x - 26, y - 12, 52, 26, 10); ctx.fill();
  ctx.fillStyle = '#dfe7ec'; ctx.beginPath(); ctx.arc(x - 2, y - 10, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a4430'; ctx.fillRect(x + 8, y - 13, 24, 4);
  ctx.fillStyle = '#e0763a'; ctx.beginPath(); ctx.moveTo(x - 2, y - 10); ctx.lineTo(x + 6, y - 8); ctx.lineTo(x - 2, y - 6); ctx.fill();
  ctx.fillStyle = '#1b1d17'; for (const ox of [-6, 2]) { ctx.beginPath(); ctx.arc(x + ox - 2, y - 14, 1.3, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#c8402a'; ctx.fillRect(x - 15, y - 2, 30, 3);
  void t;
};
DRAW.monument = function (ctx, b, t) {
  const S2 = 2 * TILE, x = b.x * TILE, y = b.y * TILE;
  pad(ctx, x, y, S2, '#a7a597', 4);
  box(ctx, x + 10, y + 60, 16, 12, 34, '#d6d2c2', '#a19d8e', 2);
  box(ctx, x + 54, y + 60, 16, 12, 34, '#d6d2c2', '#a19d8e', 2);
  ctx.fillStyle = '#e4e0d0'; rr(ctx, x + 8, y + 18, 64, 12, 3); ctx.fill();
  ctx.fillStyle = PAL.gold; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 3 : 7, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(x + 40 + Math.cos(a) * r, y + 14 + Math.sin(a) * r); }
  ctx.fill();
  ctx.fillStyle = flagColor(); ctx.fillRect(x + 14, y + 30, 6, 16); ctx.fillRect(x + 60, y + 30, 6, 16);
  void t;
};
DRAW.goldtank = function (ctx, b, t) {
  const x = b.x * TILE + TILE, y = b.y * TILE + TILE;
  pad(ctx, x - TILE, y - TILE, 2 * TILE, '#8d8a7a', 4);
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.3);
  ctx.fillStyle = '#7a5c1a'; rr(ctx, -22, -15, 44, 8, 2); ctx.fill(); rr(ctx, -22, 7, 44, 8, 2); ctx.fill();
  const g = ctx.createLinearGradient(-20, -10, 20, 10); g.addColorStop(0, '#fff1b0'); g.addColorStop(0.5, '#f2b632'); g.addColorStop(1, '#b88a1c');
  ctx.fillStyle = g; rr(ctx, -19, -11, 38, 22, 4); ctx.fill();
  ctx.fillStyle = '#b88a1c'; ctx.fillRect(4, -2.5, 26, 5);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (Math.sin(t * 3 + b.id) > 0.85) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 6, y - 8, 2, 0, Math.PI * 2); ctx.fill(); }
};

DRAW.flak = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S, '#5c6152', 3);
  sandbagRing(ctx, x + S / 2, y + S / 2 + 2, 30, 18, L >= 10 ? PAL.concrete : PAL.sandDark);
  const { cx, cy } = turretBase(ctx, b, '#5d6b4a', 7);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.angle);
  const recoil = b._flash > 0 ? -4 : 0;
  ctx.fillStyle = PAL.shadow; ctx.fillRect(6, -6, 34, 14);
  for (const oy of [-6, 6]) { ctx.fillStyle = '#23251e'; rr(ctx, 4 + recoil, oy - 2.2, 32, 4.4, 2); ctx.fill(); ctx.fillStyle = '#121310'; ctx.fillRect(33 + recoil, oy - 3, 4, 6); }
  ctx.fillStyle = '#4b5639'; rr(ctx, -13, -13, 24, 26, 5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, -11, -11, 20, 9, 4); ctx.fill();
  ctx.fillStyle = '#9fd0e8'; ctx.beginPath(); ctx.arc(-4, 0, 3, 0, Math.PI * 2); ctx.fill();
  if (b._flash > 0) { ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(40, -6, 5, 0, Math.PI * 2); ctx.arc(40, 6, 5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
};

DRAW.railgun = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S, '#3f454d', 2);
  ctx.strokeStyle = 'rgba(90,170,255,0.35)'; ctx.lineWidth = 2;
  rr(ctx, x + 6, y + 6, S - 12, S - 12, 6); ctx.stroke();
  const { cx, cy } = turretBase(ctx, b, '#56616d', 9);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.angle);
  ctx.fillStyle = PAL.shadow; ctx.fillRect(6, -2, 46, 12);
  // twin rails with glowing coils between them
  ctx.fillStyle = '#2a2f36'; rr(ctx, 2, -8, 46, 4, 2); ctx.fill(); rr(ctx, 2, 4, 46, 4, 2); ctx.fill();
  const glow = 0.4 + Math.sin(t * 6 + b.id) * 0.25 + (b._flash > 0 ? 0.6 : 0);
  for (let i = 0; i < 5; i++) { ctx.fillStyle = `rgba(110,190,255,${Math.min(1, glow)})`; ctx.fillRect(10 + i * 8, -3, 3, 6); }
  ctx.fillStyle = '#3d4652'; rr(ctx, -14, -12, 22, 24, 5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; rr(ctx, -12, -10, 18, 8, 3); ctx.fill();
  ctx.fillStyle = '#6ec0ff'; ctx.beginPath(); ctx.arc(-4, 4, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  void L;
};

DRAW.rocketarty = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S, PAL.concreteDark, 2);
  // truck chassis
  box(ctx, x + 8, y + 50, 64, 20, 6, '#55613f', '#3a4329', 3);
  for (const wx of [16, 34, 52, 64]) { ctx.fillStyle = '#16120f'; rr(ctx, x + wx - 4, y + 66, 8, 5, 2); ctx.fill(); }
  box(ctx, x + 56, y + 40, 16, 12, 10, '#606d47', '#3f4a2d', 2);
  ctx.fillStyle = 'rgba(160,210,230,0.6)'; ctx.fillRect(x + 66, y + 30, 5, 6);
  // rocket pod, tilted to its aim
  const cx = x + S / 2 - 6, cy = y + 36;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.angle);
  ctx.fillStyle = PAL.shadow; rr(ctx, -12, -8, 40, 22, 3); ctx.fill();
  ctx.fillStyle = L >= 10 ? '#5a6672' : '#4e5a36'; rr(ctx, -14, -12, 38, 24, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; rr(ctx, -12, -10, 34, 7, 2); ctx.fill();
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    ctx.fillStyle = '#16120f'; ctx.beginPath(); ctx.arc(22, -7.5 + c * 5, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.red; ctx.beginPath(); ctx.arc(22, -7.5 + c * 5, 1, 0, Math.PI * 2); ctx.fill();
    void r;
  }
  if (b._flash > 0) { ctx.fillStyle = 'rgba(255,200,110,0.8)'; ctx.beginPath(); ctx.arc(-18, 0, 10, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
};

DRAW.laser = function (ctx, b, t) {
  const S = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  const cx = x + S / 2, cy = y + S / 2;
  pad(ctx, x, y, S, '#3c4048', 3);
  // tower body
  ctx.fillStyle = PAL.shadow; ctx.beginPath(); ctx.moveTo(cx - 14, cy + 18); ctx.lineTo(cx + 16, cy + 18); ctx.lineTo(cx + 46, cy + 4); ctx.lineTo(cx + 16, cy + 4); ctx.fill();
  ctx.fillStyle = '#2b2f36'; ctx.beginPath(); ctx.moveTo(cx - 16, cy + 18); ctx.lineTo(cx + 16, cy + 18); ctx.lineTo(cx + 9, cy - 34); ctx.lineTo(cx - 9, cy - 34); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3d434d'; ctx.beginPath(); ctx.moveTo(cx - 16, cy + 18); ctx.lineTo(cx, cy + 18); ctx.lineTo(cx, cy - 34); ctx.lineTo(cx - 9, cy - 34); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 3; i++) { ctx.fillStyle = 'rgba(255,90,60,0.6)'; ctx.fillRect(cx - 8 + i * 0.5, cy + 6 - i * 14, 16 - i, 2); }
  // emitter head
  const hy = cy - 40;
  ctx.fillStyle = '#4a515c'; ctx.beginPath(); ctx.arc(cx, hy, 11, 0, Math.PI * 2); ctx.fill();
  const glow = 0.5 + Math.sin(t * 5 + b.id) * 0.3;
  const g = ctx.createRadialGradient(cx, hy, 0, cx, hy, 9);
  g.addColorStop(0, `rgba(255,240,220,${glow + 0.3})`); g.addColorStop(1, 'rgba(255,60,40,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, hy, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff5a3c'; ctx.beginPath(); ctx.arc(cx, hy, 3.5, 0, Math.PI * 2); ctx.fill();
  void L;
};

DRAW.mine = function (ctx, b, t) {
  const x = b.x * TILE + TILE / 2, y = b.y * TILE + TILE / 2, L = Math.max(1, b.level);
  // in battle the mine is buried: only a faint outline shows
  ctx.globalAlpha *= (typeof B !== 'undefined' && B) ? 0.35 : 1;
  ctx.fillStyle = 'rgba(70,55,35,0.6)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = L >= 6 ? '#5a6068' : '#4f5a35'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(x - 2, y - 2, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2e22';
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.6; ctx.fillRect(x + Math.cos(a) * 5 - 1, y + Math.sin(a) * 5 - 1, 2, 2); }
  ctx.fillStyle = Math.sin(t * 4 + b.id) > 0.6 ? '#ff4a2a' : '#5a1a10'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
  if (typeof B !== 'undefined' && B) ctx.globalAlpha /= 0.35;
};

DRAW.wire = function (ctx, b, t) {
  const x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  // wooden X-frame posts and coils of razor wire
  ctx.strokeStyle = '#4a3a28'; ctx.lineWidth = 2.5;
  for (const px of [x + 6, x + TILE - 6]) { ctx.beginPath(); ctx.moveTo(px - 4, y + 10); ctx.lineTo(px + 4, y + TILE - 8); ctx.moveTo(px + 4, y + 10); ctx.lineTo(px - 4, y + TILE - 8); ctx.stroke(); }
  ctx.strokeStyle = L >= 6 ? '#c9d2da' : '#a9a99a'; ctx.lineWidth = 1.1;
  for (let row = 0; row < 2; row++) {
    const yy = y + 15 + row * 10;
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = i * 1.2, px = x + 4 + i * ((TILE - 8) / 16);
      const py = yy + Math.sin(a) * 4;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
};

DRAW.wall = function (ctx, b, t, neighbors) {
  const x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  const h = 8 + L * 2;
  const top = [null, PAL.sand, '#a7a597', '#8f8f84', '#7f8c97', '#5c6670', '#4d5560', '#40464f', '#33373d'][Math.min(L, 8)];
  const side = shade(top, -0.4);
  const inset = 8;
  const n = neighbors || {};
  // bridges to neighbours (right / down) so rows connect
  if (n.r) box(ctx, x + TILE / 2, y + inset + 4, TILE, TILE - inset * 2 - 8, h - 1, shade(top, -0.06), side, 2);
  if (n.d) box(ctx, x + inset + 4, y + TILE / 2, TILE - inset * 2 - 8, TILE, h - 1, shade(top, -0.06), side, 2);
  box(ctx, x + inset, y + inset, TILE - inset * 2, TILE - inset * 2, h, top, side, L === 1 ? 6 : 3);
  const tx = x + inset, ty = y + inset - h, w = TILE - inset * 2;
  if (L === 1) {
    ctx.strokeStyle = 'rgba(80,60,30,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tx + 3, ty + w / 2); ctx.lineTo(tx + w - 3, ty + w / 2); ctx.stroke();
  } else if (L === 3) {
    ctx.fillStyle = 'rgba(60,40,30,0.5)';
    for (let i = 0; i < 3; i++) ctx.fillRect(tx + 5 + i * 6, ty + 5, 2, w - 10);
  } else if (L >= 4) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
    rr(ctx, tx + 4, ty + 4, w - 8, w - 8, 2); ctx.stroke();
    if (L >= 5) { ctx.fillStyle = L >= 7 ? PAL.red : PAL.hazard; ctx.fillRect(tx + 2, ty + w - 5, w - 4, 3); }
    if (L >= 6) { ctx.fillStyle = '#d8c27a'; for (const [rx, ry] of [[4, 4], [w - 4, 4], [4, w - 8], [w - 4, w - 8]]) { ctx.beginPath(); ctx.arc(tx + rx, ty + ry, 1.4, 0, Math.PI * 2); ctx.fill(); } }
  }
};

function drawBuilding(ctx, b, t, neighbors) {
  const f = DRAW[b.type];
  if (b.level === 0 || !f) {
    drawFoundation(ctx, b);
  } else {
    f(ctx, b, t, neighbors);
  }
}

// What is left of a building destroyed in battle.
function drawRubble(ctx, b) {
  const S = DEFS[b.type].size * TILE, x = b.x * TILE, y = b.y * TILE;
  const rnd = mulberry(b.id * 97 + 3);
  ctx.fillStyle = 'rgba(20,18,14,0.55)';
  ctx.beginPath(); ctx.ellipse(x + S / 2, y + S / 2, S * 0.48, S * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  const n = b.type === 'wall' ? 4 : 10 + S / 8;
  for (let i = 0; i < n; i++) {
    const px = x + S * (0.15 + rnd() * 0.7), py = y + S * (0.15 + rnd() * 0.7), r = 2 + rnd() * (S / 12);
    ctx.fillStyle = rnd() < 0.5 ? '#6f6b60' : '#4a463e';
    ctx.beginPath(); ctx.moveTo(px - r, py + r * 0.5); ctx.lineTo(px, py - r); ctx.lineTo(px + r, py + r * 0.3); ctx.closePath(); ctx.fill();
  }
  if (b.type !== 'wall') {
    ctx.strokeStyle = '#2a2520'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + S * 0.3, y + S * 0.6); ctx.lineTo(x + S * 0.55, y + S * 0.35); ctx.moveTo(x + S * 0.5, y + S * 0.7); ctx.lineTo(x + S * 0.72, y + S * 0.5); ctx.stroke();
  }
}

function drawFoundation(ctx, b) {
  const S = DEFS[b.type].size * TILE, x = b.x * TILE, y = b.y * TILE;
  pad(ctx, x, y, S, '#8a7d62', 3);
  ctx.strokeStyle = 'rgba(40,30,15,0.5)'; ctx.lineWidth = 1;
  for (let i = 8; i < S; i += 8) { ctx.beginPath(); ctx.moveTo(x + 4, y + i); ctx.lineTo(x + S - 4, y + i); ctx.stroke(); }
  // stacked materials
  box(ctx, x + 8, y + S - 22, 20, 12, 6, '#a0773f', '#6d5029', 1);
  box(ctx, x + S - 30, y + 14, 20, 12, 10, PAL.steelLight, PAL.steelDark, 1);
}

// Yellow/black scaffold frame for anything under construction.
function drawScaffold(ctx, b, t) {
  const S = DEFS[b.type].size * TILE, x = b.x * TILE, y = b.y * TILE;
  ctx.save();
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -t * 12;
  ctx.strokeStyle = PAL.hazard;
  rr(ctx, x + 2, y + 2, S - 4, S - 4, 6); ctx.stroke();
  ctx.lineDashOffset = -t * 12 + 6;
  ctx.strokeStyle = PAL.black;
  rr(ctx, x + 2, y + 2, S - 4, S - 4, 6); ctx.stroke();
  ctx.restore();
  // poles
  ctx.strokeStyle = '#b8b3a0'; ctx.lineWidth = 2;
  for (const [px, py] of [[x + 6, y + 6], [x + S - 6, y + 6], [x + 6, y + S - 6], [x + S - 6, y + S - 6]]) {
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 22); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x + 6, y - 10); ctx.lineTo(x + S - 6, y - 10); ctx.stroke();
}

function drawProgress(ctx, cx, y, w, p, label) {
  ctx.fillStyle = 'rgba(16,18,12,0.85)';
  rr(ctx, cx - w / 2 - 2, y - 2, w + 4, 10, 4); ctx.fill();
  ctx.fillStyle = PAL.hazard;
  rr(ctx, cx - w / 2, y, Math.max(4, w * p), 6, 3); ctx.fill();
  if (label) {
    ctx.font = '600 11px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(label, cx + 1, y - 3);
    ctx.fillStyle = '#f3efd9'; ctx.fillText(label, cx, y - 4);
  }
}

function drawCoinIcon(ctx, x, y, r, kind) {
  if (kind === 'oil') {
    ctx.fillStyle = '#30343d'; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r, y + r * 0.2, x, y + r); ctx.quadraticCurveTo(x - r, y + r * 0.2, x, y - r); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(x - r * 0.25, y + r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (kind === 'gold') {
    ctx.fillStyle = PAL.goldDark; ctx.beginPath(); ctx.arc(x, y + 1, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.gold; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff1b0'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = PAL.steelDark;
    ctx.beginPath(); ctx.moveTo(-r, r * 0.55); ctx.lineTo(r, r * 0.55); ctx.lineTo(r * 0.7, -r * 0.35); ctx.lineTo(-r * 0.7, -r * 0.35); ctx.fill();
    ctx.fillStyle = PAL.steelLight;
    ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.35); ctx.lineTo(r * 0.7, -r * 0.35); ctx.lineTo(r * 0.45, -r * 0.75); ctx.lineTo(-r * 0.45, -r * 0.75); ctx.fill();
    ctx.restore();
  }
}

// Render one building (level 1 by default) into a small canvas for the shop.
function renderPreview(type, level, px) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = px * dpr; c.height = px * dpr;
  c.style.width = px + 'px'; c.style.height = px + 'px';
  const ctx = c.getContext('2d');
  const size = DEFS[type].size * TILE;
  const extra = 40; // room for tall parts
  const scale = (px / (size + extra)) * dpr;
  ctx.scale(scale, scale);
  ctx.translate(extra * 0.35, extra * 0.75);
  const fake = { id: 1, type, level, x: 0, y: 0, angle: -0.6, flash: 0 };
  if (type === 'wall') {
    ctx.translate(-TILE / 2 + 8, 4);
    for (let i = 0; i < 2; i++) {
      DRAW.wall(ctx, { ...fake, x: i, y: 0.5 }, 0, { r: i === 0 });
    }
  } else {
    DRAW[type](ctx, fake, 1.3);
  }
  return c;
}

// Parachuted supply crate waiting to be opened.
function drawSupplyCrate(ctx, x, y, t) {
  const bob = Math.sin(t * 2.5) * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 12, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
  // parachute draped behind
  ctx.fillStyle = '#e9e4d4'; ctx.beginPath(); ctx.ellipse(x - 10, y + 6, 14, 7, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c8402a'; ctx.beginPath(); ctx.ellipse(x - 10, y + 6, 14, 7, -0.4, 0, Math.PI); ctx.fill();
  box(ctx, x - 12, y - 6 + bob, 24, 16, 14, '#8a7a3c', '#5e5228', 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 9, y - 18 + bob, 18, 10);
  ctx.fillStyle = PAL.hazard;
  ctx.font = 'bold 8px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SUPPLY', x, y - 13 + bob);
  // beacon
  const glow = 0.5 + Math.sin(t * 6) * 0.5;
  ctx.fillStyle = `rgba(255,90,60,${glow})`; ctx.beginPath(); ctx.arc(x + 9, y - 22 + bob, 3, 0, Math.PI * 2); ctx.fill();
}

// Friendly jet for the airstrike, drawn at (x,y) heading angle a.
function drawJet(ctx, x, y, a) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.translate(x + 40, y + 60); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-18, -22); ctx.lineTo(-12, 0); ctx.lineTo(-18, 22); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = '#5d6b4a';
  ctx.beginPath(); ctx.moveTo(28, 0); ctx.lineTo(-4, -24); ctx.lineTo(-10, -24); ctx.lineTo(-2, 0); ctx.lineTo(-10, 24); ctx.lineTo(-4, 24); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4a5639'; rr(ctx, -22, -4, 52, 8, 4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-24, -9); ctx.lineTo(-26, 9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9fd0e8'; rr(ctx, 12, -2.5, 10, 5, 2.5); ctx.fill();
  ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(-24, 0, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
