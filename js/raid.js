// WarBreach — weekly Boss Raid: hold off the Behemoth and deal as much damage as you can.
'use strict';

function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${w}`;
}
function raidState() {
  if (!S.raid || S.raid.week !== weekKey()) S.raid = { week: weekKey(), best: 0 };
  return S.raid;
}
function raidUnlocked() { return hqLevel() >= 3; }
function raidBossHp() { return Math.round(4000 * Math.pow(1.45, hqLevel() - 1) * (1 + 0.5 * (hqLevel() - 1))); }
// The boss hits softer against small bases.
function raidBossDmgK() { return 0.3 + 0.1 * hqLevel(); }
function raidTier(frac) { let n = 0; for (const t of RAID.tiers) if (frac >= t - 1e-9) n++; return n; }

function makeRaid() {
  const L = hqLevel();
  return {
    id: 'raid', raid: true, name: 'Boss Raid: Behemoth', hq: L, level: Math.max(1, L * 2), gates: ['w', 'e'],
    mods: {},
    brief: `The Behemoth, a four-legged walking fortress, is marching on your base. You have ${RAID.timeLimit} seconds. Every point of damage counts toward this week's reward tiers.`,
    waves: [[{ type: 'behemoth', count: 1 }, { type: 'rifleman', count: 6 + L }, { type: 'jeep', count: Math.floor(L / 2) }]],
    reward: { medals: 0 },
  };
}

function startRaid() {
  B.raid = { t: RAID.timeLimit, dmg: 0, max: 0, phase: 0, killed: false };
}

function updateRaid(dt) {
  const R = B.raid;
  if (!R.max) { const boss = B.units.find(u => ENEMIES[u.type].raidBoss); if (boss) R.max = boss.max; }
  if (B.phase !== 'fight') return;
  R.t -= dt;
  if (R.t <= 0 && !B.over) { R.t = 0; B.phase = 'won'; banner('Time is up', 'The Behemoth withdraws'); setTimeout(() => endBattle('timeup'), 900); }
}

function raidHit(u, dmg) {
  const R = B.raid;
  R.dmg += dmg;
  const frac = (u.hp - dmg) / u.max;
  const phase = frac < 0.33 ? 2 : frac < 0.66 ? 1 : 0;
  if (phase > R.phase) {
    R.phase = phase;
    u.rage = phase;
    banner(phase === 1 ? 'The Behemoth is angry' : 'The Behemoth is enraged', 'Escorts incoming');
    Sound.play('boss'); buzz([80, 60, 80]);
    const L = hqLevel();
    const add = phase === 1 ? [['rifleman', 6], ['grenadier', 2], ['jeep', 1]] : [['heavy', 2], ['apc', 1], ['tank', 1]];
    for (const [type, n] of add) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const hp = enemyHp(type, L * 2);
        B.units.push({ type, x: u.x + Math.cos(a) * 40, y: u.y + Math.sin(a) * 40, hp, max: hp, cd: Math.random(), angle: 0, aim: 0, walk: 0,
          ox: (Math.random() - 0.5) * 16, oy: (Math.random() - 0.5) * 16, tgt: null, retarget: 0, air: !!ENEMIES[type].air, moving: true });
      }
    }
  }
}

function raidBossDown(u) {
  B.raid.killed = true;
  S.stats.raidKills = (S.stats.raidKills || 0) + 1;
  explosion(u.x, u.y, 90); explosion(u.x + 30, u.y - 20, 50); explosion(u.x - 25, u.y + 20, 50);
  Sound.play('bigboom'); buzz([150, 60, 200]);
  addShake(10);
  banner('Behemoth destroyed', 'Outstanding work, Commander');
  B.phase = 'won';
  setTimeout(() => endBattle('victory'), 1600);
}

function endRaid(reason) {
  B.over = true;
  const R = B.raid, st = raidState();
  const frac = R.max ? Math.min(1, R.dmg / R.max) : 0;
  const tier = raidTier(frac), prevTier = raidTier(st.best);
  let medals = 0;
  for (let i = prevTier; i < tier; i++) medals += RAID.tierMedals[i];
  const cap = storageCap();
  const res = tier > prevTier ? Math.round(cap * 0.08 * (tier - prevTier) / 10) * 10 : 0;
  S.medals += medals;
  S.gold = Math.min(cap, S.gold + res); S.steel = Math.min(cap, S.steel + res);
  st.best = Math.max(st.best, frac);
  B.battleStars += tier * 3;
  save();
  Sound.play(tier ? 'win' : 'lose');
  const tiers = RAID.tiers.map((t, i) => `<div class="rt ${frac >= t - 1e-9 ? 'hit' : ''} ${i < prevTier ? 'old' : ''}"><b>${Math.round(t * 100)}%</b><span>${ICON.medal}${RAID.tierMedals[i]}</span></div>`).join('');
  const title = R.killed ? 'Behemoth destroyed' : reason === 'retreat' ? 'Raid aborted' : reason === 'timeup' ? 'Time is up' : 'Base overrun';
  openModal(`
    <div class="brief">
      <div class="brief-head">
        <span class="stamp">Boss raid · week ${weekKey().split('-W')[1]}</span>
        <h2>${title}</h2>
        <p>You dealt <b>${fmt(R.dmg)}</b> damage, ${Math.round(frac * 100)}% of the Behemoth's armor. Best this week: ${Math.round(st.best * 100)}%.</p>
      </div>
      <div class="raid-tiers">${tiers}</div>
      <div class="brief-cols">
        <div><h3>New rewards</h3><ul class="units">
          <li><span>Medals</span><b>+${medals}</b></li>
          <li><span>Gold and steel</span><b>+${fmt(res)} each</b></li>
        </ul></div>
        <div><h3>Battle</h3><ul class="units">
          <li><span>Enemies destroyed</span><b>${B.kills}</b></li>
          <li><span>Tiers reached</span><b>${tier} / ${RAID.tiers.length}</b></li>
        </ul></div>
      </div>
      <div class="brief-foot">
        <span class="soon">Rewards are paid once per tier each week. A new raid week starts every Monday.</span>
        <button class="btn" data-close>Return to base</button>
      </div>
    </div>`, leaveBattle);
}

function raidStatus() {
  const R = B.raid;
  const boss = B.units.find(u => ENEMIES[u.type].raidBoss);
  const pct = boss ? Math.round(boss.hp / boss.max * 100) : 0;
  const t = Math.ceil(R.t);
  return `Behemoth ${pct}% · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
