// WarBreach — campaign mode: Operation Iron Line, 12 scripted missions fought at your base.
'use strict';

function campaignState() {
  if (!S.campaign) S.campaign = { stars: {} };
  return S.campaign;
}
function missionStars(id) { return campaignState().stars[id] || 0; }
function missionUnlocked(i) { return i === 0 || missionStars(CAMPAIGN[i - 1].id) > 0; }
function totalStars() { return CAMPAIGN.reduce((a, m) => a + missionStars(m.id), 0); }

function starRow(n, max = 3) {
  let out = '';
  for (let i = 0; i < max; i++) out += `<svg class="star ${i < n ? 'on' : ''}" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.7l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z"/></svg>`;
  return `<span class="stars" aria-label="${n} of ${max} stars">${out}</span>`;
}

function missionEnemyTypes(m) {
  const seen = new Map();
  for (const w of m.waves) for (const g of w) seen.set(g.type, (seen.get(g.type) || 0) + g.count);
  return [...seen.entries()];
}

function modTags(m) {
  const tags = [];
  if (m.modNames) return m.modNames.map(x => `${x.name}: ${x.desc}`);
  if (m.mods && m.mods.fast) tags.push(`Enemies ${Math.round((m.mods.fast - 1) * 100)}% faster`);
  if (m.mods && m.mods.armored) tags.push(`Enemies ${Math.round((m.mods.armored - 1) * 100)}% tougher`);
  if (m.mods && m.mods.noAirstrike) tags.push('No airstrikes');
  if (m.waves.some(w => w.some(g => ENEMIES[g.type].boss))) tags.push('Boss');
  if (m.waves.some(w => w.some(g => ENEMIES[g.type].air))) tags.push('Air units');
  return tags;
}

