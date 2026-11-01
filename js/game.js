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
  return migrate(s);
}

// Fill in fields added after the first release so older saves keep working.
function migrate(s) {
  if (s.medals == null) s.medals = 10;
  if (s.xp == null) s.xp = 0;
  if (s.builders == null) s.builders = START_BUILDERS;
  if (!s.claimed) s.claimed = {};
  s.stats = Object.assign({ kills: 0, collectedGold: 0, airstrikes: 0, bosses: 0 }, s.stats || {});
  s.settings = Object.assign({ sound: true, haptics: true }, s.settings || {});
  if (s.nextDrop == null) s.nextDrop = Date.now() + FIRST_DROP_DELAY;
  if (s.bestWave == null) s.bestWave = 0;
  return s;
}

function serialize() {
  S.saved = Date.now();
  // fields starting with "_" are runtime-only (battle damage, aim, etc.)
  return JSON.stringify(S, (k, v) => (k[0] === '_' ? undefined : v));
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
    return migrate(s);
  } catch (e) { return null; }
}

function byId(id) { return S.buildings.find(b => b.id === id); }
function hq() { return S.buildings.find(b => b.type === 'hq'); }
function hqLevel() { const h = hq(); return h ? Math.max(1, h.level) : 1; }
function countOf(type) { return S.buildings.filter(b => b.type === type).length; }
function limitOf(type) { return LIMITS[type][hqLevel()]; }
function busyBuilders() { return S.buildings.filter(b => b.job).length; }
function freeBuilders() { return S.builders - busyBuilders(); }

/* ----- Commander rank & medals ----- */
function addXP(n) {
  const before = rankIndex(S.xp);
  S.xp += n;
  const after = rankIndex(S.xp);
  if (after > before) {
    S.medals += RANK_MEDALS;
    toast(`Promoted to ${RANKS[after].name}! +${RANK_MEDALS} medals`, 'good');
    Sound.play('medal'); buzz([40, 40, 40]);
  }
}

// Medals to finish a running job right away: one per started minute left.
function finishCost(b) {
  if (!b.job) return 0;
  return Math.max(1, Math.ceil((b.job.end - Date.now()) / 60000));
}

function finishNow(b) {
  if (!b.job) return;
  const c = finishCost(b);
  if (S.medals < c) { toast(`You need ${c} medals. Earn them in battle and from missions`, 'bad'); Sound.play('error'); return; }
  S.medals -= c;
  b.job.end = Date.now();
  completeJob(b);
}

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
  if (to > cap) return { ok: false, reason: `Needs HQ level ${to}`, to, cost: costFor(b.type, to) };
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
  Sound.play('done');
  addXP(b.type === 'hq' ? b.level * 40 : b.type === 'wall' ? 0 : b.level * 10);
  toast(b.level === 1 ? `${displayName(b.type, 1)} is ready` : `${displayName(b.type, b.level)} upgraded to level ${b.level}`, 'good');
  if (b.type === 'hq') { toast(hqUnlockText(b.level), 'info'); showUnlock(b.level); }
  save();
}

function hqUnlockText(L) {
  const d = defenseUnlockedAt(L);
  const parts = [`Buildings can now reach level ${L}`, `storage ${fmt(HQ_STORAGE[L])}`];
  if (d) parts.unshift(`Unlocked: ${DEFS[d].name}`);
  return parts.join(' · ');
}

// Celebrate a new Command Center level with the defense it unlocked.
function showUnlock(L) {
  const d = defenseUnlockedAt(L);
  if (!d || B) return;
  openModal(`
    <div class="unlock">
      <div class="unlock-art"></div>
      <div class="unlock-text">
        <span class="stamp">Command Center level ${L}</span>
        <h2>${DEFS[d].name} unlocked</h2>
        <p class="lead">${DEFS[d].desc}</p>
        <ul class="units">
          <li><span>Building level cap</span><b>${L}</b></li>
          <li><span>Base storage</span><b>${fmt(HQ_STORAGE[L])}</b></li>
        </ul>
        <div class="settings-row">
          <button class="btn" id="btn-unlock-build">Build one</button>
          <button class="btn ghost" data-close>Later</button>
        </div>
      </div>
    </div>`);
  $('.unlock-art').appendChild(renderPreview(d, 1, 130));
  $('#btn-unlock-build').addEventListener('click', () => { closeModal(); shopTab = 'defense'; startPlacing(d); });
}

