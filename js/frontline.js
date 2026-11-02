// WarBreach — Update 2 "Iron Front": world map, surprise attacks, Firing Range, Workshop items,
// daily orders, monthly events, cosmetics, base layouts and endless-mode wave upgrades.
'use strict';

/* ---------------- Wave upgrades (endless) ---------------- */
function freshBonus() { return { dmgAll: 0, rate: 0, range: 0, troops: 0, hero: 0, loot: 0, cd: 1, dmgType: {}, antiAir: 0 }; }

function offerWaveCards() {
  const pool = WAVE_CARDS.slice();
  const pick = [];
  while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  B.paused = true;
  const el = $('#cards');
  el.innerHTML = `
    <div class="cards-box">
      <span class="stamp">Field upgrade</span>
      <h2>Choose one</h2>
      <div class="cards-row">${pick.map(c => `<button class="wcard" data-card="${c.id}"><b>${c.name}</b><span>${c.desc}</span></button>`).join('')}</div>
      ${B.cards.length ? `<div class="cards-have">Active: ${B.cards.map(id => WAVE_CARDS.find(c => c.id === id).name).join(', ')}</div>` : ''}
    </div>`;
  el.hidden = false;
  Sound.play('medal');
  el.querySelectorAll('[data-card]').forEach(b => b.addEventListener('click', () => pickWaveCard(b.dataset.card)));
}

function pickWaveCard(id) {
  const c = WAVE_CARDS.find(x => x.id === id);
  if (!c || !B) return;
  B.cards.push(id);
  if (c.apply) c.apply(B.bonus);
  if (c.now === 'repair') for (const b of S.buildings) if (!b._dead && !isPassive(b.type)) b._hp = Math.min(b._maxhp, b._hp + b._maxhp * 0.5);
  if (c.now === 'mines') for (const b of S.buildings) if (b.type === 'mine') b._dead = false;
  if (c.now === 'walls') for (const b of S.buildings) if ((b.type === 'wall' || b.type === 'gate') && !b._dead) { b._maxhp *= 1.6; b._hp *= 1.6; }
  if (c.now === 'platoon') { const p = heroSpawnPoint(); for (let i = 0; i < 6; i++) spawnTroop('rifle', p.x + (i % 3 - 1) * 16, p.y + Math.floor(i / 3) * 14, false, 0.2 * i); }
  $('#cards').hidden = true;
  B.paused = false;
  Sound.play('done');
  toast(`${c.name} active`, 'good');
}

/* ---------------- Factions ---------------- */
function currentFaction() {
  const k = weekKey();
  let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FACTIONS[h % FACTIONS.length];
}
function factionComposition(comp, n) {
  const f = B.faction;
  if (!f) return comp;
  const out = comp.map(g => {
    const e = ENEMIES[g.type];
    let c = g.count;
    if (f.airMul && e.air) c = Math.round(c * f.airMul);
    if (f.infMul && !e.air && !e.vehicle) c = Math.round(c * f.infMul);
    if (f.sapperMul && g.type === 'sapper') c = Math.max(1, c) * f.sapperMul;
    return { type: g.type, count: c };
  });
  if (f.earlyDozers && n >= 4) out.push({ type: 'bulldozer', count: Math.floor(n / 4) });
  if (f.airMul && n >= 4 && !out.some(g => g.type === 'drone')) out.push({ type: 'drone', count: Math.floor(n / 2) });
  return out;
}
function factionHp(type) {
  const f = B.faction, e = ENEMIES[type];
  if (!f) return 1;
  if (f.vehHp && e.vehicle) return f.vehHp;
  if (f.infHp && !e.air && !e.vehicle) return f.infHp;
  return 1;
}

/* ---------------- Stealth, jammers and supply trucks ---------------- */
function updateStealth(u) {
  u.revealed = false;
  for (const b of S.buildings) {
    if (b._dead || b.level < 1) continue;
    const d = DEFS[b.type];
    if (d.aura === 'range' && distToBuilding(u.x, u.y, b) <= d.auraRange) { u.revealed = true; return; }
    if ((d.dmg || d.guard) && !d.trap && distToBuilding(u.x, u.y, b) <= 2.5) { u.revealed = true; return; }
  }
  if (B.hero && !B.hero.dead && Math.hypot(B.hero.x - u.x, B.hero.y - u.y) < 3 * TILE) u.revealed = true;
}
function revealed(u) { return !ENEMIES[u.type].stealth || u.revealed; }
function jammedAt(x, y) {
  return B.units.some(u => u.hp > 0 && ENEMIES[u.type].jam && Math.hypot(u.x - x, u.y - y) <= ENEMIES[u.type].jam * TILE);
}
function supplyPulse(u, dt) {
  u.pulse = (u.pulse || 0) - dt;
  if (u.pulse > 0) return;
  u.pulse = 1;
  const r = ENEMIES[u.type].supplyAura * TILE;
  for (const o of B.units) {
    if (o === u || o.hp <= 0) continue;
    if (Math.hypot(o.x - u.x, o.y - u.y) <= r) { o.hp = Math.min(o.max, o.hp + o.max * 0.03); o.boostT = 1.2; }
  }
  B.fx.push({ kind: 'ring', x: u.x, y: u.y, r, life: 0.5, max: 0.5, color: '242,182,50' });
}