/* ---------------- Daily challenge ---------------- */
// The same challenge for everyone on a given day, scaled to your Command Center.
function dailySeed() { const k = dayKey(); let h = 2166136261; for (const ch of k) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function makeDaily() {
  const rnd = mulberry(dailySeed());
  const pool = DAILY_POOLS[Math.floor(rnd() * DAILY_POOLS.length)];
  const modA = DAILY_MODS[Math.floor(rnd() * DAILY_MODS.length)];
  let modB = DAILY_MODS[Math.floor(rnd() * DAILY_MODS.length)];
  if (modB.id === modA.id) modB = DAILY_MODS[(DAILY_MODS.indexOf(modA) + 1) % DAILY_MODS.length];
  const L = hqLevel();
  const waves = [];
  for (let w = 0; w < 5; w++) {
    const wave = [];
    for (const t of pool.types) {
      if (ENEMIES[t].boss) continue;
      const base = ENEMIES[t].hp > 400 ? 1 : ENEMIES[t].hp > 150 ? 2 : 5;
      const n = Math.round(base * (0.6 + w * 0.45) * (0.6 + rnd() * 0.8));
      if (n > 0) wave.push({ type: t, count: n });
    }
    if (w === 4 && L >= 4) wave.push({ type: 'siege', count: 1 });
    waves.push(wave);
  }
  const mods = Object.assign({}, modA.mods, modB.mods);
  const cap = storageCap();
  return {
    id: 'daily', daily: true, name: `Daily: ${pool.name}`, hq: L, level: Math.max(1, L * 2 - 1), gates: ['w', 'e', 'n'], mods,
    modNames: [modA, modB],
    brief: `Today's challenge: ${pool.name.toLowerCase()} with special rules. ${modA.name}: ${modA.desc.toLowerCase()}. ${modB.name}: ${modB.desc.toLowerCase()}.`,
    waves, reward: { gold: Math.round(cap * 0.15 / 10) * 10, steel: Math.round(cap * 0.15 / 10) * 10, medals: 8 },
  };
}
function dailyDone() { return S.daily && S.daily.done === dayKey(); }
function timeToReset() {
  const n = new Date(), t = new Date(n); t.setHours(24, 0, 0, 0);
  return fmtTime((t - n) / 1000);
}

/* ---------------- Operation map ---------------- */
function openCampaign() {
  if (B) return;
  if (placing) cancelPlace();
  select(null);
  const nextIdx = CAMPAIGN.findIndex((m, i) => missionUnlocked(i) && !missionStars(m.id));
  const cards = CAMPAIGN.map((m, i) => {
    const open = missionUnlocked(i);
    const stars = missionStars(m.id);
    const state = !open ? 'locked' : stars ? 'done' : 'open';
    const under = hqLevel() < m.hq;
    return `
      <button class="op ${state} ${i === nextIdx ? 'current' : ''}" data-mission="${i}" ${open ? '' : 'aria-disabled="true"'}>
        <span class="op-pin"><span>${i + 1}</span></span>
        <span class="op-name">${open ? m.name : 'Classified'}</span>
        <span class="op-meta">${m.waves.length} waves · <span class="${under && open ? 'warn' : ''}">HQ ${m.hq}+</span></span>
        ${starRow(stars)}
      </button>`;
  }).join('');
  openModal(`
    <div class="campaign">
      <div class="m-head">
        <div>
          <span class="stamp">Campaign</span>
          <h2>Operation Iron Line</h2>
        </div>
        <span class="m-count">${starRow(1, 1)} ${totalStars()} / ${CAMPAIGN.length * 3}</span>
      </div>
      <p class="lead">Twelve missions against a growing enemy offensive. Each one is a fixed set of waves at your own base. Clear a mission to unlock the next. Stars depend on how much of your Command Center survives.</p>
      <button class="daily-card ${dailyDone() ? 'done' : ''}" id="btn-daily">
        <span class="daily-tag">Daily challenge</span>
        <span class="daily-name">${makeDaily().name.replace('Daily: ', '')}</span>
        <span class="daily-mods">${makeDaily().modNames.map(m => `<span>${m.name}</span>`).join('')}</span>
        <span class="daily-meta">${dailyDone() ? `Done for today. New challenge in ${timeToReset()}` : `+8 medals · resets in ${timeToReset()}`}</span>
      </button>
      <button class="daily-card raid-card ${raidUnlocked() ? '' : 'done'}" id="btn-raid">
        <span class="daily-tag">Boss raid</span>
        <span class="daily-name">The Behemoth</span>
        <span class="daily-mods"><span>Best this week ${Math.round(raidState().best * 100)}%</span></span>
        <span class="daily-meta">${raidUnlocked() ? `${RAID.timeLimit} seconds to deal as much damage as you can. New week starts Monday.` : 'Unlocks at Command Center 3'}</span>
      </button>
      <div class="op-track">${cards}</div>
      <div class="settings-row"><button class="btn ghost" data-close>Back to base</button></div>
    </div>`);
  $('#btn-daily').addEventListener('click', () => { Sound.play('click'); openMissionBrief(-1); });
  $('#btn-raid').addEventListener('click', () => {
    if (!raidUnlocked()) { toast('The Boss Raid unlocks at Command Center 3', 'bad'); Sound.play('error'); return; }
    Sound.play('click'); openMissionBrief(-2);
  });
  const track = $('.op-track');
  track.querySelectorAll('[data-mission]').forEach(el => el.addEventListener('click', () => {
    const i = +el.dataset.mission;
    if (!missionUnlocked(i)) { toast(`Clear mission ${i} first`, 'bad'); Sound.play('error'); return; }
    Sound.play('click');
    openMissionBrief(i);
  }));
  const cur = track.querySelector('.current') || track.querySelector('.done:last-of-type');
  if (cur) track.scrollLeft = Math.max(0, cur.offsetLeft - 40);
}

function openMissionBrief(i) {
  const m = i === -2 ? makeRaid() : i < 0 ? makeDaily() : CAMPAIGN[i];
  const stars = m.daily ? 0 : missionStars(m.id);
  const r = m.raid ? { medals: RAID.tierMedals.reduce((a, b) => a + b, 0) } : m.daily ? (dailyDone() ? { gold: 0, steel: 0, medals: 0 } : m.reward) : stars ? replayReward(m) : m.reward;
  const enemies = missionEnemyTypes(m).map(([t, n]) => `<li class="ms-enemy"><span class="ms-art" data-type="${t}"></span><span>${ENEMIES[t].name}</span><b>&times;${n}</b></li>`).join('');
  const tags = modTags(m).map(t => `<span>${t}</span>`).join('');
  const under = hqLevel() < m.hq;
  openModal(`
    <div class="brief">
      <div class="brief-head">
        <span class="stamp">${m.raid ? 'Weekly boss raid' : m.daily ? 'Daily challenge' : `Mission ${i + 1} of ${CAMPAIGN.length}`}</span>
        <h2>${m.name} ${m.daily || m.raid ? '' : starRow(stars)}</h2>
        <p>${m.brief}</p>
        ${tags ? `<div class="intel-tags ms-tags">${tags}</div>` : ''}
      </div>
      <div class="brief-cols">
        <div>
          <h3>Enemy forces · ${m.waves.length} waves</h3>
          <ul class="units ms-list">${enemies}</ul>
        </div>
        <div>
          <h3>${m.raid ? 'Up to (all 5 tiers)' : m.daily && dailyDone() ? 'Already claimed today' : stars ? 'Replay reward' : 'Reward'}</h3>
          <ul class="units">
            ${r.gold ? `<li><span>Gold</span><b>+${fmt(r.gold)}</b></li>` : ''}
            ${r.steel ? `<li><span>Steel</span><b>+${fmt(r.steel)}</b></li>` : ''}
            ${r.medals ? `<li><span>Medals</span><b>+${r.medals}</b></li>` : ''}
          </ul>
          <h3 class="ms-sub">Stars</h3>
          <ul class="units">
            <li><span>${starRow(3)} HQ above 70%</span></li>
            <li><span>${starRow(2)} HQ above 35%</span></li>
          </ul>
        </div>
      </div>
      <div class="brief-foot">
        <button class="btn battle-go" id="btn-mission-go">Deploy</button>
        <span class="soon">${under ? `Recommended: Command Center level ${m.hq}. You are at level ${hqLevel()}.` : 'Damage is repaired after the mission, win or lose.'}</span>
        <button class="btn ghost" id="btn-mission-arsenal">Arsenal</button>
        <button class="btn ghost" id="btn-mission-back">Operation map</button>
      </div>
    </div>`);
  $('#modal-body').querySelectorAll('.ms-art').forEach(el => el.appendChild(renderEnemyPreview(el.dataset.type, 30)));
  $('#btn-mission-go').addEventListener('click', () => startBattle(m));
  $('#btn-mission-arsenal').addEventListener('click', () => openArsenal(() => openMissionBrief(i)));
  $('#btn-mission-back').addEventListener('click', () => { closeModal(); openCampaign(); });
}

function replayReward(m) {
  return { gold: Math.round(m.reward.gold * 0.25), steel: Math.round(m.reward.steel * 0.25), medals: 0 };
}

/* ---------------- Mission result ---------------- */
function endMission(reason) {
  B.over = true;
  const m = B.mission;
  const i = CAMPAIGN.indexOf(m);
  const h = hq();
  const frac = h && h._maxhp ? Math.max(0, h._hp / h._maxhp) : 0;
  const won = reason === 'victory';
  const prev = m.daily ? 0 : missionStars(m.id);
  let stars = 0, reward = null, firstClear = false;
  if (won) {
    stars = campaignStars(frac);
    firstClear = m.daily ? !dailyDone() : !prev;
    reward = m.daily ? (firstClear ? m.reward : { gold: 0, steel: 0, medals: 0 }) : firstClear ? m.reward : replayReward(m);
    if (m.daily) { if (firstClear) S.stats.dailies = (S.stats.dailies || 0) + 1; S.daily.done = dayKey(); }
    B.battleStars += m.daily ? (firstClear ? 8 : 2) : stars * 2;
    const cap = storageCap();
    const g = Math.min(reward.gold || 0, Math.max(0, cap - S.gold)), st = Math.min(reward.steel || 0, Math.max(0, cap - S.steel));
    S.gold += g; S.steel += st; S.medals += reward.medals || 0;
    reward = { gold: g, steel: st, medals: reward.medals || 0 };
    if (!m.daily) campaignState().stars[m.id] = Math.max(prev, stars);
    addXP(firstClear ? 60 + Math.max(0, i) * 20 : 20);
    buzz([60, 40, 60]);
  } else {
    Sound.play('lose');
  }
  save();
  const next = m.daily ? null : CAMPAIGN[i + 1];
  const title = won ? 'Mission complete' : reason === 'retreat' ? 'Mission aborted' : 'Mission failed';
  const line = won
    ? `${m.name} is secure. The Command Center finished at ${Math.round(frac * 100)}% strength.`
    : reason === 'retreat' ? 'You pulled your forces out. Try again when you are ready.' : 'The Command Center fell. Upgrade your defenses and try again.';
  openModal(`
    <div class="brief">
      <div class="brief-head">
        <span class="stamp">${m.name}</span>
        <h2>${title} ${won ? starRow(stars) : ''}</h2>
        <p>${line}</p>
      </div>
      <div class="brief-cols">
        <div>
          <h3>Result</h3>
          <ul class="units">
            <li><span>Waves cleared</span><b>${B.waves} / ${m.waves.length}</b></li>
            <li><span>Enemies destroyed</span><b>${B.kills}</b></li>
            ${won && stars > prev && prev ? `<li><span>Best stars</span><b>${stars} (improved)</b></li>` : ''}
          </ul>
        </div>
        <div>
          <h3>${won ? (firstClear ? 'Mission reward' : 'Replay reward') : 'Loot from kills'}</h3>
          <ul class="units">
            <li><span>Gold</span><b>+${fmt((reward ? reward.gold : 0) + B.loot.gold)}</b></li>
            <li><span>Steel</span><b>+${fmt((reward ? reward.steel : 0) + B.loot.steel)}</b></li>
            ${reward && reward.medals ? `<li><span>Medals</span><b>+${reward.medals}</b></li>` : ''}
          </ul>
        </div>
      </div>
      <div class="brief-foot">
        ${won && next ? '<button class="btn" id="btn-next-mission">Next mission</button>' : ''}
        ${!won ? '<button class="btn" id="btn-retry-mission">Try again</button>' : ''}
        <span class="soon">${won && !next && !m.daily ? 'Operation Iron Line is complete. Outstanding work, Commander.' : won && m.daily ? 'Daily challenge cleared. A new one arrives tomorrow.' : ''}</span>
        <button class="btn ghost" data-close>Return to base</button>
      </div>
    </div>`, leaveBattle);
  const nx = $('#btn-next-mission');
  if (nx) nx.addEventListener('click', () => { closeModal(); openMissionBrief(i + 1); });
  const rt = $('#btn-retry-mission');
  if (rt) rt.addEventListener('click', () => { closeModal(); openMissionBrief(m.daily ? -1 : i); });
}
