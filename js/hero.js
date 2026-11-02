// WarBreach — heroes: one commander-unit per battle that you move by tapping the map.
'use strict';

function heroState(id) {
  if (!S.heroes) S.heroes = { active: 'commando' };
  if (!S.heroes[id]) S.heroes[id] = { level: 1, xp: 0 };
  return S.heroes[id];
}

function heroUnlocked(id) {
  const u = HEROES[id].unlock;
  if (u.hq && hqLevel() < u.hq) return false;
  if (u.mission && !((S.campaign || {}).stars || {})[u.mission]) return false;
  return true;
}

function heroUnlockText(id) {
  const u = HEROES[id].unlock;
  if (u.mission) return `Clear campaign mission ${u.mission.slice(1)}`;
  return `Command Center level ${u.hq}`;
}

// Stats for a hero at their current level.
function heroStats(id) {
  const h = HEROES[id], L = heroState(id).level, k = heroScale(L);
  return { hp: Math.round(h.hp * k), dmg: h.dmg * k, rate: h.rate, range: h.range, speed: h.speed, regen: h.regen * k, abilityDmg: (h.ability.dmg || 0) * k, level: L };
}

function addHeroXP(id, n) {
  const st = heroState(id);
  if (st.level >= HERO_MAX) return;
  st.xp += n;
  while (st.level < HERO_MAX && st.xp >= heroXpFor(st.level)) {
    st.xp -= heroXpFor(st.level);
    st.level++;
    toast(`${HEROES[id].name} reached level ${st.level}`, 'good');
    Sound.play('medal');
    if (B && B.hero && B.hero.id === id) {
      const s2 = heroStats(id);
      B.hero.max = s2.hp; B.hero.hp = s2.hp;
    }
  }
}

/* ---------------- In battle ---------------- */
function heroSpawnPoint() {
  const h = hq(), c = centerOf(h);
  return { x: c.x, y: c.y + 2 * TILE };
}

function spawnHero() {
  const id = (S.heroes && S.heroes.active) || 'commando';
  if (!heroUnlocked(id)) S.heroes.active = 'commando';
  const hid = S.heroes.active || 'commando';
  const st = heroStats(hid), p = heroSpawnPoint();
  return { id: hid, x: p.x, y: p.y, hp: st.hp, max: st.hp, cd: 0, tgt: null, dest: null, angle: -Math.PI / 2, aim: -Math.PI / 2, walk: 0, dead: false, respawn: 0, moving: false, flash: 0, hit: 0 };
}

