// WarBreach — game data: map size, building definitions, level tables.
'use strict';

const TILE = 40;            // world pixels per grid tile
const MAP_W = 36;           // total map width in tiles
const MAP_H = 26;           // total map height in tiles
const BORDER = 4;           // non-buildable wilderness around the compound
const START_BUILDERS = 2;   // simultaneous construction jobs at the start
const MAX_BUILDERS = 4;
const BUILDER_COST = [0, 0, 0, 25, 60]; // medals to hire builder #3 and #4
const MAX_HQ = 8;
const MAX_LEVEL = 8;

// Storage that the Command Center provides on its own, per HQ level.
const HQ_STORAGE = [0, 1500, 4000, 8000, 15000, 25000, 40000, 60000, 90000];

/*
 * Progression: every Command Center level unlocks exactly one new defense
 * and raises the level cap of every other building to the HQ level.
 * Counts below are how many of each building you may own, indexed by HQ level (1..8).
 */
const LIMITS = {
  hq:         [0, 1, 1, 1, 1, 1, 1, 1, 1],
  goldmine:   [0, 2, 2, 3, 3, 4, 4, 5, 5],
  steelworks: [0, 1, 2, 2, 3, 3, 4, 4, 5],
  depot:      [0, 1, 1, 2, 2, 2, 3, 3, 4],
  mg:         [0, 2, 2, 3, 3, 4, 4, 5, 5],
  cannon:     [0, 0, 1, 2, 2, 3, 3, 4, 4],
  mortar:     [0, 0, 0, 1, 1, 2, 2, 3, 3],
  flame:      [0, 0, 0, 0, 1, 2, 2, 3, 3],
  sniper:     [0, 0, 0, 0, 0, 1, 2, 2, 3],
  missile:    [0, 0, 0, 0, 0, 0, 1, 2, 2],
  tesla:      [0, 0, 0, 0, 0, 0, 0, 1, 2],
  howitzer:   [0, 0, 0, 0, 0, 0, 0, 0, 1],
  wall:       [0, 20, 40, 60, 80, 100, 120, 140, 160],
};

// Category order drives the shop tabs.
const CATEGORIES = [
  { id: 'defense', label: 'Defenses' },
  { id: 'economy', label: 'Economy' },
  { id: 'walls',   label: 'Walls' },
];

/*
 * Every building has:
 *  size    footprint in tiles (square)
 *  max     highest level
 *  cost    cost of reaching level L: base * growth^(L-1)  (or explicit table)
 *  time    seconds to reach level L: base * growth^(L-1) (0 = instant)
 *  hp      hit points at level L (used by battle mode)
 * Defenses unlocked later have a gentler cost curve so their top levels stay reachable.
 */
