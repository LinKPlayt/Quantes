// WarBreach — base state, building logic, input, HUD and main loop.
'use strict';

const SAVE_KEY = 'warbreach.save.v1';

/* ---------------- State ---------------- */

let S = null;                    // saved game state
let grid = new Int32Array(MAP_W * MAP_H); // building id per tile (0 = empty)
let selectedId = null;
let placing = null;              // { type, x, y, moveId, valid }
let particles = [];
let floaters = [];
let sellArmed = false;

function newBase() {
  const s = { v: 1, name: 'Outpost Bravo', gold: 750, steel: 600, nextId: 1, buildings: [], bestWave: 0, saved: Date.now() };
  const add = (type, x, y, level = 1) => {
    s.buildings.push({ id: s.nextId++, type, x, y, level, job: null, stored: 0, baseAngle: Math.random() * Math.PI * 2 });
  };
  const cx = Math.floor(MAP_W / 2) - 1, cy = Math.floor(MAP_H / 2) - 1;
  add('hq', cx - 1, cy);
  add('goldmine', cx - 5, cy - 2);
  add('steelworks', cx + 4, cy - 2);
  add('mg', cx - 4, cy + 3);
  add('depot', cx + 4, cy + 2);
  s.buildings.find(b => b.type === 'goldmine').stored = 120;
  s.buildings.find(b => b.type === 'steelworks').stored = 80;
  return s;
}

function serialize() {
  S.saved = Date.now();
  return JSON.stringify(S);
}

function save() {
  try { localStorage.setItem(SAVE_KEY, serialize()); } catch (e) { /* storage unavailable: play continues */ }
}

function load(raw) {
  try {
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || !Array.isArray(s.buildings)) return null;
    for (const b of s.buildings) {
      if (!DEFS[b.type]) return null;
      if (b.baseAngle == null) b.baseAngle = Math.random() * Math.PI * 2;
      if (b.stored == null) b.stored = 0;
    }
    return s;
  } catch (e) { return null; }
}

function byId(id) { return S.buildings.find(b => b.id === id); }
function hq() { return S.buildings.find(b => b.type === 'hq'); }
function hqLevel() { const h = hq(); return h ? Math.max(1, h.level) : 1; }
function countOf(type) { return S.buildings.filter(b => b.type === type).length; }
function limitOf(type) { return LIMITS[type][hqLevel()]; }
function busyBuilders() { return S.buildings.filter(b => b.job).length; }
function freeBuilders() { return BUILDERS - busyBuilders(); }

function storageCap() {
  let cap = HQ_STORAGE[hqLevel()];
  for (const b of S.buildings) if (b.type === 'depot' && b.level >= 1) cap += statsFor('depot', b.level).storage;
  return cap;
}

function canAfford(c) { return S.gold >= c.gold && S.steel >= c.steel; }
function pay(c) { S.gold -= c.gold; S.steel -= c.steel; }
function refund(c, frac) {
  const cap = storageCap();
  S.gold = Math.min(cap, S.gold + Math.floor(c.gold * frac));
  S.steel = Math.min(cap, S.steel + Math.floor(c.steel * frac));
}

function rebuildGrid() {
  grid.fill(0);
  for (const b of S.buildings) {
    const n = DEFS[b.type].size;
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) grid[(b.y + dy) * MAP_W + b.x + dx] = b.id;
  }
}

function inBuildArea(x, y) {
  return x >= BORDER && y >= BORDER && x < MAP_W - BORDER && y < MAP_H - BORDER;
}

function footprintFree(type, x, y, ignoreId) {
  const n = DEFS[type].size;
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) {
    const tx = x + dx, ty = y + dy;
    if (!inBuildArea(tx, ty)) return false;
    const id = grid[ty * MAP_W + tx];
    if (id && id !== ignoreId) return false;
  }
  return true;
}

function buildingAtTile(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return null;
  const id = grid[ty * MAP_W + tx];
  return id ? byId(id) : null;
}

/* ---------------- Actions ---------------- */

function buildStatus(type) {
  const hqL = hqLevel();
  if (LIMITS[type][hqL] === 0) return { ok: false, locked: true, reason: `Unlocks at HQ ${unlockLevel(type)}` };
  if (countOf(type) >= limitOf(type)) return { ok: false, reason: hqL < MAX_HQ ? 'Limit reached. Upgrade HQ for more' : 'Limit reached' };
  const cost = costFor(type, 1);
  if (!canAfford(cost)) return { ok: false, reason: 'Not enough resources', cost };
  if (timeFor(type, 1) > 0 && freeBuilders() <= 0) return { ok: false, reason: 'All builders are busy', cost };
  return { ok: true, cost };
}

function upgradeStatus(b) {
  const to = b.level + 1;
  const cap = levelCap(b.type, hqLevel());
  if (b.job) return { ok: false, reason: 'Already under construction' };
  if (b.level >= DEFS[b.type].max) return { ok: false, max: true, reason: 'Max level' };
  if (to > cap) return { ok: false, reason: `Needs HQ ${to - 1}`, to, cost: costFor(b.type, to) };
  const cost = costFor(b.type, to);
  const time = timeFor(b.type, to);
  if (!canAfford(cost)) return { ok: false, reason: 'Not enough resources', to, cost, time };
  if (time > 0 && freeBuilders() <= 0) return { ok: false, reason: 'All builders are busy', to, cost, time };
  return { ok: true, to, cost, time };
}

