// WarBreach — your own army: train troops at the Barracks, deploy them in battle, give rally orders.
'use strict';

/* ---------------- Army state ---------------- */
function army() {
  if (!S.army) S.army = { troops: {}, queue: [] };
  return S.army;
}
function barracksLevel() { return S.buildings.filter(b => b.type === 'barracks').reduce((m, b) => Math.max(m, b.level), 0); }
function armyCapacity() { return S.buildings.filter(b => b.type === 'barracks' && b.level >= 1).reduce((a, b) => a + barracksCapacity(b.level), 0); }
function armySpace() {
  const A = army();
  let n = 0;
  for (const t in A.troops) n += (A.troops[t] || 0) * TROOPS[t].space;
  for (const q of A.queue) n += TROOPS[q.type].space;
  return n;
}
function troopCount(t) { return army().troops[t] || 0; }
function armoryLevel(t) { return (S.armory && S.armory[t]) || 1; }
function troopStats(t) {
  const d = TROOPS[t], k = troopScale(Math.max(1, barracksLevel())) * (1 + researchBonus('training')) * armoryBonus(armoryLevel(t)) * (B && B.bonus ? 1 + B.bonus.troops : 1);
  return { hp: Math.round(d.hp * k), dmg: d.dmg * k, heal: (d.heal || 0) * k };
}

function trainStatus(t) {
  const d = TROOPS[t];
  if (barracksLevel() < 1) return { ok: false, reason: 'Build a Barracks first' };
  if (barracksLevel() < d.unlock) return { ok: false, locked: true, reason: `Barracks level ${d.unlock}` };
  if (armySpace() + d.space > armyCapacity()) return { ok: false, reason: 'Army is full' };
  if (!canAfford(costOf(d))) return { ok: false, reason: 'Not enough resources' };
  return { ok: true };
}
function costOf(d) { return { gold: d.cost.gold || 0, steel: d.cost.steel || 0, oil: d.cost.oil || 0 }; }

/* ----- Armory: upgrade a troop type ----- */
function armoryStatus(t) {
  const L = armoryLevel(t), to = L + 1;
  if (L >= ARMORY_MAX) return { ok: false, max: true, reason: 'Max level' };
  if (to > barracksLevel()) return { ok: false, reason: `Barracks level ${to}`, cost: armoryCost(t, to) };
  if (barracksLevel() < TROOPS[t].unlock) return { ok: false, reason: 'Locked', cost: armoryCost(t, to) };
  const cost = armoryCost(t, to);
  if (!canAfford(cost)) return { ok: false, reason: 'Not enough resources', cost };
  return { ok: true, cost, to };
}
function upgradeArmory(t) {
  const st = armoryStatus(t);
  if (!st.ok) { toast(st.reason, 'bad'); Sound.play('error'); return; }
  pay(st.cost);
  S.armory[t] = st.to;
  Sound.play('done'); toast(`${TROOPS[t].name} upgraded to level ${st.to}`, 'good');
  orderEvent('upgrade', 1);
  save(); openBarracks();
}

function trainTroop(t) {
  const st = trainStatus(t);
  if (!st.ok) { toast(st.reason, 'bad'); Sound.play('error'); return false; }
  const A = army(), d = TROOPS[t];
  pay(costOf(d));
  const now = Date.now();
  const last = A.queue.length ? A.queue[A.queue.length - 1].end : now;
  const speed = boostActive('train') ? 4 : 1;
  const start = Math.max(now, last);
  A.queue.push({ type: t, start, end: start + d.time * 1000 / speed });
  Sound.play('click');
  save();
  return true;
}

function cancelTraining(i) {
  const A = army(), q = A.queue[i];
  if (!q) return;
  refund(costOf(TROOPS[q.type]), 1);
  const dur = q.end - Math.max(Date.now(), q.start);
  A.queue.splice(i, 1);
  // later items move up the queue
  for (let j = i; j < A.queue.length; j++) { A.queue[j].start -= dur; A.queue[j].end -= dur; }
  save();
}

function processTraining(now) {
  const A = army();
  let done = 0;
  while (A.queue.length && now >= A.queue[0].end) {
    const q = A.queue.shift();
    A.troops[q.type] = (A.troops[q.type] || 0) + 1;
    S.stats.trained = (S.stats.trained || 0) + 1;
    orderEvent('train', 1);
    done++;
  }
  if (done && !B) { Sound.play('done'); if (!modal.hidden && $('#barracks-ui')) openBarracks(); }
}

