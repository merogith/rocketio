# Balance methodology

This document explains how RocketIO's units are balanced, the metric used to compare them, and why most "outliers" a naive analysis flags are intentional. The raw stat tables live in [`Units.csv`](Units.csv) and `src/data/factionUnits.js` / `src/core/constants.js`.

## The metric: damage per gold, per second

The right yardstick for an offensive unit is **sustained damage per gold spent**:

```
dps  = damage × projectiles / (interval_ms / 1000)
dpc  = dps / cost
```

Dividing by the reload `interval` is the part that matters. A common mistake is to rank units by `damage × projectiles ÷ cost` (a _per-shot_ figure), which makes any slow, high-volley unit look broken. For example, Poland's HOMAR MLRS fires 7 projectiles and looks ~2× a Rocket Launcher per shot — but its 10-second reload puts it right at the roster median on a per-second basis. The same correction applies to China's Type 055 and other high-volley platforms: **they are balanced once fire rate is accounted for.**

The generic Rocket Launcher line is the reference point (`RL1 ≈ 0.023`, `RL3 ≈ 0.048` dpc).

## Comparing within role, not across roles

`dpc` only compares like with like. It deliberately ignores everything a unit trades damage _for_, so a low `dpc` is not the same as "underpowered." Units are compared against the **generic baseline for their own category** (offense / ground / navy), and the following are read as design, not bugs:

- **Percent-HP and burst weapons.** Russia's Solntsepyok (`pctHpDmg` 8–22% + splash) and Iran's Fateh silo (`interval 45000` with `preStock` salvos at long range) have low _flat_ `dpc` by design — their value is in chunking high-HP structures or long-range alpha strikes.
- **Spread / saturation weapons.** China's PCL-181 (`autoSpread`) distributes its projectiles across multiple targets, so its single-target `dpc` understates it.
- **Navy.** Naval units are water-only and therefore useless on land-heavy maps. They are tuned to a higher `dpc` band (~1.5–1.8× their generic) to compensate for that conditionality.
- **0-damage support.** USA's Targeting/Stryker cells (`damage: 0`) are aura/illumination units; they have no `dpc` and are excluded from the metric entirely.

## What was actually out of band

After accounting for the above, one unit was an unambiguous outlier:

| Unit                                        | Before                        | After                 | Reason                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ----------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Iran Houdong Swarm Flotilla** (`IRN_NAV`) | dpc 0.043 / 0.075 / **0.125** | 0.026 / 0.038 / 0.059 | A plain multi-projectile naval unit with **no compensating mechanic**, sitting at 2.9–4.4× the naval baseline — far above even its naval peers (e.g. `SUI_NAV` ≈ 1.8×). Reduced projectile counts and raised costs to land it in the naval band while keeping its high-projectile "swarm" identity. |

Everything else flagged by the automated sweep was verified to fall into one of the intentional categories above and left unchanged.

## Guardrail

`tests/balance.test.js` enforces three invariants so balance can't silently regress:

1. **Data integrity** — every unit level has positive, finite cost/hp and non-negative stats.
2. **Level monotonicity** — cost and HP strictly increase L1 → L2 → L3.
3. **Efficiency ceiling** — no non-superweapon combat unit exceeds `dpc 0.085`. This is comfortably above the legitimate top of the band (`FIN_NAV3 ≈ 0.068`, whose late-game time-scaling earns it) and would have caught the pre-rebalance Houdong at 0.125.

## Validating with simulation

`tools/balance-harness.html` runs the real game logic headless at max speed — DPS/gold tables, missile-economy curves, government ROI, and all-AI matches — to sanity-check that no single faction or doctrine dominates. `tests/smoke.test.js` runs a bounded headless AI-vs-AI match in CI to guard against regressions in the simulation itself.