function startJob(b, to) {
  const time = timeFor(b.type, to);
  if (time <= 0) { b.level = to; return; }
  const now = Date.now();
  b.job = { to, start: now, end: now + time * 1000 };
}

function completeJob(b) {
  b.level = b.job.to;
  b.job = null;
  const c = centerOf(b);
  burst(c.x, c.y - 10, '#f2b632', 18);
  toast(b.level === 1 ? `${displayName(b.type, 1)} is ready` : `${displayName(b.type, b.level)} upgraded to level ${b.level}`, 'good');
  if (b.type === 'hq') toast(hqUnlockText(b.level), 'info');
  save();
}

function hqUnlockText(L) {
  const fresh = Object.keys(LIMITS).filter(t => LIMITS[t][L] > 0 && LIMITS[t][L - 1] === 0).map(t => DEFS[t].name);
  const parts = [`Storage raised to ${fmt(HQ_STORAGE[L])}`];
  if (fresh.length) parts.unshift(`Unlocked: ${fresh.join(', ')}`);
  return parts.join(' · ');
}

function upgrade(b) {
  const st = upgradeStatus(b);
  if (!st.ok) { toast(st.reason, 'bad'); return; }
  pay(st.cost);
  startJob(b, st.to);
  if (!b.job) {
    const c = centerOf(b);
    burst(c.x, c.y, '#f2b632', 10);
    toast(`${displayName(b.type, b.level)} built`, 'good');
  }
  save();
}

function cancelJob(b) {
  if (!b.job) return;
  refund(costFor(b.type, b.job.to), 1);
  b.job = null;
  if (b.level === 0) {
    S.buildings = S.buildings.filter(x => x.id !== b.id);
    selectedId = null;
    rebuildGrid();
  }
  toast('Construction cancelled. Resources refunded', 'info');
  save();
}

function sellValue(b) {
  const c = costFor(b.type, Math.max(1, b.level));
  return { gold: Math.floor(c.gold * 0.5), steel: Math.floor(c.steel * 0.5) };
}

function sell(b) {
  if (b.type === 'hq') return;
  const v = sellValue(b);
  refund(v, 1);
  S.buildings = S.buildings.filter(x => x.id !== b.id);
  const c = centerOf(b);
  burst(c.x, c.y, '#9a9a8c', 14);
  selectedId = null;
  rebuildGrid();
  toast(`${displayName(b.type, b.level)} sold`, 'info');
  save();
}

function collect(b, silent) {
  const kind = DEFS[b.type].produces;
  if (!kind || b.level < 1) return 0;
  const space = storageCap() - S[kind];
  const amt = Math.floor(Math.min(b.stored, space));
  if (amt <= 0) {
    if (!silent && b.stored >= 1) toast(`${kind === 'gold' ? 'Gold' : 'Steel'} storage is full. Build or upgrade a Supply Depot`, 'bad');
    return 0;
  }
  S[kind] += amt;
  b.stored -= amt;
  const c = centerOf(b);
  floaters.push({ x: c.x, y: c.y - 30, text: `+${fmt(amt)}`, color: kind === 'gold' ? '#f5c542' : '#c4d3e0', life: 1.2, max: 1.2 });
  for (let i = 0; i < 8; i++) particles.push({ x: c.x, y: c.y - 20, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 90, g: 260, life: 0.7, max: 0.7, r: 3, color: kind === 'gold' ? '#f5c542' : '#a9b6c1' });
  pulseRes(kind);
  return amt;
}

/* ---------------- Placement ---------------- */

function startPlacing(type) {
  const st = buildStatus(type);
  if (!st.ok) { toast(st.reason, 'bad'); return; }
  const n = DEFS[type].size;
  const cx = Math.round(cam.x / TILE - n / 2), cy = Math.round(cam.y / TILE - n / 2);
  const spot = nearestFree(type, cx, cy) || { x: cx, y: cy };
  placing = { type, x: spot.x, y: spot.y, moveId: null, valid: false };
  select(null);
  updatePlacing();
}

function startMove(b) {
  placing = { type: b.type, x: b.x, y: b.y, moveId: b.id, valid: true };
  selectedId = b.id;
  hidePanel();
  updatePlacing();
}

function nearestFree(type, cx, cy) {
  for (let r = 0; r < 20; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (footprintFree(type, cx + dx, cy + dy, 0)) return { x: cx + dx, y: cy + dy };
    }
  }
  return null;
}

function updatePlacing() {
  if (!placing) return;
  placing.valid = footprintFree(placing.type, placing.x, placing.y, placing.moveId || 0);
}

function confirmPlace() {
  if (!placing) return;
  updatePlacing();
  if (!placing.valid) { toast('That spot is blocked', 'bad'); return; }
  if (placing.moveId) {
    const b = byId(placing.moveId);
    b.x = placing.x; b.y = placing.y;
    placing = null;
    rebuildGrid();
    select(b.id);
    save();
    return;
  }
  const type = placing.type;
  const st = buildStatus(type);
  if (!st.ok) { toast(st.reason, 'bad'); placing = null; showPlaceCtrl(false); return; }
  pay(st.cost);
  const b = { id: S.nextId++, type, x: placing.x, y: placing.y, level: 0, job: null, stored: 0, baseAngle: Math.random() * Math.PI * 2 };
  S.buildings.push(b);
  startJob(b, 1);
  rebuildGrid();
  const c = centerOf(b);
  burst(c.x, c.y, '#c9b27a', 10);
  save();
  if (type === 'wall') {
    // keep laying wall: try the next tile along the last direction
    const dir = placing.dir || { x: 1, y: 0 };
    const next = buildStatus('wall');
    if (next.ok) {
      placing.x += dir.x; placing.y += dir.y;
      if (!footprintFree('wall', placing.x, placing.y, 0)) {
        const alt = nearestFree('wall', placing.x, placing.y);
        if (alt) { placing.x = alt.x; placing.y = alt.y; }
      }
      placing.prev = { x: b.x, y: b.y };
      updatePlacing();
      return;
    }
    toast(next.reason, 'info');
  }
  placing = null;
  showPlaceCtrl(false);
  select(type === 'wall' ? null : b.id);
}

