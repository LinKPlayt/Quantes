// WarBreach — meta systems: War Chest, achievements, Quartermaster and boosts, obstacles,
// map themes, save backups and the "what's new" screen.
'use strict';

/* ---------------- War Chest (monthly reward track) ---------------- */
function seasonKey(d = new Date()) { return `${d.getFullYear()}-${d.getMonth() + 1}`; }
function chest() {
  if (!S.chest || S.chest.season !== seasonKey()) S.chest = { season: seasonKey(), stars: 0, claimed: [] };
  return S.chest;
}
function chestTierReached() { return Math.min(CHEST_TIERS, Math.floor(chest().stars / CHEST_TIER_STARS)); }
function chestClaimable() { const c = chest(); let n = 0; for (let i = 0; i < chestTierReached(); i++) if (!c.claimed.includes(i)) n++; return n; }
function awardChestStars(n) {
  if (!n) return;
  chest().stars += n;
  setTimeout(() => toast(`+${n} War Chest star${n > 1 ? 's' : ''}`, 'info'), 900);
  save();
}
function daysLeftInSeason() {
  const n = new Date(), end = new Date(n.getFullYear(), n.getMonth() + 1, 1);
  return Math.ceil((end - n) / 86400000);
}
function openChest() {
  const c = chest(), reached = chestTierReached();
  const tiers = Array.from({ length: CHEST_TIERS }, (_, i) => {
    const r = chestReward(i), got = c.claimed.includes(i), ok = i < reached;
    const big = (i + 1) % 10 === 0;
    return `<div class="ct ${ok ? 'ok' : ''} ${got ? 'got' : ''} ${big ? 'big' : ''}">
      <div class="ct-n">${i + 1}</div>
      <div class="ct-r">${rewardText({ gold: Math.round(r.gold || 0), steel: Math.round(r.steel || 0), medals: r.medals || 0 })}</div>
      ${ok && !got ? `<button class="btn" data-ct="${i}">Claim</button>` : got ? '<span class="road-tag">Claimed</span>' : `<span class="ct-need">${(i + 1) * CHEST_TIER_STARS} stars</span>`}
    </div>`;
  }).join('');
  const into = c.stars % CHEST_TIER_STARS;
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>War Chest</h2><span class="m-count">${daysLeftInSeason()} days left this season</span></div>
      <p class="lead">Earn stars from every battle: each endless wave, campaign stars, daily challenges and raid tiers. Every ${CHEST_TIER_STARS} stars opens the next tier. The track resets at the start of each month.</p>
      <div class="chest-prog"><b>${c.stars} stars</b> · tier ${reached} of ${CHEST_TIERS}${reached < CHEST_TIERS ? ` · ${CHEST_TIER_STARS - into} to the next` : ''}<div class="cap-bar"><div style="width:${reached >= CHEST_TIERS ? 100 : into / CHEST_TIER_STARS * 100}%"></div></div></div>
      <div class="chest-track">${tiers}</div>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`);
  const track = $('.chest-track');
  const first = track.querySelector('.ok:not(.got)') || track.children[Math.max(0, reached - 1)];
  if (first) track.scrollLeft = Math.max(0, first.offsetLeft - 20);
  track.querySelectorAll('[data-ct]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.ct, r = chestReward(i), cap = storageCap();
    if (c.claimed.includes(i)) return;
    c.claimed.push(i);
    S.gold = Math.min(cap, S.gold + Math.round(r.gold || 0)); S.steel = Math.min(cap, S.steel + Math.round(r.steel || 0)); S.medals += r.medals || 0;
    Sound.play('medal'); buzz(20); save(); openChest();
  }));
}

/* ---------------- Achievements (three tiers each) ---------------- */
function achTier(a) { const v = a.stat(S); let n = 0; for (const t of a.tiers) if (v >= t) n++; return n; }
function achClaimed(a) { return (S.ach || {})[a.id] || 0; }
function achClaimable() { return ACHIEVEMENTS.reduce((n, a) => n + Math.max(0, achTier(a) - achClaimed(a)), 0); }
function openAchievements() {
  const names = ['Bronze', 'Silver', 'Gold'];
  const rows = ACHIEVEMENTS.map(a => {
    const v = a.stat(S), got = achClaimed(a), reached = achTier(a);
    const next = Math.min(got, 2), target = a.tiers[Math.min(reached, 2)];
    const can = reached > got;
    const badges = a.tiers.map((_, i) => `<span class="ach-b t${i} ${i < got ? 'on' : ''}"></span>`).join('');
    return `<li class="mission ${can ? 'ready' : ''}">
      <div class="ach-badges">${badges}</div>
      <div class="m-body">
        <div class="m-text">${a.name} <span class="ach-tier">${got >= 3 ? 'Complete' : names[next]}</span></div>
        <div class="m-bar"><div style="width:${Math.min(100, v / target * 100).toFixed(1)}%"></div></div>
        <div class="m-prog">${fmt(Math.min(v, target))} / ${fmt(target)} ${a.unit}</div>
      </div>
      <div class="m-reward">${got < 3 ? rewardText({ medals: a.medals[got] }) : ''}</div>
      ${can ? `<button class="btn" data-ach="${a.id}">Claim</button>` : ''}
    </li>`;
  }).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Medals of Honor</h2><div class="tabs"><button class="tab" id="tab-missions">Missions</button><button class="tab on">Achievements</button></div></div>
      <ul class="missions">${rows}</ul>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`);
  $('#tab-missions').addEventListener('click', openMissions);
  $('#modal-body').querySelectorAll('[data-ach]').forEach(b => b.addEventListener('click', () => {
    const a = ACHIEVEMENTS.find(x => x.id === b.dataset.ach);
    if (!S.ach) S.ach = {};
    const got = achClaimed(a);
    if (achTier(a) <= got) return;
    S.medals += a.medals[got]; S.ach[a.id] = got + 1;
    Sound.play('medal'); buzz(20); toast(`${a.name}: ${names[got]} medal earned`, 'good'); save(); openAchievements();
  }));
}