function updateHero(dt) {
  const H = B.hero;
  if (!H) return;
  const def = HEROES[H.id], st = heroStats(H.id);
  if (H.dead) {
    H.respawn -= dt;
    if (H.respawn <= 0) {
      const p = heroSpawnPoint();
      Object.assign(H, { dead: false, hp: H.max, x: p.x, y: p.y, dest: null, tgt: null });
      banner(`${def.name} is back`, 'Tap the map to send them into the fight');
    }
    return;
  }
  if (H.flash > 0) H.flash -= dt;
  if (H.hit > 0) H.hit -= dt;
  H.cd -= dt;
  // slow regeneration when not hurt recently
  H.hp = Math.min(H.max, H.hp + st.regen * dt);

  // walk to the ordered spot
  H.moving = false;
  if (H.dest) {
    const dx = H.dest.x - H.x, dy = H.dest.y - H.y, d = Math.hypot(dx, dy);
    if (d < 4) H.dest = null;
    else {
      const step = Math.min(d, st.speed * TILE * dt);
      H.x += dx / d * step; H.y += dy / d * step;
      H.angle = Math.atan2(dy, dx); H.aim = H.angle;
      H.walk += dt * st.speed * 9;
      H.moving = true;
    }
  }

  // shoot the nearest enemy in range (air included)
  if (!H.tgt || H.tgt.hp <= 0 || Math.hypot(H.tgt.x - H.x, H.tgt.y - H.y) > st.range * TILE) {
    H.tgt = null;
    let bd = st.range * TILE;
    for (const u of B.units) {
      if (u.hp <= 0) continue;
      const d = Math.hypot(u.x - H.x, u.y - H.y);
      if (d < bd) { bd = d; H.tgt = u; }
    }
  }
  if (H.tgt) {
    H.aim = Math.atan2(H.tgt.y - H.y, H.tgt.x - H.x);
    if (!H.moving) H.angle = H.aim;
    if (H.cd <= 0) {
      H.cd = 1 / st.rate;
      H.flash = 0.06;
      const t = H.tgt;
      if (H.id === 'heavy') {
        B.shots.push({ kind: 'shell', x: H.x, y: H.y, tx: t.x, ty: t.y, target: t, speed: 12 * TILE, dmg: st.dmg, splash: 0, src: 'hero' });
        Sound.play('cannon');
      } else {
        damageEnemy(t, st.dmg, 'hero');
        B.fx.push({ kind: 'tracer', x1: H.x, y1: H.y - 3, x2: t.x, y2: t.y - (t.air ? 18 : 2), life: 0.06, color: '#c9ff9a' });
        Sound.play('mg');
      }
    }
  }

  // the engineer patches up buildings around her
  if (def.repair) {
    for (const b of S.buildings) {
      if (b._dead || isPassive(b.type) || b._hp >= b._maxhp) continue;
      if (distToBuilding(H.x, H.y, b) <= 2.5) {
        b._hp = Math.min(b._maxhp, b._hp + def.repair * heroScale(st.level) * dt);
        if (Math.random() < dt * 4) { const c = centerOf(b); particles.push({ x: c.x + (Math.random() - 0.5) * 20, y: c.y, vx: 0, vy: -30, g: 0, life: 0.6, max: 0.6, r: 2.5, color: '#8fe07a' }); }
      }
    }
  }
}

function damageHero(dmg) {
  const H = B.hero;
  if (!H || H.dead) return;
  const def = HEROES[H.id];
  if (def.armor) dmg = Math.max(dmg * 0.3, dmg - def.armor);
  H.hp -= dmg;
  H.hit = 0.1;
  if (H.hp <= 0) {
    H.dead = true;
    H.respawn = 15;
    H.tgt = null;
    explosion(H.x, H.y, 16);
    banner(`${def.name} is down`, 'Back in 15 seconds');
    Sound.play('lose');
  }
}

function useHeroAbility() {
  const H = B && B.hero;
  if (!H) { toast('No hero in this battle', 'bad'); Sound.play('error'); return; }
  if (H.dead) { toast(`${HEROES[H.id].name} is down`, 'bad'); Sound.play('error'); return; }
  if (B.ab.hero > 0) { Sound.play('error'); return; }
  const def = HEROES[H.id], st = heroStats(H.id);
  if (H.id === 'commando') {
    const t = H.tgt || nearestEnemy(H.x, H.y, 6);
    if (!t) { toast('No enemies near Sgt. Vance', 'info'); return; }
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * TILE;
      B.shots.push({ kind: 'mortar', x: H.x, y: H.y, sx: H.x, sy: H.y, tx: t.x + Math.cos(a) * r, ty: t.y + Math.sin(a) * r, t: -i * 0.1, dur: 0.7, arc: 50, dmg: st.abilityDmg, splash: def.ability.radius, air: false, src: 'hero' });
    }
    Sound.play('mortar');
  } else if (H.id === 'engineer') {
    B.sentries.push({ x: H.x + 18, y: H.y - 10, life: def.ability.life, cd: 0, angle: 0, dmg: def.ability.dmg * heroScale(st.level), tgt: null, flash: 0 });
    Sound.play('build');
  } else if (H.id === 'heavy') {
    const t = H.tgt || nearestEnemy(H.x, H.y, 8);
    if (!t) { toast('No enemies near Cpl. Brann', 'info'); return; }
    B.shots.push({ kind: 'rocket', x: H.x, y: H.y, tx: t.x, ty: t.y, target: t, speed: 9 * TILE, dmg: st.abilityDmg, splash: def.ability.radius, air: true, wobble: 0, age: 0, src: 'hero' });
    Sound.play('rocket');
  }
  B.ab.hero = def.ability.cd;
}

