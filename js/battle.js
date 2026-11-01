// WarBreach — battle mode: enemy waves, pathing, defense fire, damage and rewards.
'use strict';

let B = null; // active battle, or null while building

const GATES = {
  w: () => ({ x: TILE * 0.4, y: (MAP_H / 2) * TILE - 30 }),
  e: () => ({ x: MAP_W * TILE - TILE * 0.4, y: (MAP_H / 2) * TILE + 40 }),
  n: () => ({ x: (MAP_W / 2) * TILE + 30, y: TILE * 0.4 }),
};

/* ---------------- Lifecycle ---------------- */

function startBattle() {
  if (placing) cancelPlace();
  select(null);
  closeModal();
  closeShop();
  for (const b of S.buildings) {
    b._maxhp = b.level >= 1 ? statsFor(b.type, b.level).hp : 150;
    b._hp = b._maxhp;
    b._dead = false;
    b._cd = Math.random() * 0.5;
    b._tgt = null;
  }
  B = {
    wave: 0, phase: 'break', breakT: 2.5, queue: [], spawnT: 0, spawnIdx: 0,
    units: [], shots: [], fx: [], kills: 0, waves: 0,
    loot: { gold: 0, steel: 0 }, medals: 0, speed: 1, flow: null, flowDirty: true, over: false,
    ab: { airstrike: 3, repair: 0 }, targeting: false, planes: [], dmgBy: {}, bosses: 0,
  };
  S.battles = (S.battles || 0) + 1;
  document.body.classList.add('in-battle');
  setSpeedLabel();
  banner('Defend the base', 'First wave approaching from the west road');
  Sound.play('alarm');
}

function startWave(n) {
  B.wave = n;
  B.phase = 'fight';
  const q = [];
  for (const g of waveComposition(n)) for (let i = 0; i < g.count; i++) q.push(g.type);
  // keep a few riflemen up front, shuffle the rest so heavy units arrive mixed in
  const head = q.splice(0, 3);
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  B.queue = head.concat(q);
  B.gates = waveGates(n);
  B.spawnT = 0.5;
  B.spawnIdx = 0;
  B.waveSize = B.queue.length;
  const fresh = n > 1 && waveGates(n).length > waveGates(n - 1).length;
  if (isBossWave(n)) {
    banner(`Boss wave ${n}`, 'Siege Tank inbound. Focus your heaviest guns');
    Sound.play('boss'); buzz([80, 60, 80]);
  } else {
    banner(`Wave ${n}`, fresh ? 'New attack route opened' : `${B.waveSize} hostiles inbound`);
    Sound.play('alarm');
  }
}

function endBattle(reason) {
  if (!B || B.over) return;
  B.over = true;
  const survived = B.waves;
  const record = survived > (S.bestWave || 0);
  if (record) S.bestWave = survived;
  save();
  Sound.play(reason === 'retreat' ? 'win' : 'lose');
  const names = { hq: 'Command Center gun', airstrike: 'Airstrikes' };
  const top = Object.entries(B.dmgBy).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = top.reduce((a, [, v]) => a + v, 0) || 1;
  const report = top.length ? top.map(([k, v]) => `<li><span>${names[k] || DEFS[k].name}</span><b>${fmt(v)} <small>${Math.round(v / total * 100)}%</small></b></li>`).join('') : '<li><span>No damage dealt</span><b>0</b></li>';
  const title = reason === 'retreat' ? 'Forces withdrawn' : 'Base overrun';
  const line = reason === 'retreat'
    ? 'You pulled back before the next assault. Everything you earned is in storage.'
    : 'The Command Center fell. Your engineers have rebuilt the base, and the loot you earned is kept.';
  openModal(`
    <div class="brief">
      <div class="brief-head">
        <span class="stamp">After-action report</span>
        <h2>${title}</h2>
        <p>${line}</p>
      </div>
      <div class="brief-cols">
        <div>
          <h3>Result</h3>
          <ul class="units">
            <li><span>Waves survived</span><b>${survived}</b></li>
            <li><span>Enemies destroyed</span><b>${B.kills}</b></li>
            <li><span>Best ever</span><b>${S.bestWave}${record ? ' (new record)' : ''}</b></li>
          </ul>
        </div>
        <div>
          <h3>Loot</h3>
          <ul class="units">
            <li><span>Gold</span><b>+${fmt(B.loot.gold)}</b></li>
            <li><span>Steel</span><b>+${fmt(B.loot.steel)}</b></li>
            <li><span>Medals</span><b>+${B.medals}</b></li>
          </ul>
        </div>
      </div>
      <h3 class="report-h">Damage by defense</h3>
      <ul class="units report">${report}</ul>
      <div class="brief-foot">
        <span class="soon">Spend your loot on upgrades, then try to beat wave ${S.bestWave + 1}.</span>
        <button class="btn" data-close>Return to base</button>
      </div>
    </div>`, leaveBattle);
}

// Called when the after-action report closes: repair the base and go back to building.
function leaveBattle() {
  if (!B) return;
  for (const b of S.buildings) { delete b._hp; delete b._maxhp; delete b._dead; delete b._cd; delete b._tgt; delete b._heal; b._flash = 0; }
  B = null;
  document.body.classList.remove('in-battle');
  $('#banner').hidden = true;
  rebuildGrid();
  save();
}