/* ---------------- Quartermaster and boosts ---------------- */
function boostActive(k) { return !!(S.boosts && S.boosts[k] > Date.now()); }
function boostLeft(k) { return S.boosts && S.boosts[k] ? Math.max(0, (S.boosts[k] - Date.now()) / 1000) : 0; }
function dailyDealId() { const r = mulberry(dailySeed() + 77); return QM_ITEMS[Math.floor(r() * QM_ITEMS.length)].id; }
function qmPrice(it) { return it.id === dailyDealId() ? Math.max(1, Math.round(it.medals * 0.6)) : it.medals; }
function openQuartermaster() {
  const cap = storageCap();
  const rows = QM_ITEMS.map(it => {
    const price = qmPrice(it), deal = it.id === dailyDealId();
    const active = it.boost && boostActive(it.boost);
    const amount = it.kind ? Math.round(cap * it.amount / 10) * 10 : 0;
    return `<div class="qm ${deal ? 'deal' : ''}">
      ${deal ? '<span class="qm-deal">Daily deal -40%</span>' : ''}
      <div class="qm-name">${it.name}</div>
      <div class="qm-desc">${it.kind ? `+${fmt(amount)} ${it.kind}` : it.desc}</div>
      ${active ? `<div class="qm-active">Active · ${fmtTime(boostLeft(it.boost))}</div>` : ''}
      <button class="btn medal-btn ${S.medals >= price ? '' : 'off'}" data-qm="${it.id}"><span class="btn-main">${active ? 'Extend' : 'Buy'}</span><span class="btn-sub">${ICON.medal}${price}</span></button>
    </div>`;
  }).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Quartermaster</h2><span class="m-count">${ICON.medal} ${S.medals} medals</span></div>
      <p class="lead">Trade medals for supplies and boosts. A different item is on sale every day.</p>
      <div class="qm-grid">${rows}</div>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`);
  $('#modal-body').querySelectorAll('[data-qm]').forEach(b => b.addEventListener('click', () => {
    const it = QM_ITEMS.find(x => x.id === b.dataset.qm), price = qmPrice(it);
    if (S.medals < price) { toast(`You need ${price} medals`, 'bad'); Sound.play('error'); return; }
    S.medals -= price;
    if (it.kind) {
      const c = storageCap(), amt = Math.round(c * it.amount / 10) * 10;
      S[it.kind] = Math.min(c, S[it.kind] + amt); pulseRes(it.kind);
      toast(`+${fmt(amt)} ${it.kind}`, 'good');
    } else {
      if (!S.boosts) S.boosts = {};
      const now = Date.now();
      if (it.boost === 'build' && !boostActive('build')) {
        // speed up jobs already running
        for (const bb of S.buildings) if (bb.job) { const left = bb.job.end - now; if (left > 0) bb.job.end = now + left / 2; }
      }
      S.boosts[it.boost] = Math.max(now, S.boosts[it.boost] || 0) + BOOST_TIME;
      toast(`${it.name} active for ${fmtTime(boostLeft(it.boost))}`, 'good');
    }
    Sound.play('medal'); save(); openQuartermaster();
  }));
}

/* ---------------- Obstacles ---------------- */
function obstacleAt(tx, ty) { return (S.obstacles || []).find(o => o.x === tx && o.y === ty) || null; }
function spawnObstacle(silent) {
  if (!S.obstacles) S.obstacles = [];
  if (S.obstacles.length >= OBSTACLE_MAX) return false;
  const kinds = Object.keys(OBSTACLES);
  for (let i = 0; i < 80; i++) {
    const x = BORDER + Math.floor(Math.random() * (MAP_W - BORDER * 2)), y = BORDER + Math.floor(Math.random() * (MAP_H - BORDER * 2));
    if (grid[y * MAP_W + x] || obstacleAt(x, y)) continue;
    if (S.drop && S.drop.x === x && S.drop.y === y) continue;
    S.obstacles.push({ id: (S.nextObsId = (S.nextObsId || 1) + 1), x, y, kind: kinds[Math.floor(Math.random() * kinds.length)] });
    if (!silent) toast('Something new has appeared in your base. Clear it for medals', 'info');
    return true;
  }
  return false;
}
function updateObstacles(now) {
  if (S.nextObstacle == null) S.nextObstacle = now + OBSTACLE_EVERY;
  if (now >= S.nextObstacle) { S.nextObstacle = now + OBSTACLE_EVERY; spawnObstacle(false); save(); }
}
function openObstacle(o) {
  const d = OBSTACLES[o.kind];
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>${d.name}</h2><span class="m-count">Grid ${o.x - BORDER + 1}-${o.y - BORDER + 1}</span></div>
      <p class="lead">Clear it to free up the space. Engineers sometimes find medals buried underneath (${d.medals[0]} to ${d.medals[1]}).</p>
      <div class="settings-row">
        <button class="btn ${canAfford({ gold: d.cost.gold || 0, steel: d.cost.steel || 0 }) ? '' : 'off'}" id="btn-clear"><span class="btn-main">Clear</span><span class="btn-sub">${costHTML({ gold: d.cost.gold || 0, steel: d.cost.steel || 0 })}</span></button>
        <button class="btn ghost" data-close>Leave it</button>
      </div>
    </div>`);
  $('#btn-clear').addEventListener('click', () => {
    const cost = { gold: d.cost.gold || 0, steel: d.cost.steel || 0 };
    if (!canAfford(cost)) { toast('Not enough resources', 'bad'); Sound.play('error'); return; }
    pay(cost);
    S.obstacles = S.obstacles.filter(x => x !== o);
    const m = d.medals[0] + Math.floor(Math.random() * (d.medals[1] - d.medals[0] + 1));
    S.medals += m; addXP(d.xp);
    S.stats.cleared = (S.stats.cleared || 0) + 1;
    const x = (o.x + 0.5) * TILE, y = (o.y + 0.5) * TILE;
    burst(x, y, '#9a8a62', 16);
    if (m) floaters.push({ x, y: y - 30, text: `+${m} medal${m > 1 ? 's' : ''}`, color: '#f2b632', life: 1.4, max: 1.4 });
    Sound.play(m ? 'medal' : 'build'); save(); closeModal();
  });
}

