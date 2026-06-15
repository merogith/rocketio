# Architecture

RocketIO is a single-page browser game with **no engine and no UI framework**. It is plain ES modules, an HTML5 Canvas, and WebAudio, bundled by Vite. State lives in a single authoritative `Game` instance; the renderer and UI are read-only consumers of that state.

## Module map

```
src/
  main.js              Entry point. Owns the DOM/UI wiring, menus, and the
                       requestAnimationFrame game loop. Imports everything else.

  core/
    game.js            The Game class — the authoritative simulation: turn/tick
                       updates, economy, structure behaviour, combat resolution,
                       projectiles/interception, diplomacy, and victory checks.
    hexGrid.js         Hex (axial coordinate + distance/neighbours), HexGrid
                       (procedural map generation + tile store), and Camera
                       (pan/zoom, world↔screen transforms).
    constants.js       All tunables in one place: UNIT_STATS, GAME_CONFIG,
                       DIFFICULTY, VICTORY_MODES, keybinds, colours, plus pure
                       economy helpers (gov income, hex-disk counts).

  ai/
    ai.js              updateAI(game, time) — doctrine-driven opponent logic.
                       Doctrines bias build/attack/expand weights; the AI reads
                       enemy composition and transitions phases.

  render/
    renderer.js        The Renderer class — draws tiles, fog of war, structures,
                       projectiles, particles, selection, and the minimap to Canvas.
    sfx.js             The SFX module — ZzFX procedural sound effects and an
                       adaptive WebAudio score whose intensity tracks threat.

  ui/
    uiPanels.js        Draggable/collapsible/closeable HUD panels (side-effect import).
    input.js           Keybind + settings model and per-frame input state.
    tutorial.js        Tutorial page content (pulls live numbers from constants.js).
    factionsDisplay.js Faction banners, leader portraits, perk copy.

  data/
    factions.js        The 14 nations: codes, leader perks, modifier helpers.
    factionUnits.js    The 70 faction-unique unit definitions (data tables).
    realWorldMaps.js   Hand-authored coastline templates.
    campaignData.js / campaignScenarios.js / campaignProgress.js
                       Campaign missions, scenario setup, and localStorage progress.
```

## Data flow

The whole game runs from one loop in `main.js`:

```
requestAnimationFrame(loop)
  └─ handleInput()                 read keyboard/mouse → intents (build, select, pan)
  └─ game.update(time)             advance the simulation one frame:
       ├─ tick()                   gold income, missile production, militia, regen
       ├─ updateStructures()       per-structure behaviour + firing
       ├─ projectile/impact()      movement, interception, damage resolution
       └─ checkVictory()           per-mode win/lose evaluation
  └─ updateAI(game, gameTime)      opponents issue their own build/attack intents
  └─ renderer.render(game)         draw current state (read-only)
  └─ HUD update                    gold/tiles/missiles/threat readouts
```

`Game` is the single source of truth. Input and AI both mutate `Game` through the same paths; the renderer and HUD only _read_ it. This keeps the simulation deterministic enough to run **headless** — see `tools/balance-harness.html` and `tests/smoke.test.js`, which construct a `HexGrid` + `Game` and step `update()`/`updateAI()` with no Canvas at all.

## Key design choices

- **Single authoritative state object.** No global mutable game state scattered across modules; `main.js` holds the one `game` reference and passes it down.
- **Tunables isolated in `constants.js`.** Balance and feel are data, not code — the tutorial and balance harness read the same numbers the simulation does, so they never drift.
- **Procedural assets.** Terrain, units, projectiles, and audio are generated at runtime, so there is no asset pipeline to maintain and the entire game ships as code.
- **Headless-friendly core.** `core/` and `ai/` have no DOM or Canvas dependencies, which makes the simulation testable and the balance harness possible.