const DEFS = {
  hq: {
    name: 'Command Center', code: 'HQ', cat: 'core', size: 3, max: MAX_HQ,
    desc: 'The heart of your base. Each level unlocks a new defense and lets every building go one level higher.',
    costTable: [null, { gold: 0, steel: 0 }, { gold: 800, steel: 400 }, { gold: 2500, steel: 1200 }, { gold: 6000, steel: 3000 },
      { gold: 12000, steel: 6000 }, { gold: 22000, steel: 11000 }, { gold: 35000, steel: 18000 }, { gold: 55000, steel: 28000 }],
    timeTable: [0, 0, 30, 120, 300, 600, 1200, 1800, 3600],
    hp: { base: 1500, growth: 1.3 },
    guard: { dmg: 5, fireRate: 3, range: 5, targets: 'both' }, // rooftop gun that defends in battle
  },
  goldmine: {
    name: 'Gold Mine', code: 'GM', cat: 'economy', size: 2, max: MAX_LEVEL,
    desc: 'Digs gold over time. Tap it to collect what it has mined.',
    cost: { base: { steel: 150 }, growth: 1.85 },
    time: { base: 10, growth: 1.7 },
    hp: { base: 400, growth: 1.25 },
    produces: 'gold',
    rate: { base: 30, growth: 1.45 },   // per minute
    hold: { base: 300, growth: 1.75 },  // internal capacity
  },
  steelworks: {
    name: 'Steel Foundry', code: 'SF', cat: 'economy', size: 2, max: MAX_LEVEL,
    desc: 'Smelts steel plate for defenses and walls. Tap it to collect.',
    cost: { base: { gold: 150 }, growth: 1.85 },
    time: { base: 10, growth: 1.7 },
    hp: { base: 400, growth: 1.25 },
    produces: 'steel',
    rate: { base: 20, growth: 1.45 },
    hold: { base: 200, growth: 1.75 },
  },
  depot: {
    name: 'Supply Depot', code: 'SD', cat: 'economy', size: 2, max: MAX_LEVEL,
    desc: 'Adds storage for both gold and steel.',
    cost: { base: { gold: 300, steel: 300 }, growth: 1.7 },
    time: { base: 20, growth: 1.7 },
    hp: { base: 600, growth: 1.25 },
    storage: { base: 1500, growth: 1.6 },
  },
  mg: {
    name: 'Machine Gun Nest', code: 'MG', cat: 'defense', size: 2, max: MAX_LEVEL,
    desc: 'Fast, short-range fire. Shreds infantry and can hit drones.',
    cost: { base: { gold: 200, steel: 100 }, growth: 1.8 },
    time: { base: 10, growth: 1.7 },
    hp: { base: 400, growth: 1.25 },
    dmg: { base: 4, growth: 1.3 }, fireRate: 6, range: 4.5, targets: 'both',
  },
  cannon: {
    name: 'Cannon', code: 'CN', cat: 'defense', size: 2, max: MAX_LEVEL,
    desc: 'Heavy rounds with good range. Strong against vehicles.',
    cost: { base: { gold: 350, steel: 250 }, growth: 1.8 },
    time: { base: 15, growth: 1.7 },
    hp: { base: 650, growth: 1.25 },
    dmg: { base: 60, growth: 1.3 }, fireRate: 0.8, range: 5.5, targets: 'ground',
  },
  mortar: {
    name: 'Mortar Pit', code: 'MT', cat: 'defense', size: 2, max: MAX_LEVEL,
    desc: 'Lobs shells over walls. Splash damage, but it cannot hit units right next to it.',
    cost: { base: { gold: 800, steel: 600 }, growth: 1.75 },
    time: { base: 30, growth: 1.7 },
    hp: { base: 500, growth: 1.25 },
    dmg: { base: 45, growth: 1.3 }, fireRate: 0.25, range: 8.5, minRange: 2.5, splash: 1.3, targets: 'ground',
  },
  flame: {
    name: 'Flame Bunker', code: 'FB', cat: 'defense', size: 2, max: MAX_LEVEL,
    desc: 'Short-range flamethrower. Burns groups of infantry at once.',
    cost: { base: { gold: 1200, steel: 800 }, growth: 1.7 },
    time: { base: 40, growth: 1.7 },
    hp: { base: 750, growth: 1.25 },
    dmg: { base: 12, growth: 1.3 }, fireRate: 5, range: 3, splash: 1.0, targets: 'ground',
  },
  sniper: {
    name: 'Sniper Tower', code: 'SN', cat: 'defense', size: 2, max: MAX_LEVEL,
    desc: 'Very long range, one precise shot at a time.',
    cost: { base: { gold: 2500, steel: 1800 }, growth: 1.6 },
    time: { base: 60, growth: 1.7 },
    hp: { base: 450, growth: 1.25 },
    dmg: { base: 160, growth: 1.3 }, fireRate: 0.4, range: 9.5, targets: 'both',
  },
  missile: {
    name: 'Missile Battery', code: 'MB', cat: 'defense', size: 2, max: MAX_LEVEL,
    desc: 'Fires rocket salvos at ground and air targets.',
    cost: { base: { gold: 5000, steel: 4000 }, growth: 1.5 },
    time: { base: 90, growth: 1.7 },
    hp: { base: 700, growth: 1.25 },
    dmg: { base: 70, growth: 1.3 }, fireRate: 0.9, range: 7.5, splash: 0.8, targets: 'both',
  },
  tesla: {
    name: 'Tesla Coil', code: 'TC', cat: 'defense', size: 2, max: MAX_LEVEL,
    desc: 'Lightning that jumps between up to four enemies, ground or air.',
    cost: { base: { gold: 9000, steel: 7000 }, growth: 1.4 },
    time: { base: 120, growth: 1.7 },
    hp: { base: 800, growth: 1.25 },
    dmg: { base: 90, growth: 1.3 }, fireRate: 1.0, range: 6, chain: 4, targets: 'both',
  },
  howitzer: {
    name: 'Howitzer', code: 'HW', cat: 'defense', size: 2, max: MAX_LEVEL,
    desc: 'Huge artillery gun. Shells the whole battlefield with massive splash.',
    cost: { base: { gold: 15000, steel: 12000 }, growth: 1.35 },
    time: { base: 180, growth: 1.7 },
    hp: { base: 1000, growth: 1.25 },
    dmg: { base: 260, growth: 1.3 }, fireRate: 0.2, range: 13, minRange: 3, splash: 2.0, targets: 'ground',
  },
  wall: {
    name: 'Wall', code: 'WL', cat: 'walls', size: 1, max: MAX_LEVEL,
    desc: 'Blocks the enemy path. Place several in a row; they link together.',
    cost: { base: { steel: 25 }, growth: 2.0 },
    time: { base: 0, growth: 1 },
    hp: { base: 300, growth: 1.55 },
  },
};