/* ---------------- Map themes ---------------- */
function setTheme(id) {
  if (!THEMES[id] || hqLevel() < THEMES[id].need) return;
  S.theme = id; save();
  ground = buildGroundCanvas(1.5, id);
}

/* ---------------- Save backup ---------------- */
function exportCode() { return btoa(unescape(encodeURIComponent(serialize()))); }
function openBackup() {
  openModal(`
    <form class="settings" id="backup-form">
      <h2>Back up your base</h2>
      <p class="lead">Your base is saved on this device only. Copy this code somewhere safe, then paste it here on any device to restore your base.</p>
      <label class="field-label" for="backup-out">Your backup code</label>
      <textarea id="backup-out" class="text-input code-box" readonly rows="3">${exportCode()}</textarea>
      <div class="settings-row"><button class="btn" type="button" id="btn-copy-code">Copy code</button></div>
      <label class="field-label" for="backup-in">Restore from a code</label>
      <textarea id="backup-in" class="text-input code-box" rows="3" placeholder="Paste a backup code"></textarea>
      <div class="settings-row">
        <button class="btn danger-outline" type="submit" id="btn-restore">Restore base</button>
        <button class="btn ghost" type="button" data-close>Close</button>
      </div>
    </form>`);
  $('#btn-copy-code').addEventListener('click', async () => {
    const box = $('#backup-out');
    try { await navigator.clipboard.writeText(box.value); toast('Backup code copied', 'good'); }
    catch (e) { box.focus(); box.select(); toast('Select the code and copy it', 'info'); }
  });
  let armed = false;
  $('#backup-form').addEventListener('submit', e => {
    e.preventDefault();
    const raw = $('#backup-in').value.trim();
    if (!raw) { toast('Paste a backup code first', 'bad'); return; }
    let s2 = null;
    try { s2 = load(decodeURIComponent(escape(atob(raw)))); } catch (err) { s2 = null; }
    if (!s2) { toast('That code is not a valid WarBreach backup', 'bad'); Sound.play('error'); return; }
    if (!armed) { armed = true; $('#btn-restore').textContent = 'Tap again to replace this base'; return; }
    S = s2; rebuildGrid(); applySettings(); ground = buildGroundCanvas(1.5, S.theme); save(); closeModal(); recenter();
    toast(`Restored ${S.name}`, 'good');
  });
}