function cancelPlace() {
  const moving = placing && placing.moveId;
  placing = null;
  showPlaceCtrl(false);
  if (moving) select(moving);
}

/* ---------------- Camera & canvas ---------------- */

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
let dpr = 1, vw = 0, vh = 0;
const cam = { x: (MAP_W / 2) * TILE, y: (MAP_H / 2) * TILE, z: 0.8 };
let ground = null;

function minZoom() { return Math.max(vw / (MAP_W * TILE), vh / (MAP_H * TILE)); }
function maxZoom() { return 1.9; }

function resize() {
  dpr = Math.min(2.5, window.devicePixelRatio || 1);
  vw = canvas.clientWidth; vh = canvas.clientHeight;
  canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
  cam.z = clamp(cam.z, minZoom(), maxZoom());
  clampCam();
}

function defaultZoom() { return clamp(vh / (14.5 * TILE), minZoom(), 1.3); }

function clampCam() {
  const W = MAP_W * TILE, H = MAP_H * TILE;
  const hw = vw / 2 / cam.z, hh = vh / 2 / cam.z;
  cam.x = hw * 2 >= W ? W / 2 : clamp(cam.x, hw, W - hw);
  cam.y = hh * 2 >= H ? H / 2 : clamp(cam.y, hh - 40 / cam.z, H - hh + 60 / cam.z);
}

function screenToWorld(sx, sy) { return { x: (sx - vw / 2) / cam.z + cam.x, y: (sy - vh / 2) / cam.z + cam.y }; }
function worldToScreen(wx, wy) { return { x: (wx - cam.x) * cam.z + vw / 2, y: (wy - cam.y) * cam.z + vh / 2 }; }

function centerOf(b) {
  const n = DEFS[b.type].size * TILE;
  return { x: b.x * TILE + n / 2, y: b.y * TILE + n / 2 };
}

/* ---------------- Input ---------------- */

const pointers = new Map();
let gesture = null;

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pointers.size === 1) {
    const w = screenToWorld(e.offsetX, e.offsetY);
    if (placing && hitsGhost(w)) {
      gesture = { mode: 'drag', offX: w.x / TILE - placing.x, offY: w.y / TILE - placing.y, moved: false };
    } else {
      gesture = { mode: 'pan', sx: e.offsetX, sy: e.offsetY, cx: cam.x, cy: cam.y, moved: false };
    }
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    gesture = { mode: 'pinch', d0: dist(a, b), z0: cam.z, anchor: screenToWorld(mid.x, mid.y), moved: true };
  }
});

canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (!gesture) return;
  if (gesture.mode === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    cam.z = clamp(gesture.z0 * dist(a, b) / gesture.d0, minZoom(), maxZoom());
    cam.x = gesture.anchor.x - (mid.x - vw / 2) / cam.z;
    cam.y = gesture.anchor.y - (mid.y - vh / 2) / cam.z;
    clampCam();
  } else if (gesture.mode === 'pan') {
    const dx = e.offsetX - gesture.sx, dy = e.offsetY - gesture.sy;
    if (!gesture.moved && Math.hypot(dx, dy) > 8) gesture.moved = true;
    if (gesture.moved) {
      cam.x = gesture.cx - dx / cam.z; cam.y = gesture.cy - dy / cam.z;
      clampCam();
    }
  } else if (gesture.mode === 'drag' && placing) {
    const w = screenToWorld(e.offsetX, e.offsetY);
    const nx = Math.round(w.x / TILE - gesture.offX), ny = Math.round(w.y / TILE - gesture.offY);
    if (nx !== placing.x || ny !== placing.y) {
      placing.dir = { x: Math.sign(nx - placing.x), y: Math.sign(ny - placing.y) };
      if (placing.dir.x && placing.dir.y) placing.dir.y = 0;
      placing.x = clamp(nx, 0, MAP_W - DEFS[placing.type].size);
      placing.y = clamp(ny, 0, MAP_H - DEFS[placing.type].size);
      gesture.moved = true;
      updatePlacing();
    }
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (gesture && gesture.mode === 'pan' && !gesture.moved && pointers.size === 0 && e.type === 'pointerup') {
    tap(e.offsetX, e.offsetY);
  }
  if (pointers.size === 1 && gesture && gesture.mode === 'pinch') {
    const [p] = [...pointers.values()];
    gesture = { mode: 'pan', sx: p.x, sy: p.y, cx: cam.x, cy: cam.y, moved: true };
  } else if (pointers.size === 0) {
    gesture = null;
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const anchor = screenToWorld(e.offsetX, e.offsetY);
  cam.z = clamp(cam.z * Math.exp(-e.deltaY * 0.0015), minZoom(), maxZoom());
  cam.x = anchor.x - (e.offsetX - vw / 2) / cam.z;
  cam.y = anchor.y - (e.offsetY - vh / 2) / cam.z;
  clampCam();
}, { passive: false });