/* ---------------- Flow field (shortest path to the HQ) ---------------- */

function liveBuildingAtTile(tx, ty) {
  const b = buildingAtTile(tx, ty);
  return b && !b._dead ? b : null;
}

// Cost of stepping onto a tile: buildings count as slow ground proportional to their hp,
// so the enemy walks around walls when a gap exists and breaks through when it doesn't.
function tileEnterCost(i) {
  const id = grid[i];
  if (!id) return 1;
  const b = byId(id);
  if (!b || b._dead || b.type === 'hq') return 1;
  return 1 + b._hp / 45;
}

function computeFlow() {
  const N = MAP_W * MAP_H;
  const dist = new Float64Array(N).fill(Infinity);
  const heap = [];
  const push = (i, d) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1; let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
    }
    return top;
  };
  const h = hq();
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
    const i = (h.y + dy) * MAP_W + h.x + dx; dist[i] = 0; push(i, 0);
  }
  const enter = tileEnterCost;
  const blocked = (x, y) => { const b = liveBuildingAtTile(x, y); return b && b.type !== 'hq'; };
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const x = i % MAP_W, y = (i / MAP_W) | 0;
    const c = enter(i);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (ox && oy && (blocked(x, ny) || blocked(nx, y))) continue;
      const nd = d + c * (ox && oy ? 1.414 : 1);
      const j = ny * MAP_W + nx;
      if (nd < dist[j]) { dist[j] = nd; push(j, nd); }
    }
  }
  B.flow = dist;
  B.flowDirty = false;
}

/* ---------------- Update ---------------- */

function battleUpdate(dt) {
  if (!B || B.over) return;
  if (B.flowDirty) computeFlow();

  if (B.phase === 'break') {
    B.breakT -= dt;
    if (B.breakT <= 0) startWave(B.wave + 1);
  } else if (B.phase === 'fight') {
    B.spawnT -= dt;
    if (B.queue.length && B.spawnT <= 0) {
      spawnEnemy(B.queue.shift());
      B.spawnT = Math.max(0.35, 0.95 - B.wave * 0.04);
    }
    if (!B.queue.length && !B.units.length) waveCleared();
  }

  for (const k in B.ab) B.ab[k] = Math.max(0, B.ab[k] - dt);
  for (const pl of B.planes) updatePlane(pl, dt);
  B.planes = B.planes.filter(pl => !pl.done);

  for (const u of B.units) updateEnemy(u, dt);
  B.units = B.units.filter(u => u.hp > 0);

  for (const b of S.buildings) if (!b._dead) updateDefense(b, dt);

  for (const p of B.shots) updateShot(p, dt);
  B.shots = B.shots.filter(p => !p.done);
  for (const f of B.fx) f.life -= dt;
  B.fx = B.fx.filter(f => f.life > 0);

  // smoke from damaged buildings
  for (const b of S.buildings) {
    if (b._heal > 0) {
      b._heal -= dt;
      if (Math.random() < dt * 10) { const c = centerOf(b); particles.push({ x: c.x + (Math.random() - 0.5) * 30, y: c.y, vx: 0, vy: -40, g: 0, life: 0.8, max: 0.8, r: 3, color: '#8fe07a' }); }
    }
    if (b._dead || b._hp > b._maxhp * 0.5) continue;
    if (Math.random() < dt * 3) {
      const c = centerOf(b);
      particles.push({ x: c.x + (Math.random() - 0.5) * 20, y: c.y - 14, vx: 6 + Math.random() * 6, vy: -22, g: 0, life: 1.6, max: 1.6, r: 4, grow: 6, color: 'smoke-dark' });
    }
  }
}

function spawnEnemy(type) {
  const gate = B.gates[B.spawnIdx++ % B.gates.length];
  const p = GATES[gate]();
  const e = ENEMIES[type];
  const hp = enemyHp(type, B.wave);
  B.units.push({
    type, x: p.x + (Math.random() - 0.5) * 24, y: p.y + (Math.random() - 0.5) * 24,
    hp, max: hp, cd: Math.random(), angle: 0, aim: 0, walk: Math.random() * 6,
    ox: (Math.random() - 0.5) * 16, oy: (Math.random() - 0.5) * 16,
    tgt: null, retarget: 0, air: !!e.air, moving: true,
  });
}

function waveCleared() {
  const n = B.wave;
  const r = waveReward(n);
  const got = { gold: addLoot('gold', r.gold), steel: addLoot('steel', r.steel) };
  B.waves = n;
  if (n > (S.bestWave || 0)) S.bestWave = n;
  B.phase = 'break';
  B.breakT = 6;
  const m = waveMedals(n);
  S.medals += m; B.medals += m;
  addXP(10 * n);
  banner(`Wave ${n} cleared`, `+${fmt(got.gold)} gold  +${fmt(got.steel)} steel  +${m} medal${m > 1 ? 's' : ''}`);
  Sound.play('medal');
  save();
}

function addLoot(kind, amt) {
  const space = Math.max(0, storageCap() - S[kind]);
  const got = Math.min(space, Math.floor(amt));
  S[kind] += got;
  B.loot[kind] += got;
  if (got > 0) pulseRes(kind);
  return got;
}

