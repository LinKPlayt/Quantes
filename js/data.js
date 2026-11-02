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
  barracks:   [0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2],
  ammo:       [0, 0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 3],
  radar:      [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2],
  flagpole:   [0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  sandbags:   [0, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  searchlight:[0, 0, 2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  radio:      [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  statue:     [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
  camonet:    [0, 0, 0, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4],
  guardpost:  [0, 0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 3],
  workshop:   [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  derrick:    [0, 0, 0, 0, 0, 1, 2, 2, 3, 3, 4, 4, 4],
  watchtower: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  gate:       [0, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6],
  snowtank:   [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  monument:   [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  goldtank:   [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
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
  { id: 'support', label: 'Army' },
  { id: 'traps',   label: 'Traps' },
  { id: 'walls',   label: 'Walls' },
  { id: 'deco',    label: 'Decor' },
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
  barracks: {
    name: 'Barracks', code: 'BK', cat: 'support', size: 3, max: MAX_LEVEL,
    desc: 'Trains troops you can deploy in battle. Higher levels hold a bigger army and unlock new troop types.',
    cost: { base: { gold: 600, steel: 300 }, growth: 1.75 },
    time: { base: 30, growth: 1.7 },
    hp: { base: 900, growth: 1.25 },
  },
  ammo: {
    name: 'Ammo Bunker', code: 'AB', cat: 'support', size: 2, max: MAX_LEVEL, aura: 'rate',
    desc: 'Keeps nearby defenses supplied: they fire faster while it stands.',
    cost: { base: { gold: 2500, steel: 2000 }, growth: 1.6 },
    time: { base: 60, growth: 1.7 },
    hp: { base: 800, growth: 1.25 },
    auraRange: 4, auraBase: 0.15, auraPer: 0.025,
  },
  radar: {
    name: 'Radar Station', code: 'RS', cat: 'support', size: 2, max: MAX_LEVEL, aura: 'range',
    desc: 'Spots targets early: nearby defenses get extra range while it stands.',
    cost: { base: { gold: 5000, steel: 4000 }, growth: 1.55 },
    time: { base: 90, growth: 1.7 },
    hp: { base: 700, growth: 1.25 },
    auraRange: 5, auraBase: 0.12, auraPer: 0.02,
  },
  flagpole:    { name: 'Flagpole', code: 'FP', cat: 'deco', size: 1, max: 1, deco: true, desc: 'Fly the colors over your base.', cost: { base: { gold: 200 }, growth: 1 }, time: { base: 0, growth: 1 }, hp: { base: 1, growth: 1 } },
  sandbags:    { name: 'Sandbag Pile', code: 'SP', cat: 'deco', size: 1, max: 1, deco: true, desc: 'Stacked sandbags. Purely for looks.', cost: { base: { gold: 100 }, growth: 1 }, time: { base: 0, growth: 1 }, hp: { base: 1, growth: 1 } },
  searchlight: { name: 'Searchlight', code: 'SL', cat: 'deco', size: 1, max: 1, deco: true, desc: 'Sweeps the night sky over your base.', cost: { base: { gold: 600, steel: 200 }, growth: 1 }, time: { base: 0, growth: 1 }, hp: { base: 1, growth: 1 } },
  radio:       { name: 'Radio Mast', code: 'RM', cat: 'deco', size: 1, max: 1, deco: true, desc: 'A tall mast with a blinking beacon.', cost: { base: { gold: 900, steel: 400 }, growth: 1 }, time: { base: 0, growth: 1 }, hp: { base: 1, growth: 1 } },
  camonet:     { name: 'Camo Net', code: 'CN', cat: 'deco', size: 2, max: 1, deco: true, desc: 'Camouflage netting over supply crates.', cost: { base: { gold: 700 }, growth: 1 }, time: { base: 0, growth: 1 }, hp: { base: 1, growth: 1 } },
  statue:      { name: 'Hero Statue', code: 'HS', cat: 'deco', size: 2, max: 1, deco: true, desc: 'A bronze monument to your victories.', cost: { base: { gold: 8000 }, growth: 1 }, time: { base: 0, growth: 1 }, hp: { base: 1, growth: 1 } },
  guardpost: {
    name: 'Guard Post', code: 'GP', cat: 'support', size: 2, max: MAX_LEVEL,
    desc: 'A garrison of free soldiers that rush out when enemies come close. Higher levels send more and better troops.',
    cost: { base: { gold: 2000, steel: 1500 }, growth: 1.6 },
    time: { base: 60, growth: 1.7 },
    hp: { base: 900, growth: 1.25 },
  },
  workshop: {
    name: 'Workshop', code: 'WS', cat: 'support', size: 2, max: MAX_LEVEL,
    desc: 'Crafts battle consumables: mine refills, med kits, overdrive charges and more. Higher levels craft faster and carry more.',
    cost: { base: { gold: 1800, steel: 1800 }, growth: 1.65 },
    time: { base: 60, growth: 1.7 },
    hp: { base: 700, growth: 1.25 },
  },
  derrick: {
    name: 'Oil Derrick', code: 'OD', cat: 'economy', size: 2, max: MAX_LEVEL,
    desc: 'Pumps oil, needed for vehicles, helicopters and the highest upgrade levels.',
    cost: { base: { gold: 3000, steel: 2500 }, growth: 1.7 },
    time: { base: 90, growth: 1.7 },
    hp: { base: 600, growth: 1.25 },
    produces: 'oil',
    rate: { base: 8, growth: 1.4 },
    hold: { base: 150, growth: 1.7 },
  },
  watchtower: {
    name: 'Watchtower', code: 'WT', cat: 'walls', size: 1, max: MAX_LEVEL,
    desc: 'A one-tile tower with a marksman. Place it in your wall lines.',
    cost: { base: { gold: 300, steel: 250 }, growth: 1.75 },
    time: { base: 0, growth: 1 },
    hp: { base: 500, growth: 1.5 },
    dmg: { base: 30, growth: 1.3 }, fireRate: 0.8, range: 5.5, targets: 'both',
  },
  gate: {
    name: 'Gate', code: 'GT', cat: 'walls', size: 1, max: MAX_LEVEL, gate: true,
    desc: 'Twice as tough as a wall. Your troops walk through it; enemies have to break it.',
    cost: { base: { steel: 120 }, growth: 2.0 },
    time: { base: 0, growth: 1 },
    hp: { base: 600, growth: 1.55 },
  },
  snowtank:    { name: 'Snow Tank', code: 'ST', cat: 'deco', size: 2, max: 1, deco: true, event: true, desc: 'Event decoration: a tank built of snow.', cost: { base: { gold: 0 }, growth: 1 }, time: { base: 0, growth: 1 }, hp: { base: 1, growth: 1 } },
  monument:    { name: 'Victory Arch', code: 'VA', cat: 'deco', size: 2, max: 1, deco: true, event: true, desc: 'Event decoration: a triumphal arch.', cost: { base: { gold: 0 }, growth: 1 }, time: { base: 0, growth: 1 }, hp: { base: 1, growth: 1 } },
  goldtank:    { name: 'Golden Tank', code: 'GK', cat: 'deco', size: 2, max: 1, deco: true, event: true, desc: 'Event decoration: a tank plated in gold.', cost: { base: { gold: 0 }, growth: 1 }, time: { base: 0, growth: 1 }, hp: { base: 1, growth: 1 } },
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
  // the top levels (9+) also cost oil
  const oilFor = c => (L >= 9 && !d.deco ? Math.round((c.gold + c.steel) * 0.12 / 10) * 10 : 0);
  if (d.costTable) { const c = { gold: d.costTable[L].gold || 0, steel: d.costTable[L].steel || 0 }; c.oil = oilFor(c); return c; }
  const m = Math.pow(d.cost.growth, L - 1);
  const r = v => (v ? Math.round((v * m) / 5) * 5 : 0);
  const c = { gold: r(d.cost.base.gold), steel: r(d.cost.base.steel) };
  c.oil = oilFor(c);
  return c;
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
  bulldozer: { name: 'Bulldozer', hp: 900, speed: 0.6, dmg: 40, rate: 1.0, range: 0.9, bounty: 30, r: 14, vehicle: true, wallBreaker: 5 },
  stealth:   { name: 'Stealth Commando', hp: 160, speed: 1.3, dmg: 14, rate: 1.2, range: 2.2, bounty: 14, r: 6, stealth: true },
  jammer:    { name: 'Jammer Truck', hp: 600, speed: 0.75, dmg: 35, rate: 1, range: 1.5, bounty: 30, r: 12, vehicle: true, jam: 4 },
  supply:    { name: 'Supply Truck', hp: 500, speed: 0.8, dmg: 35, rate: 1, range: 1.5, bounty: 25, r: 12, vehicle: true, supplyAura: 3 },
  skyfortress: { name: 'Sky Fortress', hp: 12000, speed: 0.28, dmg: 160, rate: 0.5, range: 2.6, splash: 1.5, bounty: 800, r: 36, air: true, boss: true, raidBoss: true },
  behemoth:  { name: 'Behemoth', hp: 12000, speed: 0.32, dmg: 200, rate: 0.45, range: 3.5, splash: 1.4, bounty: 800, r: 32, vehicle: true, boss: true, raidBoss: true },
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
  if (n >= 11) list.push({ type: 'bulldozer', count: Math.floor((n - 9) / 3) });
  if (n >= 12) list.push({ type: 'stealth', count: Math.floor((n - 10) / 2) });
  if (n >= 13) list.push({ type: 'supply', count: Math.floor((n - 11) / 4) + 1 });
  if (n >= 14) list.push({ type: 'jammer', count: Math.floor((n - 12) / 5) + 1 });
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
  bulldozer: 'Armored plow that smashes walls five times faster than anything else.',
  stealth: 'Invisible to your defenses until it gets close to one, or a Radar Station spots it.',
  jammer: 'Scrambles your radios: abilities aimed near it fail.',
  supply: 'Heals and speeds up the enemies around it.',
  skyfortress: 'Raid boss. A flying fortress: only anti-air weapons can touch it.',
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
  behemoth: 'Raid boss. A walking fortress that gets angrier as it takes damage.',
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
// The arsenal. Pick which abilities to bring before a battle (see LOADOUT_SLOTS).
const ABILITIES = {
  airstrike: { name: 'Airstrike', short: 'Airstrike', cooldown: 35, hq: 1, target: true, desc: 'A jet carpet-bombs a line through the spot you tap.' },
  repair:    { name: 'Field Repair', short: 'Repair', cooldown: 50, heal: 0.3, hq: 1, desc: 'Patches every standing building by 30%.' },
  paradrop:  { name: 'Paratroopers', short: 'Para', cooldown: 50, hq: 2, target: true, desc: 'Drops four rifle squads where you tap. They return home after the battle.' },
  artillery: { name: 'Artillery Barrage', short: 'Barrage', cooldown: 40, hq: 3, target: true, desc: 'Twelve shells rain down around the spot you tap.' },
  smoke:     { name: 'Smoke Screen', short: 'Smoke', cooldown: 45, hq: 4, target: true, desc: 'A smoke cloud slows enemies inside it and makes half their shots miss.' },
  emp:       { name: 'EMP Blast', short: 'EMP', cooldown: 60, hq: 6, desc: 'Freezes every vehicle and drone on the map for 5 seconds.' },
};
function loadoutSlots(hqL) { return hqL >= 8 ? 4 : hqL >= 5 ? 3 : 2; }
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
  training:   { name: 'Infantry Training', max: 10, desc: '+8% troop health and damage', per: 0.08, cost: { gold: 1600, steel: 900 } },
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
  droneop: {
    name: 'Spc. Ryo', title: 'Drone Operator', color: '#3f5a6a', unlock: { hq: 5 },
    hp: 380, speed: 1.6, dmg: 8, rate: 3, range: 3.2, regen: 5,
    ability: { name: 'Drone Swarm', cd: 26, desc: 'Launches four extra attack drones for 12 seconds.', dmg: 9, life: 12 },
    drone: { dmg: 11, rate: 3, range: 4 },
    bio: 'Controls an attack drone that hits air and ground. Unlocks at Command Center 5.',
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

/* ---------------- Troops (trained at the Barracks) ---------------- */
// space: army capacity used. unlock: Barracks level needed. time: seconds to train one.
const TROOPS = {
  rifle:  { name: 'Rifle Squad', hp: 170, dmg: 10, rate: 1.6, range: 2.8, speed: 1.3, space: 1, time: 15, cost: { gold: 60 }, unlock: 1, r: 6, color: '#55703a',
    desc: 'Cheap, quick to train. Good at holding enemies in place.' },
  gunner: { name: 'Machine Gunner', hp: 240, dmg: 5, rate: 6, range: 3.2, speed: 1.0, space: 2, time: 30, cost: { gold: 130 }, unlock: 2, r: 7, color: '#4f6a32', air: true,
    desc: 'Sprays bullets at infantry and drones.' },
  medic:  { name: 'Combat Medic', hp: 160, dmg: 0, heal: 22, rate: 1, range: 2.6, speed: 1.3, space: 2, time: 35, cost: { gold: 160 }, unlock: 3, r: 6, color: '#e2dccb',
    desc: 'Heals your troops and hero nearby.' },
  rocket: { name: 'Rocket Trooper', hp: 190, dmg: 70, rate: 0.6, range: 3.8, speed: 1.1, space: 3, time: 50, cost: { gold: 220, steel: 80 }, unlock: 4, r: 7, color: '#5d6b3a', antiArmor: 2, air: true,
    desc: 'Rockets deal double damage to vehicles and can hit aircraft.' },
  sniper: { name: 'Marksman', hp: 140, dmg: 120, rate: 0.5, range: 6.5, speed: 1.1, space: 3, time: 60, cost: { gold: 280 }, unlock: 5, r: 6, color: '#3f4a27',
    desc: 'Very long range, picks off dangerous targets.' },
  flame:  { name: 'Flame Squad', hp: 260, dmg: 10, rate: 5, range: 2, speed: 1.1, space: 3, time: 45, cost: { gold: 240 }, unlock: 3, r: 7, color: '#6a5232', splash: 1.0,
    desc: 'Short-range flamethrowers that burn groups of infantry.' },
  engineer: { name: 'Combat Engineer', hp: 220, dmg: 6, rate: 1.5, range: 2.4, speed: 1.2, space: 2, time: 40, cost: { gold: 200, steel: 100 }, unlock: 4, r: 6, color: '#b8682a', repair: 30,
    desc: 'Repairs damaged walls and buildings nearby while under fire.' },
  mortarteam: { name: 'Mortar Team', hp: 180, dmg: 60, rate: 0.35, range: 7, minRange: 2, speed: 0.9, space: 4, time: 70, cost: { gold: 350, steel: 150 }, unlock: 6, r: 7, color: '#4f5a2f', splash: 1.2, lob: true,
    desc: 'Lobs shells over walls from long range. Cannot hit enemies right next to it.' },
  heli:   { name: 'Attack Helicopter', hp: 900, dmg: 40, rate: 1.2, range: 4.2, speed: 1.8, space: 8, time: 160, cost: { gold: 1200, steel: 600, oil: 200 }, unlock: 8, r: 16, color: '#4f6a32', flying: true, air: true,
    desc: 'Your first air unit. Fast, hits ground and air with rockets. Needs oil.' },
  tank:   { name: 'Battle Tank', hp: 1600, dmg: 95, rate: 0.6, range: 4.4, speed: 0.8, space: 10, time: 180, cost: { gold: 1000, steel: 700, oil: 120 }, unlock: 7, r: 14, color: '#4f6a32', vehicle: true, splash: 0.8,
    desc: 'Heavy armor and a big gun. Takes a lot of room.' },
};
function barracksCapacity(L) { return L > 0 ? 10 + (L - 1) * 6 : 0; }
function troopScale(L) { return 1 + 0.12 * (L - 1); } // troops get stronger with Barracks level

/* ---------------- Elites and threat levels ---------------- */
const ELITE = { hp: 2.2, dmg: 1.3, bounty: 3 };
const THREATS = [
  { id: 'recruit', name: 'Recruit', hp: 0.75, loot: 0.75, elite: 0, need: 0 },
  { id: 'regular', name: 'Regular', hp: 1, loot: 1, elite: 0.06, need: 0 },
  { id: 'veteran', name: 'Veteran', hp: 1.45, loot: 1.6, elite: 0.12, need: 8 },
  { id: 'nightmare', name: 'Nightmare', hp: 2.1, loot: 2.6, elite: 0.2, need: 15 },
];

/* ---------------- Weather and time of day ---------------- */
const WEATHER = [
  { id: 'clear', name: 'Clear skies', weight: 5, range: 1 },
  { id: 'rain', name: 'Heavy rain', weight: 2, range: 0.95 },
  { id: 'fog', name: 'Thick fog', weight: 1, range: 0.9, slow: 0.9 },
];
const DAYTIME = [
  { id: 'day', name: 'Day', weight: 5, dark: 0, loot: 1 },
  { id: 'dusk', name: 'Dusk', weight: 2, dark: 0.28, loot: 1.1 },
  { id: 'night', name: 'Night', weight: 2, dark: 0.55, loot: 1.25 },
];

/* ---------------- Veterancy: defenses improve with kills ---------------- */
const VET_RANKS = [{ kills: 50, bonus: 0.05 }, { kills: 200, bonus: 0.10 }, { kills: 600, bonus: 0.16 }];
function vetRank(kills) { let r = 0; for (const v of VET_RANKS) if ((kills || 0) >= v.kills) r++; return r; }

/* ---------------- Boss raid: the Behemoth ---------------- */
const RAID = { timeLimit: 150, tiers: [0.1, 0.25, 0.5, 0.75, 1], tierMedals: [3, 5, 8, 12, 20] };

/* ---------------- War Chest: monthly reward track ---------------- */
const CHEST_TIER_STARS = 15;
const CHEST_TIERS = 30;
function chestReward(i) {
  if ((i + 1) % 10 === 0) return { medals: 25, gold: 3000 * (1 + i / 10), steel: 3000 * (1 + i / 10) };
  if ((i + 1) % 5 === 0) return { medals: 10 };
  return i % 2 ? { steel: 600 + i * 120 } : { gold: 600 + i * 120 };
}

/* ---------------- Achievements: three tiers each ---------------- */
const ACHIEVEMENTS = [
  { id: 'kills', name: 'Exterminator', stat: s => s.stats.kills || 0, tiers: [250, 2500, 20000], medals: [5, 15, 40], unit: 'enemies destroyed' },
  { id: 'wave', name: 'Last One Standing', stat: s => s.bestWave || 0, tiers: [10, 25, 50], medals: [5, 15, 40], unit: 'best endless wave' },
  { id: 'builder', name: 'Architect', stat: s => s.stats.built || 0, tiers: [25, 100, 300], medals: [5, 12, 30], unit: 'structures built' },
  { id: 'stars', name: 'Campaigner', stat: s => Object.values((s.campaign || {}).stars || {}).reduce((a, b) => a + b, 0), tiers: [9, 24, 36], medals: [5, 15, 40], unit: 'campaign stars' },
  { id: 'trainer', name: 'Drill Sergeant', stat: s => s.stats.trained || 0, tiers: [50, 300, 1500], medals: [5, 15, 35], unit: 'troops trained' },
  { id: 'daily', name: 'Daily Grind', stat: s => s.stats.dailies || 0, tiers: [3, 15, 50], medals: [5, 15, 40], unit: 'daily challenges won' },
  { id: 'boss', name: 'Giant Slayer', stat: s => s.stats.bosses || 0, tiers: [3, 20, 75], medals: [5, 15, 40], unit: 'Siege Tanks destroyed' },
  { id: 'raid', name: 'Behemoth Hunter', stat: s => s.stats.raidKills || 0, tiers: [1, 5, 20], medals: [10, 25, 60], unit: 'Behemoths destroyed' },
  { id: 'gold', name: 'Tycoon', stat: s => s.stats.collectedGold || 0, tiers: [10000, 150000, 1500000], medals: [5, 15, 40], unit: 'gold mined' },
  { id: 'clear', name: 'Groundskeeper', stat: s => s.stats.cleared || 0, tiers: [5, 25, 100], medals: [5, 10, 25], unit: 'obstacles cleared' },
];

/* ---------------- Quartermaster: spend medals ---------------- */
const QM_ITEMS = [
  { id: 'gold-s', name: 'Gold Crate', desc: '+15% of storage in gold', medals: 6, kind: 'gold', amount: 0.15 },
  { id: 'steel-s', name: 'Steel Crate', desc: '+15% of storage in steel', medals: 6, kind: 'steel', amount: 0.15 },
  { id: 'gold-l', name: 'Gold Vault', desc: '+50% of storage in gold', medals: 16, kind: 'gold', amount: 0.5 },
  { id: 'steel-l', name: 'Steel Vault', desc: '+50% of storage in steel', medals: 16, kind: 'steel', amount: 0.5 },
  { id: 'boost-prod', name: 'Overtime Shift', desc: 'Mines and foundries produce twice as fast for 1 hour', medals: 10, boost: 'prod' },
  { id: 'boost-build', name: 'Engineering Corps', desc: 'Construction runs twice as fast for 1 hour', medals: 14, boost: 'build' },
  { id: 'boost-train', name: 'Boot Camp', desc: 'Troops train four times as fast for 1 hour', medals: 8, boost: 'train' },
];
const BOOST_TIME = 60 * 60 * 1000;

/* ---------------- Obstacles that appear around the base ---------------- */
const OBSTACLES = {
  rock:   { name: 'Boulder', cost: { gold: 300 }, medals: [1, 3], xp: 10 },
  tree:   { name: 'Tree', cost: { gold: 200 }, medals: [1, 2], xp: 8 },
  bush:   { name: 'Bush', cost: { gold: 100 }, medals: [0, 1], xp: 5 },
  wreck:  { name: 'Burnt-out Wreck', cost: { steel: 400 }, medals: [2, 4], xp: 15 },
};
const OBSTACLE_EVERY = 3 * 60 * 60 * 1000;
const OBSTACLE_MAX = 8;

/* ---------------- Map themes ---------------- */
const THEMES = {
  forest: { name: 'Forest', need: 1, wild: '#41582d', wild2: '#3a4f28', a: '#55703a', b: '#5b773e', dirt: '#7a6646', dirtDark: '#5f4f36', road: '#6e5f45', trees: ['#2f4a22', '#3a5a29', '#4c6f33'], tuftA: 'rgba(140,165,90,0.35)', tuftB: 'rgba(25,40,15,0.35)', bg: '#2c3a20' },
  desert: { name: 'Desert', need: 4, wild: '#b89a62', wild2: '#a88a55', a: '#c7aa70', b: '#cdb178', dirt: '#8f7448', dirtDark: '#76603c', road: '#9c8158', trees: ['#5f7a3a', '#6e8a42', '#86a250'], tuftA: 'rgba(240,220,170,0.35)', tuftB: 'rgba(110,80,40,0.3)', bg: '#8a7448' },
  winter: { name: 'Winter', need: 7, wild: '#cfd8de', wild2: '#bcc7cf', a: '#e3e9ed', b: '#dce3e8', dirt: '#8a8f94', dirtDark: '#6f7479', road: '#9ea5ab', trees: ['#2e4a3c', '#36574a', '#47695a'], tuftA: 'rgba(255,255,255,0.5)', tuftB: 'rgba(120,140,150,0.3)', bg: '#9eabb5' },
};

const UPDATE_VERSION = '1.0';

/* =================== Update 2: Iron Front =================== */

// Armory: per-troop upgrades (level 1-5), capped by the Barracks level.
const ARMORY_MAX = 5;
function armoryCost(t, L) { const base = (TROOPS[t].cost.gold || 0) + (TROOPS[t].cost.steel || 0); return { gold: 0, steel: Math.round(base * 6 * Math.pow(2, L - 1) / 10) * 10, oil: L >= 4 ? Math.round(base * 0.5 * L / 10) * 10 : 0 }; }
function armoryBonus(L) { return 1 + 0.15 * ((L || 1) - 1); }

// Troop stances, switched in battle.
const STANCES = [
  { id: 'hold', name: 'Hold', leash: 1.5, desc: 'Stay close to the post' },
  { id: 'aggressive', name: 'Attack', leash: 99, desc: 'Hunt any enemy in sight' },
  { id: 'guard', name: 'Guard hero', leash: 3, desc: 'Follow and protect the hero' },
];

// Hero skill trees: one point per level, max 5 per branch.
const SKILL_BRANCHES = [
  { id: 'off', name: 'Firepower', desc: '+8% damage per point', per: 0.08 },
  { id: 'surv', name: 'Toughness', desc: '+10% health and regeneration per point', per: 0.10 },
  { id: 'abil', name: 'Tactics', desc: '-8% ability cooldown and +10% ability damage per point', per: 0.08 },
];
const SKILL_MAX = 5;

// Hero gear: drops from raids, three-star campaign wins and daily challenges.
const GEAR_SLOTS = { weapon: 'Weapon', armor: 'Armor', charm: 'Charm' };
const GEAR_TIERS = [
  { id: 'common', name: 'Standard', mult: 1, color: '#a6a58a' },
  { id: 'rare', name: 'Veteran', mult: 1.8, color: '#6ec0ff' },
  { id: 'epic', name: 'Legendary', mult: 2.8, color: '#f2b632' },
];
const GEAR_NAMES = {
  weapon: ['Rifle Scope', 'Extended Mag', 'Tungsten Rounds', 'Gyro Stabilizer'],
  armor: ['Kevlar Vest', 'Ceramic Plates', 'Blast Liner', 'Ghillie Suit'],
  charm: ['Lucky Coin', 'Dog Tags', 'Field Radio', 'Old Compass'],
};
const GEAR_STAT = { weapon: { key: 'dmg', base: 0.06, label: 'damage' }, armor: { key: 'hp', base: 0.08, label: 'health' }, charm: { key: 'cd', base: 0.05, label: 'faster ability' } };

// Endless-mode wave upgrades: pick one of three every five waves.
const WAVE_CARDS = [
  { id: 'dmg', name: 'Hot Barrels', desc: '+15% damage for every defense', apply: b => { b.dmgAll += 0.15; } },
  { id: 'rate', name: 'Ammo Belts', desc: '+12% fire rate for every defense', apply: b => { b.rate += 0.12; } },
  { id: 'range', name: 'Spotters', desc: '+10% range for every defense', apply: b => { b.range += 0.10; } },
  { id: 'troops', name: 'Battle Drills', desc: '+30% troop damage and health', apply: b => { b.troops += 0.3; } },
  { id: 'hero', name: 'Hero\'s Resolve', desc: '+40% hero damage', apply: b => { b.hero += 0.4; } },
  { id: 'loot', name: 'Plunder', desc: '+40% gold from kills', apply: b => { b.loot += 0.4; } },
  { id: 'cd', name: 'Fast Turnaround', desc: 'Abilities recharge 25% faster', apply: b => { b.cd *= 0.75; } },
  { id: 'repair', name: 'Field Engineers', desc: 'Repair every building by 50% now', now: 'repair' },
  { id: 'mines', name: 'Re-arm Mines', desc: 'All used land mines re-arm now', now: 'mines' },
  { id: 'walls', name: 'Sandbag Reinforcement', desc: '+60% wall and gate health', now: 'walls' },
  { id: 'reinforce', name: 'Free Platoon', desc: 'Six free rifle squads join the fight now', now: 'platoon' },
  { id: 'cannon', name: 'Heavy Shells', desc: '+35% Cannon, Mortar and Howitzer damage', apply: b => { b.dmgType.cannon = (b.dmgType.cannon || 0) + 0.35; b.dmgType.mortar = (b.dmgType.mortar || 0) + 0.35; b.dmgType.howitzer = (b.dmgType.howitzer || 0) + 0.35; } },
  { id: 'aa', name: 'Flak Doctrine', desc: '+40% damage against air units', apply: b => { b.antiAir += 0.4; } },
];

// Enemy factions rotate every week in endless battles.
const FACTIONS = [
  { id: 'legion', name: 'Iron Legion', commander: 'General Kroll', color: '#6b4a3a', rule: 'Vehicles have 40% more health', vehHp: 1.4 },
  { id: 'hawks', name: 'Red Hawks', commander: 'Air Marshal Vey', color: '#a8402a', rule: 'Twice as many drones and gunships, which fly 20% faster', airMul: 2, airSpeed: 1.2 },
  { id: 'swarm', name: 'Black Swarm', commander: 'The Hive', color: '#2e2c29', rule: '50% more infantry, each a little weaker', infMul: 1.5, infHp: 0.8 },
  { id: 'corps', name: 'Sapper Corps', commander: 'Major Dunn', color: '#8a6a3a', rule: 'Triple sappers and early bulldozers', sapperMul: 3, earlyDozers: true },
];

// Surprise attacks while you are away.
const SURPRISE = { minAway: 2 * 3600 * 1000, cooldown: 6 * 3600 * 1000, chance: 0.7 };

// World map: outposts you can capture for passive income.
const OUTPOSTS = [
  { id: 'o1', name: 'Pine Ridge', x: 18, y: 62, level: 2, hq: 2, income: { gold: 120 } },
  { id: 'o2', name: 'Old Quarry', x: 34, y: 30, level: 4, hq: 3, income: { steel: 120 } },
  { id: 'o3', name: 'Radio Hill', x: 50, y: 70, level: 6, hq: 4, income: { gold: 220, steel: 120 } },
  { id: 'o4', name: 'Dry Creek Depot', x: 60, y: 38, level: 8, hq: 5, income: { steel: 260 } },
  { id: 'o5', name: 'Oil Flats', x: 76, y: 66, level: 10, hq: 6, income: { oil: 60 } },
  { id: 'o6', name: 'Iron Pass', x: 82, y: 24, level: 13, hq: 7, income: { gold: 450, steel: 300 } },
  { id: 'o7', name: 'Fort Ashen', x: 92, y: 50, level: 16, hq: 8, income: { gold: 600, steel: 450, oil: 80 } },
];

// Workshop consumables, used from the deploy bar in battle.
const ITEMS = {
  minekit:  { name: 'Mine Refill', desc: 'Re-arms every land mine', cost: { steel: 400 }, time: 120, hq: 3 },
  medkit:   { name: 'Med Kit', desc: 'Heals your troops and hero by 60%', cost: { gold: 500 }, time: 120, hq: 3 },
  overdrive:{ name: 'Overdrive', desc: 'Defenses fire 50% faster for 15 seconds', cost: { gold: 600, steel: 600 }, time: 240, hq: 4 },
  sandbags: { name: 'Sandbag Drop', desc: 'Repairs every wall and gate by 50%', cost: { steel: 700 }, time: 180, hq: 3 },
  smokepot: { name: 'Smoke Charge', desc: 'A smoke cloud at your Command Center', cost: { gold: 300, steel: 300 }, time: 150, hq: 4 },
  fuelbomb: { name: 'Fuel Bomb', desc: 'Huge explosion where you tap', cost: { steel: 500, oil: 120 }, time: 300, hq: 5 },
};
function itemCap(wsLevel) { return 1 + Math.floor((wsLevel || 0) / 2); }

// Daily orders: three small goals every day.
const ORDER_TYPES = [
  { id: 'kill', text: n => `Destroy ${n} enemies`, n: [60, 120, 200], reward: 3 },
  { id: 'killair', text: n => `Shoot down ${n} aircraft`, n: [5, 10, 20], reward: 4 },
  { id: 'killveh', text: n => `Destroy ${n} vehicles`, n: [8, 15, 25], reward: 4 },
  { id: 'waves', text: n => `Clear ${n} waves`, n: [5, 10, 15], reward: 3 },
  { id: 'train', text: n => `Train ${n} troops`, n: [10, 20, 40], reward: 3 },
  { id: 'deploy', text: n => `Deploy ${n} troops in battle`, n: [8, 16, 30], reward: 3 },
  { id: 'ability', text: n => `Use abilities ${n} times`, n: [4, 8, 12], reward: 3 },
  { id: 'collect', text: n => `Collect ${n} gold from mines`, n: [1000, 3000, 8000], reward: 2 },
  { id: 'upgrade', text: n => `Finish ${n} upgrades`, n: [2, 4, 6], reward: 3 },
  { id: 'mission', text: () => 'Win a campaign mission, daily challenge or raid', n: [1, 1, 1], reward: 5 },
];

// Monthly event: a new theme each month with its own token shop.
const EVENTS = [
  { name: 'Winter Offensive', color: '#9fd0e8', shop: ['snowtank', 'skin:arctic', 'flag:white'] },
  { name: 'Operation Harvest', color: '#e0763a', shop: ['monument', 'skin:desert', 'flag:orange'] },
  { name: 'Golden Jubilee', color: '#f2b632', shop: ['goldtank', 'skin:gold', 'flag:gold'] },
];
const EVENT_PRICES = { deco: 120, skin: 200, flag: 60, medals: 30 };

// Cosmetics: Command Center skins, flag colors, troop camo.
const HQ_SKINS = {
  classic: { name: 'Classic', roof: null, price: 0 },
  desert: { name: 'Desert Camo', roof: '#9c8657', price: 40 },
  arctic: { name: 'Arctic', roof: '#b8c4cc', price: 40 },
  night: { name: 'Night Ops', roof: '#2a2e33', price: 60 },
  gold: { name: 'Gilded', roof: '#b88a1c', price: 150 },
};
const FLAGS = {
  red: { name: 'Red', color: '#c8402a', price: 0 },
  green: { name: 'Green', color: '#55703a', price: 15 },
  blue: { name: 'Blue', color: '#3f6fa8', price: 15 },
  white: { name: 'White', color: '#e9e4d4', price: 25 },
  orange: { name: 'Orange', color: '#e0763a', price: 25 },
  gold: { name: 'Gold', color: '#f2b632', price: 40 },
};
const CAMO = {
  standard: { name: 'Woodland', color: null, price: 0 },
  desert: { name: 'Desert', color: '#8f7448', price: 30 },
  urban: { name: 'Urban', color: '#6b6f74', price: 30 },
  tiger: { name: 'Tiger Stripe', color: '#4a5a2a', price: 45 },
};
const UPDATE2_VERSION = '2.0';
