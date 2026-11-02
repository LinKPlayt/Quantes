// WarBreach — the arsenal: commander abilities, loadout choice, and their battle effects.
'use strict';

const AB_ICONS = {
  airstrike: '<path d="M10 1.5l1.6 5.5 6.4 3.5v1.6l-6.4-1.7-.4 4.6 2 1.6v1.3L10 17l-3.2.9v-1.3l2-1.6-.4-4.6L2 12.1v-1.6L8.4 7z" fill="currentColor"/>',
  repair: '<path d="M14.5 2.5a4 4 0 0 0-4.7 5.3L3 14.6 5.4 17l6.8-6.8a4 4 0 0 0 5.3-4.7l-2.4 2.4-2.3-.6-.6-2.3z" fill="currentColor"/>',
  paradrop: '<path d="M2 9a8 8 0 0 1 16 0z" fill="currentColor"/><path d="M2 9l8 7 8-7M10 9v7" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="10" cy="17" r="2" fill="currentColor"/>',
  artillery: '<circle cx="5" cy="13" r="2.5" fill="currentColor"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/><circle cx="15" cy="15" r="2.5" fill="currentColor"/><path d="M3 4l3 4M10 2l2 4M16 4l-1 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  smoke: '<circle cx="7" cy="11" r="4.5" fill="currentColor"/><circle cx="12.5" cy="9" r="5" fill="currentColor"/><circle cx="14" cy="13.5" r="3.5" fill="currentColor"/>',
  emp: '<path d="M11 1L4 11h5l-1 8 8-11h-5z" fill="currentColor"/>',
  hero: '<path d="M4 11a6 6 0 0 1 12 0v1H4z" fill="currentColor"/><path d="M3 12.5h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};

function abilityUnlocked(k) { return hqLevel() >= ABILITIES[k].hq; }

function loadout() {
  if (!Array.isArray(S.loadout)) S.loadout = ['airstrike', 'repair'];
  const slots = loadoutSlots(hqLevel());
  return S.loadout.filter(k => ABILITIES[k] && abilityUnlocked(k)).slice(0, slots);
}

function abilityCooldown(k) {
  const m = B && B.bonus ? B.bonus.cd : 1;
  if (k === 'airstrike') return Math.max(10, ABILITIES.airstrike.cooldown - 2 * researchLevel('airpower')) * m;
  if (k === 'repair') return Math.max(15, ABILITIES.repair.cooldown - 3 * researchLevel('medicine')) * m;
  return ABILITIES[k].cooldown * m;
}

function abilityBlocked(k) {
  if (!B) return 'Not in battle';
  if (k === 'airstrike' && B.mods.noAirstrike) return 'No air support in this battle';
  if (k === 'repair' && B.mods.noRepair) return 'No Field Repair in this battle';
  return '';
}

function abilityReady(k) {
  if (!B || B.over || B.phase === 'lost' || abilityBlocked(k)) return false;
  return (B.ab[k] || 0) <= 0;
}

/* ---------------- Battle: ability bar ---------------- */
function buildAbilityBar() {
  const el = $('#abilities');
  const keys = loadout();
  B.abKeys = keys;
  for (const k of keys) if (B.ab[k] == null) B.ab[k] = k === 'airstrike' ? 3 : 0;
  let html = keys.map(k => `
    <button class="ab-btn ab-${k}" data-ab="${k}" aria-label="${ABILITIES[k].name}">
      <svg viewBox="0 0 20 20" aria-hidden="true">${AB_ICONS[k]}</svg>
      <span class="ab-name">${ABILITIES[k].short}</span><span class="ab-cd"></span>
    </button>`).join('');
  if (B.hero) html = `
    <button class="ab-btn ab-hero" data-ab="hero" aria-label="Hero ability">
      <svg viewBox="0 0 20 20" aria-hidden="true">${AB_ICONS.hero}</svg>
      <span class="ab-name">${HEROES[B.hero.id].ability.name.split(' ')[0]}</span><span class="ab-cd"></span>
    </button>` + html;
  el.innerHTML = html;
}

function updateAbilityBar() {
  if (!B || !B.abKeys) return;
  const el = $('#abilities');
  for (const btn of el.children) {
    const k = btn.dataset.ab;
    let cd, max;
    if (k === 'hero') {
      if (!B.hero) continue;
      cd = B.hero.dead ? B.hero.respawn : B.ab.hero; max = B.hero.dead ? 15 : HEROES[B.hero.id].ability.cd;
    } else { cd = B.ab[k] || 0; max = abilityCooldown(k); }
    const label = cd > 0 ? String(Math.ceil(cd)) : '';
    const c = btn.querySelector('.ab-cd');
    if (c.textContent !== label) c.textContent = label;
    btn.classList.toggle('cooling', cd > 0);
    btn.classList.toggle('blocked', k !== 'hero' && !!abilityBlocked(k));
    btn.style.setProperty('--p', cd > 0 ? (Math.min(1, cd / max) * 100).toFixed(1) + '%' : '0%');
    btn.classList.toggle('armed', B.targeting === k);
  }
}

function onAbilityClick(e) {
  const btn = e.target.closest('[data-ab]');
  if (!btn || !B) return;
  useAbility(btn.dataset.ab);
}

function useAbility(k) {
  if (k === 'hero') { useHeroAbility(); return; }
  const blocked = abilityBlocked(k);
  if (blocked) { toast(blocked, 'bad'); Sound.play('error'); return; }
  if (!abilityReady(k)) { Sound.play('error'); return; }
  if (ABILITIES[k].target) {
    clearDeployPick();
    B.targeting = B.targeting === k ? null : k;
    document.body.classList.toggle('targeting', !!B.targeting);
    Sound.play('click');
    if (B.targeting) banner(ABILITIES[k].name, 'Tap the map to choose the target');
    return;
  }
  orderEvent('ability', 1);
  if (k === 'repair') useRepair();
  else if (k === 'emp') useEmp();
}

// A tap on the map while an ability is armed.
function fireTargeted(k, w) {
  B.targeting = null;
  document.body.classList.remove('targeting');
  $('#banner').hidden = true;
  if (jammedAt(w.x, w.y)) { toast('Signal jammed. Destroy the Jammer Truck first', 'bad'); Sound.play('error'); return; }
  orderEvent('ability', 1);
  B.ab[k] = abilityCooldown(k);
  if (k === 'airstrike') callAirstrike(w);
  else if (k === 'artillery') callArtillery(w);
  else if (k === 'smoke') dropSmoke(w);
  else if (k === 'paradrop') paradrop(w);
}

/* ---------------- Ability effects ---------------- */
function callAirstrike(w) {
  S.stats.airstrikes++;
  const a = -0.22;
  B.planes.push({ tx: w.x, ty: w.y, a, t: 0, speed: 720, x: -9999, y: -9999, drops: [-90, -45, 0, 45, 90].map(o => ({ o, dropped: false })) });
  B.fx.push({ kind: 'ring', x: w.x, y: w.y, r: 1.8 * TILE, life: 1.6, max: 1.6, color: '242,182,50' });
  Sound.play('plane');
}

function updatePlane(pl, dt) {
  pl.t += dt;
  const along = pl.t * pl.speed - 1000;
  pl.x = pl.tx + Math.cos(pl.a) * along;
  pl.y = pl.ty + Math.sin(pl.a) * along;
  for (const d of pl.drops) {
    if (d.dropped || along < d.o - 70) continue;
    d.dropped = true;
    B.shots.push({
      kind: 'bomb', sx: pl.x, sy: pl.y, x: pl.x, y: pl.y,
      tx: pl.tx + Math.cos(pl.a) * d.o, ty: pl.ty + Math.sin(pl.a) * d.o,
      t: 0, dur: 0.45, arc: 0, dmg: airstrikeDamage(B.wave) * (1 + researchBonus('airpower')), splash: 1.4, air: true, src: 'airstrike',
    });
  }
  if (along > 1100) pl.done = true;
}

function callArtillery(w) {
  const dmg = 80 + Math.max(1, B.wave) * 14;
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 2.4 * TILE;
    B.shots.push({ kind: 'mortar', x: w.x, y: w.y - 300, sx: w.x + (Math.random() - 0.5) * 200, sy: w.y - 380, tx: w.x + Math.cos(a) * r, ty: w.y + Math.sin(a) * r,
      t: -0.6 - i * 0.18, dur: 0.7, arc: 60, dmg, splash: 1.1, air: false, src: 'artillery' });
  }
  B.fx.push({ kind: 'ring', x: w.x, y: w.y, r: 2.4 * TILE, life: 2.8, max: 2.8, color: '200,64,42' });
  Sound.play('alarm');
}