/* ---------------- Workshop items ---------------- */
function workshopLevel() { return S.buildings.filter(b => b.type === 'workshop').reduce((m, b) => Math.max(m, b.level), 0); }
function itemButtons() {
  return Object.keys(ITEMS).filter(k => (S.items[k] || 0) > 0).map(k => `
    <button class="dp dp-cmd dp-item" data-dp="item:${k}" aria-label="${ITEMS[k].name}"><span class="dp-ico">${ITEM_ICONS[k]}</span><span class="dp-l">${ITEMS[k].name.split(' ')[0]}</span><span class="dp-n">${S.items[k]}</span></button>`).join('');
}
const ITEM_ICONS = {
  minekit: '<svg viewBox="0 0 20 20"><circle cx="10" cy="11" r="6" fill="currentColor"/><path d="M10 2v4M4 5l2 2M16 5l-2 2" stroke="currentColor" stroke-width="1.8"/></svg>',
  medkit: '<svg viewBox="0 0 20 20"><rect x="3" y="5" width="14" height="11" rx="2" fill="currentColor"/><path d="M10 7.5v6M7 10.5h6" stroke="#1b2016" stroke-width="2"/></svg>',
  overdrive: '<svg viewBox="0 0 20 20"><path d="M11 1L4 11h5l-1 8 8-11h-5z" fill="currentColor"/></svg>',
  sandbags: '<svg viewBox="0 0 20 20"><ellipse cx="6" cy="14" rx="4.5" ry="2.8" fill="currentColor"/><ellipse cx="14" cy="14" rx="4.5" ry="2.8" fill="currentColor"/><ellipse cx="10" cy="9" rx="4.5" ry="2.8" fill="currentColor"/></svg>',
  smokepot: '<svg viewBox="0 0 20 20"><circle cx="7" cy="11" r="4.5" fill="currentColor"/><circle cx="13" cy="9" r="5" fill="currentColor"/></svg>',
  fuelbomb: '<svg viewBox="0 0 20 20"><path d="M10 2c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z" fill="currentColor"/></svg>',
};

function useItem(k) {
  if (!B || (S.items[k] || 0) <= 0) { Sound.play('error'); return; }
  if (k === 'fuelbomb') {
    B.targeting = B.targeting === 'item:fuelbomb' ? null : 'item:fuelbomb';
    document.body.classList.toggle('targeting', !!B.targeting);
    if (B.targeting) banner('Fuel Bomb', 'Tap the map to drop it');
    return;
  }
  S.items[k]--;
  if (k === 'minekit') { let n = 0; for (const b of S.buildings) if (b.type === 'mine' && b._dead) { b._dead = false; n++; } toast(`${n} mine${n === 1 ? '' : 's'} re-armed`, 'good'); }
  else if (k === 'medkit') {
    for (const t of B.troops) t.hp = Math.min(t.max, t.hp + t.max * 0.6);
    if (B.hero && !B.hero.dead) B.hero.hp = Math.min(B.hero.max, B.hero.hp + B.hero.max * 0.6);
    Sound.play('heal'); toast('Med kits handed out', 'good');
  } else if (k === 'overdrive') { B.overdrive = 15; Sound.play('zap'); toast('Overdrive: defenses fire 50% faster', 'good'); }
  else if (k === 'sandbags') {
    for (const b of S.buildings) if ((b.type === 'wall' || b.type === 'gate') && !b._dead) b._hp = Math.min(b._maxhp, b._hp + b._maxhp * 0.5);
    Sound.play('build'); toast('Walls reinforced', 'good');
  } else if (k === 'smokepot') { dropSmoke(heroSpawnPoint()); }
  save();
}

function fireItemAt(k, w) {
  B.targeting = null;
  document.body.classList.remove('targeting');
  $('#banner').hidden = true;
  if (jammedAt(w.x, w.y)) { toast('Signal jammed. Destroy the Jammer Truck first', 'bad'); Sound.play('error'); return; }
  S.items[k]--;
  const dmg = 500 + Math.max(1, B.wave) * 40;
  splashDamage(w.x, w.y, 2.6, dmg, false, 'fuelbomb');
  explosion(w.x, w.y, 70); explosion(w.x + 20, w.y + 10, 40);
  for (let i = 0; i < 20; i++) particles.push({ x: w.x + (Math.random() - 0.5) * 80, y: w.y + (Math.random() - 0.5) * 60, vx: 0, vy: -20, g: 0, life: 1.2, max: 1.2, r: 6, grow: 10, color: '#ff8a3a', glow: true });
  Sound.play('bigboom'); buzz([60, 40, 80]); save();
}