const WALL_NAMES = ['', 'Sandbag Wall', 'Concrete Wall', 'Reinforced Wall', 'Steel Wall', 'Fortress Wall', 'Bastion Wall', 'Titan Wall', 'Citadel Wall'];

function grow(spec, L) {
  return spec.base * Math.pow(spec.growth, L - 1);
}

function costFor(type, L) {
  const d = DEFS[type];
  if (d.costTable) return { gold: d.costTable[L].gold || 0, steel: d.costTable[L].steel || 0 };
  const m = Math.pow(d.cost.growth, L - 1);
  const r = v => (v ? Math.round((v * m) / 5) * 5 : 0);
  return { gold: r(d.cost.base.gold), steel: r(d.cost.base.steel) };
}

function timeFor(type, L) {
  const d = DEFS[type];
  if (d.timeTable) return d.timeTable[L];
  if (!d.time.base) return 0;
  return Math.round(grow(d.time, L));
}

function statsFor(type, L) {
  const d = DEFS[type];
  const s = { hp: Math.round(grow(d.hp, L)) };
  if (d.rate) { s.rate = Math.round(grow(d.rate, L)); s.hold = Math.round(grow(d.hold, L) / 10) * 10; }
  if (d.storage) s.storage = Math.round(grow(d.storage, L) / 100) * 100;
  if (d.dmg) {
    s.dmg = Math.round(grow(d.dmg, L));
    s.dps = Math.round(s.dmg * d.fireRate * (d.splash ? 1.5 : 1));
    s.range = d.range;
  }
  if (type === 'hq') s.storage = HQ_STORAGE[L];
  return s;
}

function unlockLevel(type) {
  const row = LIMITS[type];
  for (let i = 1; i < row.length; i++) if (row[i] > 0) return i;
  return 99;
}

// The defense a given HQ level unlocks (for the roadmap and upgrade preview).
function defenseUnlockedAt(L) {
  return Object.keys(LIMITS).find(t => DEFS[t].cat === 'defense' && LIMITS[t][L] > 0 && LIMITS[t][L - 1] === 0) || null;
}

// Highest level a non-HQ building can reach: the Command Center's level.
function levelCap(type, hqLevel) {
  if (type === 'hq') return MAX_HQ;
  return Math.min(DEFS[type].max, hqLevel);
}

function displayName(type, level) {
  if (type === 'wall') return WALL_NAMES[Math.max(1, level)];
  return DEFS[type].name;
}

/*
 * Enemy roster. Speeds and ranges are in tiles; rate is attacks per second.
 * Hit points grow with each wave (see enemyHp).
 */