function dropSmoke(w) {
  B.smokes.push({ x: w.x, y: w.y, r: 2.4 * TILE, life: 10, max: 10 });
  Sound.play('flame');
  for (let i = 0; i < 24; i++) particles.push({ x: w.x + (Math.random() - 0.5) * 60, y: w.y + (Math.random() - 0.5) * 50, vx: (Math.random() - 0.5) * 30, vy: -8, g: 0, life: 2, max: 2, r: 8, grow: 10, color: 'smoke' });
}

function inSmoke(x, y) {
  for (const s of B.smokes) if (Math.hypot(x - s.x, y - s.y) < s.r) return true;
  return false;
}

function useEmp() {
  B.ab.emp = abilityCooldown('emp');
  let n = 0;
  for (const u of B.units) if (u.hp > 0 && (u.air || ENEMIES[u.type].vehicle)) { u.stun = 5; n++; }
  B.fx.push({ kind: 'shock', x: cam.x, y: cam.y, r: Math.max(vw, vh) / cam.z, life: 0.6, max: 0.6 });
  B.empFlash = 0.4;
  Sound.play('zap'); buzz([40, 30, 40]);
  toast(n ? `EMP: ${n} vehicle${n > 1 ? 's' : ''} and drone${n > 1 ? 's' : ''} frozen` : 'EMP fired. No vehicles in range', n ? 'good' : 'info');
}