function itemStatus(k) {
  const it = ITEMS[k], wl = workshopLevel();
  if (wl < 1) return { ok: false, reason: 'Build a Workshop' };
  if (hqLevel() < it.hq) return { ok: false, locked: true, reason: `Command Center ${it.hq}` };
  if ((S.items[k] || 0) + craftQueued(k) >= itemCap(wl)) return { ok: false, reason: `Carrying the most (${itemCap(wl)})` };
  if (!canAfford(costOfItem(it))) return { ok: false, reason: 'Not enough resources' };
  return { ok: true };
}
function costOfItem(it) { return { gold: it.cost.gold || 0, steel: it.cost.steel || 0, oil: it.cost.oil || 0 }; }
function craftQueued(k) { return (S.craft || []).filter(c => c.k === k).length; }
function craftItem(k) {
  const st = itemStatus(k);
  if (!st.ok) { toast(st.reason, 'bad'); Sound.play('error'); return; }
  pay(costOfItem(ITEMS[k]));
  if (!S.craft) S.craft = [];
  const now = Date.now(), last = S.craft.length ? S.craft[S.craft.length - 1].end : now;
  const speed = 1 + workshopLevel() * 0.15;
  S.craft.push({ k, end: Math.max(now, last) + ITEMS[k].time * 1000 / speed });
  Sound.play('build'); save(); openWorkshop();
}
function processCrafting(now) {
  if (!S.craft || !S.craft.length) return;
  let done = false;
  while (S.craft.length && now >= S.craft[0].end) { const c = S.craft.shift(); S.items[c.k] = (S.items[c.k] || 0) + 1; done = true; }
  if (done && !B) { Sound.play('done'); if (!modal.hidden && $('#workshop-ui')) openWorkshop(); }
}
function openWorkshop() {
  const rows = Object.keys(ITEMS).map(k => {
    const it = ITEMS[k], st = itemStatus(k);
    return `<div class="qm ${st.locked ? 'locked' : ''}">
      <div class="ws-ico">${ITEM_ICONS[k]}</div>
      <div class="qm-name">${it.name}</div>
      <div class="qm-desc">${it.desc}</div>
      <div class="qm-active">Carrying ${S.items[k] || 0}${craftQueued(k) ? ` · ${craftQueued(k)} in production` : ''}</div>
      <button class="btn ${st.ok ? '' : 'off'}" data-craft="${k}"><span class="btn-main">${st.locked ? 'Locked' : 'Craft'}</span><span class="btn-sub">${st.ok || st.reason === 'Not enough resources' ? costHTML(costOfItem(it)) : st.reason}</span></button>
    </div>`;
  }).join('');
  const q = (S.craft || []).map((c, i) => `<span class="ws-q">${ITEMS[c.k].name}${i === 0 ? ` · ${fmtTime((c.end - Date.now()) / 1000)}` : ''}</span>`).join('');
  openModal(`
    <div class="settings" id="workshop-ui">
      <div class="m-head"><h2>Workshop</h2><span class="m-count">Level ${workshopLevel()} · carry up to ${itemCap(workshopLevel())} of each</span></div>
      <p class="lead">Craft consumables between battles. In battle they appear in the deploy bar. Upgrade the Workshop to craft faster and carry more.</p>
      ${q ? `<div class="q-row"><span class="q-label">In production</span>${q}</div>` : ''}
      <div class="qm-grid">${rows}</div>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`);
  $('#modal-body').querySelectorAll('[data-craft]').forEach(b => b.addEventListener('click', () => craftItem(b.dataset.craft)));
}

