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
function troopStats(t) {
  const d = TROOPS[t], k = troopScale(Math.max(1, barracksLevel())) * (1 + researchBonus('training'));
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
function costOf(d) { return { gold: d.cost.gold || 0, steel: d.cost.steel || 0 }; }

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
  const span = TROOPS[t].vehicle ? 46 : 24;
  g.scale(dpr * px / span, dpr * px / span);
  drawTroopFigure(g, { kind: t, x: span / 2, y: span / 2, aim: -0.5, angle: -0.5, walk: 1, moving: false, flash: 0, hit: 0 });
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
        <div class="trp-have">Ready: <b>${troopCount(t)}</b></div>
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
    if (t.hp <= 0 || t.drop > 0) continue;
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
  const leash = 3 * TILE;
  for (const t of B.troops) {
    if (t.hp <= 0) continue;
    if (t.drop > 0) { t.drop -= dt; continue; }
    const d = TROOPS[t.kind];
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
    if (!t.tgt || t.tgt.hp <= 0 || Math.hypot(t.tgt.x - t.x, t.tgt.y - t.y) > (d.range + 2.5) * TILE || (t.tgt.air && !canAir)) {
      t.tgt = null;
      let bd = (d.range + 2.5) * TILE;
      for (const u of B.units) {
        if (u.hp <= 0 || (u.air && !canAir)) continue;
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
          if (t.kind === 'rocket') {
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
  const types = Object.keys(TROOPS).filter(t => troopCount(t) > 0);
  el.innerHTML = types.map(t => `
    <button class="dp" data-dp="${t}" aria-label="Deploy ${TROOPS[t].name}">
      <span class="dp-art" data-troop="${t}"></span><span class="dp-n">${troopCount(t)}</span>
    </button>`).join('') + `
    <button class="dp dp-cmd" data-dp="rally" aria-label="Rally troops"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2v16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 3h10l-3 3.5 3 3.5H6z" fill="currentColor"/></svg><span class="dp-l">Rally</span></button>
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
    else if (k === 'reinforce') {
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
  if (d.vehicle) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(4, 5, 17, 11, t.angle, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.rotate(t.angle);
    const L = 34, W = 22;
    ctx.fillStyle = '#1d2216'; rr(ctx, -L / 2, -W / 2 - 2, L, 7, 2); ctx.fill(); rr(ctx, -L / 2, W / 2 - 5, L, 7, 2); ctx.fill();
    ctx.fillStyle = '#3a4527';
    for (let i = 0; i < 7; i++) { const o = ((t.walk * 2 + i * 5) % L) - L / 2; ctx.fillRect(o, -W / 2 - 2, 1.6, 7); ctx.fillRect(o, W / 2 - 5, 1.6, 7); }
    ctx.fillStyle = t.hit > 0 ? '#fff' : '#55703a'; rr(ctx, -L / 2 + 3, -W / 2 + 3, L - 6, W - 6, 3); ctx.fill();
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
  else if (t.kind === 'sniper') ctx.fillRect(r * 0.2, 0.5, 16, 1.6);
  else if (t.kind === 'gunner') ctx.fillRect(r * 0.2, 0, 13, 3.2);
  else if (t.kind !== 'medic') ctx.fillRect(r * 0.2, 0.5, 11, 2);
  ctx.fillStyle = '#3e4a26'; rr(ctx, -r * 1.0, -r * 0.45, r * 0.55, r * 0.9, 2); ctx.fill();
  ctx.fillStyle = t.hit > 0 ? '#fff' : d.color; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r, 0, 0, Math.PI * 2); ctx.fill();
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