function hitsGhost(w) {
  const n = DEFS[placing.type].size;
  const pad = Math.max(0.6, 1.1 - n * 0.15);
  const tx = w.x / TILE, ty = w.y / TILE;
  return tx >= placing.x - pad && tx <= placing.x + n + pad && ty >= placing.y - pad - 0.5 && ty <= placing.y + n + pad;
}

function tap(sx, sy) {
  const w = screenToWorld(sx, sy);
  if (placing) {
    const n = DEFS[placing.type].size;
    const nx = Math.floor(w.x / TILE - (n - 1) / 2), ny = Math.floor(w.y / TILE - (n - 1) / 2);
    placing.x = clamp(nx, 0, MAP_W - n); placing.y = clamp(ny, 0, MAP_H - n);
    updatePlacing();
    return;
  }
  // collection bubbles first (they float above the roof)
  for (const b of S.buildings) {
    if (!hasBubble(b)) continue;
    const p = bubblePos(b);
    if (Math.hypot(w.x - p.x, w.y - p.y) < 20 + 8 / cam.z) { collect(b); return; }
  }
  const b = buildingAtTile(Math.floor(w.x / TILE), Math.floor(w.y / TILE)) || tallBuildingAt(w);
  if (b) {
    if (b.id === selectedId && DEFS[b.type].produces && b.stored >= 1) collect(b);
    select(b.id);
  } else {
    select(null);
  }
}

// Taps on the raised roof of a building (drawn above its footprint) still select it.
function tallBuildingAt(w) {
  const below = buildingAtTile(Math.floor(w.x / TILE), Math.floor((w.y + TILE * 0.6) / TILE));
  return below && below.type !== 'wall' ? below : null;
}

function hasBubble(b) {
  const d = DEFS[b.type];
  return d.produces && b.level >= 1 && b.stored >= Math.max(5, statsFor(b.type, b.level).hold * 0.08);
}

function bubblePos(b) {
  const c = centerOf(b);
  return { x: c.x, y: c.y - 54 + Math.sin(tSec * 3 + b.id) * 3 };
}

/* ---------------- Effects ---------------- */

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 110;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, g: 120, life: 0.6 + Math.random() * 0.4, max: 1, r: 2 + Math.random() * 2, color });
  }
}

/* ---------------- Loop ---------------- */

let tSec = 0, lastFrame = performance.now(), lastSave = 0, lastPanel = 0;

function update(dt) {
  tSec += dt;
  const now = Date.now();
  for (const b of S.buildings) {
    if (b.job && now >= b.job.end) completeJob(b);
    const d = DEFS[b.type];
    if (d.produces && b.level >= 1) {
      const st = statsFor(b.type, b.level);
      b.stored = Math.min(st.hold, b.stored + (st.rate / 60) * dt);
    }
    if (d.cat === 'defense') b.angle = b.baseAngle + Math.sin(tSec * 0.45 + b.id * 1.7) * 1.1;
    if (b.type === 'steelworks' && b.level >= 1 && b._chimney && Math.random() < dt * 4) {
      particles.push({ x: b._chimney.x + (Math.random() - 0.5) * 4, y: b._chimney.y, vx: 8 + Math.random() * 10, vy: -18 - Math.random() * 10, g: 0, life: 2.4, max: 2.4, r: 4, grow: 5, color: 'smoke' });
    }
  }
  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; if (p.grow) p.r += p.grow * dt; }
  particles = particles.filter(p => p.life > 0);
  for (const f of floaters) { f.life -= dt; f.y -= 30 * dt; }
  floaters = floaters.filter(f => f.life > 0);
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2c3a20';
  ctx.fillRect(0, 0, vw, vh);
  const z = cam.z;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - cam.x * z), dpr * (vh / 2 - cam.y * z));
  if (ground) ctx.drawImage(ground, 0, 0, MAP_W * TILE, MAP_H * TILE);

  if (placing) drawGridOverlay();

  const sel = selectedId ? byId(selectedId) : null;
  if (sel && !placing) drawSelection(sel);

  const list = S.buildings.filter(b => !(placing && placing.moveId === b.id));
  list.sort((a, b) => (a.y + DEFS[a.type].size) - (b.y + DEFS[b.type].size) || a.x - b.x);
  for (const b of list) {
    let nb = null;
    if (b.type === 'wall') {
      const r = buildingAtTile(b.x + 1, b.y), d = buildingAtTile(b.x, b.y + 1);
      nb = { r: r && r.type === 'wall' && r.level >= 1 && !(placing && placing.moveId === r.id), d: d && d.type === 'wall' && d.level >= 1 && !(placing && placing.moveId === d.id) };
    }
    drawBuilding(ctx, b, tSec, nb);
    if (b.job) {
      drawScaffold(ctx, b, tSec);
      const c = centerOf(b), n = DEFS[b.type].size * TILE;
      const p = clamp((Date.now() - b.job.start) / (b.job.end - b.job.start), 0, 1);
      drawProgress(ctx, c.x, b.y * TILE - 26, Math.max(36, n * 0.8), p, fmtTime(Math.ceil((b.job.end - Date.now()) / 1000)));
    }
  }

  if (placing) drawGhost();

  // collection bubbles
  if (!placing) for (const b of S.buildings) {
    if (!hasBubble(b)) continue;
    const p = bubblePos(b);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(p.x + 2, p.y + 3, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f3efd9'; ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(p.x - 5, p.y + 12); ctx.lineTo(p.x, p.y + 20); ctx.lineTo(p.x + 5, p.y + 12); ctx.fill();
    ctx.strokeStyle = '#2b2e25'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); ctx.stroke();
    drawCoinIcon(ctx, p.x, p.y, 8, DEFS[b.type].produces);
  }

  for (const p of particles) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = p.color === 'smoke' ? a * 0.45 : a;
    ctx.fillStyle = p.color === 'smoke' ? '#cfcabb' : p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life / f.max * 1.5, 0, 1);
    ctx.font = '22px "Black Ops One", Impact, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(f.text, f.x + 2, f.y + 2);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawGridOverlay() {
  ctx.save();
  ctx.strokeStyle = 'rgba(240,235,200,0.14)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = BORDER; x <= MAP_W - BORDER; x++) { ctx.moveTo(x * TILE, BORDER * TILE); ctx.lineTo(x * TILE, (MAP_H - BORDER) * TILE); }
  for (let y = BORDER; y <= MAP_H - BORDER; y++) { ctx.moveTo(BORDER * TILE, y * TILE); ctx.lineTo((MAP_W - BORDER) * TILE, y * TILE); }
  ctx.stroke();
  ctx.restore();
}