/* ---------------- Daily orders ---------------- */
function orders() {
  const today = dayKey();
  if (!S.orders || S.orders.date !== today) {
    const r = mulberry(dailySeed() + 991);
    const pool = ORDER_TYPES.slice(), list = [];
    while (list.length < 3) {
      const t = pool.splice(Math.floor(r() * pool.length), 1)[0];
      const tier = Math.min(2, Math.floor(r() * 3));
      list.push({ id: t.id, target: t.n[tier], progress: 0, claimed: false, reward: t.reward + tier * 2 });
    }
    S.orders = { date: today, list };
  }
  return S.orders;
}
function orderEvent(id, n) {
  if (typeof S === 'undefined' || !S || (B && B.practice)) return;
  for (const o of orders().list) if (o.id === id && !o.claimed) o.progress = Math.min(o.target, o.progress + n);
}
function ordersClaimable() { return orders().list.filter(o => !o.claimed && o.progress >= o.target).length; }
function openOrders() {
  const rows = orders().list.map((o, i) => {
    const t = ORDER_TYPES.find(x => x.id === o.id), done = o.progress >= o.target;
    return `<li class="mission ${done && !o.claimed ? 'ready' : ''}">
      <div class="m-body"><div class="m-text">${t.text(o.target)}</div>
        <div class="m-bar"><div style="width:${(o.progress / o.target * 100).toFixed(1)}%"></div></div>
        <div class="m-prog">${fmt(o.progress)} / ${fmt(o.target)}</div></div>
      <div class="m-reward">${rewardText({ medals: o.reward })} <span class="cost">+3 stars</span></div>
      ${o.claimed ? '<span class="road-tag">Done</span>' : done ? `<button class="btn" data-order="${i}">Claim</button>` : ''}
    </li>`;
  }).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Daily orders</h2><div class="tabs"><button class="tab" id="tab-missions2">Missions</button><button class="tab" id="tab-ach2">Achievements</button><button class="tab on">Daily orders</button></div></div>
      <p class="lead">Three new orders every day. Each pays medals and War Chest stars.</p>
      <ul class="missions">${rows}</ul>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`);
  $('#tab-missions2').addEventListener('click', openMissions);
  $('#tab-ach2').addEventListener('click', openAchievements);
  $('#modal-body').querySelectorAll('[data-order]').forEach(b => b.addEventListener('click', () => {
    const o = orders().list[+b.dataset.order];
    if (o.claimed || o.progress < o.target) return;
    o.claimed = true; S.medals += o.reward; awardChestStars(3); eventTokens(5);
    Sound.play('medal'); toast('Order complete', 'good'); save(); openOrders();
  }));
}

/* ---------------- Monthly event ---------------- */
function currentEvent() {
  const d = new Date();
  const ev = EVENTS[(d.getFullYear() * 12 + d.getMonth()) % EVENTS.length];
  const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
  if (!S.event || S.event.key !== key) S.event = { key, tokens: 0, bought: [] };
  return ev;
}
function eventTokens(n) {
  if (!n || (B && B.practice)) return;
  currentEvent();
  S.event.tokens += n;
}
function eventItemInfo(id) {
  const [kind, val] = id.includes(':') ? id.split(':') : ['deco', id];
  if (kind === 'skin') return { kind, val, name: `${HQ_SKINS[val].name} HQ skin`, price: EVENT_PRICES.skin };
  if (kind === 'flag') return { kind, val, name: `${FLAGS[val].name} flag`, price: EVENT_PRICES.flag };
  return { kind: 'deco', val, name: DEFS[val].name, price: EVENT_PRICES.deco };
}
function openEvent() {
  const ev = currentEvent();
  const items = [...ev.shop, 'medals'].map(id => {
    if (id === 'medals') return `<div class="qm"><div class="qm-name">Medal Pouch</div><div class="qm-desc">+10 medals. Can be bought again.</div>
      <button class="btn ${S.event.tokens >= EVENT_PRICES.medals ? '' : 'off'}" data-ev="medals"><span class="btn-main">Buy</span><span class="btn-sub">${EVENT_PRICES.medals} tokens</span></button></div>`;
    const info = eventItemInfo(id), got = S.event.bought.includes(id) || (info.kind !== 'deco' && S.cosmetic.owned.includes(`${info.kind === 'skin' ? 'hq' : 'flag'}:${info.val}`));
    return `<div class="qm"><div class="qm-name">${info.name}</div><div class="qm-desc">${info.kind === 'deco' ? 'Exclusive decoration, placed from the Decor tab' : 'Exclusive cosmetic, equipped in Wardrobe'}</div>
      ${got ? '<span class="road-tag">Owned</span>' : `<button class="btn ${S.event.tokens >= info.price ? '' : 'off'}" data-ev="${id}"><span class="btn-main">Buy</span><span class="btn-sub">${info.price} tokens</span></button>`}</div>`;
  }).join('');
  const d = new Date(), end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  openModal(`
    <div class="settings">
      <div class="m-head"><div><span class="stamp" style="color:${ev.color};border-color:${ev.color}">Event</span><h2>${ev.name}</h2></div><span class="m-count">${S.event.tokens} tokens · ends in ${Math.ceil((end - d) / 86400000)} days</span></div>
      <p class="lead">Earn event tokens from kills, cleared waves, missions and daily orders. Spend them on exclusive items before the month ends.</p>
      <div class="qm-grid">${items}</div>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`);
  $('#modal-body').querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.ev;
    if (id === 'medals') {
      if (S.event.tokens < EVENT_PRICES.medals) { toast('Not enough tokens', 'bad'); return; }
      S.event.tokens -= EVENT_PRICES.medals; S.medals += 10;
    } else {
      const info = eventItemInfo(id);
      if (S.event.tokens < info.price) { toast('Not enough tokens', 'bad'); Sound.play('error'); return; }
      S.event.tokens -= info.price; S.event.bought.push(id);
      if (info.kind === 'deco') { S.unlockedDeco = S.unlockedDeco || []; S.unlockedDeco.push(info.val); }
      else S.cosmetic.owned.push(`${info.kind === 'skin' ? 'hq' : 'flag'}:${info.val}`);
      toast(`${info.name} unlocked`, 'good');
    }
    Sound.play('medal'); save(); openEvent();
  }));
}

/* ---------------- Cosmetics: Wardrobe ---------------- */
function openWardrobe() {
  const C = S.cosmetic;
  const group = (title, key, defs) => `<h3 class="report-h">${title}</h3><div class="wd-row">${Object.keys(defs).map(id => {
    const own = C.owned.includes(`${key}:${id}`), on = C[key] === id, d = defs[id];
    const sw = d.roof || d.color || '#55703a';
    return `<button class="wd ${on ? 'on' : ''} ${own ? '' : 'locked'}" data-wd="${key}:${id}"><span class="wd-sw" style="background:${sw}"></span><b>${d.name}</b><span>${on ? 'Equipped' : own ? 'Owned' : d.price ? `${d.price} medals` : 'Event'}</span></button>`;
  }).join('')}</div>`;
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Wardrobe</h2><span class="m-count">${ICON.medal} ${S.medals}</span></div>
      ${group('Command Center skin', 'hq', HQ_SKINS)}
      ${group('Flag', 'flag', FLAGS)}
      ${group('Troop camo', 'camo', CAMO)}
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`);
  $('#modal-body').querySelectorAll('[data-wd]').forEach(b => b.addEventListener('click', () => {
    const [key, id] = b.dataset.wd.split(':');
    const defs = key === 'hq' ? HQ_SKINS : key === 'flag' ? FLAGS : CAMO;
    if (!C.owned.includes(`${key}:${id}`)) {
      const price = defs[id].price;
      const eventOnly = EVENTS.some(e => e.shop.includes(`${key === 'hq' ? 'skin' : key}:${id}`));
      if (eventOnly && (key === 'hq' ? false : false)) return;
      if (S.medals < price) { toast(`You need ${price} medals`, 'bad'); Sound.play('error'); return; }
      S.medals -= price; C.owned.push(`${key}:${id}`);
    }
    C[key] = id; Sound.play('click'); save(); openWardrobe();
  }));
}