function finishTrainingNow() {
  const A = army();
  if (!A.queue.length) return;
  const cost = Math.max(1, Math.ceil((A.queue[A.queue.length - 1].end - Date.now()) / 120000));
  if (S.medals < cost) { toast(`You need ${cost} medals`, 'bad'); Sound.play('error'); return; }
  S.medals -= cost;
  const now = Date.now();
  for (const q of A.queue) { q.end = now; q.start = now; }
  processTraining(now);
  toast('Training complete', 'good'); save(); openBarracks();
}

/* ---------------- Barracks screen ---------------- */
function renderTroopPreview(t, px) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = px * dpr; c.height = px * dpr;
  c.style.width = px + 'px'; c.style.height = px + 'px';
  const g = c.getContext('2d');
  const span = TROOPS[t].vehicle ? 46 : TROOPS[t].flying ? 64 : 24;
  g.scale(dpr * px / span, dpr * px / span);
  drawTroopFigure(g, { kind: t, x: span / 2, y: span / 2 + (TROOPS[t].flying ? 14 : 0), aim: -0.5, angle: -0.5, walk: 1, moving: false, flash: 0, hit: 0 });
  return c;
}

function openBarracks() {
  const A = army(), cap = armyCapacity(), used = armySpace();
  const cards = Object.keys(TROOPS).map(t => {
    const d = TROOPS[t], st = trainStatus(t), s2 = troopStats(t);
    return `
      <div class="trp ${st.locked ? 'locked' : ''}">
        <div class="trp-art" data-troop="${t}"></div>
        <div class="trp-name">${d.name}</div>
        <div class="trp-desc">${d.desc}</div>
        <div class="trp-stats"><span>HP ${s2.hp}</span><span>${d.heal ? `Heal ${Math.round(s2.heal)}/s` : `DPS ${Math.round(s2.dmg * d.rate)}`}</span><span>Size ${d.space}</span></div>
        <div class="trp-have">Ready: <b>${troopCount(t)}</b> · Armory L${armoryLevel(t)}</div>
        ${!st.locked ? (() => { const a = armoryStatus(t); return a.max ? '<span class="road-tag">Armory maxed</span>' : `<button class="btn ghost arm-btn ${a.ok ? '' : 'off'}" data-armory="${t}"><span class="btn-sub">Armory L${armoryLevel(t) + 1}: ${a.ok || a.reason === 'Not enough resources' ? costHTML(a.cost) : a.reason}</span></button>`; })() : ''}
        <button class="btn ${st.ok ? '' : 'off'}" data-train="${t}">
          <span class="btn-main">${st.locked ? 'Locked' : 'Train'}</span>
          <span class="btn-sub">${st.locked ? st.reason : costHTML(costOf(d)) + `<span class="cost">${ICON.clock}${fmtTime(d.time / (boostActive('train') ? 4 : 1))}</span>`}</span>
        </button>
      </div>`;
  }).join('');
  const q = A.queue.slice(0, 14).map((it, i) => {
    const left = Math.max(0, (it.end - Date.now()) / 1000);
    return `<button class="q-item" data-cancel="${i}" title="Cancel"><span class="q-art" data-troop="${it.type}"></span><span class="q-t">${i === 0 ? fmtTime(left) : ''}</span></button>`;
  }).join('');
  const fin = A.queue.length ? Math.max(1, Math.ceil((A.queue[A.queue.length - 1].end - Date.now()) / 120000)) : 0;
  openModal(`
    <div class="settings" id="barracks-ui">
      <div class="m-head"><h2>Barracks</h2><span class="m-count">Army ${used} / ${cap}${boostActive('train') ? ' · Boot Camp active' : ''}</span></div>
      <div class="cap-bar"><div style="width:${cap ? Math.min(100, used / cap * 100) : 0}%"></div></div>
      <p class="lead">Trained troops wait here until you deploy them in battle. Tap a troop card in battle, then tap the map to send them in. Survivors come home afterwards.</p>
      <div class="trp-row">${cards}</div>
      ${A.queue.length ? `<div class="q-row"><span class="q-label">Training queue (tap to cancel)</span>${q}${A.queue.length > 14 ? `<span class="q-more">+${A.queue.length - 14}</span>` : ''}
        <button class="btn medal-btn" id="btn-train-finish"><span class="btn-main">Finish all</span><span class="btn-sub">${ICON.medal}${fin}</span></button></div>` : ''}
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`);
  const body = $('#modal-body');
  body.querySelectorAll('[data-troop]').forEach(el => el.appendChild(renderTroopPreview(el.dataset.troop, el.classList.contains('q-art') ? 26 : 48)));
  body.querySelectorAll('[data-train]').forEach(b => b.addEventListener('click', () => { if (trainTroop(b.dataset.train)) openBarracks(); }));
  body.querySelectorAll('[data-armory]').forEach(b => b.addEventListener('click', () => upgradeArmory(b.dataset.armory)));
  body.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => { cancelTraining(+b.dataset.cancel); openBarracks(); }));
  const f = $('#btn-train-finish');
  if (f) f.addEventListener('click', finishTrainingNow);
}