function drawRange(cx, cy, r, color, dashed) {
  ctx.save();
  ctx.fillStyle = color.replace('A', '0.08');
  ctx.strokeStyle = color.replace('A', '0.75');
  ctx.lineWidth = 2;
  if (dashed) ctx.setLineDash([10, 8]);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawSelection(b) {
  const n = DEFS[b.type].size * TILE, x = b.x * TILE, y = b.y * TILE, d = DEFS[b.type];
  const c = centerOf(b);
  if (d.range && b.level >= 1) {
    drawRange(c.x, c.y, d.range * TILE, 'rgba(242,182,50,A)', true);
    if (d.minRange) drawRange(c.x, c.y, d.minRange * TILE, 'rgba(200,64,42,A)', true);
  }
  const pulse = 0.55 + Math.sin(tSec * 5) * 0.25;
  ctx.strokeStyle = `rgba(255,236,170,${pulse})`; ctx.lineWidth = 2.5;
  rr(ctx, x - 1, y - 1, n + 2, n + 2, 6); ctx.stroke();
  // corner brackets
  ctx.strokeStyle = '#f2b632'; ctx.lineWidth = 3;
  const k = 9;
  for (const [px, py, sx, sy] of [[x - 3, y - 3, 1, 1], [x + n + 3, y - 3, -1, 1], [x - 3, y + n + 3, 1, -1], [x + n + 3, y + n + 3, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(px, py + sy * k); ctx.lineTo(px, py); ctx.lineTo(px + sx * k, py); ctx.stroke();
  }
  if (b.level >= 1 && b.type !== 'wall') levelChevrons(ctx, x + n - 6, y + n - 14 - b.level * 2, b.level);
}

function drawGhost() {
  const n = DEFS[placing.type].size;
  const x = placing.x * TILE, y = placing.y * TILE, S2 = n * TILE;
  ctx.fillStyle = placing.valid ? 'rgba(127,191,77,0.35)' : 'rgba(200,64,42,0.4)';
  ctx.fillRect(x, y, S2, S2);
  ctx.strokeStyle = placing.valid ? '#a5e26e' : '#ff6a4d'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, S2 - 2, S2 - 2);
  const d = DEFS[placing.type];
  if (d.range) {
    drawRange(x + S2 / 2, y + S2 / 2, d.range * TILE, 'rgba(242,182,50,A)', true);
  }
  const moving = placing.moveId ? byId(placing.moveId) : null;
  const fake = { id: 0, type: placing.type, x: placing.x, y: placing.y, level: moving ? Math.max(1, moving.level) : 1, angle: -0.6, flash: 0 };
  ctx.globalAlpha = 0.82;
  DRAW[placing.type](ctx, fake, tSec, {});
  ctx.globalAlpha = 1;
  // drag arrows
  const cx = x + S2 / 2, cy = y + S2 + 14;
  ctx.fillStyle = 'rgba(16,18,12,0.75)';
  rr(ctx, cx - 26, cy - 8, 52, 16, 8); ctx.fill();
  ctx.fillStyle = '#f3efd9';
  ctx.font = '600 10px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('DRAG', cx, cy + 1);
}

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  update(dt);
  draw();
  updateHUD();
  if (placing) positionPlaceCtrl();
  if (now - lastPanel > 250) { lastPanel = now; refreshPanel(); }
  if (now - lastSave > 4000) { lastSave = now; save(); }
  requestAnimationFrame(frame);
}

/* ---------------- HUD & UI ---------------- */

const $ = sel => document.querySelector(sel);
const ICON = {
  gold: '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="11" r="8" fill="#b88a1c"/><circle cx="10" cy="10" r="8" fill="#f5c542"/><circle cx="7.5" cy="7.5" r="2.2" fill="#fff1b0"/></svg>',
  steel: '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 15h16l-3-7H5z" fill="#4f5961"/><path d="M5 8h10l-2-4H7z" fill="#a9b6c1"/></svg>',
  hammer: '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M11 4l5 5-2 2-5-5z" fill="#c9b27a"/><path d="M8.5 7.5l3 3-7 7-3-3z" fill="#7a5c3d"/><path d="M9 3h5l3 3-2 1-3-2H9z" fill="#9aa5ad"/></svg>',
  clock: '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 5.5V10l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

function fmt(n) {
  n = Math.floor(n);
  if (n >= 100000) return (n / 1000).toFixed(0) + 'K';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString('en-US');
}
function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s}s`;
  if (s < 3600) return s % 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s / 60}m`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m`;
}
function costHTML(c) {
  const parts = [];
  if (c.gold) parts.push(`<span class="cost ${S.gold < c.gold ? 'short' : ''}">${ICON.gold}${fmt(c.gold)}</span>`);
  if (c.steel) parts.push(`<span class="cost ${S.steel < c.steel ? 'short' : ''}">${ICON.steel}${fmt(c.steel)}</span>`);
  if (!parts.length) parts.push('<span class="cost">Free</span>');
  return parts.join('');
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) || 1; }
function gridRef(b) { return `GRID ${String(b.x - BORDER + 1).padStart(2, '0')}-${String(b.y - BORDER + 1).padStart(2, '0')}`; }

const hudCache = {};
function setText(el, key, v) { if (hudCache[key] !== v) { hudCache[key] = v; el.textContent = v; } }

function updateHUD() {
  const cap = storageCap();
  for (const k of ['gold', 'steel']) {
    setText($(`#res-${k} .amt`), k, fmt(S[k]));
    setText($(`#res-${k} .cap`), k + 'cap', `/ ${fmt(cap)}`);
    const pct = Math.min(100, (S[k] / cap) * 100).toFixed(1);
    if (hudCache[k + 'pct'] !== pct) { hudCache[k + 'pct'] = pct; $(`#res-${k} .fill`).style.width = pct + '%'; $(`#res-${k}`).classList.toggle('full', S[k] >= cap); }
  }
  setText($('#builders .amt'), 'bld', `${freeBuilders()}/${BUILDERS}`);
  setText($('#hq-badge .rank'), 'hq', String(hqLevel()));
  setText($('#hq-badge .sub'), 'hqs', `HQ LEVEL ${hqLevel()}`);
}