/* ---------------- Base layouts and edit mode ---------------- */
function saveLayout(i) {
  const pos = {};
  for (const b of S.buildings) pos[b.id] = [b.x, b.y];
  S.layouts[i] = { name: `Layout ${i + 1}`, saved: Date.now(), pos };
  save(); toast(`Saved to layout ${i + 1}`, 'good'); openLayouts();
}
function loadLayout(i) {
  const L = S.layouts[i];
  if (!L) return;
  // place buildings that appear in the layout, then fit any newer ones around them
  const placed = [], rest = [];
  for (const b of S.buildings) (L.pos[b.id] ? placed : rest).push(b);
  for (const b of placed) { b.x = L.pos[b.id][0]; b.y = L.pos[b.id][1]; }
  rebuildGrid();
  for (const b of rest) {
    if (!footprintFree(b.type, b.x, b.y, b.id)) {
      const sp = nearestFree(b.type, b.x, b.y);
      if (sp) { b.x = sp.x; b.y = sp.y; rebuildGrid(); }
    }
  }
  rebuildGrid(); save(); closeModal(); toast(`Layout ${i + 1} applied`, 'good');
}
function openLayouts() {
  const slots = [0, 1, 2].map(i => {
    const L = S.layouts[i];
    return `<div class="qm"><div class="qm-name">Layout ${i + 1}</div><div class="qm-desc">${L ? `Saved ${new Date(L.saved).toLocaleDateString()}` : 'Empty'}</div>
      <div class="settings-row"><button class="btn ghost" data-lsave="${i}">Save current</button>${L ? `<button class="btn" data-lload="${i}">Load</button>` : ''}</div></div>`;
  }).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Base layouts</h2><span class="m-count">Up to 3</span></div>
      <p class="lead">Save your current arrangement and switch between layouts, for example one for air raids and one for armored waves. <b>Edit mode</b> lets you drag buildings around directly, one after another, without opening menus.</p>
      <div class="qm-grid">${slots}</div>
      <div class="settings-row"><button class="btn ${editMode ? '' : 'ghost'}" id="btn-editmode">${editMode ? 'Leave edit mode' : 'Enter edit mode'}</button><button class="btn" data-close>Done</button></div>
    </div>`);
  $('#modal-body').querySelectorAll('[data-lsave]').forEach(b => b.addEventListener('click', () => saveLayout(+b.dataset.lsave)));
  $('#modal-body').querySelectorAll('[data-lload]').forEach(b => b.addEventListener('click', () => loadLayout(+b.dataset.lload)));
  $('#btn-editmode').addEventListener('click', () => { setEditMode(!editMode); closeModal(); });
}
let editMode = false;
function setEditMode(on) {
  editMode = on;
  document.body.classList.toggle('edit-mode', on);
  if (on) { select(null); toast('Edit mode: drag any building to move it. Tap Done when finished', 'info'); }
  $('#edit-done').hidden = !on;
}

/* ---------------- Surprise attacks while away ---------------- */
function checkSurpriseAttack(awayMs) {
  const now = Date.now();
  if (awayMs < SURPRISE.minAway || (S.lastSurprise && now - S.lastSurprise < SURPRISE.cooldown) || S.tut < 99) return;
  if (Math.random() > SURPRISE.chance) return;
  S.lastSurprise = now;
  // compare your firepower against a raid sized for your Command Center
  const r = defenseRating();
  const troopPower = Object.keys(TROOPS).reduce((a, t) => a + troopCount(t) * TROOPS[t].dmg * (TROOPS[t].rate || 1), 0) * 0.3;
  const power = r.dps + troopPower + r.walls * 2;
  const threat = 45 * Math.pow(hqLevel(), 1.6);
  const ratio = power / threat;
  const won = ratio >= 1 || Math.random() < ratio * 0.8;
  const cap = storageCap();
  let report;
  if (won) {
    const g = Math.round(Math.min(cap - S.gold, 80 * hqLevel() + 40) / 10) * 10, st2 = Math.round(Math.min(cap - S.steel, 60 * hqLevel() + 30) / 10) * 10;
    S.gold += Math.max(0, g); S.steel += Math.max(0, st2);
    S.stats.kills = (S.stats.kills || 0) + 6 + hqLevel() * 2;
    report = { won, gold: g, steel: st2 };
  } else {
    const lossFrac = Math.min(0.15, 0.06 + (1 - ratio) * 0.1);
    const g = Math.floor(S.gold * lossFrac), st2 = Math.floor(S.steel * lossFrac);
    S.gold -= g; S.steel -= st2;
    report = { won, gold: -g, steel: -st2 };
  }
  S.pendingReport = report;
  save();
}
function showSurpriseReport() {
  const r = S.pendingReport;
  if (!r) return false;
  S.pendingReport = null; save();
  openModal(`
    <div class="brief">
      <div class="brief-head">
        <span class="stamp">While you were away</span>
        <h2>${r.won ? 'Raid repelled' : 'Raiders broke through'}</h2>
        <p>${r.won ? 'A raiding party hit the base while you were gone. Your defenses drove them off and collected what they left behind.' : 'A raiding party slipped past your defenses and made off with some supplies. More firepower, troops and walls will stop the next one.'}</p>
      </div>
      <ul class="units">
        <li><span>Gold</span><b>${r.gold >= 0 ? '+' : ''}${fmt(r.gold)}</b></li>
        <li><span>Steel</span><b>${r.steel >= 0 ? '+' : ''}${fmt(r.steel)}</b></li>
      </ul>
      <div class="brief-foot"><span class="soon">Surprise attacks happen at most once every six hours.</span><button class="btn" data-close>Understood</button></div>
    </div>`);
  return true;
}

/* ---------------- Firing Range ---------------- */
let rangePick = {};
function openFiringRange() {
  const types = Object.keys(ENEMIES).filter(t => !ENEMIES[t].raidBoss);
  const rows = types.map(t => `<div class="fr"><span class="fr-art" data-type="${t}"></span><span class="fr-name">${ENEMIES[t].name}</span>
    <button class="fr-b" data-fr="${t}" data-d="-1">-</button><b class="fr-n">${rangePick[t] || 0}</b><button class="fr-b" data-fr="${t}" data-d="1">+</button></div>`).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Firing Range</h2><span class="m-count">Practice: no rewards, no losses</span></div>
      <p class="lead">Pick any mix of enemies and watch how your layout copes. Toughness matches your Command Center level. Your troops are not used, and nothing is lost.</p>
      <div class="fr-grid">${rows}</div>
      <div class="settings-row"><button class="btn battle-go" id="btn-fr-go">Start practice</button><button class="btn ghost" id="btn-fr-clear">Clear</button><button class="btn ghost" data-close>Back</button></div>
    </div>`);
  $('#modal-body').querySelectorAll('.fr-art').forEach(el => el.appendChild(renderEnemyPreview(el.dataset.type, 26)));
  $('#modal-body').querySelectorAll('[data-fr]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.fr; rangePick[t] = clamp((rangePick[t] || 0) + +b.dataset.d, 0, ENEMIES[t].boss ? 2 : 30);
    b.parentElement.querySelector('.fr-n').textContent = rangePick[t];
  }));
  $('#btn-fr-clear').addEventListener('click', () => { rangePick = {}; openFiringRange(); });
  $('#btn-fr-go').addEventListener('click', () => {
    const wave = Object.keys(rangePick).filter(t => rangePick[t] > 0).map(t => ({ type: t, count: rangePick[t] }));
    if (!wave.length) { toast('Add at least one enemy', 'bad'); return; }
    startBattle({ id: 'practice', practice: true, name: 'Firing Range', hq: hqLevel(), level: Math.max(1, hqLevel() * 2 - 1), gates: ['w', 'e', 'n'], mods: {}, waves: [wave], reward: {} });
  });
}

