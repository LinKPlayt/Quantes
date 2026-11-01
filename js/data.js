// WarBreach — game data: map size, building definitions, level tables.
'use strict';

const TILE = 40;            // world pixels per grid tile
const MAP_W = 36;           // total map width in tiles
const MAP_H = 26;           // total map height in tiles
const BORDER = 4;           // non-buildable wilderness around the compound
const START_BUILDERS = 2;   // simultaneous construction jobs at the start
const MAX_BUILDERS = 4;
const BUILDER_COST = [0, 0, 0, 25, 60]; // medals to hire builder #3 and #4
const MAX_HQ = 12;
const MAX_LEVEL = 12;
const MAX_BUILD_TIME = 6 * 3600; // no single job takes longer than 6 hours

// Storage that the Command Center provides on its own, per HQ level.
const HQ_STORAGE = [0, 1500, 4000, 8000, 15000, 25000, 40000, 60000, 90000, 130000, 180000, 250000, 350000];

/*
 * Progression: every Command Center level unlocks exactly one new defense
 * and raises the level cap of every other building to the HQ level.
 * Counts below are how many of each building you may own, indexed by HQ level (1..8).
 */
const LIMITS = {
  hq:         [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  goldmine:   [0, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7],
  steelworks: [0, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
  lab:        [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  depot:      [0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6],
  mg:         [0, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7],
  cannon:     [0, 0, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6],
  mortar:     [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
  flame:      [0, 0, 0, 0, 1, 2, 2, 3, 3, 4, 4, 5, 5],
  sniper:     [0, 0, 0, 0, 0, 1, 2, 2, 3, 3, 4, 4, 5],
  missile:    [0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 3, 4, 4],
  tesla:      [0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 3, 4],
  howitzer:   [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 3],
  flak:       [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 3],
  railgun:    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2],
  rocketarty: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2],
  laser:      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  mine:       [0, 0, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
  wire:       [0, 0, 0, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42],
  wall:       [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240],
};

// Category order drives the shop tabs.
const CATEGORIES = [
  { id: 'defense', label: 'Defenses' },
  { id: 'economy', label: 'Economy' },
  { id: 'traps',   label: 'Traps' },
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
      { gold: 12000, steel: 6000 }, { gold: 22000, steel: 11000 }, { gold: 35000, steel: 18000 }, { gold: 55000, steel: 28000 },
      { gold: 80000, steel: 40000 }, { gold: 115000, steel: 58000 }, { gold: 160000, steel: 80000 }, { gold: 220000, steel: 110000 }],
    timeTable: [0, 0, 30, 120, 300, 600, 1200, 1800, 3600, 5400, 7200, 9000, 10800],
    hp: { base: 1500, growth: 1.3 },
    guard: { dmg: 5, fireRate: 3, range: 6.2, targets: 'both' }, // rooftop gun that defends in battle
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
  lab: {
    name: 'Research Lab', code: 'RL', cat: 'economy', size: 2, max: MAX_LEVEL,
    desc: 'Researches permanent upgrades for your whole base. Its level caps how far each research can go.',
    cost: { base: { gold: 1500, steel: 1500 }, growth: 1.7 },
    time: { base: 60, growth: 1.7 },
    hp: { base: 700, growth: 1.25 },
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
  flak: {
    name: 'Flak Cannon', code: 'FK', cat: 'defense', size: 2, max: MAX_LEVEL,
    desc: 'Anti-aircraft gun. Shreds drones and gunships with bursting shells. Cannot hit ground units.',
    cost: { base: { gold: 30000, steel: 22000 }, growth: 1.3 },
    time: { base: 240, growth: 1.7 },
    hp: { base: 1100, growth: 1.25 },
    dmg: { base: 220, growth: 1.3 }, fireRate: 1.4, range: 8, splash: 1.1, targets: 'air',
  },
  railgun: {
    name: 'Railgun', code: 'RG', cat: 'defense', size: 2, max: MAX_LEVEL,
    desc: 'Fires a magnetic slug that pierces every enemy in a straight line.',
    cost: { base: { gold: 45000, steel: 35000 }, growth: 1.28 },
    time: { base: 300, growth: 1.7 },
    hp: { base: 1200, growth: 1.25 },
    dmg: { base: 900, growth: 1.3 }, fireRate: 0.35, range: 11, pierce: true, targets: 'ground',
  },
  rocketarty: {
    name: 'Rocket Artillery', code: 'RA', cat: 'defense', size: 2, max: MAX_LEVEL,
    desc: 'Launches a salvo of eight rockets that blanket a wide area.',
    cost: { base: { gold: 65000, steel: 50000 }, growth: 1.25 },
    time: { base: 360, growth: 1.7 },
    hp: { base: 1300, growth: 1.25 },
    dmg: { base: 260, growth: 1.3 }, fireRate: 0.18, range: 12, minRange: 3, splash: 1.2, salvo: 8, targets: 'ground',
  },
  laser: {
    name: 'Laser Tower', code: 'LZ', cat: 'defense', size: 2, max: MAX_LEVEL,
    desc: 'A continuous beam that burns hotter the longer it stays on one target. Hits ground and air.',
    cost: { base: { gold: 90000, steel: 70000 }, growth: 1.22 },
    time: { base: 420, growth: 1.7 },
    hp: { base: 1500, growth: 1.25 },
    dmg: { base: 22, growth: 1.3 }, fireRate: 10, range: 8, ramp: 4, targets: 'both',
  },
  mine: {
    name: 'Land Mine', code: 'LM', cat: 'traps', size: 1, max: MAX_LEVEL, trap: true,
    desc: 'Hidden explosive. Blows up under the first ground unit that steps near it. Re-arms after each battle.',
    cost: { base: { gold: 150, steel: 100 }, growth: 1.7 },
    time: { base: 0, growth: 1 },
    hp: { base: 1, growth: 1 },
    dmg: { base: 160, growth: 1.35 }, fireRate: 0, range: 0.6, splash: 1.3, targets: 'ground',
  },
  wire: {
    name: 'Barbed Wire', code: 'BW', cat: 'traps', size: 1, max: MAX_LEVEL, trap: true,
    desc: 'Enemies can cross it, but infantry slows to a crawl and gets cut while doing it.',
    cost: { base: { steel: 80 }, growth: 1.7 },
    time: { base: 0, growth: 1 },
    hp: { base: 1, growth: 1 },
    dmg: { base: 6, growth: 1.3 }, fireRate: 0, range: 0, slow: 0.4, targets: 'ground',
  },
  wall: {
    name: 'Wall', code: 'WL', cat: 'walls', size: 1, max: MAX_LEVEL,
    desc: 'Blocks the enemy path. Place several in a row; they link together.',
    cost: { base: { steel: 25 }, growth: 2.0 },
    time: { base: 0, growth: 1 },
    hp: { base: 300, growth: 1.55 },
  },
};

const WALL_NAMES = ['', 'Sandbag Wall', 'Concrete Wall', 'Reinforced Wall', 'Steel Wall', 'Fortress Wall', 'Bastion Wall', 'Titan Wall', 'Citadel Wall',
  'Bulwark Wall', 'Aegis Wall', 'Colossus Wall', 'Monolith Wall'];

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
  return Math.min(MAX_BUILD_TIME, Math.round(grow(d.time, L)));
}

function statsFor(type, L) {
  const d = DEFS[type];
  const s = { hp: Math.round(grow(d.hp, L)) };
  if (d.rate) { s.rate = Math.round(grow(d.rate, L)); s.hold = Math.round(grow(d.hold, L) / 10) * 10; }
  if (d.storage) s.storage = Math.round(grow(d.storage, L) / 100) * 100;
  if (d.dmg) {
    s.dmg = Math.round(grow(d.dmg, L));
    s.dps = d.trap ? s.dmg : Math.round(s.dmg * d.fireRate * (d.splash ? 1.5 : 1) * (d.salvo || 1));
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

// Traps a given HQ level unlocks (listed alongside the defense in the roadmap).
function trapsUnlockedAt(L) {
  return Object.keys(LIMITS).filter(t => DEFS[t].cat === 'traps' && LIMITS[t][L] > 0 && LIMITS[t][L - 1] === 0);
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
  sapper:    { name: 'Sapper',       hp: 80,  speed: 1.3,  dmg: 160, rate: 1.0, range: 0.8, splash: 1.2, bounty: 9, r: 6, sapper: true },
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
  { id: 'mine',     text: 'Lay 4 Land Mines',                       progress: s => [builtAt(s, 'mine', 1), 4], reward: { steel: 400 } },
  { id: 'camp3',    text: 'Complete campaign mission 3',            progress: s => [Object.keys((s.campaign || {}).stars || {}).length, 3], reward: { medals: 10 } },
  { id: 'camp12',   text: 'Finish the whole campaign',              progress: s => [Object.keys((s.campaign || {}).stars || {}).length, 12], reward: { medals: 60 } },
  { id: 'hq8',      text: 'Command Center level 8',   progress: s => [builtAt(s, 'hq', 8), 1], reward: { medals: 50 } },
  { id: 'hq12',     text: 'Command Center level 12',                progress: s => [builtAt(s, 'hq', 12), 1], reward: { medals: 80 } },
];

// Supply drops: a crate lands in the base on a timer.
const DROP_INTERVAL = 2 * 60 * 60 * 1000;
const FIRST_DROP_DELAY = 90 * 1000;

/* ---------------- Campaign: Operation Iron Line ---------------- */
// Each mission is a fixed set of waves fought at your own base.
// level sets enemy toughness (like the endless wave number); mods change the rules.
const W = (...pairs) => { const out = []; for (let i = 0; i < pairs.length; i += 2) out.push({ type: pairs[i], count: pairs[i + 1] }); return out; };
const CAMPAIGN = [
  { id: 'm1', name: 'First Contact', hq: 1, level: 1, gates: ['w'],
    brief: 'Scouts have found our outpost. Hold off a light probe from the west road.',
    waves: [W('rifleman', 6), W('rifleman', 8, 'moto', 2), W('rifleman', 10, 'moto', 3)],
    reward: { gold: 400, steel: 250, medals: 3 } },
  { id: 'm2', name: 'Supply Line', hq: 2, level: 2, gates: ['w', 'e'],
    brief: 'Raiders hit our convoys from both sides. Grenadiers and armored cars expected.',
    waves: [W('rifleman', 10, 'grenadier', 2), W('rifleman', 10, 'jeep', 2, 'moto', 3), W('rifleman', 12, 'grenadier', 4, 'jeep', 3)],
    reward: { gold: 800, steel: 500, medals: 4 } },
  { id: 'm3', name: 'Bridgehead', hq: 2, level: 2, gates: ['w', 'e'],
    brief: 'Engineers with demolition charges are trying to blast a way in. Keep them off your walls.',
    waves: [W('rifleman', 8, 'sapper', 2), W('rifleman', 10, 'sapper', 3, 'grenadier', 2), W('sapper', 4, 'jeep', 2, 'rifleman', 8), W('rifleman', 12, 'sapper', 5, 'jeep', 3)],
    reward: { gold: 1200, steel: 800, medals: 5 } },
  { id: 'm4', name: 'Iron Rain', hq: 3, level: 3, gates: ['w', 'e'],
    brief: 'The first enemy tanks have arrived. Cannons and walls will be your best friends.',
    waves: [W('jeep', 3, 'rifleman', 10), W('tank', 1, 'jeep', 3, 'rifleman', 10), W('tank', 1, 'grenadier', 4, 'rifleman', 12), W('tank', 2, 'jeep', 4, 'rifleman', 12)],
    reward: { gold: 2000, steel: 1300, medals: 6 } },
  { id: 'm5', name: 'Field Hospital', hq: 3, level: 5, gates: ['w', 'e', 'n'],
    brief: 'Medics are keeping the enemy column alive. Burst them down before they patch everyone up.',
    waves: [W('rifleman', 14, 'medic', 3), W('rifleman', 14, 'grenadier', 5, 'medic', 4), W('jeep', 4, 'rifleman', 14, 'medic', 5), W('tank', 2, 'rifleman', 16, 'medic', 6, 'grenadier', 5)],
    reward: { gold: 3000, steel: 2000, medals: 7 } },
  { id: 'm6', name: 'Siege of Sector 7', hq: 5, level: 5, gates: ['w', 'e', 'n'],
    brief: 'A Siege Tank is leading the assault. Survive the escort, then bring the giant down.',
    waves: [W('rifleman', 14, 'jeep', 3, 'sapper', 2), W('tank', 1, 'rifleman', 14, 'medic', 2), W('tank', 2, 'jeep', 4, 'grenadier', 5), W('siege', 1, 'tank', 1, 'rifleman', 14, 'medic', 2)],
    reward: { gold: 4500, steel: 3000, medals: 10 } },
  { id: 'm7', name: 'Night Raid', hq: 4, level: 7, gates: ['w', 'e', 'n'], mods: { fast: 1.3 },
    brief: 'Under cover of darkness, fast units are rushing the base. Every enemy moves 30% faster.',
    waves: [W('moto', 8, 'rifleman', 14), W('moto', 8, 'sapper', 6, 'flamer', 3), W('jeep', 6, 'flamer', 5, 'sapper', 6, 'moto', 6), W('moto', 10, 'jeep', 8, 'flamer', 6, 'sapper', 8)],
    reward: { gold: 6000, steel: 4000, medals: 10 } },
  { id: 'm8', name: 'Skyfall', hq: 5, level: 8, gates: ['w', 'e', 'n'],
    brief: 'Air assault. Drones and gunships will ignore your walls. Anti-air defenses are essential.',
    waves: [W('drone', 6, 'rifleman', 12), W('drone', 8, 'heli', 1, 'rifleman', 12), W('drone', 10, 'heli', 2, 'jeep', 4), W('heli', 4, 'drone', 12, 'rifleman', 16)],
    reward: { gold: 9000, steel: 6000, medals: 12 } },
  { id: 'm9', name: 'Steel Tide', hq: 5, level: 8, gates: ['w', 'e', 'n'],
    brief: 'Troop carriers and heavy gunners are pushing an armored wedge into the base.',
    waves: [W('apc', 2, 'heavy', 2, 'rifleman', 12), W('apc', 3, 'tank', 2, 'heavy', 3), W('tank', 3, 'heavy', 4, 'apc', 3, 'medic', 3), W('tank', 4, 'apc', 4, 'heavy', 6, 'grenadier', 6)],
    reward: { gold: 13000, steel: 9000, medals: 14 } },
  { id: 'm10', name: 'Long Guns', hq: 6, level: 11, gates: ['w', 'e', 'n'],
    brief: 'Artillery trucks are shelling us from beyond the fence. Hunt them with long-range guns and airstrikes.',
    waves: [W('artillery', 2, 'rifleman', 16, 'jeep', 4), W('artillery', 3, 'tank', 3, 'heavy', 4), W('artillery', 4, 'apc', 4, 'flamer', 6, 'medic', 4), W('artillery', 6, 'tank', 5, 'heli', 2, 'rifleman', 20)],
    reward: { gold: 20000, steel: 14000, medals: 16 } },
  { id: 'm11', name: 'Total War', hq: 7, level: 26, gates: ['w', 'e', 'n'],
    brief: 'Every unit the enemy has, thrown at us at once. Six waves. No retreat.',
    waves: [W('rifleman', 24, 'grenadier', 8, 'moto', 6), W('jeep', 8, 'sapper', 8, 'flamer', 6, 'medic', 5), W('tank', 5, 'apc', 5, 'heavy', 6, 'drone', 8),
      W('heli', 4, 'drone', 10, 'artillery', 3, 'rifleman', 20), W('tank', 6, 'artillery', 4, 'heavy', 10, 'sapper', 10), W('siege', 1, 'tank', 6, 'heli', 4, 'apc', 6, 'rifleman', 24)],
    reward: { gold: 32000, steel: 22000, medals: 20 } },
  { id: 'm12', name: 'Last Stand', hq: 8, level: 34, gates: ['w', 'e', 'n'], mods: { armored: 1.25, noAirstrike: true },
    brief: 'The final assault. No air support is available. Two Siege Tanks lead the last wave.',
    waves: [W('rifleman', 26, 'heavy', 8, 'medic', 6), W('tank', 6, 'apc', 6, 'flamer', 8, 'sapper', 8), W('heli', 6, 'drone', 14, 'artillery', 4),
      W('siege', 1, 'tank', 6, 'heavy', 10, 'medic', 6), W('artillery', 6, 'heli', 5, 'apc', 8, 'moto', 10), W('siege', 2, 'tank', 8, 'heli', 6, 'heavy', 12, 'rifleman', 30)],
    reward: { gold: 50000, steel: 35000, medals: 40 } },
];

// Stars from how much of the Command Center survived a campaign mission.
function campaignStars(hqFraction) { return hqFraction >= 0.7 ? 3 : hqFraction >= 0.35 ? 2 : 1; }

/* ---------------- Research (Research Lab) ---------------- */
// Permanent bonuses. A topic can be researched up to the Lab's level (and its own max).
const RESEARCH = {
  ballistics: { name: 'Ballistics', max: 10, desc: '+6% damage for every defense', per: 0.06, cost: { gold: 1200, steel: 1600 } },
  armor:      { name: 'Reinforced Concrete', max: 10, desc: '+8% hit points for every building', per: 0.08, cost: { gold: 1000, steel: 1800 } },
  logistics:  { name: 'Logistics', max: 10, desc: '+8% gold and steel production', per: 0.08, cost: { gold: 1500, steel: 800 } },
  airpower:   { name: 'Air Command', max: 6, desc: '+15% airstrike damage and 2s shorter cooldown', per: 0.15, cost: { gold: 2000, steel: 2000 } },
  engineering:{ name: 'Engineering', max: 5, desc: '5% faster construction', per: 0.05, cost: { gold: 2500, steel: 1500 } },
  medicine:   { name: 'Field Medicine', max: 6, desc: '+5% Field Repair healing and 3s shorter cooldown', per: 0.05, cost: { gold: 1800, steel: 1800 } },
};
function researchCost(id, L) {
  const c = RESEARCH[id].cost, m = Math.pow(1.85, L - 1);
  return { gold: Math.round(c.gold * m / 50) * 50, steel: Math.round(c.steel * m / 50) * 50 };
}
function researchTime(L) { return Math.min(MAX_BUILD_TIME, Math.round(45 * Math.pow(1.75, L - 1))); }

/* ---------------- Defense specializations ---------------- */
// At level 5 a defense can pick one permanent specialization.
const SPEC_LEVEL = 5;
const SPECS = {
  rapid: { name: 'Rapid Fire', desc: '+35% fire rate', color: '#f2b632' },
  heavy: { name: 'Heavy Rounds', desc: '+45% damage per hit', color: '#c8402a' },
  scope: { name: 'Long Barrel', desc: '+25% range', color: '#6ec0ff' },
};

/* ---------------- Targeting priority ---------------- */
const PRIORITIES = [
  { id: 'close', name: 'Closest' },
  { id: 'first', name: 'First' },
  { id: 'strong', name: 'Strongest' },
  { id: 'weak', name: 'Weakest' },
];

/* ---------------- Heroes ---------------- */
// One hero joins every battle. Tap the map to move them; enemies stop to fight them.
const HEROES = {
  commando: {
    name: 'Sgt. Vance', title: 'Commando', color: '#4f6a32', unlock: { hq: 1 },
    hp: 420, speed: 1.9, dmg: 13, rate: 4, range: 3.4, regen: 6,
    ability: { name: 'Frag Barrage', cd: 22, desc: 'Throws five grenades at the enemy he is fighting.', dmg: 110, radius: 1.3 },
    bio: 'Fast, aggressive and hard to pin down. Great at holding a gate.',
  },
  engineer: {
    name: 'Lt. Quill', title: 'Field Engineer', color: '#b8682a', unlock: { mission: 'm3' },
    hp: 520, speed: 1.5, dmg: 9, rate: 3, range: 3.4, regen: 4, repair: 18,
    ability: { name: 'Sentry Drop', cd: 28, desc: 'Deploys an auto-turret beside her for 18 seconds.', dmg: 14, life: 18 },
    bio: 'Repairs nearby buildings while she fights. Unlocks after campaign mission 3.',
  },
  heavy: {
    name: 'Cpl. Brann', title: 'Heavy Weapons', color: '#5a5f66', unlock: { hq: 6 },
    hp: 900, speed: 1.1, dmg: 40, rate: 1.2, range: 3.8, regen: 8, armor: 6,
    ability: { name: 'Rocket Strike', cd: 26, desc: 'Fires a heavy rocket that wrecks vehicles.', dmg: 700, radius: 1.2 },
    bio: 'Slow tank of a soldier with a rocket launcher. Unlocks at Command Center 6.',
  },
};
const HERO_MAX = 10;
function heroXpFor(L) { return 80 * L * L; } // xp needed to go from L to L+1
function heroScale(L) { return 1 + 0.14 * (L - 1); }

/* ---------------- Daily challenge ---------------- */
const DAILY_MODS = [
  { id: 'fast', name: 'Blitz', desc: 'Enemies move 35% faster', mods: { fast: 1.35 } },
  { id: 'armored', name: 'Hardened', desc: 'Enemies have 50% more health', mods: { armored: 1.5 } },
  { id: 'noair', name: 'Grounded', desc: 'No airstrikes', mods: { noAirstrike: true } },
  { id: 'norepair', name: 'No Medics', desc: 'No Field Repair', mods: { noRepair: true } },
  { id: 'swarm', name: 'Swarm', desc: 'Twice as many enemies, each weaker', mods: { swarm: true } },
  { id: 'nohero', name: 'Lone Command', desc: 'No hero in this battle', mods: { noHero: true } },
];
const DAILY_POOLS = [
  { name: 'Infantry Rush', types: ['rifleman', 'grenadier', 'moto', 'sapper', 'medic', 'flamer'] },
  { name: 'Armored Column', types: ['jeep', 'tank', 'apc', 'rifleman', 'heavy'] },
  { name: 'Air Raid', types: ['drone', 'heli', 'rifleman', 'jeep'] },
  { name: 'Demolition Crew', types: ['sapper', 'flamer', 'moto', 'artillery', 'rifleman'] },
  { name: 'Combined Arms', types: ['rifleman', 'grenadier', 'tank', 'drone', 'medic', 'heavy', 'artillery'] },
];

/* ---------------- Daily login rewards (7-day cycle) ---------------- */
const LOGIN_REWARDS = [
  { gold: 400 }, { steel: 400 }, { medals: 3 }, { gold: 800, steel: 800 }, { medals: 5 }, { gold: 1500, steel: 1500 }, { medals: 15, gold: 2500, steel: 2500 },
];