function pulseRes(kind) {
  const el = $(`#res-${kind}`);
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
}

function toast(msg, kind = 'info') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 2400);
}

/* ----- Selection panel ----- */

const panel = $('#panel');
let panelKey = '';

function select(id) {
  selectedId = id;
  sellArmed = false;
  panelKey = '';
  if (!id) hidePanel(); else refreshPanel(true);
}
function hidePanel() { panel.hidden = true; panelKey = ''; }

function statChips(b) {
  const d = DEFS[b.type], L = Math.max(1, b.level);
  const cur = statsFor(b.type, L);
  const nxt = b.level < d.max && !b.job ? statsFor(b.type, b.level + 1) : null;
  const chip = (label, v, nv, unit = '') => `<span class="chip"><b>${label}</b>${v}${unit}${nv != null && nv !== v ? `<i>&rarr; ${nv}${unit}</i>` : ''}</span>`;
  const out = [];
  if (d.produces) {
    out.push(chip('RATE', cur.rate, nxt && nxt.rate, '/min'));
    out.push(`<span class="chip"><b>MINED</b><span data-live="stored">${fmt(b.stored)}</span> / ${fmt(cur.hold)}</span>`);
  }
  if (b.type === 'depot') out.push(chip('STORAGE', '+' + fmt(cur.storage), nxt && '+' + fmt(nxt.storage)));
  if (b.type === 'hq') out.push(chip('STORAGE', fmt(cur.storage), nxt && fmt(nxt.storage)));
  if (d.dmg) {
    out.push(chip('DPS', cur.dps, nxt && nxt.dps));
    out.push(chip('RANGE', d.range, null));
    out.push(chip('HITS', d.targets === 'both' ? 'Ground + Air' : 'Ground', null));
  }
  out.push(chip('HP', fmt(cur.hp), nxt && fmt(nxt.hp)));
  return out.join('');
}

function refreshPanel(force) {
  if (!selectedId || placing) return;
  const b = byId(selectedId);
  if (!b) { hidePanel(); return; }
  const up = upgradeStatus(b);
  const key = [b.id, b.level, !!b.job, up.ok, up.reason, sellArmed, Math.floor(b.stored) >= 1, b.x, b.y].join('|');
  if (force || key !== panelKey) {
    panelKey = key;
    panel.innerHTML = buildPanel(b, up);
    panel.hidden = false;
  }
  // live values
  const st = panel.querySelector('[data-live="stored"]');
  if (st) st.textContent = fmt(b.stored);
  const cb = panel.querySelector('[data-live="collect"]');
  if (cb) cb.textContent = '+' + fmt(b.stored);
  if (b.job) {
    const left = Math.ceil((b.job.end - Date.now()) / 1000);
    const p = clamp((Date.now() - b.job.start) / (b.job.end - b.job.start), 0, 1);
    const t = panel.querySelector('[data-live="time"]');
    if (t) t.textContent = fmtTime(left);
    const f = panel.querySelector('[data-live="bar"]');
    if (f) f.style.width = (p * 100).toFixed(1) + '%';
  }
}