// Every Command Center level at a glance: what it unlocks and what it costs.
function openRoadmap() {
  const cur = hqLevel();
  const rows = [];
  for (let L = 1; L <= MAX_HQ; L++) {
    const d = defenseUnlockedAt(L);
    const c = costFor('hq', L);
    const state = L < cur ? 'done' : L === cur ? 'now' : L === cur + 1 ? 'next' : 'later';
    rows.push(`
      <li class="road ${state}">
        <div class="road-lvl">${L}</div>
        <div class="road-art" data-type="${d || ''}"></div>
        <div class="road-body">
          <div class="road-title">${d ? DEFS[d].name : 'Command Center'}</div>
          <div class="road-meta">Level cap ${L} · storage ${fmt(HQ_STORAGE[L])}${L > 1 ? ` · ${fmtTime(timeFor('hq', L))}` : ''}</div>
        </div>
        <div class="road-cost">${state === 'done' || state === 'now' ? `<span class="road-tag">${state === 'now' ? 'Current' : 'Done'}</span>` : costHTML(c)}</div>
      </li>`);
  }
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Command Center roadmap</h2><span class="m-count">HQ ${cur} of ${MAX_HQ}</span></div>
      <p class="lead">Each level unlocks a new defense and lets every other building be upgraded one level higher.</p>
      <ul class="roadmap">${rows.join('')}</ul>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`);
  $('#modal-body').querySelectorAll('.road-art').forEach(el => { if (el.dataset.type) el.appendChild(renderPreview(el.dataset.type, 1, 44)); });
}

function upgrade(b) {
  const st = upgradeStatus(b);
  if (!st.ok) { toast(st.reason, 'bad'); return; }
  pay(st.cost);
  startJob(b, st.to);
  Sound.play('build');
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

// Collect from every mine and foundry in one tap.
function collectAll() {
  let g = 0, st = 0, any = false;
  for (const b of S.buildings) {
    if (!hasBubble(b)) continue;
    any = true;
    const amt = collect(b, true);
    if (DEFS[b.type].produces === 'gold') g += amt; else st += amt;
  }
  if (!any) return;
  if (!g && !st) { toast('Storage is full. Build or upgrade a Supply Depot', 'bad'); Sound.play('error'); return; }
  toast(`Collected ${g ? fmt(g) + ' gold' : ''}${g && st ? ' and ' : ''}${st ? fmt(st) + ' steel' : ''}`, 'good');
}

function collect(b, silent) {
  const kind = DEFS[b.type].produces;
  if (!kind || b.level < 1) return 0;
  const space = storageCap() - S[kind];
  const amt = Math.floor(Math.min(b.stored, space));
  if (amt <= 0) {
    if (!silent && b.stored >= 1) { toast(`${kind === 'gold' ? 'Gold' : 'Steel'} storage is full. Build or upgrade a Supply Depot`, 'bad'); Sound.play('error'); }
    return 0;
  }
  S[kind] += amt;
  if (kind === 'gold') S.stats.collectedGold += amt;
  Sound.play('collect'); buzz(10);
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
  Sound.play('build');
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
  if (B) { battleTap(w); return; }
  if (placing) {
    const n = DEFS[placing.type].size;
    const nx = Math.floor(w.x / TILE - (n - 1) / 2), ny = Math.floor(w.y / TILE - (n - 1) / 2);
    placing.x = clamp(nx, 0, MAP_W - n); placing.y = clamp(ny, 0, MAP_H - n);
    updatePlacing();
    return;
  }
  if (S.drop && Math.hypot(w.x - (S.drop.x + 0.5) * TILE, w.y - (S.drop.y + 0.3) * TILE) < TILE * 0.9) { openDrop(); return; }
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
  if (!S.drop && now >= S.nextDrop && !B) spawnDrop();
  for (const b of S.buildings) {
    if (b.job && now >= b.job.end && !B) completeJob(b);
    const d = DEFS[b.type];
    if (d.produces && b.level >= 1) {
      const st = statsFor(b.type, b.level);
      b.stored = Math.min(st.hold, b.stored + (st.rate / 60) * dt);
    }
    if (d.cat === 'defense' && !B) b.angle = b.baseAngle + Math.sin(tSec * 0.45 + b.id * 1.7) * 1.1;
    if (b.type === 'steelworks' && b.level >= 1 && b._chimney && Math.random() < dt * 4) {
      particles.push({ x: b._chimney.x + (Math.random() - 0.5) * 4, y: b._chimney.y, vx: 8 + Math.random() * 10, vy: -18 - Math.random() * 10, g: 0, life: 2.4, max: 2.4, r: 4, grow: 5, color: 'smoke' });
    }
  }
  if (B) battleUpdate(dt * B.speed);
  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; if (p.grow) p.r += p.grow * dt; }
  particles = particles.filter(p => p.life > 0);
  for (const f of floaters) { f.life -= dt; f.y -= 30 * dt; }
  floaters = floaters.filter(f => f.life > 0);
}

/* ---------------- Ambient: drifting cloud shadows and passing birds ---------------- */
const clouds = [];
let cloudBlob = null;
let birds = null, birdTimer = 12;

function initAmbient() {
  cloudBlob = document.createElement('canvas');
  cloudBlob.width = cloudBlob.height = 128;
  const g = cloudBlob.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(10,20,5,1)'); grad.addColorStop(0.6, 'rgba(10,20,5,0.55)'); grad.addColorStop(1, 'rgba(10,20,5,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const W = MAP_W * TILE, H = MAP_H * TILE;
  for (let i = 0; i < 5; i++) {
    clouds.push({ x: Math.random() * W, y: Math.random() * H, w: 260 + Math.random() * 260, h: 140 + Math.random() * 120, s: 6 + Math.random() * 6 });
  }
}

function updateAmbient(dt) {
  const W = MAP_W * TILE;
  for (const c of clouds) { c.x += c.s * dt; if (c.x - c.w > W) c.x = -c.w; }
  if (birds) {
    for (const b of birds.list) { b.x += birds.vx * dt; b.y += birds.vy * dt; }
    birds.t += dt;
    if (birds.t > 40) birds = null;
  } else if (!B && (birdTimer -= dt) <= 0) {
    birdTimer = 25 + Math.random() * 25;
    const fromLeft = Math.random() < 0.5, H = MAP_H * TILE;
    const y0 = H * (0.2 + Math.random() * 0.6), vx = (fromLeft ? 1 : -1) * (70 + Math.random() * 30), vy = (Math.random() - 0.5) * 30;
    const x0 = fromLeft ? -60 : W + 60;
    const list = [];
    for (let i = 0; i < 5 + (Math.random() * 4 | 0); i++) list.push({ x: x0 - Math.sign(vx) * (i * 18 + Math.random() * 10), y: y0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 14, p: Math.random() * 6 });
    birds = { list, vx, vy, t: 0 };
  }
}

function drawCloudShadows() {
  if (!cloudBlob) return;
  ctx.globalAlpha = 0.11;
  for (const c of clouds) ctx.drawImage(cloudBlob, c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
  ctx.globalAlpha = 1;
}

function drawBirds() {
  if (!birds) return;
  const dir = Math.sign(birds.vx);
  for (const b of birds.list) {
    const flap = Math.sin(tSec * 10 + b.p) * 4;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(b.x + 30, b.y + 40, 4, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1e1f1a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x - 6 * dir, b.y - flap); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x - 6 * dir, b.y + flap); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.x - 6, b.y - flap * 0.2); ctx.quadraticCurveTo(b.x - 3, b.y - 5 - flap, b.x, b.y); ctx.quadraticCurveTo(b.x + 3, b.y - 5 - flap, b.x + 6, b.y - flap * 0.2); ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

let frameDt = 0;
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#2c3a20';
  ctx.fillRect(0, 0, vw, vh);
  const z = cam.z;
  const sh = shakeOffset(frameDt);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - cam.x * z + sh.x), dpr * (vh / 2 - cam.y * z + sh.y));
  if (ground) ctx.drawImage(ground, 0, 0, MAP_W * TILE, MAP_H * TILE);
  drawBattleDecals(ctx);

  if (placing) drawGridOverlay();

  const sel = selectedId ? byId(selectedId) : null;
  if (sel && !placing) drawSelection(sel);

  const list = S.buildings.filter(b => !(placing && placing.moveId === b.id));
  list.sort((a, b) => (a.y + DEFS[a.type].size) - (b.y + DEFS[b.type].size) || a.x - b.x);
  for (const b of list) {
    let nb = null;
    if (b.type === 'wall') {
      const r = buildingAtTile(b.x + 1, b.y), d = buildingAtTile(b.x, b.y + 1);
      const link = o => o && o.type === 'wall' && o.level >= 1 && !o._dead && !(placing && placing.moveId === o.id);
      nb = { r: link(r), d: link(d) };
    }
    if (b._dead) { drawRubble(ctx, b); continue; }
    drawBuilding(ctx, b, tSec, nb);
    if (b.job && !B) {
      drawScaffold(ctx, b, tSec);
      const c = centerOf(b), n = DEFS[b.type].size * TILE;
      const p = clamp((Date.now() - b.job.start) / (b.job.end - b.job.start), 0, 1);
      drawProgress(ctx, c.x, b.y * TILE - 26, Math.max(36, n * 0.8), p, fmtTime(Math.ceil((b.job.end - Date.now()) / 1000)));
    }
  }

  drawBattleGround(ctx);
  if (placing) drawGhost();

  // collection bubbles
  if (S.drop && !B) drawSupplyCrate(ctx, (S.drop.x + 0.5) * TILE, (S.drop.y + 0.5) * TILE, tSec);
  if (!placing && !B) for (const b of S.buildings) {
    if (!hasBubble(b)) continue;
    const p = bubblePos(b);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(p.x + 2, p.y + 3, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f3efd9'; ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(p.x - 5, p.y + 12); ctx.lineTo(p.x, p.y + 20); ctx.lineTo(p.x + 5, p.y + 12); ctx.fill();
    ctx.strokeStyle = '#2b2e25'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); ctx.stroke();
    drawCoinIcon(ctx, p.x, p.y, 8, DEFS[b.type].produces);
  }

  drawCloudShadows();
  for (const p of particles) {
    const a = clamp(p.life / p.max, 0, 1);
    const smoke = p.color === 'smoke' || p.color === 'smoke-dark';
    ctx.globalAlpha = smoke ? a * 0.45 : a;
    if (p.glow) ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = p.color === 'smoke' ? '#cfcabb' : p.color === 'smoke-dark' ? '#3a3632' : p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    if (p.glow) ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
  drawBirds();
  drawBattleAir(ctx);
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.life / f.max * 1.5, 0, 1);
    ctx.font = `${f.size || 22}px "Black Ops One", Impact, sans-serif`;
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
  updateAmbient(dt);
  frameDt = dt;
  draw();
  updateHUD();
  updateBattleHUD();
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
  medal: '<svg class="ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 1h3l1 5-3 1zM14 1h-3l-1 5 3 1z" fill="#c8402a"/><circle cx="10" cy="12" r="6.5" fill="#b9851a"/><circle cx="10" cy="12" r="5" fill="#f2b632"/><path d="M10 8.6l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="#fff1b0"/></svg>',
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
  setText($('#builders .amt'), 'bld', `${freeBuilders()}/${S.builders}`);
  setText($('#medals .amt'), 'med', fmt(S.medals));
  setText($('#hq-badge .rank'), 'hq', String(hqLevel()));
  setText($('#hq-badge .base-name'), 'bn', S.name);
  const ri = rankIndex(S.xp);
  setText($('#hq-badge .sub'), 'hqs', `${RANKS[ri].name.toUpperCase()} · HQ ${hqLevel()}`);
  const next = RANKS[ri + 1];
  const xpPct = next ? ((S.xp - RANKS[ri].xp) / (next.xp - RANKS[ri].xp) * 100).toFixed(1) : '100';
  if (hudCache.xp !== xpPct) { hudCache.xp = xpPct; $('#hq-badge .xp-fill').style.width = xpPct + '%'; }
  const ready = claimableMissions();
  setText($('#btn-missions .dot'), 'mdot', ready ? String(ready) : '');
  const anyBubble = !B && !placing && S.buildings.some(hasBubble);
  if (hudCache.ca !== anyBubble) { hudCache.ca = anyBubble; $('#btn-collect').hidden = !anyBubble; }
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
  if (b.type === 'hq') {
    out.push(chip('LEVEL CAP', L, nxt ? L + 1 : null));
    const nd = b.level < MAX_HQ && defenseUnlockedAt(b.level + 1);
    if (nd && !b.job) out.push(`<span class="chip unlock-chip"><b>NEXT</b>${DEFS[nd].name}</span>`);
    out.push(chip('STORAGE', fmt(cur.storage), nxt && fmt(nxt.storage)));
  }
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
    const fc = panel.querySelector('[data-live="fcost"]');
    if (fc) { const c = finishCost(b); fc.textContent = c; fc.closest('.btn').classList.toggle('off', S.medals < c); }
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
      <button class="btn medal-btn ${S.medals >= finishCost(b) ? '' : 'off'}" data-act="finish"><span class="btn-main">Finish</span><span class="btn-sub">${ICON.medal}<span data-live="fcost">${finishCost(b)}</span></span></button>
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
    if (b.type === 'wall' && !up.max) {
      const same = S.buildings.filter(w => w.type === 'wall' && w.level === b.level && !w.job).length;
      if (same > 1) actions += `<button class="btn ghost" data-act="walls-all"><span class="btn-main">All ${same}</span><span class="btn-sub">to level ${b.level + 1}</span></button>`;
    }
    actions += `<button class="btn ghost" data-act="move">Move</button>`;
    if (b.type === 'hq') actions += `<button class="btn ghost" data-act="roadmap">Roadmap</button>`;
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
  else if (act === 'finish') finishNow(b);
  else if (act === 'roadmap') { openRoadmap(); return; }
  else if (act === 'walls-all') upgradeAllWalls(b.level);
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
  const types = Object.keys(DEFS).filter(t => DEFS[t].cat === shopTab).sort((a, b) => unlockLevel(a) - unlockLevel(b));
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
let modalOnClose = null;
function openModal(html, onClose) {
  $('#modal-body').innerHTML = html;
  modal.hidden = false;
  modalOnClose = onClose || null;
}
function closeModal() {
  if (modal.hidden) return;
  modal.hidden = true;
  const f = modalOnClose; modalOnClose = null;
  if (f) f();
}
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
  if (B) return;
  const wave = 1;
  const r = defenseRating();
  const comp = waveComposition(wave).map(u => `<li><span>${ENEMIES[u.type].name}</span><b>&times;${u.count}</b></li>`).join('');
  openModal(`
    <div class="brief">
      <div class="brief-head">
        <span class="stamp">Intel report</span>
        <h2>Hold the line</h2>
        <p>Enemy waves will keep coming down the roads, each one bigger than the last. Every kill and every wave you survive pays out gold and steel. Damage is repaired after the battle.</p>
      </div>
      <div class="brief-cols">
        <div>
          <h3>First wave</h3>
          <ul class="units">${comp}</ul>
        </div>
        <div>
          <h3>Your defenses</h3>
          <ul class="units">
            <li><span>Turrets</span><b>${r.towers}</b></li>
            <li><span>Firepower</span><b>${r.dps} DPS</b></li>
            <li><span>Wall segments</span><b>${r.walls}</b></li>
            <li><span>Best wave survived</span><b>${S.bestWave || 0}</b></li>
          </ul>
        </div>
      </div>
      <div class="brief-foot">
        <button class="btn battle-go" id="btn-deploy">Start battle</button>
        <button class="btn ghost" id="btn-intel">Enemy guide</button>
        <span class="soon">Tip: walls slow the enemy down while your turrets fire.</span>
        <button class="btn ghost" data-close>Back to base</button>
      </div>
    </div>`);
  $('#btn-deploy').addEventListener('click', startBattle);
  $('#btn-intel').addEventListener('click', () => openFieldGuide(true));
});

$('#btn-menu').addEventListener('click', () => {
  openModal(`
    <div class="settings">
      <h2>Field manual</h2>
      <ul class="manual">
        <li><b>Build</b> opens the shop. Drag the outline into place, then tap the check mark.</li>
        <li><b>Tap a building</b> to upgrade, move or sell it. Mines show a bubble when they have something to collect.</li>
        <li><b>Drag</b> to look around and <b>pinch</b> to zoom.</li>
        <li>Upgrade the <b>Command Center</b>: every level unlocks a new defense and lets your other buildings go one level higher. Tap it and open <b>Roadmap</b> to see all 8 levels.</li>
        <li><b>Battle</b> sends endless enemy waves down the roads. Survive as long as you can; kills and cleared waves pay out, and the base is repaired afterwards.</li>
        <li>Earn <b>medals</b> from battles, missions and promotions. Spend them to finish construction instantly or to hire more builders.</li>
        <li>Your base saves automatically on this device.</li>
      </ul>
      <div class="settings-row">
        <button class="btn ghost toggle ${S.settings.sound ? 'on' : ''}" id="btn-sound">Sound: ${S.settings.sound ? 'On' : 'Off'}</button>
        <button class="btn ghost toggle ${S.settings.haptics ? 'on' : ''}" id="btn-haptics">Vibration: ${S.settings.haptics ? 'On' : 'Off'}</button>
        <button class="btn ghost" id="btn-fs">Fullscreen</button>
        <button class="btn ghost" id="btn-recenter">Recenter view</button>
        <button class="btn danger-outline" id="btn-reset">Reset base</button>
        <button class="btn" data-close>Done</button>
      </div>
    </div>`);
  $('#btn-fs').addEventListener('click', toggleFullscreen);
  $('#btn-sound').addEventListener('click', e => {
    S.settings.sound = !S.settings.sound; applySettings(); save();
    if (S.settings.sound) Sound.unlock();
    e.currentTarget.textContent = `Sound: ${S.settings.sound ? 'On' : 'Off'}`; e.currentTarget.classList.toggle('on', S.settings.sound);
    Sound.play('click');
  });
  $('#btn-haptics').addEventListener('click', e => {
    S.settings.haptics = !S.settings.haptics; applySettings(); save();
    e.currentTarget.textContent = `Vibration: ${S.settings.haptics ? 'On' : 'Off'}`; e.currentTarget.classList.toggle('on', S.settings.haptics);
    buzz(30);
  });
  $('#btn-recenter').addEventListener('click', () => { recenter(); closeModal(); });
  const reset = $('#btn-reset');
  reset.addEventListener('click', () => {
    if (reset.dataset.armed) {
      S = newBase(); applySettings(); rebuildGrid(); select(null); save(); recenter(); closeModal();
      toast('New base established', 'good');
    } else {
      reset.dataset.armed = '1';
      reset.textContent = 'Tap again to erase everything';
    }
  });
});

function applySettings() {
  Sound.enabled = S.settings.sound;
  hapticsOn = S.settings.haptics;
}

/* ----- Walls: upgrade a whole set ----- */
function upgradeAllWalls(level) {
  const list = S.buildings.filter(w => w.type === 'wall' && w.level === level && !w.job);
  const to = level + 1;
  if (to > levelCap('wall', hqLevel())) { toast(`Walls above level ${level} need Command Center level ${to}`, 'bad'); Sound.play('error'); return; }
  const cost = costFor('wall', to);
  let n = 0;
  for (const w of list) { if (!canAfford(cost)) break; pay(cost); w.level = to; n++; }
  if (!n) { toast('Not enough resources', 'bad'); Sound.play('error'); return; }
  Sound.play('done');
  toast(`${n} wall${n > 1 ? 's' : ''} upgraded to ${WALL_NAMES[to]}${n < list.length ? ` (${list.length - n} left: not enough resources)` : ''}`, 'good');
  save();
}

/* ----- Supply drops ----- */
function spawnDrop() {
  const rnd = () => BORDER + 1 + Math.floor(Math.random() * (MAP_W - BORDER * 2 - 2));
  for (let i = 0; i < 60; i++) {
    const x = rnd(), y = BORDER + 1 + Math.floor(Math.random() * (MAP_H - BORDER * 2 - 2));
    if (!grid[y * MAP_W + x]) { S.drop = { x, y }; toast('A supply crate has landed in your base', 'info'); Sound.play('alarm'); save(); return; }
  }
  S.nextDrop = Date.now() + 10 * 60 * 1000;
}

function openDrop() {
  if (!S.drop) return;
  const cap = storageCap();
  const gold = Math.round(cap * 0.12 / 10) * 10 + 100, steel = Math.round(cap * 0.1 / 10) * 10 + 80, medals = 2;
  const g = Math.min(gold, Math.max(0, cap - S.gold)), st = Math.min(steel, Math.max(0, cap - S.steel));
  S.gold += g; S.steel += st; S.medals += medals;
  const x = (S.drop.x + 0.5) * TILE, y = (S.drop.y + 0.5) * TILE;
  burst(x, y, '#f2b632', 20);
  floaters.push({ x, y: y - 30, text: `+${medals} medals`, color: '#f2b632', life: 1.4, max: 1.4 });
  S.drop = null;
  S.nextDrop = Date.now() + DROP_INTERVAL;
  Sound.play('medal'); buzz(30);
  toast(`Supply crate: +${fmt(g)} gold, +${fmt(st)} steel, +${medals} medals. Next drop in about 2 hours`, 'good');
  pulseRes('gold'); pulseRes('steel');
  save();
}

/* ----- Missions ----- */
function missionState(m) {
  const [cur, target] = m.progress(S);
  return { cur: Math.min(cur, target), target, done: cur >= target, claimed: !!S.claimed[m.id] };
}
function claimableMissions() {
  let n = 0;
  for (const m of MISSIONS) { const st = missionState(m); if (st.done && !st.claimed) n++; }
  return n;
}
function rewardText(r) {
  const parts = [];
  if (r.gold) parts.push(`${ICON.gold}${fmt(r.gold)}`);
  if (r.steel) parts.push(`${ICON.steel}${fmt(r.steel)}`);
  if (r.medals) parts.push(`${ICON.medal}${r.medals}`);
  return parts.map(p => `<span class="cost">${p}</span>`).join('');
}
function openMissions() {
  // show unclaimed first (claimable on top), then a few upcoming, then completed
  const rows = MISSIONS.map(m => ({ m, st: missionState(m) }))
    .filter(r => !r.st.claimed)
    .sort((a, b) => (b.st.done - a.st.done));
  const doneCount = MISSIONS.filter(m => S.claimed[m.id]).length;
  const list = rows.slice(0, 6).map(({ m, st }) => `
    <li class="mission ${st.done ? 'ready' : ''}">
      <div class="m-body">
        <div class="m-text">${m.text}</div>
        <div class="m-bar"><div style="width:${(st.cur / st.target * 100).toFixed(1)}%"></div></div>
        <div class="m-prog">${fmt(st.cur)} / ${fmt(st.target)}</div>
      </div>
      <div class="m-reward">${rewardText(m.reward)}</div>
      ${st.done ? `<button class="btn" data-claim="${m.id}">Claim</button>` : ''}
    </li>`).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Missions</h2><span class="m-count">${doneCount} / ${MISSIONS.length} complete</span></div>
      <ul class="missions">${list || '<li class="mission"><div class="m-text">Every mission is complete. Outstanding work, Commander.</div></li>'}</ul>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`);
  $('#modal-body').querySelectorAll('[data-claim]').forEach(btn => btn.addEventListener('click', () => claimMission(btn.dataset.claim)));
}
function claimMission(id) {
  const m = MISSIONS.find(x => x.id === id);
  if (!m || S.claimed[id] || !missionState(m).done) return;
  S.claimed[id] = true;
  const cap = storageCap();
  if (m.reward.gold) S.gold = Math.min(cap, S.gold + m.reward.gold);
  if (m.reward.steel) S.steel = Math.min(cap, S.steel + m.reward.steel);
  if (m.reward.medals) S.medals += m.reward.medals;
  addXP(25);
  Sound.play('medal'); buzz(20);
  toast(`Mission complete: ${m.text}`, 'good');
  save();
  openMissions();
}