/* ---------------- Battle: troops on the field ---------------- */
function spawnTroop(t, x, y, home, dropIn) {
  const s2 = troopStats(t);
  const tr = { kind: t, x, y, hp: s2.hp, max: s2.hp, dmg: s2.dmg, heal: s2.heal, post: { x, y }, cd: Math.random() * 0.5, tgt: null,
    angle: -Math.PI / 2, aim: -Math.PI / 2, walk: 0, moving: false, flash: 0, hit: 0, home, drop: dropIn || 0 };
  B.troops.push(tr);
  return tr;
}

function deployAt(t, w) {
  const x = clamp(w.x, TILE, (MAP_W - 1) * TILE), y = clamp(w.y, TILE, (MAP_H - 1) * TILE);
  if (troopCount(t) <= 0) { toast(`No ${TROOPS[t].name} left. Train more at the Barracks`, 'bad'); clearDeployPick(); return; }
  army().troops[t]--;
  B.deployed[t] = (B.deployed[t] || 0) + 1;
  orderEvent('deploy', 1);
  spawnTroop(t, x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10, true, 0.6);
  B.fx.push({ kind: 'ring', x, y, r: 18, life: 0.5, max: 0.5, color: '127,191,77' });
  Sound.play('build');
  if (troopCount(t) <= 0) clearDeployPick();
}