function buildPanel(b, up) {
  const d = DEFS[b.type];
  const L = b.level;
  const title = displayName(b.type, Math.max(1, L));
  let actions = '';
  if (b.job) {
    actions = `
      <div class="job">
        <div class="job-label">${L === 0 ? 'Building' : `Upgrading to level ${b.job.to}`} ${ICON.clock}<span data-live="time"></span></div>
        <div class="job-bar"><div data-live="bar"></div></div>
      </div>
      <button class="btn ghost" data-act="cancel">Cancel</button>`;
  } else {
    if (d.produces) {
      actions += `<button class="btn collect" data-act="collect" ${b.stored >= 1 ? '' : 'disabled'}>${ICON[d.produces]}<span data-live="collect">+${fmt(b.stored)}</span></button>`;
    }
    if (up.max) {
      actions += `<div class="maxed">Max level</div>`;
    } else {
      const sub = up.ok ? `<span class="btn-sub">${costHTML(up.cost)}${up.time ? `<span class="cost">${ICON.clock}${fmtTime(up.time)}</span>` : ''}</span>`
        : `<span class="btn-sub reason">${up.cost && up.reason === 'Not enough resources' ? costHTML(up.cost) : up.reason}</span>`;
      actions += `<button class="btn upgrade ${up.ok ? '' : 'off'}" data-act="upgrade"><span class="btn-main">Upgrade</span>${sub}</button>`;
    }
    actions += `<button class="btn ghost" data-act="move">Move</button>`;
    if (b.type !== 'hq') {
      actions += sellArmed
        ? `<button class="btn danger" data-act="sell-confirm"><span class="btn-main">Confirm</span><span class="btn-sub">${costHTML(sellValue(b))}</span></button>`
        : `<button class="btn ghost" data-act="sell">Sell</button>`;
    }
  }
  return `
    <div class="p-info">
      <div class="p-head">
        <span class="p-code">${d.code}</span>
        <span class="p-title">${title}</span>
        <span class="p-lvl">${L === 0 ? 'NEW' : 'LVL ' + L}</span>
      </div>
      <div class="p-stats">${statChips(b)}</div>
      <div class="p-grid">${gridRef(b)}</div>
    </div>
    <div class="p-actions">${actions}</div>
    <button class="p-close" data-act="close" aria-label="Close">&times;</button>`;
}

panel.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const b = byId(selectedId);
  if (!b) return;
  const act = btn.dataset.act;
  if (act !== 'sell' && act !== 'sell-confirm') sellArmed = false;
  if (act === 'upgrade') upgrade(b);
  else if (act === 'collect') collect(b);
  else if (act === 'move') startMove(b);
  else if (act === 'cancel') cancelJob(b);
  else if (act === 'sell') { sellArmed = true; }
  else if (act === 'sell-confirm') { sell(b); return; }
  else if (act === 'close') { select(null); return; }
  refreshPanel(true);
});

/* ----- Placement controls ----- */

const placeCtrl = $('#place-ctrl');
function showPlaceCtrl(on) { placeCtrl.hidden = !on; }
function positionPlaceCtrl() {
  showPlaceCtrl(true);
  const n = DEFS[placing.type].size * TILE;
  const p = worldToScreen(placing.x * TILE + n / 2, placing.y * TILE);
  const w = placeCtrl.offsetWidth, h = placeCtrl.offsetHeight;
  const x = clamp(p.x - w / 2, 8, vw - w - 8);
  const y = clamp(p.y - h - 34 * cam.z - 8, 54, vh - h - 8);
  placeCtrl.style.transform = `translate(${x | 0}px, ${y | 0}px)`;
  const label = placing.moveId ? `Move ${displayName(placing.type, byId(placing.moveId).level)}` : displayName(placing.type, 1);
  setText($('#place-label'), 'pl', label);
  const ok = $('#place-ok');
  ok.classList.toggle('off', !placing.valid);
  const costEl = $('#place-cost');
  const ckey = placing.moveId ? 'move' : `${placing.type}|${S.gold}|${S.steel}`;
  if (hudCache.pc !== ckey) { hudCache.pc = ckey; costEl.innerHTML = placing.moveId ? '' : costHTML(costFor(placing.type, 1)); }
}
$('#place-ok').addEventListener('click', confirmPlace);
$('#place-cancel').addEventListener('click', cancelPlace);

/* ----- Shop ----- */

const shop = $('#shop');
let shopTab = 'defense';

function openShop() {
  if (placing) cancelPlace();
  select(null);
  renderShop();
  shop.hidden = false;
}
function closeShop() { shop.hidden = true; }

function renderShop() {
  const tabs = $('#shop-tabs');
  tabs.innerHTML = CATEGORIES.map(c => `<button class="tab ${c.id === shopTab ? 'on' : ''}" data-tab="${c.id}">${c.label}</button>`).join('');
  const list = $('#shop-list');
  list.innerHTML = '';
  const types = Object.keys(DEFS).filter(t => DEFS[t].cat === shopTab);
  for (const type of types) {
    const d = DEFS[type];
    const st = buildStatus(type);
    const card = document.createElement('button');
    card.className = `card ${st.ok ? '' : 'off'} ${st.locked ? 'locked' : ''}`;
    card.dataset.type = type;
    const lim = limitOf(type);
    const t = timeFor(type, 1);
    card.innerHTML = `
      <div class="card-art"></div>
      <div class="card-name">${type === 'wall' ? 'Wall' : d.name}</div>
      <div class="card-desc">${d.desc}</div>
      <div class="card-meta">
        ${st.locked ? `<span class="lock">${st.reason}</span>` : `<span class="count">${countOf(type)}/${lim}</span>`}
        <span class="card-time">${t ? ICON.clock + fmtTime(t) : 'Instant'}</span>
      </div>
      <div class="card-cost">${costHTML(costFor(type, 1))}</div>`;
    card.querySelector('.card-art').appendChild(renderPreview(type, 1, 84));
    list.appendChild(card);
  }
  list.scrollLeft = 0;
}