/* ----- Builders ----- */
function openBuilders() {
  const next = S.builders + 1;
  const canHire = S.builders < MAX_BUILDERS;
  const cost = canHire ? BUILDER_COST[next] : 0;
  openModal(`
    <div class="settings">
      <h2>Builders</h2>
      <p class="lead">You have ${S.builders} builder${S.builders > 1 ? 's' : ''}. Each one can work on one construction job at a time. ${busyBuilders()} ${busyBuilders() === 1 ? 'is' : 'are'} busy right now.</p>
      ${canHire ? `<p class="lead">Hire builder #${next} for ${cost} medals. You have ${S.medals}.</p>` : '<p class="lead">Your construction crew is at full strength.</p>'}
      <div class="settings-row">
        ${canHire ? `<button class="btn medal-btn ${S.medals >= cost ? '' : 'off'}" id="btn-hire"><span class="btn-main">Hire</span><span class="btn-sub">${ICON.medal}${cost}</span></button>` : ''}
        <button class="btn ghost" data-close>Close</button>
      </div>
    </div>`);
  const hire = $('#btn-hire');
  if (hire) hire.addEventListener('click', () => {
    if (S.medals < cost) { toast(`You need ${cost} medals`, 'bad'); Sound.play('error'); return; }
    S.medals -= cost; S.builders++;
    Sound.play('done'); toast(`Builder #${S.builders} hired`, 'good'); save(); closeModal();
  });
}