// distance (in tiles) from a point to a building's footprint
function distToBuilding(x, y, b) {
  const n = DEFS[b.type].size * TILE;
  const x0 = b.x * TILE, y0 = b.y * TILE;
  const dx = Math.max(x0 - x, 0, x - (x0 + n));
  const dy = Math.max(y0 - y, 0, y - (y0 + n));
  return Math.hypot(dx, dy) / TILE;
}

function nearestBuilding(x, y, range, skipWalls) {
  let best = null, bd = range;
  for (const b of S.buildings) {
    if (b._dead || (skipWalls && b.type === 'wall')) continue;
    const d = distToBuilding(x, y, b);
    if (d <= bd) { bd = d; best = b; }
  }
  return best;
}

function updateEnemy(u, dt) {
  const e = ENEMIES[u.type];
  u.cd -= dt;
  u.retarget -= dt;
  if (u.tgt && u.tgt._dead) u.tgt = null;

  if (u.retarget <= 0) {
    u.retarget = 0.35;
    const near = nearestBuilding(u.x, u.y, e.range, true);
    if (near) u.tgt = near;
    else if (u.tgt && distToBuilding(u.x, u.y, u.tgt) > e.range + 0.3) u.tgt = null;
  }

  let moveTo = null;
  if (!u.tgt) {
    if (u.air) {
      const goal = nearestBuilding(u.x, u.y, 999, true);
      if (goal) {
        if (distToBuilding(u.x, u.y, goal) <= e.range) u.tgt = goal;
        else { const c = centerOf(goal); moveTo = { x: c.x + u.ox, y: c.y + u.oy }; }
      }
    } else {
      const tx = Math.floor(u.x / TILE), ty = Math.floor(u.y / TILE);
      let best = -1, bd = Infinity;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = tx + ox, ny = ty + oy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        if (ox && oy && (liveBuildingAtTile(tx, ny) || liveBuildingAtTile(nx, ty))) continue;
        const j = ny * MAP_W + nx;
        const d = B.flow[j] + tileEnterCost(j) * (ox && oy ? 1.414 : 1);
        if (d < bd) { bd = d; best = ny * MAP_W + nx; }
      }
      if (best >= 0) {
        const nx = best % MAP_W, ny = (best / MAP_W) | 0;
        const blocker = liveBuildingAtTile(nx, ny);
        if (blocker) u.tgt = blocker;
        else moveTo = { x: (nx + 0.5) * TILE + u.ox, y: (ny + 0.5) * TILE + u.oy };
      }
    }
  }

  u.moving = !!moveTo;
  if (moveTo) {
    const dx = moveTo.x - u.x, dy = moveTo.y - u.y, d = Math.hypot(dx, dy) || 1;
    const step = Math.min(d, e.speed * TILE * dt);
    u.x += (dx / d) * step; u.y += (dy / d) * step;
    u.angle = Math.atan2(dy, dx);
    u.aim = u.angle;
    u.walk += dt * e.speed * 9;
  }

  if (u.tgt) {
    const c = centerOf(u.tgt);
    u.aim = Math.atan2(c.y - u.y, c.x - u.x);
    if (!e.vehicle) u.angle = u.aim;
    if (u.cd <= 0) {
      u.cd = 1 / e.rate;
      const hx = c.x + (Math.random() - 0.5) * 16, hy = c.y + (Math.random() - 0.5) * 16;
      if (e.splash) {
        B.shots.push({ kind: 'enemy-shell', x: u.x, y: u.y, sx: u.x, sy: u.y, tx: hx, ty: hy, t: 0, dur: u.type === 'tank' ? 0.35 : 0.6, arc: u.type === 'grenadier' ? 26 : 0, dmg: e.dmg, bTarget: u.tgt });
      } else {
        damageBuilding(u.tgt, e.dmg);
        Sound.play('rifle');
        B.fx.push({ kind: 'tracer', x1: u.x, y1: u.y - (u.air ? 18 : 2), x2: hx, y2: hy, life: 0.07, color: '#ff9a6a' });
      }
      u.flash = 0.06;
    }
  }
  if (u.flash > 0) u.flash -= dt;

  // field medics patch up nearby attackers
  if (e.heal) {
    u.healT = (u.healT || 0) - dt;
    if (u.healT <= 0) {
      u.healT = 1;
      let healed = false;
      for (const o of B.units) {
        if (o === u || o.hp <= 0 || o.hp >= o.max || o.air) continue;
        if (Math.hypot(o.x - u.x, o.y - u.y) <= e.healRange * TILE) { o.hp = Math.min(o.max, o.hp + e.heal); o.healFx = 0.4; healed = true; }
      }
      if (healed) B.fx.push({ kind: 'ring', x: u.x, y: u.y, r: e.healRange * TILE, life: 0.4, max: 0.4, color: '120,220,120' });
    }
  }
  if (u.healFx > 0) u.healFx -= dt;
}