function useRepair() {
  B.ab.repair = abilityCooldown('repair');
  let n = 0;
  for (const b of S.buildings) {
    if (b._dead || isPassive(b.type) || b._hp >= b._maxhp) continue;
    b._hp = Math.min(b._maxhp, b._hp + b._maxhp * (ABILITIES.repair.heal + researchBonus('medicine')));
    b._heal = 1.2; n++;
  }
  Sound.play('heal');
  toast(n ? `Field repair: ${n} building${n > 1 ? 's' : ''} patched up` : 'Field repair used. Nothing was damaged', 'good');
}

function paradrop(w) {
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.4;
    spawnTroop('rifle', w.x + Math.cos(a) * 16, w.y + Math.sin(a) * 16, false, 1.2 + i * 0.15);
  }
  Sound.play('plane');
}

function updateSmokes(dt) {
  for (const s of B.smokes) {
    s.life -= dt;
    if (Math.random() < dt * 6) particles.push({ x: s.x + (Math.random() - 0.5) * s.r * 1.4, y: s.y + (Math.random() - 0.5) * s.r, vx: (Math.random() - 0.5) * 10, vy: -5, g: 0, life: 2.2, max: 2.2, r: 10, grow: 8, color: 'smoke' });
  }
  B.smokes = B.smokes.filter(s => s.life > 0);
  if (B.empFlash > 0) B.empFlash -= dt;
}

function drawSmokes(ctx) {
  for (const s of B.smokes) {
    const a = Math.min(1, s.life / 2) * 0.45;
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    g.addColorStop(0, `rgba(210,206,195,${a})`); g.addColorStop(1, 'rgba(210,206,195,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  }
}

/* ---------------- Loadout screen ---------------- */
function openArsenal(back) {
  const slots = loadoutSlots(hqLevel());
  const eq = loadout();
  const cards = Object.keys(ABILITIES).map(k => {
    const a = ABILITIES[k], ok = abilityUnlocked(k), on = eq.includes(k);
    return `
      <button class="ars ${on ? 'on' : ''} ${ok ? '' : 'locked'}" data-ars="${k}">
        <span class="ars-ico"><svg viewBox="0 0 20 20" aria-hidden="true">${AB_ICONS[k]}</svg></span>
        <span class="ars-name">${a.name}</span>
        <span class="ars-desc">${ok ? a.desc : `Unlocks at Command Center ${a.hq}`}</span>
        <span class="ars-meta">${ok ? `${abilityCooldown(k)}s cooldown` : ''}${on ? ' · Equipped' : ''}</span>
      </button>`;
  }).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Arsenal</h2><span class="m-count">${eq.length} / ${slots} slots used</span></div>
      <p class="lead">Choose which abilities you bring into battle. You get more slots at Command Center 5 and 8. Your hero's ability is always available.</p>
      <div class="ars-grid">${cards}</div>
      <div class="settings-row">${back ? '<button class="btn ghost" id="btn-ars-back">Back</button>' : ''}<button class="btn" data-close>Done</button></div>
    </div>`);
  $('#modal-body').querySelectorAll('[data-ars]').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.ars;
    if (!abilityUnlocked(k)) { toast(`Unlocks at Command Center ${ABILITIES[k].hq}`, 'bad'); Sound.play('error'); return; }
    let cur = loadout();
    if (cur.includes(k)) cur = cur.filter(x => x !== k);
    else if (cur.length < slots) cur.push(k);
    else { toast(`All ${slots} slots are full. Remove one first`, 'bad'); Sound.play('error'); return; }
    S.loadout = cur; save(); Sound.play('click');
    openArsenal(back);
  }));
  const bb = $('#btn-ars-back');
  if (bb) bb.addEventListener('click', () => { closeModal(); back(); });
}