/* ----- Rename base ----- */
function openRename() {
  openModal(`
    <form class="settings" id="rename-form">
      <h2>Rename your base</h2>
      <label class="field-label" for="base-name-input">Base name</label>
      <input id="base-name-input" class="text-input" maxlength="20" autocomplete="off" value="${S.name.replace(/"/g, '&quot;')}">
      <div class="settings-row">
        <button class="btn" type="submit">Save name</button>
        <button class="btn ghost" type="button" data-close>Cancel</button>
      </div>
    </form>`);
  const input = $('#base-name-input');
  setTimeout(() => { try { input.focus(); input.select(); } catch (e) { /* ignore */ } }, 50);
  $('#rename-form').addEventListener('submit', e => {
    e.preventDefault();
    const v = input.value.replace(/[<>]/g, '').trim().slice(0, 20);
    if (!v) { toast('Enter a name for your base', 'bad'); return; }
    S.name = v; save(); closeModal(); toast(`Base renamed to ${v}`, 'good');
  });
}

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
  applySettings();
  initBattleUI();
  $('#btn-missions').addEventListener('click', () => { if (!B) { Sound.play('click'); openMissions(); } });
  $('#builders').addEventListener('click', () => { if (!B) { Sound.play('click'); openBuilders(); } });
  $('#hq-badge').addEventListener('click', () => { if (!B) openRename(); });
  $('#btn-collect').addEventListener('click', collectAll);
  resize();
  recenter();
  ground = buildGroundCanvas(1.5);
  initAmbient();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { ground = buildGroundCanvas(1.5); });
  window.addEventListener('resize', () => { resize(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  window.claude?.hot?.snapshot?.(() => ({ save: serialize() }));
  if (!saved) setTimeout(() => toast('Welcome, Commander. Tap the bubbles to collect resources', 'info'), 600);
  requestAnimationFrame(t => { lastFrame = t; frame(t); });
}

window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