/* ---------------- What's new ---------------- */
const WHATS_NEW = [
  ['Barracks and troops', 'Train six troop types and deploy them in battle'],
  ['Rally and reinforcements', 'Move your army with rally points and call in squads for gold'],
  ['Arsenal', 'Four new abilities: Paratroopers, Artillery, Smoke and EMP'],
  ['Support buildings', 'Ammo Bunkers and Radar Stations boost nearby defenses'],
  ['Weekly Boss Raid', 'Fight the Behemoth for medal tiers'],
  ['Threat levels', 'Pick a difficulty for endless battles: up to Nightmare'],
  ['Elite enemies', 'Tougher golden-ringed units that pay triple'],
  ['Weather and night', 'Rain, fog, dusk and night battles'],
  ['War Chest', 'A monthly reward track filled by every battle'],
  ['Medals of Honor', 'Ten achievements with bronze, silver and gold tiers'],
  ['Quartermaster', 'Spend medals on supplies and boosts with a daily deal'],
  ['Veteran defenses', 'Defenses get stronger as they rack up kills'],
  ['Kill streaks', 'Bonus gold for fast chains of kills'],
  ['Obstacles', 'Clear rocks, trees and wrecks for medals'],
  ['Decorations and themes', 'Decorate your base and switch to Desert or Winter'],
  ['Backups and battery saver', 'Move your base between devices, save power'],
];
function maybeShowWhatsNew() {
  if (S.seenUpdate === UPDATE_VERSION) return false;
  const fresh = S.tut != null && S.tut < 99;
  S.seenUpdate = UPDATE_VERSION; save();
  if (fresh) return false;
  openModal(`
    <div class="settings">
      <div class="m-head"><div><span class="stamp">Update ${UPDATE_VERSION}</span><h2>Reinforcements have arrived</h2></div></div>
      <ul class="whats-new">${WHATS_NEW.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('')}</ul>
      <div class="settings-row"><button class="btn" data-close>To battle</button></div>
    </div>`);
  return true;
}