const ENEMIES = {
  rifleman:  { name: 'Rifleman',     hp: 55,  speed: 1.0,  dmg: 5,  rate: 1.0,  range: 2.2, bounty: 4,  r: 6 },
  grenadier: { name: 'Grenadier',    hp: 95,  speed: 0.85, dmg: 22, rate: 0.5,  range: 2.8, splash: 0.9, bounty: 7, r: 7 },
  jeep:      { name: 'Armored Jeep', hp: 260, speed: 1.7,  dmg: 8,  rate: 2.5,  range: 3.0, bounty: 15, r: 11, vehicle: true },
  tank:      { name: 'Light Tank',   hp: 850, speed: 0.55, dmg: 60, rate: 0.35, range: 4.0, splash: 0.7, bounty: 40, r: 14, vehicle: true },
  drone:     { name: 'Attack Drone', hp: 110, speed: 1.5,  dmg: 12, rate: 1.0,  range: 1.4, bounty: 12, r: 9, air: true },
  medic:     { name: 'Field Medic',  hp: 70,  speed: 1.0,  dmg: 2,  rate: 1.0,  range: 1.8, bounty: 8,  r: 6, heal: 14, healRange: 2.2 },
  moto:      { name: 'Scout Bike',   hp: 45,  speed: 2.6,  dmg: 4,  rate: 2.0,  range: 1.6, bounty: 5,  r: 8, vehicle: true },
  sapper:    { name: 'Sapper',       hp: 80,  speed: 1.3,  dmg: 260, rate: 1.0, range: 0.8, splash: 1.2, bounty: 9, r: 6, sapper: true },
  apc:       { name: 'Troop Carrier', hp: 520, speed: 1.0, dmg: 6,  rate: 2.0,  range: 2.6, bounty: 25, r: 13, vehicle: true, carries: { type: 'rifleman', count: 4 } },
  flamer:    { name: 'Flame Trooper', hp: 120, speed: 0.9, dmg: 7,  rate: 5.0,  range: 1.6, bounty: 10, r: 7, flamer: true },
  heavy:     { name: 'Heavy Gunner', hp: 260, speed: 0.6,  dmg: 6,  rate: 4.0,  range: 2.6, bounty: 18, r: 9, armor: 8 },
  heli:      { name: 'Gunship',      hp: 650, speed: 1.1,  dmg: 45, rate: 0.7,  range: 3.2, splash: 0.6, bounty: 45, r: 16, air: true },
  artillery: { name: 'Artillery Truck', hp: 420, speed: 0.5, dmg: 70, rate: 0.25, range: 6.5, splash: 0.9, bounty: 35, r: 12, vehicle: true, lob: true },
  siege:     { name: 'Siege Tank',   hp: 2600, speed: 0.38, dmg: 130, rate: 0.3, range: 4.5, splash: 1.0, bounty: 220, r: 20, vehicle: true, boss: true },
};

function enemyHp(type, wave) {
  return Math.round(ENEMIES[type].hp * (1 + 0.14 * (wave - 1)));
}

// The force sent at a given wave number.
function waveComposition(n) {
  const list = [{ type: 'rifleman', count: 6 + n * 2 }];
  if (n >= 2) list.push({ type: 'grenadier', count: Math.floor(n * 0.8) });
  if (n >= 3) list.push({ type: 'jeep', count: Math.floor(n / 2) });
  if (n >= 5) list.push({ type: 'tank', count: Math.floor((n - 3) / 2) });
  if (n >= 7) list.push({ type: 'drone', count: Math.floor((n - 5) / 2) });
  if (n >= 4) list.push({ type: 'medic', count: Math.floor((n - 2) / 2) });
  if (n >= 2) list.push({ type: 'moto', count: Math.floor(n / 3) + 1 });
  if (n >= 3) list.push({ type: 'sapper', count: Math.floor((n - 1) / 3) });
  if (n >= 6) list.push({ type: 'apc', count: Math.floor((n - 3) / 3) });
  if (n >= 6) list.push({ type: 'flamer', count: Math.floor((n - 4) / 3) });
  if (n >= 8) list.push({ type: 'heavy', count: Math.floor((n - 6) / 2) });
  if (n >= 9) list.push({ type: 'heli', count: Math.floor((n - 6) / 3) });
  if (n >= 10) list.push({ type: 'artillery', count: Math.floor((n - 7) / 3) });
  if (isBossWave(n)) list.push({ type: 'siege', count: 1 + Math.floor(n / 15) });
  return list;
}

function isBossWave(n) { return n % 5 === 0; }

// First wave in which each enemy type appears (for the field guide and "new enemy" alerts).
function firstWaveOf(type) {
  for (let n = 1; n <= 60; n++) if (waveComposition(n).some(g => g.type === type && g.count > 0)) return n;
  return 99;
}

// One-line field notes for the enemy guide.
const ENEMY_NOTES = {
  rifleman: 'Basic infantry. Comes in numbers.',
  grenadier: 'Throws grenades that splash nearby buildings.',
  jeep: 'Fast armored car with a mounted gun.',
  tank: 'Slow and tough. Its shells hit hard.',
  drone: 'Flies over walls. Only air-capable defenses can hit it.',
  medic: 'Heals injured attackers around it. Kill it first.',
  moto: 'Very fast and fragile. Races ahead of the main force.',
  sapper: 'Runs at the nearest building and blows itself up.',
  apc: 'Armored carrier. Four riflemen jump out when it is destroyed.',
  flamer: 'Short range, but burns buildings quickly.',
  heavy: 'Body armor shrugs off light bullets. Use heavy guns.',
  heli: 'Armored gunship that rockets your buildings from the air.',
  artillery: 'Shells your base from long range. Hunt it with long-range defenses or airstrikes.',
  siege: 'Boss of every fifth wave. Enormous armor and firepower.',
};