$('#shop-tabs').addEventListener('click', e => {
  const t = e.target.closest('[data-tab]');
  if (!t) return;
  shopTab = t.dataset.tab;
  renderShop();
});
$('#shop-list').addEventListener('click', e => {
  const c = e.target.closest('.card');
  if (!c) return;
  const st = buildStatus(c.dataset.type);
  if (!st.ok) { toast(st.reason, 'bad'); return; }
  closeShop();
  startPlacing(c.dataset.type);
});
$('#shop-close').addEventListener('click', closeShop);
shop.addEventListener('click', e => { if (e.target === shop) closeShop(); });
$('#btn-build').addEventListener('click', openShop);

/* ----- Modals: battle briefing, settings ----- */

const modal = $('#modal');
function openModal(html) {
  $('#modal-body').innerHTML = html;
  modal.hidden = false;
}
function closeModal() { modal.hidden = true; }
modal.addEventListener('click', e => {
  if (e.target === modal || e.target.closest('[data-close]')) closeModal();
});

function defenseRating() {
  let dps = 0, walls = 0, towers = 0;
  for (const b of S.buildings) {
    if (b.level < 1) continue;
    if (DEFS[b.type].dmg) { dps += statsFor(b.type, b.level).dps; towers++; }
    if (b.type === 'wall') walls++;
  }
  return { dps, walls, towers };
}

$('#btn-battle').addEventListener('click', () => {
  if (placing) cancelPlace();
  const wave = S.bestWave + 1;
  const r = defenseRating();
  const comp = waveComposition(wave).map(u => `<li><span>${u.unit}</span><b>&times;${u.count}</b></li>`).join('');
  openModal(`
    <div class="brief">
      <div class="brief-head">
        <span class="stamp">Intel report</span>
        <h2>Wave ${wave} incoming</h2>
        <p>Hostile forces are massing on the west and east roads. Survive each wave to earn gold and steel.</p>
      </div>
      <div class="brief-cols">
        <div>
          <h3>Enemy force</h3>
          <ul class="units">${comp}</ul>
        </div>
        <div>
          <h3>Your defenses</h3>
          <ul class="units">
            <li><span>Turrets</span><b>${r.towers}</b></li>
            <li><span>Firepower</span><b>${r.dps} DPS</b></li>
            <li><span>Wall segments</span><b>${r.walls}</b></li>
          </ul>
        </div>
      </div>
      <div class="brief-foot">
        <button class="btn battle-go off" disabled>Deploy</button>
        <span class="soon">Battle mode arrives in the next update. Keep fortifying.</span>
        <button class="btn ghost" data-close>Back to base</button>
      </div>
    </div>`);
});

$('#btn-menu').addEventListener('click', () => {
  openModal(`
    <div class="settings">
      <h2>Field manual</h2>
      <ul class="manual">
        <li><b>Build</b> opens the shop. Drag the outline into place, then tap the check mark.</li>
        <li><b>Tap a building</b> to upgrade, move or sell it. Mines show a bubble when they have something to collect.</li>
        <li><b>Drag</b> to look around and <b>pinch</b> to zoom.</li>
        <li>Upgrade the <b>Command Center</b> to unlock more buildings and higher levels.</li>
        <li>Your base saves automatically on this device.</li>
      </ul>
      <div class="settings-row">
        <button class="btn ghost" id="btn-fs">Fullscreen</button>
        <button class="btn ghost" id="btn-recenter">Recenter view</button>
        <button class="btn danger-outline" id="btn-reset">Reset base</button>
        <button class="btn" data-close>Done</button>
      </div>
    </div>`);
  $('#btn-fs').addEventListener('click', toggleFullscreen);
  $('#btn-recenter').addEventListener('click', () => { recenter(); closeModal(); });
  const reset = $('#btn-reset');
  reset.addEventListener('click', () => {
    if (reset.dataset.armed) {
      S = newBase(); rebuildGrid(); select(null); save(); recenter(); closeModal();
      toast('New base established', 'good');
    } else {
      reset.dataset.armed = '1';
      reset.textContent = 'Tap again to erase everything';
    }
  });
});

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      try { await screen.orientation.lock('landscape'); } catch (e) { /* not supported */ }
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {
    toast('Fullscreen is not available here. Add the game to your home screen instead', 'info');
  }
}

function recenter() {
  const h = hq();
  const c = h ? centerOf(h) : { x: MAP_W * TILE / 2, y: MAP_H * TILE / 2 };
  cam.z = defaultZoom();
  cam.x = c.x; cam.y = c.y + 20;
  clampCam();
}

/* ---------------- Boot ---------------- */

function applyOffline(elapsedSec) {
  if (elapsedSec <= 0) return;
  for (const b of S.buildings) {
    const d = DEFS[b.type];
    if (d.produces && b.level >= 1) {
      const st = statsFor(b.type, b.level);
      b.stored = Math.min(st.hold, b.stored + (st.rate / 60) * elapsedSec);
    }
  }
}

function start(hotData) {
  let saved = hotData && hotData.save ? load(hotData.save) : null;
  if (!saved) { try { saved = load(localStorage.getItem(SAVE_KEY)); } catch (e) { saved = null; } }
  S = saved || newBase();
  if (saved) applyOffline((Date.now() - (S.saved || Date.now())) / 1000);
  rebuildGrid();
  resize();
  recenter();
  ground = buildGroundCanvas(1.5);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { ground = buildGroundCanvas(1.5); });
  window.addEventListener('resize', () => { resize(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  window.claude?.hot?.snapshot?.(() => ({ save: serialize() }));
  if (!saved) setTimeout(() => toast('Welcome, Commander. Tap the bubbles to collect resources', 'info'), 600);
  requestAnimationFrame(t => { lastFrame = t; frame(t); });
}

window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
