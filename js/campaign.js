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
  if (m.mods && m.mods.fast) tags.push(`Enemies ${Math.round((m.mods.fast - 1) * 100)}% faster`);
  if (m.mods && m.mods.armored) tags.push(`Enemies ${Math.round((m.mods.armored - 1) * 100)}% tougher`);
  if (m.mods && m.mods.noAirstrike) tags.push('No airstrikes');
  if (m.waves.some(w => w.some(g => ENEMIES[g.type].boss))) tags.push('Boss');
  if (m.waves.some(w => w.some(g => ENEMIES[g.type].air))) tags.push('Air units');
  return tags;
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
      <div class="op-track">${cards}</div>
      <div class="settings-row"><button class="btn ghost" data-close>Back to base</button></div>
    </div>`);
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
  const m = CAMPAIGN[i];
  const stars = missionStars(m.id);
  const r = stars ? replayReward(m) : m.reward;
  const enemies = missionEnemyTypes(m).map(([t, n]) => `<li class="ms-enemy"><span class="ms-art" data-type="${t}"></span><span>${ENEMIES[t].name}</span><b>&times;${n}</b></li>`).join('');
  const tags = modTags(m).map(t => `<span>${t}</span>`).join('');
  const under = hqLevel() < m.hq;
  openModal(`
    <div class="brief">
      <div class="brief-head">
        <span class="stamp">Mission ${i + 1} of ${CAMPAIGN.length}</span>
        <h2>${m.name} ${starRow(stars)}</h2>
        <p>${m.brief}</p>
        ${tags ? `<div class="intel-tags ms-tags">${tags}</div>` : ''}
      </div>
      <div class="brief-cols">
        <div>
          <h3>Enemy forces · ${m.waves.length} waves</h3>
          <ul class="units ms-list">${enemies}</ul>
        </div>
        <div>
          <h3>${stars ? 'Replay reward' : 'Reward'}</h3>
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
        <button class="btn ghost" id="btn-mission-back">Operation map</button>
      </div>
    </div>`);
  $('#modal-body').querySelectorAll('.ms-art').forEach(el => el.appendChild(renderEnemyPreview(el.dataset.type, 30)));
  $('#btn-mission-go').addEventListener('click', () => startBattle(m));
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
  const prev = missionStars(m.id);
  let stars = 0, reward = null, firstClear = false;
  if (won) {
    stars = campaignStars(frac);
    firstClear = !prev;
    reward = firstClear ? m.reward : replayReward(m);
    const cap = storageCap();
    const g = Math.min(reward.gold || 0, Math.max(0, cap - S.gold)), st = Math.min(reward.steel || 0, Math.max(0, cap - S.steel));
    S.gold += g; S.steel += st; S.medals += reward.medals || 0;
    reward = { gold: g, steel: st, medals: reward.medals || 0 };
    campaignState().stars[m.id] = Math.max(prev, stars);
    addXP(firstClear ? 60 + i * 20 : 20);
    buzz([60, 40, 60]);
  } else {
    Sound.play('lose');
  }
  save();
  const next = CAMPAIGN[i + 1];
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
        <span class="soon">${won && !next ? 'Operation Iron Line is complete. Outstanding work, Commander.' : ''}</span>
        <button class="btn ghost" data-close>Return to base</button>
      </div>
    </div>`, leaveBattle);
  const nx = $('#btn-next-mission');
  if (nx) nx.addEventListener('click', () => { closeModal(); openMissionBrief(i + 1); });
  const rt = $('#btn-retry-mission');
  if (rt) rt.addEventListener('click', () => { closeModal(); openMissionBrief(i); });
}
