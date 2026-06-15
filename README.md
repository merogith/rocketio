# RocketIO

**A real-time, hex-grid strategy game of missiles, economy, and interception — built from scratch in vanilla JavaScript and Canvas.**

Command one of **14 world powers**, each with its own doctrine, leader perks, and a roster of unique units. Expand your borders, balance a missile economy against your defenses, and out-maneuver up to six rival AIs across procedurally generated and hand-authored real-world maps.

> No engine, no framework, no asset pipeline — every tile, unit, projectile, and sound is generated procedurally at runtime.

---

## Highlights

- **14 playable factions**, each with 5 faction-unique units (70 total) layered on a shared 20-structure tech tree — economy, defense, offense, ground, and navy.
- **Doctrine-driven AI** with distinct personalities (Aggressor, Turtle, Bomber, Economist, Raider, Swarm, and more) that reads your composition and shifts phases from expansion to domination.
- **Five victory modes** — Conquest, Domination, Regime Change, Blitz, and Last Stand — with adjustable parameters.
- **Real missile economy** — factories produce missiles, launchers consume them, and anti-air batteries intercept incoming volleys. Supply, not just gold, gates your offense.
- **Procedural everything** — hex terrain (gradient-noise continents, archipelagos, inland seas) plus hand-authored coastlines (Mediterranean, British Isles, Japan, Caribbean); ZzFX sound effects and an adaptive WebAudio score that tightens with on-screen threat.
- **Fog of war** with a remembered last-known-enemy layer, draggable/collapsible HUD panels, a single-player campaign, and a full tutorial.

## Run it locally

```bash
npm install
npm run dev      # start the Vite dev server, then open the printed URL
```

Other scripts:

| Script            | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `npm run build`   | Production build to `dist/`                                          |
| `npm run preview` | Serve the production build                                           |
| `npm test`        | Run the Vitest suite (hex math, economy, balance, headless game sim) |
| `npm run lint`    | ESLint                                                               |
| `npm run format`  | Prettier                                                             |

> **Display:** designed for desktop browsers at 1280×720 and up.

## Controls

| Action                         | Key                             |
| ------------------------------ | ------------------------------- |
| Pan camera                     | `W` `A` `S` `D`                 |
| Build (Economy → Navy)         | `1`–`0`, `I` (ICBM), `F2`–`F10` |
| Upgrade selected / upgrade all | `Space` / `U`                   |
| Select all of a type           | `Q`                             |
| Demolish                       | `X`                             |
| Center on capital / last hit   | `H` / `J`                       |
| Game speed                     | `+` / `-`                       |
| Pause · Settings · Combat log  | `P` · `,` · `L`                 |

All keys are rebindable in **Settings**.

## Tech stack

- **Vanilla JavaScript (ES modules)** — no game engine or UI framework.
- **HTML5 Canvas** for all rendering; **WebAudio** (ZzFX + a procedural score) for sound.
- **Vite** for dev server and bundling.
- **ESLint + Prettier + Vitest** with **GitHub Actions** CI.

## Project layout

```
src/
  main.js          # entry: bootstrapping, UI wiring, game loop
  core/            # game.js (rules/combat/economy), hexGrid.js, constants.js (tunables)
  ai/              # ai.js (doctrines + decision-making)
  render/          # renderer.js (Canvas), sfx.js (audio)
  ui/              # HUD panels, input, tutorial, faction display
  data/            # factions, faction units, campaign, real-world maps
tests/             # Vitest suites
tools/             # balance-harness.html — headless balance simulator (dev only)
docs/              # ARCHITECTURE.md, BALANCE.md, Units.csv
public/assets/     # static assets
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the module map and data flow, and [`docs/BALANCE.md`](docs/BALANCE.md) for the unit-balance methodology.

## License

[MIT](LICENSE)
