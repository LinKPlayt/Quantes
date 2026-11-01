# WarBreach

A landscape base-defense game for phones. Build and upgrade a military base, then survive endless waves of enemy armies.

## Play

Open `index.html` in a browser, or host the folder on any static host (GitHub Pages works). On a phone, use **Add to Home Screen** for a fullscreen landscape app. Progress saves in the browser automatically.

## Features

- Top-down military compound with fence, gates and approach roads
- Command Center (HQ levels 1–5) that unlocks buildings, storage and higher levels
- Economy: Gold Mine, Steel Foundry, Supply Depot (tap bubbles to collect)
- Defenses: Machine Gun Nest, Cannon, Mortar Pit, Sniper Tower, Missile Battery
- Walls in five tiers that link together as you lay them
- Build timers with 2 builders, upgrade / move / sell, offline production
- Touch controls: drag to pan, pinch to zoom, drag the outline to place
- Battle mode: endless waves come down the west, east and north roads
  - Riflemen, Grenadiers, Armored Jeeps, Light Tanks and Attack Drones
  - Enemies path around walls when they can and break through when they can't
  - Each defense fires its own way: MG tracers, cannon shells, lobbed mortars, sniper shots, homing rockets
  - The Command Center has a rooftop gun
  - Kills and cleared waves pay gold and steel; damage is repaired after the battle
  - Speed x1/x2/x3, retreat, best-wave record

## Update 2: sixteen new features

1. **Sound effects** – synthesized gunfire, explosions, building, collecting, alarms (toggle in the menu)
2. **Vibration** – phone buzzes on big explosions, boss waves and rewards (toggle in the menu)
3. **Medals** – new currency from battles, missions, promotions and supply drops
4. **Finish now** – spend medals to complete construction instantly
5. **Hire builders** – tap the builders counter to hire a 3rd and 4th builder
6. **Collect all** – one button empties every mine and foundry
7. **Flame Bunker** – new short-range defense (HQ 2) that burns groups of infantry
8. **Airstrike** – battle ability: tap the map and a jet carpet-bombs that spot
9. **Field Repair** – battle ability: patches every standing building by 30%
10. **Boss waves** – every 5th wave brings a Siege Tank
11. **Field Medic** – new enemy (wave 4+) that heals nearby attackers
12. **Missions** – 15 objectives with gold, steel and medal rewards
13. **Commander ranks** – earn XP from building and fighting, get promoted from Private to General
14. **Supply drops** – a crate parachutes into the base every couple of hours
15. **Rename your base** – tap the badge in the top-left
16. **Battle damage report** and **upgrade all walls of a level at once**

## Update 4: new enemies and graphics

**Seven new enemy types** (14 total), each with its own art and behavior:
Scout Bike (fast raider) · Sapper (suicide charge) · Troop Carrier (drops 4 riflemen when destroyed) ·
Flame Trooper (burns buildings) · Heavy Gunner (armor shrugs off light bullets) ·
Gunship (armored helicopter) · Artillery Truck (shells from long range).
New arrivals are announced at the start of a wave, and the battle briefing has an **Enemy guide**.

**Graphics:** redrawn soldiers with walking legs and gear, detailed vehicles, explosions with shockwaves and
light flashes, muzzle flashes, camera shake, craters, tank tracks and wrecks left on the battlefield,
burning buildings, big-hit damage numbers, drifting cloud shadows, birds over the base, warm lighting,
a vignette that pulses red when the Command Center is in danger.

## Code layout

- `js/data.js` – building stats, costs, limits per HQ level, wave previews
- `js/render.js` – procedural terrain and building art (canvas)
- `js/audio.js` – synthesized sound effects and vibration
- `js/battle.js` – battle mode: waves, enemy pathing (flow field), turret fire, rewards
- `js/game.js` – state, saving, placement, input, HUD and main loop
- `style.css` – HUD, panels, shop and modals
