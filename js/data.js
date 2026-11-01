// WarBreach — game data: map size, building definitions, level tables.
'use strict';

const TILE = 40;            // world pixels per grid tile
const MAP_W = 36;           // total map width in tiles
const MAP_H = 26;           // total map height in tiles
const BORDER = 4;           // non-buildable wilderness around the compound
const BUILDERS = 2;         // simultaneous construction jobs
const MAX_HQ = 5;

// Storage that the Command Center provides on its own, per HQ level.
const HQ_STORAGE = [0, 1500, 4000, 10000, 25000, 60000];

// How many of each building the player may own, indexed by HQ level (1..5).
const LIMITS = {
  hq:         [0, 1, 1, 1, 1, 1],
  goldmine:   [0, 2, 3, 4, 5, 6],
  steelworks: [0, 1, 2, 3, 4, 5],
  depot:      [0, 1, 1, 2, 2, 3],
  mg:         [0, 2, 3, 4, 5, 6],
  cannon:     [0, 1, 2, 3, 3, 4],
  mortar:     [0, 0, 1, 1, 2, 3],
  sniper:     [0, 0, 0, 1, 2, 2],
  missile:    [0, 0, 0, 0, 1, 2],
  wall:       [0, 25, 50, 75, 100, 125],
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
 *  time    seconds to reach level L: base * timeGrowth^(L-1) (0 = instant)
 *  hp      hit points at level L (used by battle mode)
 * Stats for defenses are the numbers battle mode will read.
 */
const DEFS = {
  hq: {
    name: 'Command Center', code: 'HQ', cat: 'core', size: 3, max: MAX_HQ,
    desc: 'The heart of your base. Upgrade it to unlock new buildings, more storage and higher building levels.',
    costTable: [null, { gold: 0, steel: 0 }, { gold: 1000, steel: 500 }, { gold: 3000, steel: 1500 }, { gold: 8000, steel: 4000 }, { gold: 20000, steel: 10000 }],
    timeTable: [0, 0, 60, 180, 420, 900],
    hp: { base: 1500, growth: 1.35 },
    guard: { dmg: 5, fireRate: 3, range: 5, targets: 'both' }, // rooftop gun that defends in battle
  },
  goldmine: {
    name: 'Gold Mine', code: 'GM', cat: 'economy', size: 2, max: 5,
    desc: 'Digs gold over time. Tap it to collect what it has mined.',
    cost: { base: { steel: 150 }, growth: 2.3 },
    time: { base: 10, growth: 2.2 },
    hp: { base: 400, growth: 1.3 },
    produces: 'gold',
    rate: { base: 30, growth: 1.5 },    // per minute
    hold: { base: 300, growth: 1.9 },   // internal capacity
  },
  steelworks: {
    name: 'Steel Foundry', code: 'SF', cat: 'economy', size: 2, max: 5,
    desc: 'Smelts steel plate for defenses and walls. Tap it to collect.',
    cost: { base: { gold: 150 }, growth: 2.3 },
    time: { base: 10, growth: 2.2 },
    hp: { base: 400, growth: 1.3 },
    produces: 'steel',
    rate: { base: 20, growth: 1.5 },
    hold: { base: 200, growth: 1.9 },
  },
  depot: {
    name: 'Supply Depot', code: 'SD', cat: 'economy', size: 2, max: 5,
    desc: 'Adds storage for both gold and steel.',
    cost: { base: { gold: 300, steel: 300 }, growth: 2.4 },
    time: { base: 20, growth: 2.2 },
    hp: { base: 600, growth: 1.3 },
    storage: { base: 1500, growth: 2.0 },
  },
  mg: {
    name: 'Machine Gun Nest', code: 'MG', cat: 'defense', size: 2, max: 5,
    desc: 'Fast, short-range fire. Shreds infantry and can hit drones.',
    cost: { base: { gold: 200, steel: 100 }, growth: 2.2 },
    time: { base: 10, growth: 2.2 },
    hp: { base: 400, growth: 1.3 },
    dmg: { base: 4, growth: 1.35 }, fireRate: 6, range: 4.5, targets: 'both',
  },
  cannon: {
    name: 'Cannon', code: 'CN', cat: 'defense', size: 2, max: 5,
    desc: 'Heavy rounds with good range. Strong against vehicles.',
    cost: { base: { gold: 350, steel: 250 }, growth: 2.2 },
    time: { base: 15, growth: 2.2 },
    hp: { base: 650, growth: 1.3 },
    dmg: { base: 60, growth: 1.35 }, fireRate: 0.8, range: 5.5, targets: 'ground',
  },
  mortar: {
    name: 'Mortar Pit', code: 'MT', cat: 'defense', size: 2, max: 5,
    desc: 'Lobs shells over walls. Splash damage, but it cannot hit units right next to it.',
    cost: { base: { gold: 800, steel: 600 }, growth: 2.2 },
    time: { base: 30, growth: 2.2 },
    hp: { base: 500, growth: 1.3 },
    dmg: { base: 45, growth: 1.35 }, fireRate: 0.25, range: 8.5, minRange: 2.5, splash: 1.3, targets: 'ground',
  },
  sniper: {
    name: 'Sniper Tower', code: 'SN', cat: 'defense', size: 2, max: 5,
    desc: 'Very long range, one precise shot at a time.',
    cost: { base: { gold: 1500, steel: 1000 }, growth: 2.2 },
    time: { base: 45, growth: 2.2 },
    hp: { base: 450, growth: 1.3 },
    dmg: { base: 160, growth: 1.35 }, fireRate: 0.4, range: 9.5, targets: 'both',
  },
  missile: {
    name: 'Missile Battery', code: 'MB', cat: 'defense', size: 2, max: 5,
    desc: 'Fires rocket salvos at ground and air targets.',
    cost: { base: { gold: 3000, steel: 2500 }, growth: 2.2 },
    time: { base: 60, growth: 2.2 },
    hp: { base: 700, growth: 1.3 },
    dmg: { base: 70, growth: 1.35 }, fireRate: 0.9, range: 7.5, splash: 0.8, targets: 'both',
  },
  wall: {
    name: 'Wall', code: 'WL', cat: 'walls', size: 1, max: 5,
    desc: 'Blocks the enemy path. Place several in a row; they link together.',
    cost: { base: { steel: 25 }, growth: 2.5 },
    time: { base: 0, growth: 1 },
    hp: { base: 300, growth: 1.7 },
  },
};

const WALL_NAMES = ['', 'Sandbag Wall', 'Concrete Wall', 'Reinforced Wall', 'Steel Wall', 'Fortress Wall'];

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

// Highest level a non-HQ building can reach at the current HQ level.
function levelCap(type, hqLevel) {
  if (type === 'hq') return MAX_HQ;
  return Math.min(DEFS[type].max, hqLevel + 1);
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
  return list;
}

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