function damageBuilding(b, dmg) {
  if (!b || b._dead) return;
  b._hp -= dmg;
  if (b._hp <= 0) {
    b._hp = 0;
    b._dead = true;
    const c = centerOf(b);
    explosion(c.x, c.y, DEFS[b.type].size * 18);
    Sound.play(b.type === 'wall' ? 'boom' : 'bigboom');
    if (b.type !== 'wall') buzz(60);
    B.flowDirty = true;
    if (b.type === 'hq') { buzz([200, 80, 300]); banner('Command Center destroyed', ''); setTimeout(() => endBattle('defeat'), 1400); B.phase = 'lost'; }
  }
}

function damageEnemy(u, dmg, src) {
  if (u.hp <= 0) return;
  if (src) B.dmgBy[src] = (B.dmgBy[src] || 0) + Math.min(dmg, u.hp);
  u.hp -= dmg;
  u.hit = 0.1;
  if (u.hp <= 0) {
    B.kills++;
    S.stats.kills++;
    const e = ENEMIES[u.type];
    addXP(e.boss ? 40 : 1);
    if (e.boss) {
      S.stats.bosses++; B.bosses++;
      explosion(u.x, u.y, 60); Sound.play('bigboom'); buzz([100, 50, 150]);
      banner('Siege Tank destroyed', `+${e.bounty} gold`);
    } else if (e.vehicle || e.air) Sound.play('boom');
    addLoot('gold', e.bounty);
    if (e.vehicle || e.air) addLoot('steel', Math.round(e.bounty * 0.6));
    if (e.vehicle || e.air) explosion(u.x, u.y, e.r * 1.6);
    else for (let i = 0; i < 5; i++) particles.push({ x: u.x, y: u.y, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 40, g: 160, life: 0.4, max: 0.4, r: 2, color: '#6b2a1c' });
  }
}

function explosion(x, y, size) {
  if (size > 20) Sound.play('boom');
  B.fx.push({ kind: 'boom', x, y, r: size, life: 0.45, max: 0.45 });
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 90;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, g: 90, life: 0.5 + Math.random() * 0.5, max: 1, r: 2 + Math.random() * 3, color: Math.random() < 0.5 ? '#ffb347' : '#5a5348' });
  }
  for (let i = 0; i < 4; i++) particles.push({ x: x + (Math.random() - 0.5) * size, y, vx: (Math.random() - 0.5) * 10, vy: -15, g: 0, life: 1.8, max: 1.8, r: 6, grow: 8, color: 'smoke-dark' });
}

/* ----- Defenses ----- */

function weaponOf(b) {
  if (b.level < 1) return null;
  const d = DEFS[b.type];
  if (d.guard) return { dmg: d.guard.dmg * b.level, fireRate: d.guard.fireRate, range: d.guard.range, targets: d.guard.targets };
  if (!d.dmg) return null;
  return { dmg: statsFor(b.type, b.level).dmg, fireRate: d.fireRate, range: d.range, minRange: d.minRange || 0, splash: d.splash || 0, targets: d.targets };
}