/* ---------------- World map ---------------- */
function worldState() { if (!S.world) S.world = { owned: {}, contested: null }; return S.world; }
function outpostIncome(o, hours) {
  const out = {};
  for (const k in o.income) out[k] = Math.floor(o.income[k] * hours);
  return out;
}
function worldPending() {
  const W = worldState(), now = Date.now(), out = { gold: 0, steel: 0, oil: 0 };
  for (const id in W.owned) {
    const o = OUTPOSTS.find(x => x.id === id);
    const hrs = Math.min(24, (now - W.owned[id].last) / 3600000);
    const inc = outpostIncome(o, hrs);
    for (const k in inc) out[k] += inc[k];
  }
  return out;
}
function collectWorld() {
  const W = worldState(), p = worldPending(), cap = storageCap();
  for (const k in p) S[k] = Math.min(cap, (S[k] || 0) + p[k]);
  for (const id in W.owned) W.owned[id].last = Date.now();
  toast(`Collected ${fmt(p.gold)} gold, ${fmt(p.steel)} steel${p.oil ? `, ${fmt(p.oil)} oil` : ''} from your outposts`, 'good');
  Sound.play('collect'); save(); openWorldMap();
}
// The enemy counter-attacks one of your outposts now and then; defend it or lose it.
function updateWorld(now) {
  const W = worldState();
  if (W.contested && now > W.contested.until) {
    delete W.owned[W.contested.id];
    toast(`${OUTPOSTS.find(o => o.id === W.contested.id).name} has fallen to the enemy`, 'bad');
    W.contested = null; save();
  }
  const ids = Object.keys(W.owned);
  if (!W.contested && ids.length && (!W.nextCounter || now > W.nextCounter)) {
    if (W.nextCounter) {
      const id = ids[Math.floor(Math.random() * ids.length)];
      W.contested = { id, until: now + 24 * 3600000 };
      toast(`${OUTPOSTS.find(o => o.id === id).name} is under attack! Defend it from the world map`, 'bad');
    }
    W.nextCounter = now + (20 + Math.random() * 16) * 3600000;
    save();
  }
}
function outpostMission(o, defend) {
  const L = o.level, pool = L < 5 ? ['rifleman', 'grenadier', 'moto', 'jeep', 'sapper'] : L < 10 ? ['rifleman', 'grenadier', 'jeep', 'tank', 'medic', 'drone', 'apc'] : ['heavy', 'tank', 'apc', 'heli', 'artillery', 'bulldozer', 'stealth', 'supply'];
  const waves = [];
  for (let w = 0; w < 4; w++) waves.push(pool.map((t, i) => ({ type: t, count: Math.max(1, Math.round((ENEMIES[t].hp > 400 ? 1 : 4) * (0.7 + w * 0.4) * (1 + i * 0.05))) })));
  if (L >= 8) waves[3].push({ type: 'siege', count: 1 });
  return { id: 'outpost-' + o.id, outpost: o.id, defend, name: `${defend ? 'Defend' : 'Capture'} ${o.name}`, hq: o.hq, level: L, gates: ['w', 'e', 'n'], mods: {}, waves,
    brief: defend ? `The enemy is counter-attacking ${o.name}. Hold all four waves to keep the outpost.` : `Take ${o.name} by breaking the garrison's counter-attack. Once captured it pays income every hour.`,
    reward: { gold: 300 * L, steel: 200 * L } };
}
function openWorldMap() {
  const W = worldState(), p = worldPending();
  const pins = OUTPOSTS.map((o, i) => {
    const own = !!W.owned[o.id], contested = W.contested && W.contested.id === o.id;
    const open = i === 0 || W.owned[OUTPOSTS[i - 1].id] || own;
    return `<button class="wpin ${own ? 'own' : ''} ${contested ? 'contested' : ''} ${open ? '' : 'locked'}" style="left:${o.x}%;top:${o.y}%" data-op="${o.id}">
      <span class="wpin-dot"></span><span class="wpin-name">${o.name}</span><span class="wpin-meta">${contested ? 'Under attack' : own ? 'Captured' : `HQ ${o.hq}+`}</span></button>`;
  }).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>World map</h2><span class="m-count">${Object.keys(W.owned).length} / ${OUTPOSTS.length} outposts</span></div>
      <div class="wmap">
        <svg class="wmap-bg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 70 C20 60 30 80 50 72 S80 50 100 58" stroke="rgba(110,160,190,0.5)" stroke-width="2.5" fill="none"/>
          <path d="M${OUTPOSTS.map(o => `${o.x} ${o.y}`).join(' L')}" stroke="rgba(242,182,50,0.45)" stroke-width="0.6" stroke-dasharray="1.5 1.5" fill="none"/>
        </svg>
        <span class="wmap-home" style="left:6%;top:44%">Your base</span>
        ${pins}
      </div>
      <div class="settings-row">
        <button class="btn ${p.gold + p.steel + p.oil > 0 ? '' : 'off'}" id="btn-wcollect"><span class="btn-main">Collect income</span><span class="btn-sub">${rewardText(p) || 'Nothing yet'}</span></button>
        <button class="btn" data-close>Done</button>
      </div>
    </div>`);
  $('#btn-wcollect').addEventListener('click', () => { if (p.gold + p.steel + p.oil > 0) collectWorld(); });
  $('#modal-body').querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', () => {
    const i = OUTPOSTS.findIndex(o => o.id === b.dataset.op), o = OUTPOSTS[i];
    const own = !!W.owned[o.id], contested = W.contested && W.contested.id === o.id;
    if (!(i === 0 || W.owned[OUTPOSTS[i - 1].id] || own)) { toast('Capture the previous outpost first', 'bad'); return; }
    if (own && !contested) { toast(`${o.name} is yours. It pays ${rewardText(o.income).replace(/<[^>]+>/g, ' ')} per hour`, 'info'); return; }
    const m = outpostMission(o, contested);
    openOutpostBrief(m, o);
  }));
}
function openOutpostBrief(m, o) {
  const enemies = {};
  for (const w of m.waves) for (const g of w) enemies[g.type] = (enemies[g.type] || 0) + g.count;
  openModal(`
    <div class="brief">
      <div class="brief-head"><span class="stamp">${m.defend ? 'Counter-attack' : 'Outpost assault'}</span><h2>${m.name}</h2><p>${m.brief}</p></div>
      <div class="brief-cols">
        <div><h3>Enemy forces</h3><ul class="units">${Object.keys(enemies).map(t => `<li><span>${ENEMIES[t].name}</span><b>&times;${enemies[t]}</b></li>`).join('')}</ul></div>
        <div><h3>Income once held</h3><ul class="units">${Object.keys(o.income).map(k => `<li><span>${k[0].toUpperCase() + k.slice(1)}</span><b>+${o.income[k]}/hour</b></li>`).join('')}</ul></div>
      </div>
      <div class="brief-foot"><button class="btn battle-go" id="btn-op-go">Deploy</button><span class="soon">${hqLevel() < o.hq ? `Recommended: Command Center ${o.hq}.` : 'The fight happens at your base.'}</span><button class="btn ghost" id="btn-op-back">World map</button></div>
    </div>`);
  $('#btn-op-go').addEventListener('click', () => startBattle(m));
  $('#btn-op-back').addEventListener('click', openWorldMap);
}
// Called from endMission when an outpost battle is won.
function outpostWon(m) {
  const W = worldState();
  if (!W.owned[m.outpost]) W.owned[m.outpost] = { last: Date.now() };
  if (W.contested && W.contested.id === m.outpost) W.contested = null;
  save();
}

/* ---------------- Operations hub (one button for all the extra screens) ---------------- */
function openHub() {
  const ev = currentEvent();
  const W = worldState();
  const tiles = [
    { id: 'heroes', name: 'Heroes', sub: 'Skills and gear', dot: Object.keys(HEROES).some(id => heroUnlocked(id) && skillPoints(id) > 0), fn: openHeroes },
    { id: 'world', name: 'World map', sub: `${Object.keys(W.owned).length}/${OUTPOSTS.length} outposts${W.contested ? ' · under attack!' : ''}`, dot: !!W.contested, fn: openWorldMap },
    { id: 'event', name: ev.name, sub: `${S.event.tokens} event tokens`, fn: openEvent },
    { id: 'chest', name: 'War Chest', sub: `Tier ${chestTierReached()} of ${CHEST_TIERS}`, dot: chestClaimable() > 0, fn: openChest },
    { id: 'supply', name: 'Daily supply', sub: loginClaimable() ? 'Ready to claim' : 'Claimed today', dot: loginClaimable(), fn: openLogin },
    { id: 'range', name: 'Firing Range', sub: 'Practice with any enemy', fn: openFiringRange },
    { id: 'workshop', name: 'Workshop', sub: workshopLevel() ? 'Craft battle items' : 'Build a Workshop (HQ 3)', fn: () => { if (workshopLevel()) openWorkshop(); else toast('Build a Workshop first (Army tab, Command Center 3)', 'info'); } },
    { id: 'arsenal', name: 'Arsenal', sub: loadout().map(k => ABILITIES[k].short).join(', '), fn: () => openArsenal(null) },
    { id: 'quarter', name: 'Quartermaster', sub: `${S.medals} medals`, fn: openQuartermaster },
    { id: 'wardrobe', name: 'Wardrobe', sub: 'Skins, flags and camo', fn: openWardrobe },
    { id: 'layouts', name: 'Layouts', sub: 'Save and edit your base', fn: openLayouts },
    { id: 'guide', name: 'Enemy guide', sub: `${Object.keys(ENEMIES).length} unit types`, fn: () => openFieldGuide(false) },
  ];
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Operations</h2><span class="m-count">${B ? '' : S.name}</span></div>
      <div class="hub-grid">${tiles.map(t => `<button class="hub ${t.dot ? 'has-dot' : ''}" data-hub="${t.id}"><b>${t.name}</b><span>${t.sub}</span></button>`).join('')}</div>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`);
  $('#modal-body').querySelectorAll('[data-hub]').forEach(b => b.addEventListener('click', () => { Sound.play('click'); tiles.find(t => t.id === b.dataset.hub).fn(); }));
}