function nearestAlly(x, y, reach) {
  let best = null, bd = reach;
  const H = B.hero;
  if (H && !H.dead) { const d = Math.hypot(H.x - x, H.y - y); if (d < bd) { bd = d; best = H; } }
  for (const t of B.troops) {
    if (t.hp <= 0 || t.drop > 0 || TROOPS[t.kind].flying) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

function damageAlly(a, dmg) {
  if (a === B.hero) { damageHero(dmg); return; }
  if (TROOPS[a.kind].vehicle) dmg *= 0.7;
  a.hp -= dmg; a.hit = 0.1;
  if (a.hp <= 0) {
    a.hp = 0;
    if (TROOPS[a.kind].vehicle) explosion(a.x, a.y, 22);
    else for (let i = 0; i < 5; i++) particles.push({ x: a.x, y: a.y, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 40, g: 160, life: 0.4, max: 0.4, r: 2, color: '#3f4a27' });
    B.lost = (B.lost || 0) + 1;
  }
}

function updateTroops(dt) {
  const stance = STANCES.find(x => x.id === S.stance) || STANCES[0];
  const leash = stance.leash * TILE;
  const H = B.hero;
  updateGuardPosts();
  for (const t of B.troops) {
    if (t.hp <= 0) continue;
    if (t.drop > 0) { t.drop -= dt; continue; }
    const d = TROOPS[t.kind];
    // guard stance: posts follow the hero
    if (stance.id === 'guard' && H && !H.dead && !t.rallied) {
      const i = B.troops.indexOf(t), a = i * 1.7;
      t.post = { x: H.x + Math.cos(a) * 28, y: H.y + Math.sin(a) * 22 };
    }
    // engineers patch up buildings within reach
    if (d.repair) {
      for (const b of S.buildings) {
        if (b._dead || isPassive(b.type) || b._hp >= b._maxhp) continue;
        if (distToBuilding(t.x, t.y, b) <= 2) {
          b._hp = Math.min(b._maxhp, b._hp + d.repair * dt * armoryBonus(armoryLevel('engineer')));
          if (Math.random() < dt * 3) { const c = centerOf(b); particles.push({ x: c.x + (Math.random() - 0.5) * 16, y: c.y, vx: 0, vy: -26, g: 0, life: 0.5, max: 0.5, r: 2, color: '#ffd36b' }); }
        }
      }
    }
    if (t.flash > 0) t.flash -= dt;
    if (t.hit > 0) t.hit -= dt;
    t.cd -= dt;
    // medics heal whoever is hurt nearby instead of shooting
    if (d.heal) {
      if (t.cd <= 0) {
        t.cd = 1;
        const allies = [...B.troops.filter(o => o !== t && o.hp > 0 && o.hp < o.max)];
        if (B.hero && !B.hero.dead && B.hero.hp < B.hero.max) allies.push(B.hero);
        for (const o of allies) {
          if (Math.hypot(o.x - t.x, o.y - t.y) <= d.range * TILE) { o.hp = Math.min(o.max, o.hp + t.heal); o.healFx = 0.4; }
        }
      }
      moveTroopToward(t, t.post, dt, d);
      continue;
    }
    const canAir = !!d.air;
    const aggro = stance.id === 'aggressive' ? 8 : 2.5;
    if (!t.tgt || t.tgt.hp <= 0 || Math.hypot(t.tgt.x - t.x, t.tgt.y - t.y) > (d.range + aggro) * TILE || (t.tgt.air && !canAir)) {
      t.tgt = null;
      let bd = (d.range + aggro) * TILE;
      for (const u of B.units) {
        if (u.hp <= 0 || (u.air && !canAir) || (ENEMIES[u.type].stealth && !revealed(u))) continue;
        if (d.minRange && Math.hypot(u.x - t.x, u.y - t.y) < d.minRange * TILE) continue;
        const dd = Math.hypot(u.x - t.x, u.y - t.y);
        if (dd < bd) { bd = dd; t.tgt = u; }
      }
    }
    const tg = t.tgt;
    if (tg) {
      const dist = Math.hypot(tg.x - t.x, tg.y - t.y);
      t.aim = Math.atan2(tg.y - t.y, tg.x - t.x);
      if (dist > d.range * TILE) {
        // chase, but don't wander too far from the post
        const nx = tg.x, ny = tg.y;
        if (Math.hypot(nx - t.post.x, ny - t.post.y) < leash + d.range * TILE) moveTroopToward(t, { x: nx, y: ny }, dt, d);
        else moveTroopToward(t, t.post, dt, d);
      } else {
        t.moving = false;
        if (!d.vehicle) t.angle = t.aim;
        if (t.cd <= 0) {
          t.cd = 1 / d.rate;
          t.flash = 0.06;
          let dmg = t.dmg;
          if (d.antiArmor && ENEMIES[tg.type].vehicle) dmg *= d.antiArmor;
          if (t.kind === 'flame') {
            splashDamage(tg.x, tg.y, d.splash, dmg, false, 'troops');
            for (let i = 0; i < 4; i++) particles.push({ x: t.x + Math.cos(t.aim) * 8, y: t.y + Math.sin(t.aim) * 8, vx: (tg.x - t.x) * (2.2 + Math.random()) + (Math.random() - 0.5) * 30, vy: (tg.y - t.y) * (2.2 + Math.random()) + (Math.random() - 0.5) * 30, g: -20, life: 0.3, max: 0.3, r: 3, grow: 12, color: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a', glow: true });
            Sound.play('flame');
          } else if (t.kind === 'mortarteam') {
            B.shots.push({ kind: 'mortar', x: t.x, y: t.y, sx: t.x, sy: t.y, tx: tg.x, ty: tg.y, t: 0, dur: 1.2, arc: 100, dmg, splash: d.splash, air: false, src: 'troops' });
            Sound.play('mortar');
          } else if (t.kind === 'heli') {
            for (const off of [-0.3, 0.3]) B.shots.push({ kind: 'rocket', x: t.x, y: t.y - 24, tx: tg.x, ty: tg.y, target: tg, speed: 10 * TILE, dmg: dmg / 2, splash: 0.5, air: true, wobble: off, age: 0, src: 'troops' });
            Sound.play('rocket');
          } else if (t.kind === 'rocket') {
            B.shots.push({ kind: 'rocket', x: t.x, y: t.y, tx: tg.x, ty: tg.y, target: tg, speed: 9 * TILE, dmg, splash: 0, air: true, wobble: 0, age: 0, src: 'troops' });
            Sound.play('rocket');
          } else if (t.kind === 'tank') {
            B.shots.push({ kind: 'mortar', x: t.x, y: t.y, sx: t.x, sy: t.y, tx: tg.x, ty: tg.y, t: 0, dur: 0.3, arc: 0, dmg, splash: d.splash, air: false, src: 'troops' });
            Sound.play('cannon');
            B.fx.push({ kind: 'light', x: t.x + Math.cos(t.aim) * 20, y: t.y + Math.sin(t.aim) * 20, r: 26, life: 0.08, max: 0.08 });
          } else {
            damageEnemy(tg, dmg, 'troops');
            B.fx.push({ kind: 'tracer', x1: t.x, y1: t.y - 2, x2: tg.x, y2: tg.y - (tg.air ? 18 : 2), life: t.kind === 'sniper' ? 0.15 : 0.06, color: '#c9ff9a', width: t.kind === 'sniper' ? 2 : 1.5 });
            Sound.play(t.kind === 'sniper' ? 'sniper' : t.kind === 'gunner' ? 'mg' : 'rifle');
          }
        }
      }
    } else {
      moveTroopToward(t, t.post, dt, d);
    }
  }
  B.troops = B.troops.filter(t => t.hp > 0);
}

function moveTroopToward(t, p, dt, d) {
  const dx = p.x - t.x, dy = p.y - t.y, dist = Math.hypot(dx, dy);
  if (dist < 4) { t.moving = false; return; }
  const step = Math.min(dist, d.speed * TILE * dt);
  t.x += dx / dist * step; t.y += dy / dist * step;
  t.angle = Math.atan2(dy, dx);
  if (!t.tgt) t.aim = t.angle;
  t.walk += dt * d.speed * 9;
  t.moving = true;
}

// Rally: every troop on the field moves its post to the tapped spot.
function rallyTo(w) {
  const live = B.troops.filter(t => t.hp > 0);
  live.forEach((t, i) => {
    t.rallied = true;
    const a = i * 2.4, r = 10 + Math.sqrt(i) * 10;
    t.post = { x: w.x + Math.cos(a) * r, y: w.y + Math.sin(a) * r };
    t.tgt = null;
  });
  B.rally = { x: w.x, y: w.y, life: 3 };
  Sound.play('click');
  toast(live.length ? `${live.length} unit${live.length > 1 ? 's' : ''} moving to the rally point` : 'No troops on the field yet', live.length ? 'good' : 'info');
}

function reinforceCost() { return 100 + hqLevel() * 60; }
function callReinforcements() {
  if (B.reinforceCd > 0) { Sound.play('error'); return; }
  const cost = reinforceCost();
  if (S.gold < cost) { toast(`Reinforcements cost ${cost} gold`, 'bad'); Sound.play('error'); return; }
  S.gold -= cost;
  B.reinforceCd = 30;
  const p = heroSpawnPoint();
  for (let i = 0; i < 3; i++) spawnTroop('rifle', p.x + (i - 1) * 16, p.y + 10, false, 0.3 * i);
  if (barracksLevel() >= 2) spawnTroop('gunner', p.x, p.y + 26, false, 0.9);
  Sound.play('alarm');
  toast('Reinforcements are on their way', 'good');
}

// Survivors from your own army go back to the Barracks when the battle ends.
function returnTroops() {
  if (!B || !B.troops) return 0;
  let n = 0;
  for (const t of B.troops) if (t.hp > 0 && t.home) { army().troops[t.kind] = (army().troops[t.kind] || 0) + 1; n++; }
  return n;
}

/* ---------------- Battle: deploy bar ---------------- */
function clearDeployPick() {
  if (!B) return;
  B.deployPick = null; B.rallyMode = false;
  document.body.classList.remove('deploying');
}

function buildDeployBar() {
  const el = $('#deploy-bar');
  const types = B.practice ? [] : Object.keys(TROOPS).filter(t => troopCount(t) > 0);
  el.innerHTML = types.map(t => `
    <button class="dp" data-dp="${t}" aria-label="Deploy ${TROOPS[t].name}">
      <span class="dp-art" data-troop="${t}"></span><span class="dp-n">${troopCount(t)}</span>
    </button>`).join('') + `
    <button class="dp dp-cmd" data-dp="stance" aria-label="Troop stance"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2l6 3v5c0 4-3 6.5-6 8-3-1.5-6-4-6-8V5z" fill="currentColor"/></svg><span class="dp-l dp-stance">${(STANCES.find(x => x.id === S.stance) || STANCES[0]).name}</span></button>
    <button class="dp dp-cmd" data-dp="rally" aria-label="Rally troops"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2v16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 3h10l-3 3.5 3 3.5H6z" fill="currentColor"/></svg><span class="dp-l">Rally</span></button>
    ${itemButtons()}
    <button class="dp dp-cmd" data-dp="reinforce" aria-label="Call reinforcements"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="6" cy="6" r="2.6" fill="currentColor"/><circle cx="14" cy="6" r="2.6" fill="currentColor"/><path d="M2 15a4 4 0 0 1 8 0zM10 15a4 4 0 0 1 8 0z" fill="currentColor"/></svg><span class="dp-l">${reinforceCost()}</span><span class="dp-cd"></span></button>`;
  el.querySelectorAll('[data-troop]').forEach(s => s.appendChild(renderTroopPreview(s.dataset.troop, 28)));
}

function updateDeployBar() {
  if (!B) return;
  const el = $('#deploy-bar');
  for (const btn of el.children) {
    const k = btn.dataset.dp;
    if (TROOPS[k]) {
      const n = troopCount(k);
      const c = btn.querySelector('.dp-n');
      if (c.textContent !== String(n)) c.textContent = String(n);
      btn.classList.toggle('empty', n <= 0);
      btn.classList.toggle('on', B.deployPick === k);
    } else if (k === 'rally') btn.classList.toggle('on', !!B.rallyMode);
    else if (k.startsWith('item:')) {
      const n = (S.items[k.slice(5)] || 0);
      const c = btn.querySelector('.dp-n');
      if (c && c.textContent !== String(n)) c.textContent = String(n);
      btn.classList.toggle('empty', n <= 0);
      btn.classList.toggle('on', B.targeting === 'item:' + k.slice(5));
    } else if (k === 'reinforce') {
      const cd = B.reinforceCd > 0 ? String(Math.ceil(B.reinforceCd)) : '';
      const c = btn.querySelector('.dp-cd');
      if (c.textContent !== cd) c.textContent = cd;
      btn.classList.toggle('cooling', B.reinforceCd > 0);
    }
  }
}

function onDeployClick(e) {
  const btn = e.target.closest('[data-dp]');
  if (!btn || !B) return;
  const k = btn.dataset.dp;
  B.targeting = null; document.body.classList.remove('targeting');
  if (k === 'reinforce') { callReinforcements(); return; }
  if (k === 'stance') {
    const i = STANCES.findIndex(x => x.id === S.stance);
    S.stance = STANCES[(i + 1) % STANCES.length].id;
    for (const t of B.troops) t.rallied = false;
    btn.querySelector('.dp-stance').textContent = STANCES.find(x => x.id === S.stance).name;
    toast(`Stance: ${STANCES.find(x => x.id === S.stance).name}. ${STANCES.find(x => x.id === S.stance).desc}`, 'info');
    Sound.play('click'); return;
  }
  if (k.startsWith('item:')) { useItem(k.slice(5)); return; }
  if (k === 'rally') {
    const on = !B.rallyMode;
    clearDeployPick();
    B.rallyMode = on;
    if (on) { document.body.classList.add('deploying'); banner('Rally point', 'Tap the map to move your troops'); }
    Sound.play('click');
    return;
  }
  if (B.deployPick === k) { clearDeployPick(); return; }
  if (troopCount(k) <= 0) { toast('None left', 'bad'); return; }
  clearDeployPick();
  B.deployPick = k;
  document.body.classList.add('deploying');
  banner(`Deploy ${TROOPS[k].name}`, 'Tap the map. Each tap sends one unit');
  Sound.play('click');
}

/* ---------------- Drawing ---------------- */
function drawTroopFigure(ctx, t) {
  const d = TROOPS[t.kind];
  ctx.save(); ctx.translate(t.x, t.y);
  if (t.kind === 'heli') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(10, 12, 20, 9, t.angle, 0, Math.PI * 2); ctx.fill();
    ctx.translate(0, -24 + Math.sin((t.walk || 0) * 0.5 + tSec * 2) * 2);
    ctx.rotate(t.angle);
    ctx.fillStyle = t.hit > 0 ? '#fff' : '#4a5d33'; rr(ctx, -30, -2.5, 22, 5, 2); ctx.fill();
    ctx.fillStyle = '#2b2e25'; ctx.fillRect(-32, -6, 4, 12);
    ctx.fillStyle = t.hit > 0 ? '#fff' : camoColor(d); ctx.beginPath(); ctx.ellipse(0, 0, 15, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(160,210,230,0.7)'; ctx.beginPath(); ctx.ellipse(9, 0, 5, 5, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
    ctx.fillStyle = '#e9e4d4'; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 1.5 : 3.5, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(-6 + Math.cos(a) * r, Math.sin(a) * r); }
    ctx.fill();
    ctx.fillStyle = '#2b2e25'; ctx.fillRect(-4, -11, 10, 3); ctx.fillRect(-4, 8, 10, 3);
    ctx.save(); ctx.rotate(tSec * 30);
    ctx.fillStyle = 'rgba(220,220,210,0.18)'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(30,28,24,0.7)'; ctx.fillRect(-24, -1.4, 48, 2.8); ctx.fillRect(-1.4, -24, 2.8, 48);
    ctx.restore();
    if (t.flash > 0) { ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(8, -10, 3, 0, Math.PI * 2); ctx.arc(8, 10, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    return;
  }
  if (d.vehicle) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(4, 5, 17, 11, t.angle, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.rotate(t.angle);
    const L = 34, W = 22;
    ctx.fillStyle = '#1d2216'; rr(ctx, -L / 2, -W / 2 - 2, L, 7, 2); ctx.fill(); rr(ctx, -L / 2, W / 2 - 5, L, 7, 2); ctx.fill();
    ctx.fillStyle = '#3a4527';
    for (let i = 0; i < 7; i++) { const o = ((t.walk * 2 + i * 5) % L) - L / 2; ctx.fillRect(o, -W / 2 - 2, 1.6, 7); ctx.fillRect(o, W / 2 - 5, 1.6, 7); }
    ctx.fillStyle = t.hit > 0 ? '#fff' : camoColor({ color: '#55703a' }); rr(ctx, -L / 2 + 3, -W / 2 + 3, L - 6, W - 6, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; rr(ctx, -L / 2 + 5, -W / 2 + 4, L - 10, 5, 2); ctx.fill();
    ctx.fillStyle = '#e9e4d4'; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 2 : 4.5, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(-8 + Math.cos(a) * r, Math.sin(a) * r); }
    ctx.fill();
    ctx.restore();
    ctx.rotate(t.aim);
    ctx.fillStyle = '#1d2216'; ctx.fillRect(4, -2.2, 24, 4.4);
    ctx.fillStyle = t.hit > 0 ? '#fff' : '#3f5228'; ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.fill();
    if (t.flash > 0) { ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(30, 0, 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    return;
  }
  const r = d.r;
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(2, 3, r * 0.9, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  // friendly marker ring
  ctx.strokeStyle = 'rgba(127,191,77,0.75)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 2, r + 2, (r + 2) * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.rotate(t.aim);
  const stride = t.moving ? Math.sin(t.walk) * r * 0.45 : 0;
  ctx.fillStyle = '#1e2414';
  ctx.beginPath(); ctx.ellipse(stride, -r * 0.35, r * 0.32, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-stride, r * 0.35, r * 0.32, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#17130f';
  if (t.kind === 'rocket') { ctx.fillStyle = '#4a5639'; rr(ctx, -3, -7, 18, 4, 2); ctx.fill(); }
  else if (t.kind === 'flame') { ctx.fillStyle = '#c8562a'; rr(ctx, -r * 1.2, -4, r * 0.7, 3.4, 1.7); ctx.fill(); rr(ctx, -r * 1.2, 1, r * 0.7, 3.4, 1.7); ctx.fill(); ctx.fillStyle = '#17130f'; ctx.fillRect(r * 0.2, 0.5, 10, 2.4); }
  else if (t.kind === 'mortarteam') { ctx.fillStyle = '#2b2e25'; rr(ctx, 2, -3, 12, 6, 3); ctx.fill(); }
  else if (t.kind === 'engineer') { ctx.fillStyle = '#9aa0a6'; ctx.fillRect(r * 0.2, -1, 9, 2); ctx.fillRect(r * 0.2 + 7, -3, 3, 6); }
  else if (t.kind === 'sniper') ctx.fillRect(r * 0.2, 0.5, 16, 1.6);
  else if (t.kind === 'gunner') ctx.fillRect(r * 0.2, 0, 13, 3.2);
  else if (t.kind !== 'medic' && t.kind !== 'flame' && t.kind !== 'mortarteam' && t.kind !== 'engineer') ctx.fillRect(r * 0.2, 0.5, 11, 2);
  ctx.fillStyle = '#3e4a26'; rr(ctx, -r * 1.0, -r * 0.45, r * 0.55, r * 0.9, 2); ctx.fill();
  ctx.fillStyle = t.hit > 0 ? '#fff' : camoColor(d); ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r, 0, 0, Math.PI * 2); ctx.fill();
  if (t.kind === 'engineer') { ctx.fillStyle = '#f2b632'; ctx.fillRect(-1.5, -r * 0.8, 3, r * 1.6); }
  if (t.kind === 'medic') { ctx.fillStyle = '#c8402a'; ctx.fillRect(-1, -3.5, 2, 7); ctx.fillRect(-3.5, -1, 7, 2); }
  ctx.fillStyle = t.kind === 'medic' ? '#c9c2ae' : '#2f3a1e'; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(-r * 0.15, -r * 0.18, r * 0.22, 0, Math.PI * 2); ctx.fill();
  if (t.flash > 0 && t.kind !== 'medic') { ctx.fillStyle = '#e8ffb0'; ctx.beginPath(); ctx.arc(r * 0.2 + (t.kind === 'sniper' ? 17 : 12), 1.5, 2.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawTroops(ctx) {
  if (!B || !B.troops) return;
  for (const t of B.troops) {
    if (t.drop > 0) {
      // parachuting in
      const h = t.drop * 60;
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(t.x, t.y + 3, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e9e4d4'; ctx.beginPath(); ctx.arc(t.x, t.y - h - 12, 10, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(80,80,70,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(t.x - 10, t.y - h - 12); ctx.lineTo(t.x, t.y - h); ctx.lineTo(t.x + 10, t.y - h - 12); ctx.stroke();
      ctx.fillStyle = TROOPS[t.kind].color; ctx.beginPath(); ctx.arc(t.x, t.y - h, 4, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    drawTroopFigure(ctx, t);
    if (t.healFx > 0) { t.healFx -= 1 / 60; ctx.strokeStyle = `rgba(140,230,120,${t.healFx * 2})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(t.x, t.y, 10, 0, Math.PI * 2); ctx.stroke(); }
    if (t.hp < t.max) {
      const w = TROOPS[t.kind].vehicle ? 26 : 14, y = t.y - (TROOPS[t.kind].vehicle ? 20 : 13);
      ctx.fillStyle = 'rgba(16,18,12,0.8)'; ctx.fillRect(t.x - w / 2 - 1, y - 1, w + 2, 4);
      ctx.fillStyle = '#7fbf4d'; ctx.fillRect(t.x - w / 2, y, w * t.hp / t.max, 2);
    }
  }
  if (B.rally && B.rally.life > 0) {
    B.rally.life -= 1 / 60;
    const r = B.rally;
    ctx.strokeStyle = '#d8d4c4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x, r.y - 26); ctx.stroke();
    ctx.fillStyle = '#7fbf4d'; ctx.beginPath(); ctx.moveTo(r.x, r.y - 26); ctx.lineTo(r.x + 14, r.y - 21); ctx.lineTo(r.x, r.y - 16); ctx.fill();
    ctx.strokeStyle = 'rgba(127,191,77,0.7)'; ctx.beginPath(); ctx.ellipse(r.x, r.y, 18, 9, 0, 0, Math.PI * 2); ctx.stroke();
  }
}

/* ----- Guard Posts release free troops when enemies come close ----- */
function updateGuardPosts() {
  for (const b of S.buildings) {
    if (b.type !== 'guardpost' || b._dead || b.level < 1 || b._released) continue;
    const c = centerOf(b);
    if (!B.units.some(u => u.hp > 0 && !u.air && Math.hypot(u.x - c.x, u.y - c.y) < 5.5 * TILE)) continue;
    b._released = true;
    const L = b.level;
    const squad = ['rifle', 'rifle'];
    if (L >= 2) squad.push('rifle');
    if (L >= 3) squad.push('gunner');
    if (L >= 5) squad.push('rocket');
    if (L >= 7) squad.push('flame');
    if (L >= 9) squad.push('sniper', 'gunner');
    squad.forEach((t, i) => {
      const a = i / squad.length * Math.PI * 2;
      spawnTroop(t, c.x + Math.cos(a) * 18, c.y + Math.sin(a) * 14 + 10, false, 0.2 + i * 0.1);
    });
    B.fx.push({ kind: 'ring', x: c.x, y: c.y, r: 2.5 * TILE, life: 0.8, max: 0.8, color: '127,191,77' });
    Sound.play('alarm');
  }
}

/* ----- Draw helper: troop camo color ----- */
function camoColor(def) {
  const c = S.cosmetic && CAMO[S.cosmetic.camo];
  return c && c.color && def.color !== '#e2dccb' ? c.color : def.color;
}