// Which roads the enemy uses at a given wave.
function waveGates(n) {
  if (n <= 1) return ['w'];
  if (n <= 3) return ['w', 'e'];
  return ['w', 'e', 'n'];
}

// Bonus paid for clearing a wave (on top of per-kill bounties).
function waveReward(n) {
  return { gold: 60 + n * 45, steel: 40 + n * 30 };
}

// Medals for clearing a wave: boss waves pay extra.
function waveMedals(n) { return 1 + (isBossWave(n) ? 3 : 0); }

/* ---------------- Battle abilities ---------------- */
const ABILITIES = {
  airstrike: { name: 'Airstrike', cooldown: 35 },
  repair:    { name: 'Field Repair', cooldown: 50, heal: 0.3 },
};
function airstrikeDamage(wave) { return 140 + wave * 25; }

/* ---------------- Commander ranks ---------------- */
const RANKS = [
  { name: 'Private', xp: 0 }, { name: 'Corporal', xp: 100 }, { name: 'Sergeant', xp: 300 },
  { name: 'Lieutenant', xp: 700 }, { name: 'Captain', xp: 1400 }, { name: 'Major', xp: 2600 },
  { name: 'Colonel', xp: 4500 }, { name: 'General', xp: 7500 },
];
const RANK_MEDALS = 5;
function rankIndex(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  return i;
}

/* ---------------- Missions ---------------- */
// progress(s) returns [current, target]. Rewards go straight to storage.
const builtAt = (s, type, L) => s.buildings.filter(b => b.type === type && b.level >= L).length;
const MISSIONS = [
  { id: 'cannon',   text: 'Build a Cannon',                         progress: s => [builtAt(s, 'cannon', 1), 1], reward: { gold: 250 } },
  { id: 'walls10',  text: 'Build 10 wall segments',                 progress: s => [builtAt(s, 'wall', 1), 10], reward: { steel: 200 } },
  { id: 'collect',  text: 'Collect 1,000 gold from mines',          progress: s => [s.stats.collectedGold, 1000], reward: { steel: 300 } },
  { id: 'hq2',      text: 'Upgrade the Command Center to level 2',  progress: s => [builtAt(s, 'hq', 2), 1], reward: { medals: 5 } },
  { id: 'wave3',    text: 'Survive wave 3',                         progress: s => [s.bestWave, 3], reward: { gold: 400, medals: 3 } },
  { id: 'flame',    text: 'Build a Flame Bunker',                   progress: s => [builtAt(s, 'flame', 1), 1], reward: { gold: 500 } },
  { id: 'kills100', text: 'Destroy 100 enemies',                    progress: s => [s.stats.kills, 100], reward: { gold: 600, steel: 300 } },
  { id: 'strike',   text: 'Call in an airstrike',                   progress: s => [s.stats.airstrikes, 1], reward: { medals: 3 } },
  { id: 'wave5',    text: 'Survive the first boss wave (wave 5)',   progress: s => [s.bestWave, 5], reward: { medals: 10 } },
  { id: 'def3',     text: 'Upgrade any defense to level 3',         progress: s => [s.buildings.filter(b => DEFS[b.type].cat === 'defense' && b.level >= 3).length, 1], reward: { steel: 800 } },
  { id: 'hq3',      text: 'Upgrade the Command Center to level 3',  progress: s => [builtAt(s, 'hq', 3), 1], reward: { medals: 10 } },
  { id: 'boss',     text: 'Destroy a Siege Tank',                   progress: s => [s.stats.bosses, 1], reward: { gold: 1500, medals: 5 } },
  { id: 'kills500', text: 'Destroy 500 enemies',                    progress: s => [s.stats.kills, 500], reward: { medals: 15 } },
  { id: 'wave10',   text: 'Survive wave 10',                        progress: s => [s.bestWave, 10], reward: { medals: 20 } },
  { id: 'hq5',      text: 'Upgrade the Command Center to level 5',  progress: s => [builtAt(s, 'hq', 5), 1], reward: { medals: 20 } },
  { id: 'tesla',    text: 'Build a Tesla Coil',                     progress: s => [builtAt(s, 'tesla', 1), 1], reward: { medals: 20 } },
  { id: 'hq8',      text: 'Max out the Command Center (level 8)',   progress: s => [builtAt(s, 'hq', 8), 1], reward: { medals: 50 } },
];

// Supply drops: a crate lands in the base on a timer.
const DROP_INTERVAL = 2 * 60 * 60 * 1000;
const FIRST_DROP_DELAY = 90 * 1000;