/* ---------------- Accessibility ---------------- */
function applyAccessibility() {
  const st = S.settings;
  document.body.classList.toggle('bigtext', !!st.bigtext);
  document.body.classList.toggle('lefty', !!st.lefty);
  document.body.classList.toggle('colorblind', !!st.colorblind);
  // enemies switch from red-brown to a purple palette that stands apart from green for colorblind players
  if (st.colorblind) Object.assign(ENEMY_COL, { body: '#6a3f9a', dark: '#3d2160', helmet: '#2a1844', hull: '#5a4a7a', hullDark: '#3a2f52' });
  else Object.assign(ENEMY_COL, { body: '#7a3424', dark: '#4a1d14', helmet: '#3a1610', hull: '#6b4a3a', hullDark: '#43302a' });
  INFANTRY_LOOK.rifleman.body = ENEMY_COL.body; INFANTRY_LOOK.rifleman.helmet = ENEMY_COL.helmet;
}

/* ---------------- What's new in 2.0 ---------------- */
const WHATS_NEW_2 = [
  ['Armory', 'Upgrade each troop type separately'],
  ['Four new troops', 'Flame Squad, Combat Engineer, Mortar Team, Attack Helicopter'],
  ['Troop stances', 'Hold, Attack or Guard your hero'],
  ['Guard Posts', 'Free soldiers rush out when enemies get close'],
  ['Hero skills and gear', 'Spend skill points and equip gear from raids'],
  ['New hero', 'Spc. Ryo, the Drone Operator'],
  ['Wave upgrades', 'Pick one of three upgrades every five endless waves'],
  ['Gates and watchtowers', 'Tougher gates and one-tile marksman towers'],
  ['New enemies', 'Bulldozers, Stealth Commandos, Jammer and Supply Trucks'],
  ['Factions', 'A different enemy army each week'],
  ['Sky Fortress', 'A flying raid boss that alternates with the Behemoth'],
  ['Surprise attacks', 'Raiders may hit your base while you are away'],
  ['Firing Range', 'Practice against any enemies, no risk'],
  ['Oil', 'A third resource from Oil Derricks'],
  ['World map', 'Capture outposts for hourly income'],
  ['Layouts and edit mode', 'Save three layouts and drag buildings freely'],
  ['Workshop', 'Craft battle items like Med Kits and Fuel Bombs'],
  ['Daily orders', 'Three new goals every day'],
  ['Monthly events', 'Event tokens and an exclusive shop'],
  ['Wardrobe', 'Command Center skins, flags and troop camo'],
  ['Music and accessibility', 'A soundtrack, volume sliders, colorblind mode, large text, left-handed layout'],
];
function maybeShowWhatsNew2() {
  if (S.seenUpdate2 === UPDATE2_VERSION) return false;
  const fresh = S.tut != null && S.tut < 99;
  S.seenUpdate2 = UPDATE2_VERSION; S.seenUpdate = UPDATE_VERSION; save();
  if (fresh) return false;
  openModal(`
    <div class="settings">
      <div class="m-head"><div><span class="stamp">Update ${UPDATE2_VERSION}</span><h2>Iron Front</h2></div></div>
      <p class="lead">Most new screens live under the <b>Operations</b> button (the compass in the top bar).</p>
      <ul class="whats-new">${WHATS_NEW_2.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('')}</ul>
      <div class="settings-row"><button class="btn" data-close>To the front</button></div>
    </div>`);
  return true;
}
