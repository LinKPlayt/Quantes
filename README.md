# WarBreach

A landscape base-defense game for phones. Build and upgrade a military base, then (coming next) survive waves of enemy armies.

## Play

Open `index.html` in a browser, or host the folder on any static host (GitHub Pages works). On a phone, use **Add to Home Screen** for a fullscreen landscape app. Progress saves in the browser automatically.

## What's in this first build

- Top-down military compound with fence, gates and approach roads
- Command Center (HQ levels 1–5) that unlocks buildings, storage and higher levels
- Economy: Gold Mine, Steel Foundry, Supply Depot (tap bubbles to collect)
- Defenses: Machine Gun Nest, Cannon, Mortar Pit, Sniper Tower, Missile Battery
- Walls in five tiers that link together as you lay them
- Build timers with 2 builders, upgrade / move / sell, offline production
- Touch controls: drag to pan, pinch to zoom, drag the outline to place
- Battle button with a wave briefing (battle mode is the next phase)

## Code layout

- `js/data.js` – building stats, costs, limits per HQ level, wave previews
- `js/render.js` – procedural terrain and building art (canvas)
- `js/game.js` – state, saving, placement, input, HUD and main loop
- `style.css` – HUD, panels, shop and modals