function updateDefense(b, dt) {
  const w = weaponOf(b);
  if (!w) return;
  if (b._flash > 0) b._flash -= dt;
  b._cd -= dt;
  const c = centerOf(b);
  const inRange = u => {
    if (u.hp <= 0) return false;
    if (u.air && w.targets !== 'both') return false;
    const d = Math.hypot(u.x - c.x, u.y - c.y) / TILE;
    return d <= w.range && d >= (w.minRange || 0);
  };
  if (!b._tgt || !inRange(b._tgt)) {
    b._tgt = null;
    let bd = Infinity;
    for (const u of B.units) {
      if (!inRange(u)) continue;
      const d = Math.hypot(u.x - c.x, u.y - c.y);
      if (d < bd) { bd = d; b._tgt = u; }
    }
  }
  const t = b._tgt;
  if (!t) return;
  const want = Math.atan2(t.y - c.y, t.x - c.x);
  if (b.type !== 'hq') {
    let diff = ((want - b.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    b.angle += clamp(diff, -dt * 9, dt * 9);
    b.baseAngle = b.angle;
  }
  if (b._cd > 0) return;
  b._cd = 1 / w.fireRate;
  b._flash = 0.06;
  const mx = c.x + Math.cos(want) * 20, my = c.y - 8 + Math.sin(want) * 20;
  switch (b.type) {
    case 'mg':
    case 'hq':
      Sound.play('mg');
      damageEnemy(t, w.dmg, b.type);
      B.fx.push({ kind: 'tracer', x1: b.type === 'hq' ? c.x : mx, y1: b.type === 'hq' ? c.y - 40 : my, x2: t.x, y2: t.y - (t.air ? 18 : 2), life: 0.06, color: '#ffe08a' });
      break;
    case 'sniper':
      Sound.play('sniper');
      damageEnemy(t, w.dmg, 'sniper');
      B.fx.push({ kind: 'tracer', x1: c.x, y1: c.y - 60, x2: t.x, y2: t.y - (t.air ? 18 : 2), life: 0.18, color: '#e8f7ff', width: 2 });
      break;
    case 'cannon':
      Sound.play('cannon');
      B.shots.push({ kind: 'shell', x: mx, y: my, tx: t.x, ty: t.y, target: t, speed: 14 * TILE, dmg: w.dmg, splash: 0, src: 'cannon' });
      break;
    case 'mortar':
      Sound.play('mortar');
      B.shots.push({ kind: 'mortar', x: c.x, y: c.y, sx: c.x, sy: c.y, tx: t.x, ty: t.y, t: 0, dur: 1.3, arc: 120, dmg: w.dmg, splash: w.splash, air: false, src: 'mortar' });
      break;
    case 'missile':
      Sound.play('rocket');
      for (const off of [-0.35, 0.35]) {
        B.shots.push({ kind: 'rocket', x: mx, y: my, tx: t.x, ty: t.y, target: t, speed: 8 * TILE, dmg: w.dmg, splash: w.splash, air: true, wobble: off, age: 0, src: 'missile' });
      }
      break;
    case 'tesla': {
      // lightning jumps to the nearest enemy not yet hit, losing a little power each jump
      Sound.play('zap');
      const top = b._top || { x: c.x, y: c.y - 50 };
      let from = top, cur = t, power = w.dmg;
      const hit = new Set();
      for (let j = 0; j < (DEFS.tesla.chain || 4) && cur; j++) {
        hit.add(cur);
        const to = { x: cur.x, y: cur.y - (cur.air ? 18 : 4) };
        B.fx.push({ kind: 'bolt', x1: from.x, y1: from.y, x2: to.x, y2: to.y, life: 0.16, seed: Math.random() * 1000 });
        damageEnemy(cur, power, 'tesla');
        from = to; power *= 0.8;
        let next = null, nd = 2.6 * TILE;
        for (const u of B.units) {
          if (u.hp <= 0 || hit.has(u)) continue;
          const d = Math.hypot(u.x - cur.x, u.y - cur.y);
          if (d < nd) { nd = d; next = u; }
        }
        cur = next;
      }
      break;
    }
    case 'howitzer':
      Sound.play('cannon'); buzz(25);
      B.shots.push({ kind: 'mortar', x: c.x, y: c.y, sx: c.x, sy: c.y, tx: t.x, ty: t.y, t: 0, dur: 1.9, arc: 220, dmg: w.dmg, splash: w.splash, air: false, src: 'howitzer', big: true });
      break;
    case 'flame': {
      Sound.play('flame');
      // a cone of fire: everything near the target takes damage
      const nx = c.x + Math.cos(want) * 24, ny = c.y - 2 + Math.sin(want) * 24;
      splashDamage(t.x, t.y, w.splash, w.dmg, false, 'flame');
      for (let i = 0; i < 6; i++) {
        const k = Math.random();
        particles.push({ x: nx, y: ny, vx: (t.x - nx) * (2.2 + k) + (Math.random() - 0.5) * 40, vy: (t.y - ny) * (2.2 + k) + (Math.random() - 0.5) * 40, g: -20, life: 0.35, max: 0.35, r: 4 + Math.random() * 3, grow: 14, color: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a' });
      }
      break;
    }
  }
}

function updateShot(p, dt) {
  if (p.dur) {
    // time-based arcing / lobbed shot
    p.t += dt;
    const k = Math.min(1, p.t / p.dur);
    p.x = p.sx + (p.tx - p.sx) * k;
    p.y = p.sy + (p.ty - p.sy) * k;
    p.h = Math.sin(k * Math.PI) * (p.arc || 0);
    if (k >= 1) {
      p.done = true;
      if (p.kind === 'enemy-shell') {
        damageBuilding(p.bTarget, p.dmg);
        B.fx.push({ kind: 'boom', x: p.tx, y: p.ty, r: 14, life: 0.3, max: 0.3 });
      } else {
        if (p.kind === 'bomb' || p.big) { Sound.play('bigboom'); buzz(40); }
        splashDamage(p.tx, p.ty, p.splash, p.dmg, p.air, p.src);
        explosion(p.tx, p.ty, p.splash * TILE * 0.9);
      }
    }
    return;
  }
  // homing projectile
  if (p.target && p.target.hp > 0) { p.tx = p.target.x; p.ty = p.target.y - (p.target.air ? 18 : 0); }
  p.age = (p.age || 0) + dt;
  const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
  const step = p.speed * dt;
  if (d <= step + 2) {
    p.done = true;
    if (p.splash) { splashDamage(p.tx, p.ty, p.splash, p.dmg, p.air, p.src); explosion(p.tx, p.ty, 16); }
    else if (p.target && p.target.hp > 0) { damageEnemy(p.target, p.dmg, p.src); B.fx.push({ kind: 'boom', x: p.tx, y: p.ty, r: 10, life: 0.25, max: 0.25 }); }
    return;
  }
  let a = Math.atan2(dy, dx);
  if (p.wobble) a += p.wobble * Math.max(0, 1 - p.age * 3);
  p.x += Math.cos(a) * step; p.y += Math.sin(a) * step;
  p.a = a;
  if (p.kind === 'rocket' && Math.random() < 0.7) particles.push({ x: p.x, y: p.y, vx: 0, vy: -4, g: 0, life: 0.5, max: 0.5, r: 2.5, grow: 4, color: 'smoke' });
}

function splashDamage(x, y, radiusTiles, dmg, hitsAir, src) {
  const r = radiusTiles * TILE;
  for (const u of B.units) {
    if (u.hp <= 0 || (u.air && !hitsAir)) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d <= r) damageEnemy(u, dmg * (d < r * 0.4 ? 1 : 0.6), src);
  }
}

/* ---------------- Abilities ---------------- */

function abilityReady(k) { return B && !B.over && B.phase !== 'lost' && B.ab[k] <= 0; }

function armAirstrike() {
  if (!B) return;
  if (!abilityReady('airstrike')) { Sound.play('error'); return; }
  B.targeting = !B.targeting;
  document.body.classList.toggle('targeting', B.targeting);
  Sound.play('click');
  if (B.targeting) banner('Airstrike ready', 'Tap the map to mark the target');
}

// Taps on the map during battle: only used to aim the airstrike.
function battleTap(w) {
  if (!B || !B.targeting) return;
  B.targeting = false;
  document.body.classList.remove('targeting');
  $('#banner').hidden = true;
  B.ab.airstrike = ABILITIES.airstrike.cooldown;
  S.stats.airstrikes++;
  const a = -0.22;
  B.planes.push({ tx: w.x, ty: w.y, a, t: 0, speed: 720, x: -9999, y: -9999, drops: [-90, -45, 0, 45, 90].map(o => ({ o, dropped: false })) });
  B.fx.push({ kind: 'ring', x: w.x, y: w.y, r: 1.8 * TILE, life: 1.6, max: 1.6, color: '242,182,50' });
  Sound.play('plane');
}

function updatePlane(pl, dt) {
  pl.t += dt;
  const along = pl.t * pl.speed - 1000;
  const px = pl.x, py = pl.y;
  pl.x = pl.tx + Math.cos(pl.a) * along;
  pl.y = pl.ty + Math.sin(pl.a) * along;
  for (const d of pl.drops) {
    if (d.dropped || along < d.o - 70) continue;
    d.dropped = true;
    B.shots.push({
      kind: 'bomb', sx: pl.x, sy: pl.y, x: pl.x, y: pl.y,
      tx: pl.tx + Math.cos(pl.a) * d.o, ty: pl.ty + Math.sin(pl.a) * d.o,
      t: 0, dur: 0.45, arc: 0, dmg: airstrikeDamage(B.wave), splash: 1.4, air: true, src: 'airstrike',
    });
  }
  if (along > 1100) pl.done = true;
  void px; void py;
}

function useRepair() {
  if (!B) return;
  if (!abilityReady('repair')) { Sound.play('error'); return; }
  B.ab.repair = ABILITIES.repair.cooldown;
  let n = 0;
  for (const b of S.buildings) {
    if (b._dead || b._hp >= b._maxhp) continue;
    b._hp = Math.min(b._maxhp, b._hp + b._maxhp * ABILITIES.repair.heal);
    b._heal = 1.2; n++;
  }
  Sound.play('heal');
  toast(n ? `Field repair: ${n} building${n > 1 ? 's' : ''} patched up` : 'Field repair used. Nothing was damaged', 'good');
}

/* ---------------- Drawing ---------------- */

function drawBattleGround(ctx) {
  if (!B) return;
  for (const u of B.units) if (!u.air) drawEnemy(ctx, u);
}

function drawBattleAir(ctx) {
  if (!B) return;
  for (const u of B.units) if (u.air) drawEnemy(ctx, u);
  for (const p of B.shots) drawShot(ctx, p);
  for (const f of B.fx) {
    if (f.kind === 'tracer') {
      ctx.strokeStyle = f.color; ctx.lineWidth = f.width || 1.5; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'bolt') {
      const rnd = mulberry(Math.floor(f.seed + f.life * 60));
      const n = 6;
      ctx.lineCap = 'round';
      for (const [wid, col] of [[5, 'rgba(120,200,255,0.35)'], [2, '#eaf8ff']]) {
        ctx.strokeStyle = col; ctx.lineWidth = wid;
        ctx.beginPath(); ctx.moveTo(f.x1, f.y1);
        for (let i = 1; i < n; i++) {
          const k = i / n;
          ctx.lineTo(f.x1 + (f.x2 - f.x1) * k + (rnd() - 0.5) * 14, f.y1 + (f.y2 - f.y1) * k + (rnd() - 0.5) * 14);
        }
        ctx.lineTo(f.x2, f.y2); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    } else if (f.kind === 'ring') {
      const k = 1 - f.life / f.max;
      ctx.strokeStyle = `rgba(${f.color},${(1 - k) * 0.9})`; ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.6 + k * 0.4), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    } else if (f.kind === 'boom') {
      const k = 1 - f.life / f.max;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ffcf5a'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + k), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff7a2f'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.3 + k * 0.6), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  for (const pl of B.planes) drawJet(ctx, pl.x, pl.y, pl.a);
  // building health bars
  for (const b of S.buildings) {
    if (b._dead || b._hp >= b._maxhp || b.type === 'wall' && b._hp > b._maxhp * 0.98) continue;
    const n = DEFS[b.type].size * TILE;
    const w = Math.max(26, n * 0.7);
    const x = b.x * TILE + n / 2 - w / 2, y = b.y * TILE - (b.type === 'wall' ? 6 : 18);
    const k = b._hp / b._maxhp;
    ctx.fillStyle = 'rgba(16,18,12,0.85)'; ctx.fillRect(x - 1, y - 1, w + 2, 6);
    ctx.fillStyle = k > 0.5 ? '#7fbf4d' : k > 0.25 ? '#f2b632' : '#c8402a';
    ctx.fillRect(x, y, w * k, 4);
  }
}

const ENEMY_COL = { body: '#7a3424', dark: '#4a1d14', helmet: '#3a1610', hull: '#6b4a3a', hullDark: '#43302a' };

function drawEnemy(ctx, u) {
  const e = ENEMIES[u.type];
  const bob = u.moving ? Math.sin(u.walk) * 1.2 : 0;
  ctx.save();
  ctx.translate(u.x, u.y);
  if (u.air) {
    // shadow on the ground, drone floats above it
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(6, 8, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(0, -18 + Math.sin(u.walk * 0.6) * 2);
    ctx.rotate(u.angle);
    ctx.strokeStyle = '#2b2522'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke();
    for (const [rx, ry] of [[-8, -8], [8, 8], [8, -8], [-8, 8]]) {
      ctx.fillStyle = 'rgba(220,220,210,0.35)'; ctx.beginPath(); ctx.ellipse(rx, ry, 6, 6 * Math.abs(Math.sin(tSec * 40 + rx)), 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = u.hit > 0 ? '#fff' : ENEMY_COL.body; rr(ctx, -6, -5, 12, 10, 3); ctx.fill();
    ctx.fillStyle = '#ff4a2a'; ctx.beginPath(); ctx.arc(5, 0, 1.6, 0, Math.PI * 2); ctx.fill();
  } else if (e.vehicle) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(3, 4, e.r + 3, e.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.rotate(u.angle);
    const big = u.type === 'siege';
    const L = big ? 52 : u.type === 'tank' ? 34 : 24, W = big ? 34 : u.type === 'tank' ? 22 : 14;
    if (u.type === 'tank' || big) {
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(-L / 2, -W / 2 - 2, L, 6); ctx.fillRect(-L / 2, W / 2 - 4, L, 6);
      ctx.fillStyle = '#4a403a';
      for (let i = 0; i < L / 6; i++) { const o = ((u.walk * 2 + i * 6) % L) - L / 2; ctx.fillRect(o, -W / 2 - 2, 2, 6); ctx.fillRect(o, W / 2 - 4, 2, 6); }
    } else {
      ctx.fillStyle = '#1e1a18';
      for (const [wx, wy] of [[-8, -8], [6, -8], [-8, 8], [6, 8]]) { ctx.fillRect(wx - 3, wy - 2, 6, 4); }
    }
    ctx.fillStyle = u.hit > 0 ? '#ffffff' : big ? '#4e3a30' : ENEMY_COL.hull; rr(ctx, -L / 2 + 2, -W / 2 + 2, L - 4, W - 4, 3); ctx.fill();
    ctx.fillStyle = ENEMY_COL.hullDark; ctx.fillRect(L / 2 - 8, -W / 2 + 3, 4, W - 6);
    if (big) { ctx.fillStyle = '#c8402a'; ctx.fillRect(-L / 2 + 6, -W / 2 + 4, 6, W - 8); }
    ctx.restore();
    // turret
    ctx.rotate(u.aim);
    if (big) {
      ctx.fillStyle = '#211b18'; ctx.fillRect(6, -7, 30, 5); ctx.fillRect(6, 2, 30, 5);
      ctx.fillStyle = '#3a2c25'; rr(ctx, -13, -12, 26, 24, 6); ctx.fill();
      ctx.fillStyle = '#c8402a'; ctx.beginPath(); ctx.arc(-4, 0, 3, 0, Math.PI * 2); ctx.fill();
      if (u.flash > 0) { ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(39, -4.5, 6, 0, Math.PI * 2); ctx.arc(39, 4.5, 6, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      drawEnemyBar(ctx, u, e);
      return;
    }
    ctx.fillStyle = '#2a2420'; ctx.fillRect(4, -2, u.type === 'tank' ? 22 : 12, u.type === 'tank' ? 4 : 2.5);
    ctx.fillStyle = ENEMY_COL.hullDark; ctx.beginPath(); ctx.arc(0, 0, u.type === 'tank' ? 8 : 5, 0, Math.PI * 2); ctx.fill();
    if (u.flash > 0) { ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(u.type === 'tank' ? 28 : 18, 0, 4, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(2, 3, e.r, e.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(0, bob);
    ctx.rotate(u.aim);
    ctx.fillStyle = '#1e1a18'; ctx.fillRect(2, 1, u.type === 'grenadier' ? 9 : 11, 2);
    ctx.fillStyle = u.hit > 0 ? '#ffffff' : u.type === 'medic' ? '#e9e4d4' : ENEMY_COL.body;
    ctx.beginPath(); ctx.ellipse(0, 0, e.r * 0.7, e.r, 0, 0, Math.PI * 2); ctx.fill();
    if (u.type === 'medic') { ctx.fillStyle = '#c8402a'; ctx.fillRect(-1, -4, 2, 8); ctx.fillRect(-4, -1, 8, 2); }
    if (u.type === 'grenadier') { ctx.fillStyle = ENEMY_COL.dark; ctx.fillRect(-e.r * 0.9, -4, 4, 8); }
    ctx.fillStyle = ENEMY_COL.helmet; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.55, 0, Math.PI * 2); ctx.fill();
    if (u.flash > 0) { ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(13, 2, 2.5, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
  drawEnemyBar(ctx, u, e);
}

function drawEnemyBar(ctx, u, e) {
  if (u.hit > 0) u.hit -= 1 / 60;
  if (u.healFx > 0) {
    ctx.strokeStyle = `rgba(140,230,120,${u.healFx * 2})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(u.x, u.y, e.r + 4, 0, Math.PI * 2); ctx.stroke();
  }
  if (u.hp < u.max || e.boss) {
    const w = e.boss ? 60 : e.vehicle ? 26 : e.air ? 20 : 14, y = u.y - (u.air ? 34 : e.r + 10);
    const h = e.boss ? 5 : 2;
    ctx.fillStyle = 'rgba(16,18,12,0.8)'; ctx.fillRect(u.x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#e0503a'; ctx.fillRect(u.x - w / 2, y, w * Math.max(0, u.hp / u.max), h);
    if (e.boss) {
      ctx.font = '10px "Black Ops One", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#f2b632'; ctx.fillText('SIEGE TANK', u.x, y - 2);
    }
  }
}

function drawShot(ctx, p) {
  if (p.kind === 'bomb') {
    const k = Math.min(1, p.t / p.dur);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(p.tx, p.ty, 3 + k * 5, 2 + k * 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2e25'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
  } else if (p.kind === 'mortar' || p.kind === 'enemy-shell') {
    const h = p.h || 0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.kind === 'mortar' ? '#2b2e25' : '#3a1610';
    ctx.beginPath(); ctx.arc(p.x, p.y - h, p.kind === 'mortar' ? (p.big ? 6 : 4) + h / 60 : 3, 0, Math.PI * 2); ctx.fill();
  } else if (p.kind === 'rocket') {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a || 0);
    ctx.fillStyle = '#d9d6c6'; ctx.fillRect(-5, -1.5, 10, 3);
    ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.arc(-6, 0, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = '#1b1d17'; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
}

/* ---------------- Battle HUD ---------------- */

let bannerTimer = 0;
function banner(title, sub) {
  const el = $('#banner');
  el.innerHTML = `<div class="bn-title">${title}</div>${sub ? `<div class="bn-sub">${sub}</div>` : ''}`;
  el.hidden = false;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function updateBattleHUD() {
  if (!B) return;
  setText($('#bh-wave'), 'bw', String(Math.max(1, B.wave)));
  const left = B.queue.length + B.units.length;
  const status = B.phase === 'break'
    ? (B.wave === 0 ? `Enemy arrives in ${Math.ceil(B.breakT)}` : `Next wave in ${Math.ceil(B.breakT)}`)
    : `${left} hostile${left === 1 ? '' : 's'} left`;
  setText($('#bh-status'), 'bs', status);
  const h = hq();
  const k = h && h._maxhp ? Math.max(0, h._hp / h._maxhp) : 1;
  const pct = (k * 100).toFixed(1);
  if (hudCache.bhq !== pct) {
    hudCache.bhq = pct;
    const f = $('#bh-hq');
    f.style.width = pct + '%';
    f.style.background = k > 0.5 ? '#7fbf4d' : k > 0.25 ? '#f2b632' : '#c8402a';
  }
  setText($('#bh-kills'), 'bk', String(B.kills));
  for (const k of ['airstrike', 'repair']) {
    const el = $(`#ab-${k}`);
    const cd = B.ab[k], max = ABILITIES[k].cooldown;
    const label = cd > 0 ? String(Math.ceil(cd)) : '';
    setText(el.querySelector('.ab-cd'), 'ab' + k, label);
    el.classList.toggle('cooling', cd > 0);
    el.style.setProperty('--p', cd > 0 ? (cd / max * 100).toFixed(1) + '%' : '0%');
    el.classList.toggle('armed', k === 'airstrike' && B.targeting);
  }
}

let retreatArmed = 0;
function setSpeedLabel() { $('#btn-speed span').textContent = `Speed x${B ? B.speed : 1}`; }

function initBattleUI() {
  $('#ab-airstrike').addEventListener('click', armAirstrike);
  $('#ab-repair').addEventListener('click', useRepair);
  $('#btn-speed').addEventListener('click', () => {
    if (!B) return;
    B.speed = B.speed === 1 ? 2 : B.speed === 2 ? 3 : 1;
    setSpeedLabel();
  });

  $('#btn-retreat').addEventListener('click', () => {
    if (!B || B.over) return;
    const btn = $('#btn-retreat span');
    if (Date.now() - retreatArmed < 2500) { retreatArmed = 0; btn.textContent = 'Retreat'; endBattle('retreat'); return; }
    retreatArmed = Date.now();
    btn.textContent = 'Sure?';
    setTimeout(() => { if (retreatArmed && Date.now() - retreatArmed >= 2400) { retreatArmed = 0; btn.textContent = 'Retreat'; } }, 2500);
  });
}