function nearestEnemy(x, y, rangeTiles) {
  let best = null, bd = rangeTiles * TILE;
  for (const u of B.units) {
    if (u.hp <= 0) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

function updateSentries(dt) {
  for (const s of B.sentries) {
    s.life -= dt; s.cd -= dt;
    if (s.flash > 0) s.flash -= dt;
    if (!s.tgt || s.tgt.hp <= 0 || Math.hypot(s.tgt.x - s.x, s.tgt.y - s.y) > 4 * TILE) s.tgt = nearestEnemy(s.x, s.y, 4);
    if (s.tgt) {
      s.angle = Math.atan2(s.tgt.y - s.y, s.tgt.x - s.x);
      if (s.cd <= 0) {
        s.cd = 0.2; s.flash = 0.05;
        damageEnemy(s.tgt, s.dmg, 'hero');
        B.fx.push({ kind: 'tracer', x1: s.x, y1: s.y - 4, x2: s.tgt.x, y2: s.tgt.y - (s.tgt.air ? 18 : 2), life: 0.05, color: '#ffe08a' });
        Sound.play('mg');
      }
    }
  }
  B.sentries = B.sentries.filter(s => s.life > 0);
}

/* ---------------- Drawing ---------------- */
function drawHeroFigure(ctx, id, x, y, angle, aim, walk, moving, flash, white) {
  const def = HEROES[id];
  const r = id === 'heavy' ? 10 : 8;
  ctx.save(); ctx.translate(x, y);
  // command ring
  ctx.strokeStyle = 'rgba(242,182,50,0.85)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 3, r + 5, (r + 5) * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(2, 4, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(aim);
  const stride = moving ? Math.sin(walk) * r * 0.45 : 0;
  ctx.fillStyle = '#1e2414';
  ctx.beginPath(); ctx.ellipse(stride, -r * 0.35, r * 0.32, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-stride, r * 0.35, r * 0.32, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  // weapon
  ctx.fillStyle = '#17130f';
  if (id === 'heavy') { ctx.fillStyle = '#3c4148'; rr(ctx, -4, -9, 22, 5, 2); ctx.fill(); ctx.fillStyle = '#c8402a'; ctx.fillRect(16, -9, 3, 5); }
  else ctx.fillRect(r * 0.2, 0.5, 13, 2.4);
  // backpack
  ctx.fillStyle = id === 'engineer' ? '#7a5c3d' : '#3a4a26'; rr(ctx, -r * 1.05, -r * 0.5, r * 0.6, r, 2); ctx.fill();
  // torso
  ctx.fillStyle = white ? '#fff' : def.color; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r, 0, 0, Math.PI * 2); ctx.fill();
  if (id === 'engineer') { ctx.fillStyle = '#f2b632'; ctx.fillRect(-2, -r * 0.8, 3, r * 1.6); }
  // helmet + rank stripe
  ctx.fillStyle = id === 'heavy' ? '#2f3338' : '#2f3a1e'; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2b632'; ctx.fillRect(-1, -r * 0.5, 2, r);
  if (flash > 0) { ctx.fillStyle = '#e8ffb0'; ctx.beginPath(); ctx.arc(id === 'heavy' ? 21 : r * 0.2 + 15, id === 'heavy' ? -6.5 : 1.5, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawHero(ctx) {
  if (!B) return;
  for (const s of B.sentries) {
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(2, 4, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2b2e25'; ctx.lineWidth = 2;
    for (const a of [0.5, 2.6, 4.7]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 7 + 3); ctx.stroke(); }
    ctx.rotate(s.angle);
    ctx.fillStyle = '#23251e'; ctx.fillRect(2, -1.5, 13, 3);
    ctx.fillStyle = '#b8682a'; rr(ctx, -6, -5, 12, 10, 3); ctx.fill();
    if (s.flash > 0) { ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(16, 0, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    const k = s.life / HEROES.engineer.ability.life;
    ctx.fillStyle = 'rgba(16,18,12,0.8)'; ctx.fillRect(s.x - 9, s.y - 16, 18, 3);
    ctx.fillStyle = '#f2b632'; ctx.fillRect(s.x - 9, s.y - 16, 18 * k, 3);
  }
  const H = B.hero;
  if (!H || H.dead) return;
  if (H.dest) {
    ctx.strokeStyle = 'rgba(242,182,50,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(H.x, H.y); ctx.lineTo(H.dest.x, H.dest.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(H.dest.x, H.dest.y, 8 + Math.sin(tSec * 6) * 2, 0, Math.PI * 2); ctx.stroke();
  }
  drawHeroFigure(ctx, H.id, H.x, H.y, H.angle, H.aim, H.walk, H.moving, H.flash, H.hit > 0);
  const w = 26, y = H.y - 22;
  ctx.fillStyle = 'rgba(16,18,12,0.85)'; ctx.fillRect(H.x - w / 2 - 1, y - 1, w + 2, 5);
  ctx.fillStyle = '#7fbf4d'; ctx.fillRect(H.x - w / 2, y, w * Math.max(0, H.hp / H.max), 3);
  ctx.font = '9px "Black Ops One", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(HEROES[H.id].name.toUpperCase(), H.x + 1, y - 1);
  ctx.fillStyle = '#f2b632'; ctx.fillText(HEROES[H.id].name.toUpperCase(), H.x, y - 2);
}

function renderHeroPreview(id, px) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = px * dpr; c.height = px * dpr;
  c.style.width = px + 'px'; c.style.height = px + 'px';
  const g = c.getContext('2d');
  g.scale(dpr * px / 28, dpr * px / 28);
  drawHeroFigure(g, id, 14, 13, -0.6, -0.6, 1, false, 0, false);
  return c;
}

/* ---------------- Hero screen ---------------- */
function openHeroes() {
  const active = (S.heroes && S.heroes.active) || 'commando';
  const cards = Object.keys(HEROES).map(id => {
    const h = HEROES[id], st = heroState(id), ok = heroUnlocked(id), s2 = heroStats(id);
    const need = st.level < HERO_MAX ? heroXpFor(st.level) : 0;
    return `
      <div class="hero-card ${ok ? '' : 'locked'} ${id === active ? 'active' : ''}">
        <div class="hero-art" data-hero="${id}"></div>
        <div class="hero-body">
          <div class="hero-name">${h.name} <span class="hero-title">${h.title}</span></div>
          <div class="hero-lvl">Level ${st.level}${st.level < HERO_MAX ? ` <span class="hero-xp"><span style="width:${(st.xp / need * 100).toFixed(1)}%"></span></span>` : ' (max)'}</div>
          <div class="intel-note">${h.bio}</div>
          <div class="intel-stats"><span>HP ${s2.hp}</span><span>DPS ${Math.round(s2.dmg * s2.rate)}</span><span>Speed ${h.speed}</span></div>
          <div class="hero-ability"><b>${h.ability.name}:</b> ${h.ability.desc}</div>
        </div>
        <div class="hero-act">
          ${!ok ? `<span class="lock">${heroUnlockText(id)}</span>` : id === active ? '<span class="road-tag">Deployed</span>' : `<button class="btn" data-pick="${id}">Deploy</button>`}
        </div>
      </div>`;
  }).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Heroes</h2><span class="m-count">One hero fights in every battle</span></div>
      <p class="lead">Tap the map during battle to move your hero. Enemies stop to fight them, so park your hero at a choke point. Heroes earn experience from kills and come back 15 seconds after falling.</p>
      <div class="hero-list">${cards}</div>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`);
  $('#modal-body').querySelectorAll('[data-hero]').forEach(el => el.appendChild(renderHeroPreview(el.dataset.hero, 64)));
  $('#modal-body').querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', () => {
    heroState(btn.dataset.pick);
    S.heroes.active = btn.dataset.pick; save(); Sound.play('click');
    toast(`${HEROES[btn.dataset.pick].name} will lead your next battle`, 'good');
    openHeroes();
  }));
}
