// ============================================================================
//  ROCKETIO — AI v0.9
// ----------------------------------------------------------------------------
//  Strategic loop per AI tick:
//
//    1. SHARED ASSESSMENT (once per real frame, cached on `game._aiShared`):
//         - Per-player power score (gold rate, tiles, military, govs)
//         - Leader identification + "kingmaker" gang-up bias
//         - Map of per-player visible structures
//
//    2. PER-AI SNAPSHOT:
//         - Own structures bucketed by type
//         - Missile production/consumption balance
//         - Frontier sectors with threat analysis
//         - Attack-vector memory (where are we taking fire from?)
//         - Primary enemy = leader-if-not-me, else nearest aggressor
//
//    3. PRIORITY-DRIVEN ACTIONS (each tick performs 2-4 actions):
//         a. Opening build order   — deterministic early-game ramp
//         b. Emergency defense     — incoming projectile / leaking territory
//         c. Counter-play          — role-aware: ground (M/B) vs air (RL/AB/D), B screen, drones vs AAS
//         d. Focus fire            — reassign attackers to a single high-value target
//         e. Economy               — MF when missile-starved, Gov when snowballing
//         f. Strategic build       — pick best STRUCTURE TYPE then best LOCATION
//         g. Upgrade               — high-value, behind-frontier structures
//         h. Militia upgrade strategy — M2→M3 Partisan when fortified
//         i. Coordinated strike    — point all attackers at the kill target
//         j. Demolish              — reclaim gold from trapped/redundant structures
// ============================================================================

import { UNIT_STATS, AI_DOCTRINES, GAME_CONFIG, DIPLOMACY } from './constants.js?v=naval2027';
import { Hex } from './hexGrid.js?v=naval2027';

const PHASES = { EXPAND: 0, FORTIFY: 1, PRESSURE: 2, DOMINATE: 3 };

const KILL_VALUE = { G: 100, AB: 60, SSG: 34, MF: 55, AAS: 45, AF: 42, RL: 40, DDG: 30, B: 35, D: 25, SU: 24, M: 8, BUNK: 5 };

const ATTACKER_TYPES = new Set(['RL', 'B', 'D', 'SU', 'AB', 'M', 'DDG', 'SSG']);
const COMBAT_TYPES   = new Set(['RL', 'B', 'D', 'SU', 'AB', 'M', 'DDG', 'SSG']);

const DOCTRINE_KEYS = Object.keys(AI_DOCTRINES);

// ============================================================================
//  TINY HELPERS
// ============================================================================
function tileKey(t) { return `${t.q},${t.r}`; }

function weightedPick(weights) {
    const keys = Object.keys(weights);
    let total = 0;
    for (const k of keys) total += weights[k];
    if (total <= 0) return keys[0];
    let r = Math.random() * total;
    for (const k of keys) { r -= weights[k]; if (r <= 0) return k; }
    return keys[keys.length - 1];
}

function statsAtLevel(type, level = 0) {
    return UNIT_STATS[type]?.levels?.[level];
}

function canAffordType(player, type, level = 0) {
    const s = statsAtLevel(type, level);
    return !!s && player.gold >= s.cost;
}

function canAffordUpgrade(player, tile) {
    const def = UNIT_STATS[tile.structure.type];
    const next = def?.levels?.[tile.structure.level + 1];
    if (!next) return false;
    return player.gold >= Math.floor(next.cost * GAME_CONFIG.UPGRADE_COST_MULT);
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

const MAX_TARGET_GOV = 12;

/** Cap MF spam: scales with map footprint and missile load — enough stock, not endless factories. */
function maxMissileFactoriesForPlayer(game, p, snap) {
    const cons = snap.missileCons || 0;
    const tc = Math.max(1, p.tileCount);
    // One MF2-equivalent produces ~0.22 missiles/s in supply; need ~1.4x headroom over consumption.
    const fromDemand = 1 + Math.min(5, Math.ceil(cons / 0.18));
    const fromLand = Math.min(7, 1 + Math.floor(tc / 16));
    return clamp(Math.max(fromDemand, fromLand), 1, 8);
}

function playstyleMilitiaExpandMult(doctrine) {
    const ps = doctrine?.playstyle || 'mixed';
    if (ps === 'raid') return 1.22;
    if (ps === 'defend') return 0.86;
    return 1;
}

function m0Cost() {
    return (statsAtLevel('M', 0)?.cost) || 135;
}

function counterAggressionScale(game) {
    const d = game.aiDifficulty || 'normal';
    if (d === 'very_hard') return 1.12;
    if (d === 'hard') return 1.07;
    if (d === 'easy') return 0.95;
    return 1.02;
}

/**
 * Adjust structure weights from visible enemy composition (see Units.csv roles).
 * - AAS only intercepts missiles/drones; M/B are ground (bypass AA) — shift off AAS, onto B.
 * - Heavy RL/AB: need AAS + B screens; heavy AAS: D to saturate, fewer interceptable volleys.
 */
function counterCompositionMults(snap, game) {
    const c = snap.visibleEnemyTypeCounts || {};
    const get = (t) => c[t] || 0;
    const eAAS = get('AAS');
    const eRL = get('RL');
    const eAB = get('AB');
    const eDDG = get('DDG');
    const eSSG = get('SSG');
    const eShooters = eRL + eAB + eDDG + eSSG;
    const eD = get('D') + get('SU');
    const eM = get('M');
    const eB = get('B');
    const s = counterAggressionScale(game);
    const mult = { RL: 1, AB: 1, D: 1, B: 1, AAS: 1 };

    const eGround = eM + eB;
    const eAirThreat = eRL + eAB + eD + eDDG + eSSG;
    if (eGround >= 2 && eGround > eAirThreat) {
        mult.B *= 1.14 * s;
        mult.AAS *= 0.88;
        mult.D *= 0.9;
    }
    if (eB >= 2) mult.AAS *= 0.94;
    if (eM >= 4 && eAirThreat <= 1) { mult.B *= 1.08; mult.AAS *= 0.9; }

    if (eShooters >= 1) { mult.AAS *= 1.1 * s; mult.B *= 1.1 * s; }
    if (eShooters >= 2) { mult.AAS *= 1.08; mult.B *= 1.06; }

    if (eAAS >= 1) { mult.D *= 1.06; mult.RL *= 0.97; mult.AB *= 0.96; }
    if (eAAS >= 2) { mult.D *= 1.18 * s; mult.RL *= 0.9; mult.AB *= 0.88; }
    if (eAAS >= 3) { mult.D *= 1.1; mult.RL *= 0.94; mult.AB *= 0.93; }
    if (eAAS >= 4) { mult.D *= 1.08; }

    if (eD >= 2) mult.AAS *= 1.12 * s;
    if (eD >= 4) mult.AAS *= 1.05;

    if (eM >= 3) mult.B *= 1.12 * s;
    if (eM >= 5) mult.B *= 1.05;

    for (const k of Object.keys(mult)) {
        mult[k] = clamp(mult[k], 0.62, 1.7);
    }
    return mult;
}

/** Closer to enemy rocket/air than a protected site — so missiles/AA auto aim hits B first. */
function pickScreenBarracksSpot(game, p, snap) {
    const threats = snap.visibleEnemies.filter(e =>
        e.structure.type === 'RL' || e.structure.type === 'AB'
    );
    if (threats.length === 0) return null;

    const protect = [
        ...(snap.ownByType.G || []),
        ...(snap.ownByType.MF || []),
        ...(snap.ownByType.RL || []),
        ...(snap.ownByType.AB || []),
    ];
    if (protect.length === 0) return null;

    let best = null;
    let bestS = 0;
    for (const v of protect) {
        const nbrs = new Hex(v.q, v.r).getNeighbors();
        for (const nh of nbrs) {
            const t = game.grid.getTile(nh.q, nh.r);
            if (!t || t.structure || t.contested) continue;
            if (t.owner !== p.id) continue;

            let s = 0;
            for (const en of threats) {
                const dV = Hex.distance(v, en);
                const dT = Hex.distance(t, en);
                if (dT < dV) s += (dV - dT) * 2.2;
            }
            if (s > bestS) { bestS = s; best = t; }
        }
    }
    return bestS >= 0.5 ? best : null;
}

/**
 * Per-difficulty tuning: expansion vs militia spam, gov timing, aggression.
 * `humanTargetMult` / `humanPressureMult` make PvE bots prioritize the human a bit more (fair: they still share fog rules).
 */
function aiParams(game) {
    const d = game.aiDifficulty || 'normal';
    if (d === 'very_hard') {
        return {
            secondGovMinTiles: 3,
            openingMilitiaBeforeGov2: 1,
            openingMilitiaMax: 6,
            exitOpeningMinStructures: 5,
            economyGoldMult: 0.7,
            strategicMilitiaPhaseMult: 0.34,
            fortifyWithOneGovTileBonus: 4,
            extraActionsDominate: 2,
            extraActionsPressure: 2,
            phaseAggressScale: 0.86,
            humanTargetMult: 1.32,
            humanPressureMult: 1.22,
            upgradeBiasScale: 1.24,
            frontierTopN: 2,
        };
    }
    if (d === 'hard') {
        return {
            secondGovMinTiles: 4,
            openingMilitiaBeforeGov2: 2,
            openingMilitiaMax: 5,
            exitOpeningMinStructures: 6,
            economyGoldMult: 0.78,
            strategicMilitiaPhaseMult: 0.42,
            fortifyWithOneGovTileBonus: 3,
            extraActionsDominate: 1,
            extraActionsPressure: 1,
            phaseAggressScale: 0.94,
            humanTargetMult: 1.14,
            humanPressureMult: 1.1,
            upgradeBiasScale: 1.08,
            frontierTopN: 3,
        };
    }
    if (d === 'easy') {
        return {
            secondGovMinTiles: 5,
            openingMilitiaBeforeGov2: 3,
            openingMilitiaMax: 6,
            exitOpeningMinStructures: 8,
            economyGoldMult: 1.12,
            strategicMilitiaPhaseMult: 0.88,
            fortifyWithOneGovTileBonus: 0,
            extraActionsDominate: 0,
            extraActionsPressure: 0,
            phaseAggressScale: 1.06,
            humanTargetMult: 1,
            humanPressureMult: 0.98,
            upgradeBiasScale: 0.9,
            frontierTopN: 3,
        };
    }
    return {
        secondGovMinTiles: 5,
        openingMilitiaBeforeGov2: 2,
        openingMilitiaMax: 5,
        exitOpeningMinStructures: 7,
        economyGoldMult: 1,
        strategicMilitiaPhaseMult: 0.62,
        fortifyWithOneGovTileBonus: 1,
        extraActionsDominate: 0,
        extraActionsPressure: 0,
        phaseAggressScale: 1,
        humanTargetMult: 1.07,
        humanPressureMult: 1.04,
        upgradeBiasScale: 1,
        frontierTopN: 3,
    };
}

/** Desired Government count scales with owned tiles, map size, and difficulty (capped). */
function computeTargetGovCount(game, p, snap, shared) {
    const landScale = Math.max(1, (shared.totalLandTiles || 400) / 400);
    const tc = p.tileCount;
    const difficulty = game.aiDifficulty || 'normal';
    // Govs compound: each extra Gov harvests already-owned tiles. Scale faster than before.
    let n = 2 + Math.floor((tc * landScale) / 26);
    if (difficulty === 'very_hard') n += 3;
    else if (difficulty === 'hard') n += 2;
    else if (difficulty === 'easy') n += 0;
    else n += 1;
    return clamp(n, 2, MAX_TARGET_GOV);
}

/** Applies doctrine G preference (ECONOMIST builds more, baseline 2). */
function effectiveTargetGovCount(game, p, snap, shared, doctrine) {
    const base = computeTargetGovCount(game, p, snap, shared);
    const mult = clamp((doctrine?.G ?? 2) / 2, 0.75, 2);
    return clamp(Math.round(base * mult), 2, MAX_TARGET_GOV);
}

function phasedGovNeed(targetG, phase) {
    if (phase === PHASES.EXPAND) return Math.min(targetG, Math.max(2, Math.ceil(targetG * 0.66)));
    if (phase === PHASES.FORTIFY) return Math.min(targetG, Math.max(3, Math.ceil(targetG * 0.78)));
    if (phase === PHASES.PRESSURE) return Math.min(targetG, Math.max(3, Math.ceil(targetG * 0.9)));
    return targetG;
}

// ============================================================================
//  GLOBAL ASSESSMENT (shared across AIs in a single frame)
// ============================================================================
function computeSharedAssessment(game) {
    const cached = game._aiShared;
    if (cached && cached.time === game.gameTime) return cached;

    const players = game.players;
    const byId = new Map();
    const govByPlayer = new Map();
    const structuresByPlayer = new Map();
    const allByPlayer = new Map();
    const missileProd = new Map();
    const missileCons = new Map();

    for (const p of players) {
        govByPlayer.set(p.id, []);
        structuresByPlayer.set(p.id, {});
        allByPlayer.set(p.id, []);
        missileProd.set(p.id, 0);
        missileCons.set(p.id, 0);
    }

    let totalLandTiles = 0;
    for (const tile of game.grid.tiles.values()) {
        if (tile.buildable) totalLandTiles++;
        const s = tile.structure;
        if (!s || !tile.owner) continue;
        const pid = tile.owner;
        const arr = allByPlayer.get(pid);
        if (arr) arr.push(tile);
        const counts = structuresByPlayer.get(pid);
        if (counts) counts[s.type] = (counts[s.type] || 0) + 1;
        if (s.type === 'G') govByPlayer.get(pid)?.push(tile);

        if (!tile.contested) {
            if (s.type === 'MF') {
                const ms = s.stats;
                const eff = game.effFor(tile);
                const sec = (ms.produceInterval * eff) / 1000;
                missileProd.set(pid, missileProd.get(pid) + (ms.missilesProduced / sec));
            }
            if (s.type === 'RL' || s.type === 'AB' || s.type === 'DDG' || s.type === 'SSG') {
                const ms = s.stats;
                const eff = game.effFor(tile);
                const sec = (ms.interval * eff) / 1000;
                missileCons.set(pid, missileCons.get(pid) + (ms.missilesPerShot / sec));
            }
        }
    }

    const power = new Map();
    for (const p of players) {
        if (game.defeated.has(p.id)) { power.set(p.id, 0); continue; }
        const counts = structuresByPlayer.get(p.id) || {};
        const govs = govByPlayer.get(p.id) || [];

        let militaryStrength = 0;
        for (const tile of allByPlayer.get(p.id) || []) {
            const s = tile.structure;
            if (!ATTACKER_TYPES.has(s.type)) continue;
            const dps = (s.stats.damage || 0) / Math.max(1, (s.stats.interval || 1000) / 1000);
            militaryStrength += dps * (s.stats.range || 1);
        }

        let govStrength = 0;
        for (const g of govs) {
            const gs = g.structure.stats;
            govStrength += (gs.influence || 0) + (gs.radius || 0) * 50;
        }

        const score = p.tileCount * 8
                    + (p.goldRate || 0) * 25
                    + militaryStrength * 0.4
                    + govStrength * 0.05
                    + (counts.MF || 0) * 30
                    + (p.missiles || 0) * 1;
        power.set(p.id, score);
    }

    let leaderId = null;
    let leaderScore = -1;
    for (const p of players) {
        if (game.defeated.has(p.id)) continue;
        const s = power.get(p.id);
        if (s > leaderScore) { leaderScore = s; leaderId = p.id; }
    }

    let runawayLeader = false;
    if (leaderId != null) {
        let secondBest = 0;
        for (const p of players) {
            if (p.id === leaderId || game.defeated.has(p.id)) continue;
            const s = power.get(p.id);
            if (s > secondBest) secondBest = s;
        }
        runawayLeader = secondBest > 0 && (leaderScore / secondBest) > 1.4;
    }

    const shared = {
        time: game.gameTime,
        power, leaderId, leaderScore, runawayLeader,
        govByPlayer, structuresByPlayer, allByPlayer,
        missileProd, missileCons, totalLandTiles,
    };
    game._aiShared = shared;
    return shared;
}

// ============================================================================
//  PER-AI SNAPSHOT
// ============================================================================
function buildSnapshot(game, p, shared) {
    const ownByType = {};
    const own = [];
    const structures = [];
    const emptyOwn = [];
    const frontier = [];

    for (const tile of game.grid.tiles.values()) {
        if (tile.owner !== p.id) continue;
        own.push(tile);
        if (tile.structure) {
            structures.push(tile);
            const t = tile.structure.type;
            (ownByType[t] = ownByType[t] || []).push(tile);
        } else {
            emptyOwn.push(tile);
        }
        const nbrs = new Hex(tile.q, tile.r).getNeighbors();
        for (const nh of nbrs) {
            const nt = game.grid.getTile(nh.q, nh.r);
            if (nt && nt.buildable && nt.owner !== p.id) { frontier.push(tile); break; }
        }
    }

    const visible = p.fogVisible;
    const visibleEnemies = [];
    for (const tile of game.grid.tiles.values()) {
        if (!tile.structure || !tile.owner || tile.owner === p.id) continue;
        if (game.defeated.has(tile.owner)) continue;
        if (game.areAllied(tile.owner, p.id)) continue;
        if (!visible.has(tileKey(tile))) continue;
        visibleEnemies.push(tile);
    }

    const govCount = (shared.structuresByPlayer.get(p.id)?.G) || 0;
    const mfCount  = (shared.structuresByPlayer.get(p.id)?.MF) || 0;
    const aasCount = (shared.structuresByPlayer.get(p.id)?.AAS) || 0;

    let primaryEnemyId = null;
    if (shared.leaderId && shared.leaderId !== p.id && !game.areAllied(shared.leaderId, p.id)) {
        primaryEnemyId = shared.leaderId;
    } else {
        let bestId = null, bestScore = -1;
        for (const otherP of game.players) {
            if (otherP.id === p.id || game.defeated.has(otherP.id)) continue;
            if (game.areAllied(otherP.id, p.id)) continue;
            const s = shared.power.get(otherP.id);
            if (s > bestScore) { bestScore = s; bestId = otherP.id; }
        }
        primaryEnemyId = bestId;
    }

    // Compute centroid of our territory for directional decisions
    let cx = 0, cy = 0;
    for (const t of own) { cx += t.q; cy += t.r; }
    if (own.length) { cx /= own.length; cy /= own.length; }

    // Compute enemy direction vector (toward primary enemy's centroid)
    let enemyDirQ = 0, enemyDirR = 0;
    if (primaryEnemyId) {
        let ex = 0, ey = 0, en = 0;
        for (const tile of game.grid.tiles.values()) {
            if (tile.owner === primaryEnemyId) { ex += tile.q; ey += tile.r; en++; }
        }
        if (en > 0) {
            enemyDirQ = (ex / en) - cx;
            enemyDirR = (ey / en) - cy;
            const mag = Math.sqrt(enemyDirQ * enemyDirQ + enemyDirR * enemyDirR) || 1;
            enemyDirQ /= mag;
            enemyDirR /= mag;
        }
    }

    // Track attack vectors — remember recent damage directions
    if (!p._attackVectors) p._attackVectors = [];
    const recentHits = p._attackVectors.filter(v => game.gameTime - v.t < 30000);
    p._attackVectors = recentHits;

    // Nearest enemy structure distance from our frontier
    let nearestEnemyDist = Infinity;
    let nearestEnemyTile = null;
    for (const en of visibleEnemies) {
        for (const ft of frontier) {
            const d = Hex.distance(ft, en);
            if (d < nearestEnemyDist) { nearestEnemyDist = d; nearestEnemyTile = en; }
        }
    }

    // Supply coverage check
    const supplySet = game.supplyByPlayer.get(p.id);
    const inSupplyCount = structures.filter(t => supplySet?.has(tileKey(t))).length;
    const supplyRatio = structures.length > 0 ? inSupplyCount / structures.length : 1;

    // Unclaimed buildable hexes next to the frontier (macro pressure — grab land before anything else)
    let neutralAdjacentToFrontier = 0;
    for (const ft of frontier) {
        const nbrs = new Hex(ft.q, ft.r).getNeighbors();
        for (const nh of nbrs) {
            const nt = game.grid.getTile(nh.q, nh.r);
            if (nt && nt.buildable && nt.owner == null) neutralAdjacentToFrontier++;
        }
    }

    const visibleEnemyTypeCounts = {};
    for (const e of visibleEnemies) {
        const typ = e.structure.type;
        visibleEnemyTypeCounts[typ] = (visibleEnemyTypeCounts[typ] || 0) + 1;
    }

    return {
        own, structures, emptyOwn, frontier,
        ownByType,
        govCount, mfCount, aasCount,
        visibleEnemies,
        primaryEnemyId,
        nearestEnemyDist, nearestEnemyTile,
        missileProd: shared.missileProd.get(p.id) || 0,
        missileCons: shared.missileCons.get(p.id) || 0,
        powerScore: shared.power.get(p.id) || 0,
        centroidQ: cx, centroidR: cy,
        enemyDirQ, enemyDirR,
        attackVectors: recentHits,
        supplyRatio,
        neutralAdjacentToFrontier,
        visibleEnemyTypeCounts,
    };
}

// ============================================================================
//  PHASE DETECTION  (scales with map context)
// ============================================================================
function detectPhase(game, p, snap, shared) {
    const tc = p.tileCount;
    const hasAttacker = (snap.ownByType.RL?.length || 0) + (snap.ownByType.AB?.length || 0) + (snap.ownByType.DDG?.length || 0) + (snap.ownByType.SSG?.length || 0) > 0;
    const hasDrones   = (snap.ownByType.D?.length || 0) + (snap.ownByType.SU?.length || 0) > 0;
    const hasCombat   = hasAttacker || hasDrones || (snap.ownByType.B?.length || 0) > 0;
    const isLeader    = shared.leaderId === p.id;

    const landScale = Math.max(1, (shared.totalLandTiles || 400) / 400);
    const params = aiParams(game);
    const pas = params.phaseAggressScale ?? 1;
    const scaledFortify  = Math.round(11 * landScale * pas);
    const scaledPressure = Math.round(16 * landScale * pas);
    const scaledDominate = Math.round(36 * landScale * pas);
    const fortifyTileFloor = scaledFortify + (params.fortifyWithOneGovTileBonus || 0);

    if ((p.gold > UNIT_STATS.G.levels[1].cost && hasCombat && tc > scaledPressure) || (tc > scaledDominate && hasCombat))
        return PHASES.DOMINATE;
    if (tc > scaledPressure && hasCombat)
        return PHASES.PRESSURE;
    if (tc >= fortifyTileFloor && snap.govCount >= 2)
        return PHASES.FORTIFY;
    if (tc >= fortifyTileFloor + 2 && snap.govCount >= 1 && hasCombat)
        return PHASES.FORTIFY;
    if (isLeader && tc >= Math.round(10 * landScale))
        return PHASES.FORTIFY;
    if (game.gameTime >= 50000 && tc >= Math.round(8 * landScale))
        return PHASES.FORTIFY;
    return PHASES.EXPAND;
}

// ============================================================================
//  MAIN ENTRY POINT
// ============================================================================
export function updateAI(game, time) {
    computeSharedAssessment(game);

    if (!game._aiShuffledDoctrines) {
        const a = DOCTRINE_KEYS.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [a[i], a[j]] = [a[j], a[i]];
        }
        game._aiShuffledDoctrines = a;
    }
    let dIdx = 0;
    for (const p of game.players) {
        if (p.id === game.humanId) continue;
        if (!p.doctrine) {
            p.doctrine = AI_DOCTRINES[game._aiShuffledDoctrines[dIdx % game._aiShuffledDoctrines.length]];
        }
        dIdx++;
    }

    for (const p of game.players) {
        if (p.id === game.humanId) continue;
        if (game.defeated.has(p.id)) continue;
        if (time < p.nextAiAction) continue;

        p._aiGameTime = game.gameTime;

        const shared = computeSharedAssessment(game);
        const snap = buildSnapshot(game, p, shared);
        const phase = detectPhase(game, p, snap, shared);
        p._aiPhase = phase;

        const params = aiParams(game);
        const baseDelay = phase >= PHASES.PRESSURE ? 260 : 420;
        const tickMult = game._difficulty?.tickMult ?? 1;
        p.nextAiAction = time + (baseDelay + Math.random() * 260) * tickMult;

        let actions = phase >= PHASES.DOMINATE ? 4 : (phase >= PHASES.PRESSURE ? 3 : 2);
        if (phase >= PHASES.DOMINATE) actions += params.extraActionsDominate || 0;
        else if (phase >= PHASES.PRESSURE) actions += params.extraActionsPressure || 0;
        for (let a = 0; a < actions; a++) runAITick(game, p, time);
    }

    if (game.diplomacyEnabled) {
        for (const p of game.players) {
            if (p.id === game.humanId) continue;
            if (game.defeated.has(p.id)) continue;
            if (time < (p.nextDiploAction || 0)) continue;
            p.nextDiploAction = time + DIPLOMACY.AI_ACTION_THROTTLE_MS + Math.random() * 2000;
            runDiplomacyTick(game, p);
        }
    }
}

// ============================================================================
//  DIPLOMACY AI  (improved with geographic + threat awareness)
// ============================================================================
function runDiplomacyTick(game, p) {
    const shared = computeSharedAssessment(game);
    const myPower = shared.power.get(p.id) || 0;
    const leaderId = shared.leaderId;
    const leaderScore = shared.leaderScore;
    const difficulty = game.aiDifficulty || 'normal';
    const isHard = difficulty === 'hard' || difficulty === 'very_hard';

    // 1) Handle pending incoming requests
    for (const rel of Object.values(game.relations)) {
        if (rel.status !== 'pending') continue;
        if (rel.lastRequestFrom === p.id) continue;
        const otherId = rel.a === p.id ? rel.b : (rel.b === p.id ? rel.a : null);
        if (otherId == null) continue;
        const otherIsBot = otherId !== game.humanId;
        if (otherIsBot && !isHard) {
            game.rejectPeace(p.id, otherId);
            continue;
        }
        const otherPower = shared.power.get(otherId) || 0;
        const iAmWinning = myPower >= leaderScore * 0.95;
        const proposerStrong = otherPower >= myPower * 0.7;

        // Check if we share a common strong enemy (geographic threat awareness)
        const sharedThreat = shared.leaderId &&
            shared.leaderId !== p.id &&
            shared.leaderId !== otherId &&
            shared.runawayLeader;

        if (sharedThreat && !iAmWinning) {
            game.acceptPeace(p.id, otherId);
        } else if (!iAmWinning && proposerStrong) {
            game.acceptPeace(p.id, otherId);
        } else {
            const acceptChance = sharedThreat ? 0.5 : (iAmWinning ? 0.08 : 0.2);
            if (Math.random() < acceptChance) game.acceptPeace(p.id, otherId);
            else game.rejectPeace(p.id, otherId);
        }
    }

    // 2) Consider forfeiting existing peace
    const cap = game.maxPeacesAllowed();
    if (cap > 0) {
        for (const rel of Object.values(game.relations)) {
            if (rel.status !== 'peace') continue;
            if (rel.a !== p.id && rel.b !== p.id) continue;
            const otherId = rel.a === p.id ? rel.b : rel.a;
            if (!game.canForfeit(p.id, otherId)) continue;
            if (game.defeated.has(otherId)) continue;
            const otherPower = shared.power.get(otherId) || 0;
            const leaderGone = leaderId == null || game.defeated.has(leaderId);
            const allyIsLeader = otherId === leaderId;
            // Break if ally became the threat, or leader was eliminated
            if (otherPower > myPower * 1.25 || leaderGone || allyIsLeader) {
                game.forfeitPeace(p.id, otherId);
            }
        }
    }

    // 3) Consider proposing peace
    if (cap <= 0) return;
    if (game.peaceCountFor(p.id) >= cap) return;

    const wantGangUp = !!shared.runawayLeader && shared.leaderId !== p.id;

    let bestCandidate = null;
    let bestScore = -Infinity;
    for (const q of game.players) {
        if (q.id === p.id) continue;
        if (game.defeated.has(q.id)) continue;
        if (!game.haveMet(p.id, q.id)) continue;
        const qIsBot = q.id !== game.humanId;
        if (qIsBot && !isHard) continue;
        if (game.peaceCountFor(q.id) >= cap) continue;
        const chk = game.canPropose(p.id, q.id);
        if (!chk.ok) continue;
        if (q.id === shared.leaderId) continue;
        const qPower = shared.power.get(q.id) || 0;
        if (qPower <= 0) continue;
        const ratio = qPower / Math.max(1, myPower);
        if (ratio < 0.5 || ratio > 1.6) continue;
        let score = 1 - Math.abs(1 - ratio);
        if (wantGangUp) score += 0.5;
        if (q.id === game.humanId) score += difficulty === 'very_hard' ? 0.26 : 0.15;
        // Geographic proximity bonus: closer enemies make better allies
        const qTiles = shared.allByPlayer.get(q.id) || [];
        const myTiles = shared.allByPlayer.get(p.id) || [];
        if (qTiles.length > 0 && myTiles.length > 0) {
            let minDist = Infinity;
            for (const qt of qTiles.slice(0, 5)) {
                for (const mt of myTiles.slice(0, 5)) {
                    const d = Hex.distance(qt, mt);
                    if (d < minDist) minDist = d;
                }
            }
            if (minDist < 6) score += 0.2;
        }
        if (score > bestScore) { bestScore = score; bestCandidate = q; }
    }

    if (bestCandidate) {
        if (wantGangUp || bestScore > 0.55) {
            game.proposePeace(p.id, bestCandidate.id);
        }
    }
}

// ============================================================================
//  AI TICK  (v0.8 — Expansion-First Philosophy)
//
//  ALL doctrines follow the same macro priority:
//    1. GRAB FREE LAND (militia expansion — always, relentlessly)
//    2. MAINTAIN MISSILE ECONOMY (MF before consumers — non-negotiable)
//    3. EMERGENCY / COUNTER-PLAY (survive immediate threats)
//    4. FOCUS FIRE (coordinate existing attackers)
//    5. DOCTRINE-SPECIFIC BUILD (express personality through combat choices)
//    6. UPGRADE / M3 HQ ABUSE / DEMOLISH
// ============================================================================
function runAITick(game, p, time) {
    const doctrine = p.doctrine;
    if (!doctrine) return;

    p._aiGameTime = game.gameTime;

    const shared = computeSharedAssessment(game);
    const snap = buildSnapshot(game, p, shared);
    if (snap.own.length === 0) return;

    const phase = detectPhase(game, p, snap, shared);
    p._aiPhase = phase;

    if (p._lastTileCount == null) p._lastTileCount = p.tileCount;
    const tileLoss = p._lastTileCount - p.tileCount;

    // Opening build order for first ~60s — deterministic ramp-up
    if (tryOpeningBuildOrder(game, p, snap, shared, phase)) { goto_done(p); return; }

    // ── PRIORITY 1: GRAB FREE LAND ──
    // Always try to expand with militia FIRST. Free tiles = free gold = everything.
    // This runs every tick regardless of phase or doctrine.
    if (tryExpandWithMilitia(game, p, snap, phase, shared)) {
        // Also try to do something else this tick (multi-action)
    }

    // ── PRIORITY 2: MISSILE ECONOMY GATE ──
    // Before ANY combat builds, ensure MF capacity is adequate.
    // This prevents the AI from building RL/AB it can't feed.
    if (tryMissileEconomyGate(game, p, snap)) {
        goto_done(p); return;
    }

    // ── PRIORITY 3: EMERGENCY / COUNTER-PLAY ──
    if (tryEmergencyDefense(game, p, snap, tileLoss)) { goto_done(p); return; }
    if (tryCounterPlay(game, p, snap)) { goto_done(p); return; }

    // ── PRIORITY 3b: PROACTIVE BORDER FORTIFICATION ──
    // Build Barracks preemptively along frontier facing enemy territory.
    // Barracks have huge influence (1450+) — they project supply, lock the border,
    // and answer ground swarms that AAS can't touch.
    if (tryBorderFortify(game, p, snap, phase, shared)) { goto_done(p); return; }

    // ── PRIORITY 4: FOCUS FIRE ──
    // Re-target existing attackers to high-value targets
    tryFocusFire(game, p, snap, shared);

    // ── PRIORITY 5: M3 MILITIA HQ FORWARD BASES ──
    // Upgrade distant militia to M3 for flanking attacks + mini-income
    if (tryMilitiaHQAbuse(game, p, snap, phase)) { goto_done(p); return; }

    // ── PRIORITY 6: ECONOMY + DOCTRINE-SPECIFIC BUILDS ──
    if (tryEconomy(game, p, snap, phase, shared, doctrine)) { goto_done(p); return; }
    if (tryStrategicBuild(game, p, snap, shared, phase, doctrine)) { goto_done(p); return; }

    if (tryNavyOpportunism(game, p, snap)) { goto_done(p); return; }

    // ── PRIORITY 7: UPGRADE / DEMOLISH ──
    tryMilitiaUpgradeStrategy(game, p, snap, phase) ||
    tryUpgrade(game, p, snap, doctrine, shared) ||
    tryDemolish(game, p, snap, shared);

    goto_done(p);
}

function goto_done(p) {
    const lossThisTick = Math.max(0, (p._lastTileCount ?? p.tileCount) - p.tileCount);
    // Exponentially-decaying sustained loss: catches slow attrition that never spikes
    // tileLoss above the per-tick threshold but still bleeds territory over many ticks.
    p._sustainedLoss = ((p._sustainedLoss || 0) * 0.92) + lossThisTick;
    p._lastTileCount = p.tileCount;
}

// ============================================================================
//  PRIORITY 0 — OPENING BUILD ORDER
// ============================================================================
function tryOpeningBuildOrder(game, p, snap, shared, phase) {
    if (phase > PHASES.EXPAND) return false;

    const pr = aiParams(game);
    const totalStructures = snap.structures.length;
    const govs = snap.ownByType.G?.length || 0;
    const mfs = snap.ownByType.MF?.length || 0;
    const militias = snap.ownByType.M?.length || 0;

    // Step 1: We need at least 1 MF (might already have one from spawn)
    if (mfs === 0 && canAffordType(p, 'MF')) {
        const spot = pickSupplyAwareRearSpot(game, p, snap);
        if (spot) return game.buildStructure(spot, 'MF', p.id);
    }

    // Step 2: Second Government early — dual income / influence beats militia flood
    if (mfs >= 1 && govs < 2 && p.tileCount >= pr.secondGovMinTiles && canAffordType(p, 'G')) {
        const spot = findGovSpot(game, p.id, snap);
        if (spot) return game.buildStructure(spot, 'G', p.id);
    }

    // Step 3: A few militia for early tiles (cap scales with difficulty — was hard-locked to 3 then 5)
    const earlyMilitiaCap = pr.openingMilitiaBeforeGov2;
    if (mfs >= 1 && govs < 2 && militias < earlyMilitiaCap && p.units.M < game.militiaCap(p)) {
        if (canAffordType(p, 'M')) {
            const spot = findMilitiaSpot(game, p.id, snap);
            if (spot) return game.buildStructure(spot, 'M', p.id);
        }
    }

    // Step 4: After two govs, more militia for push (bounded)
    if (govs >= 2 && mfs >= 1 && militias < pr.openingMilitiaMax && p.units.M < game.militiaCap(p)) {
        if (canAffordType(p, 'M')) {
            const spot = findMilitiaSpot(game, p.id, snap);
            if (spot) return game.buildStructure(spot, 'M', p.id);
        }
    }

    // Step 5: First combat unit — sooner on hard, doctrine-weighted
    if (govs >= 2 && mfs >= 1 && totalStructures >= pr.exitOpeningMinStructures - 1) {
        const doctrine = p.doctrine;
        if (doctrine) {
            const options = [];
            if (canAffordType(p, 'B') && p.missiles >= 0) options.push({ type: 'B', w: doctrine.B * 1.15 });
            if (canAffordType(p, 'RL') && p.missiles >= 1) options.push({ type: 'RL', w: doctrine.RL * 1.1 });
            if (canAffordType(p, 'D')) options.push({ type: 'D', w: doctrine.D * 1.1 });
            if (canAffordType(p, 'SU')) options.push({ type: 'SU', w: doctrine.D * 0.42 });
            if (options.length > 0) {
                const weights = {};
                for (const o of options) weights[o.type] = o.w;
                const type = weightedPick(weights);
                const spot = pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies);
                if (spot) return game.buildStructure(spot, type, p.id);
            }
        }
    }

    if (govs >= 2 && mfs >= 1 && totalStructures >= pr.exitOpeningMinStructures) return false;

    return false;
}

// ============================================================================
//  PRIORITY 1 — EMERGENCY DEFENSE
// ============================================================================
function tryEmergencyDefense(game, p, snap, tileLoss) {
    const govs = snap.ownByType.G || [];
    const abs  = snap.ownByType.AB || [];
    const mfs  = snap.ownByType.MF || [];
    const valuable = [...govs, ...abs, ...mfs];

    // (a) Incoming projectile threat to high-value structures
    for (const vt of valuable) {
        const threatened = game.projectiles.some(proj =>
            proj.owner !== p.id &&
            proj.interceptable &&
            proj.targetQR.q === vt.q && proj.targetQR.r === vt.r
        );
        if (!threatened) continue;

        const protectedByAAS = (snap.ownByType.AAS || []).some(a =>
            (a.structure.charge || 0) > 0 &&
            Hex.distance(a, vt) <= a.structure.stats.range
        ) || (snap.ownByType.AF || []).some(a =>
            (a.structure.charge || 0) > 0 &&
            Hex.distance(a, vt) <= a.structure.stats.range
        );
        if (protectedByAAS) continue;

        const spot = findEmptyAdjacent(game, p.id, vt);
        if (spot && canAffordType(p, 'AAS')) {
            return game.buildStructure(spot, 'AAS', p.id);
        }
    }

    // (b) Bleeding territory — respond proportionally.
    // Two triggers: sharp loss this tick (tileLoss >= 2) OR sustained attrition (decay-summed loss).
    const sustainedLoss = p._sustainedLoss || 0;
    const isBleedingFast = tileLoss >= 2;
    const isBleedingSlow = sustainedLoss >= 2.2;
    if (isBleedingFast || isBleedingSlow) {
        if (snap.nearestEnemyTile) {
            p._attackVectors = p._attackVectors || [];
            p._attackVectors.push({
                q: snap.nearestEnemyTile.q,
                r: snap.nearestEnemyTile.r,
                t: game.gameTime,
            });
        }

        // Ground attackers (M/B) bypass AA — Barracks is the only real answer.
        // Prefer B whenever ground threats are visible OR we're already short on B at the frontier.
        const ec = snap.visibleEnemyTypeCounts || {};
        const eGround = (ec.M || 0) + (ec.B || 0);
        const eAir = (ec.RL || 0) + (ec.AB || 0) + (ec.D || 0) + (ec.SU || 0);
        const myB = snap.ownByType.B?.length || 0;
        const groundDominant = eGround >= 2 && eGround >= eAir;

        const spot = pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies);
        if (spot) {
            if (groundDominant && canAffordType(p, 'B')) return game.buildStructure(spot, 'B', p.id);
            if (myB < 2 && canAffordType(p, 'B')) return game.buildStructure(spot, 'B', p.id);
            if (canAffordType(p, 'B')) return game.buildStructure(spot, 'B', p.id);
            if (canAffordType(p, 'M')) return game.buildStructure(spot, 'M', p.id);
        }
    }

    // (c) Gov unshielded + enemy attackers nearby
    for (const g of govs) {
        const visEnemyAttackers = snap.visibleEnemies.filter(e =>
            (e.structure.type === 'RL' || e.structure.type === 'AB' || e.structure.type === 'DDG' || e.structure.type === 'SSG') &&
            Hex.distance(g, e) <= (e.structure.stats.range || 0) + 2
        );
        if (visEnemyAttackers.length === 0) continue;

        const protectedByAAS = (snap.ownByType.AAS || []).some(a =>
            Hex.distance(a, g) <= a.structure.stats.range
        ) || (snap.ownByType.AF || []).some(a =>
            Hex.distance(a, g) <= a.structure.stats.range
        );
        if (!protectedByAAS && canAffordType(p, 'AAS')) {
            const spot = findEmptyAdjacent(game, p.id, g);
            if (spot) return game.buildStructure(spot, 'AAS', p.id);
        }
    }

    // (d) Defensive response at remembered attack vectors
    if (snap.attackVectors.length >= 2 && snap.aasCount < 2) {
        const avgQ = snap.attackVectors.reduce((s, v) => s + v.q, 0) / snap.attackVectors.length;
        const avgR = snap.attackVectors.reduce((s, v) => s + v.r, 0) / snap.attackVectors.length;
        if (canAffordType(p, 'AAS')) {
            const spot = pickSpotTowardDirection(game, p, snap, avgQ - snap.centroidQ, avgR - snap.centroidR);
            if (spot) return game.buildStructure(spot, 'AAS', p.id);
        }
    }

    return false;
}

// ============================================================================
//  PRIORITY 2 — COUNTER-PLAY
// ============================================================================
function tryCounterPlay(game, p, snap) {
    if (snap.visibleEnemies.length === 0) return false;

    const ec = snap.visibleEnemyTypeCounts || {};
    const countNear = (t) => ec[t] || 0;
    const enemyTypeNearMe = {};
    for (const ft of snap.frontier) {
        for (const en of snap.visibleEnemies) {
            const d = Hex.distance(ft, en);
            if (d > 8) continue;
            const t = en.structure.type;
            enemyTypeNearMe[t] = (enemyTypeNearMe[t] || 0) + 1;
        }
    }
    const nearCnt = (t) => enemyTypeNearMe[t] || 0;

    const myAAS = snap.ownByType.AAS?.length || 0;
    const myB   = snap.ownByType.B?.length || 0;
    const myD   = (snap.ownByType.D?.length || 0) + (snap.ownByType.SU?.length || 0);

    const enemyAASV  = countNear('AAS');
    const enemyShotV = countNear('RL') + countNear('AB');
    let enemyShootersN = nearCnt('RL') + nearCnt('AB');
    if (enemyShootersN === 0) enemyShootersN = enemyShotV;

    // Interceptable volleys: Barracks in front of Gov/MF/launchers (closest-hex targeting)
    if (enemyShootersN >= 1 && canAffordType(p, 'B')) {
        const bWant = 1 + (enemyShotV >= 2 ? 1 : 0) + (enemyShotV >= 3 ? 1 : 0);
        if (myB < bWant) {
            const sp = pickScreenBarracksSpot(game, p, snap) ||
                pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies.filter(e => e.structure.type === 'RL' || e.structure.type === 'AB'));
            if (sp) return game.buildStructure(sp, 'B', p.id);
        }
    }

    // Ground-dominant (M/B): AAS does not protect vs ground — Barracks (non-intercept. fire + supply) answers militia/ground
    const eGr = countNear('M') + countNear('B');
    const eAirK = countNear('RL') + countNear('AB') + countNear('D') + countNear('SU');
    if (eGr >= 2 && eGr > eAirK && myB < 2 && canAffordType(p, 'B')) {
        const sp = pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies.filter(e => e.structure.type === 'M' || e.structure.type === 'B'));
        if (sp) return game.buildStructure(sp, 'B', p.id);
    }

    // Heavy drone presence → AAS (proportional response)
    const enemyDrones = (enemyTypeNearMe.D || 0) + (enemyTypeNearMe.SU || 0) + countNear('D') + countNear('SU');
    if (enemyDrones >= 2 && myAAS < Math.ceil(enemyDrones / 2) && canAffordType(p, 'AAS')) {
        const spot = pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies.filter(e => e.structure.type === 'D' || e.structure.type === 'SU'));
        if (spot) return game.buildStructure(spot, 'AAS', p.id);
    }

    // Enemy RL/AB → we need AAS shield
    const enemyShooters = (enemyTypeNearMe.RL || 0) + (enemyTypeNearMe.AB || 0);
    if (enemyShooters >= 1 && myAAS === 0) {
        if (canAffordType(p, 'AAS')) {
            const spot = pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies.filter(e => e.structure.type === 'RL' || e.structure.type === 'AB'));
            if (spot) return game.buildStructure(spot, 'AAS', p.id);
        }
    }

    // Heavy enemy AAS (visible count): drones to force charges, exhaust intercept, L3 debuff
    if (enemyAASV >= 1 && canAffordType(p, 'D')) {
        const wantD = 1 + Math.max(0, Math.min(3, Math.floor((enemyAASV - 1) / 2) + (enemyAASV >= 3 ? 1 : 0) + (enemyAASV >= 4 ? 1 : 0)));
        if (myD < wantD) {
            const spot = pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies.filter(e => e.structure.type === 'AAS')) ||
                pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies);
            if (spot) return game.buildStructure(spot, 'D', p.id);
        }
    }

    // Militia swarm → Barracks (great area denial + DPS vs cheap units)
    if ((enemyTypeNearMe.M || 0) >= 3 && canAffordType(p, 'B')) {
        const spot = pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies.filter(e => e.structure.type === 'M'));
        if (spot) return game.buildStructure(spot, 'B', p.id);
    }

    const enemyGovNearFrontier = snap.visibleEnemies.filter(e =>
        e.structure.type === 'G' &&
        snap.frontier.some(ft => Hex.distance(ft, e) <= 12)
    );
    if (enemyGovNearFrontier.length > 0 &&
        snap.missileProd >= snap.missileCons * 0.7 &&
        p.missiles >= 2 &&
        snap.mfCount > 0) {
        const govTargets = enemyGovNearFrontier.map(e => {
            let md = Infinity;
            for (const ft of snap.frontier) {
                const d = Hex.distance(ft, e);
                if (d < md) md = d;
            }
            return { e, md };
        }).sort((a, b) => a.md - b.md).map(x => x.e);
        if (canAffordType(p, 'RL')) {
            const spot = pickPlacementForType(game, p, snap, 'RL', govTargets);
            if (spot) return game.buildStructure(spot, 'RL', p.id);
        }
        if (canAffordType(p, 'AB')) {
            const spot = pickPlacementForType(game, p, snap, 'AB', govTargets);
            if (spot) return game.buildStructure(spot, 'AB', p.id);
        }
    }

    return false;
}

// ============================================================================
//  PRIORITY 3 — FOCUS FIRE
// ============================================================================
function tryFocusFire(game, p, snap, shared) {
    const pr = aiParams(game);
    const humanTargetMult = pr.humanTargetMult ?? 1;
    const attackers = snap.structures.filter(t =>
        ATTACKER_TYPES.has(t.structure.type) && t.structure.stats.damage && t.structure.stats.range
    );
    if (attackers.length === 0) return false;
    if (snap.visibleEnemies.length === 0) return false;

    const prod = snap.missileProd, cons = snap.missileCons;
    const missileShort = (cons > 0 && prod < cons * 0.85) || (p.missiles < 2 && cons > 0);
    let incomingShooterKeys = null;
    if (missileShort) {
        incomingShooterKeys = new Set();
        for (const proj of game.projectiles) {
            if (!proj.interceptable || !proj.fromQR) continue;
            if (proj.owner === p.id || game.areAllied(proj.owner, p.id)) continue;
            const tgt = game.grid.getTile(proj.targetQR.q, proj.targetQR.r);
            if (!tgt?.structure) continue;
            if (tgt.owner !== p.id && !game.areAllied(tgt.owner, p.id)) continue;
            incomingShooterKeys.add(`${proj.fromQR.q},${proj.fromQR.r}`);
        }
    }

    const scored = [];
    for (const en of snap.visibleEnemies) {
        const t = en.structure.type;
        let value = KILL_VALUE[t] || 5;

        if (en.owner === game.humanId && humanTargetMult !== 1) value *= humanTargetMult;

        if (en.owner === snap.primaryEnemyId) value *= 1.4;
        if (en.owner === shared.leaderId)     value *= 1.25;

        const hpFrac = en.maxHp ? (en.hp / en.maxHp) : 1;
        if (hpFrac < 0.3)  value *= 2.0;
        else if (hpFrac < 0.5) value *= 1.6;
        else if (hpFrac < 0.7) value *= 1.2;

        if (missileShort && incomingShooterKeys?.has(`${en.q},${en.r}`)) {
            value *= 1.55;
        }
        if (missileShort && (t === 'RL' || t === 'AB' || t === 'D' || t === 'SU')) {
            const st = en.structure.stats;
            const edps = (st.damage || 0) / Math.max(1, (st.interval || 1000) / 1000);
            value *= 1 + Math.min(0.85, edps / 45);
        }

        // Proximity to our territory matters — closer targets are higher priority
        let minDistToUs = Infinity;
        for (const ft of snap.frontier.slice(0, 20)) {
            const d = Hex.distance(ft, en);
            if (d < minDistToUs) minDistToUs = d;
        }
        value *= 1 + clamp(1 - minDistToUs / 15, 0, 0.5);

        if (snap.attackVectors.length >= 2) {
            const avgQ = snap.attackVectors.reduce((s, v) => s + v.q, 0) / snap.attackVectors.length;
            const avgR = snap.attackVectors.reduce((s, v) => s + v.r, 0) / snap.attackVectors.length;
            const dPress = Hex.distance({ q: avgQ, r: avgR }, en);
            if (dPress < 10) value *= 1.35;
            else if (dPress < 16) value *= 1.15;
        }

        let inRangeCount = 0;
        let totalDpsInRange = 0;
        for (const a of attackers) {
            if (Hex.distance(a, en) <= a.structure.stats.range) {
                inRangeCount++;
                totalDpsInRange += (a.structure.stats.damage || 0)
                                / Math.max(1, (a.structure.stats.interval || 1000) / 1000);
            }
        }
        if (inRangeCount === 0) continue;
        value *= 1 + Math.min(2, inRangeCount * 0.25);

        const ttk = totalDpsInRange > 0 ? en.hp / totalDpsInRange : Infinity;
        if (ttk < 6) value *= 1.6;
        else if (ttk < 12) value *= 1.3;

        // Bonus for targets near our Gov (protect the core)
        const govs = snap.ownByType.G || [];
        for (const g of govs) {
            if (Hex.distance(g, en) <= (g.structure.stats.radius || 4) + 2) {
                value *= 1.5;
                break;
            }
        }

        scored.push({ tile: en, value, inRangeCount });
    }

    if (scored.length === 0) return false;
    scored.sort((a, b) => b.value - a.value);
    const primary = scored[0].tile;
    const secondary = scored.length > 1 ? scored[1].tile : null;

    const orderedAttackers = [
        ...attackers.filter(a => a.structure.type === 'D' || a.structure.type === 'SU'),
        ...attackers.filter(a => a.structure.type === 'AB' || a.structure.type === 'RL'),
        ...attackers.filter(a => a.structure.type === 'B'),
        ...attackers.filter(a => a.structure.type === 'M'),
    ];

    let primaryAssigned = 0;
    let acted = false;
    const capMult = game.aiDifficulty === 'very_hard' ? 0.82 : (game.aiDifficulty === 'hard' ? 0.88 : 1);
    const primaryCap = Math.max(2, Math.ceil(orderedAttackers.length * 0.7 * capMult));

    for (const atk of orderedAttackers) {
        const range = atk.structure.stats.range;
        const distP = Hex.distance(atk, primary);
        const distS = secondary ? Hex.distance(atk, secondary) : Infinity;
        const cur = atk.structure.target;
        let curPriority = -Infinity;
        if (cur) {
            const ct = game.grid.getTile(cur.q, cur.r);
            if (ct?.structure && ct.owner !== p.id) {
                curPriority = (KILL_VALUE[ct.structure.type] || 0)
                            * (ct.owner === snap.primaryEnemyId ? 1.4 : 1);
            }
        }

        let want = null;
        if (distP <= range && primaryAssigned < primaryCap) {
            want = primary; primaryAssigned++;
        } else if (secondary && distS <= range) {
            want = secondary;
        } else if (distP <= range) {
            want = primary;
        }
        if (!want) continue;

        const wantPriority = (KILL_VALUE[want.structure.type] || 0)
                           * (want.owner === snap.primaryEnemyId ? 1.4 : 1);
        if (wantPriority <= curPriority) continue;

        if (game.setAssignedTarget(atk, want)) acted = true;
    }
    return acted;
}

// ============================================================================
//  PRIORITY 4 — ECONOMY
// ============================================================================
function tryEconomy(game, p, snap, phase, shared, doctrine) {
    const pr = aiParams(game);
    const prod = snap.missileProd, cons = snap.missileCons;
    const missileShort = (cons > 0 && prod < cons * 0.85) || (p.missiles < 2 && cons > 0);

    if (missileShort) {
        if (snap.ownByType.MF) {
            for (const mf of snap.ownByType.MF) {
                if (canAffordUpgrade(p, mf) && !mf.contested) {
                    return game.upgradeStructure(mf);
                }
            }
        }
        if (canAffordType(p, 'MF')) {
            const spot = pickSupplyAwareRearSpot(game, p, snap);
            if (spot) return game.buildStructure(spot, 'MF', p.id);
        }
    }

    const wantG = effectiveTargetGovCount(game, p, snap, shared, doctrine);
    const allG = snap.ownByType.G || [];

    // Snowball play: upgrade G1 → G2 when behind on Govs but already have 1-2 Govs.
    // +radius captures already-claimed tiles + boosts $/tile across them.
    if (allG.length >= 1 && allG.length <= 2 && snap.govCount < wantG && phase <= PHASES.FORTIFY) {
        const upgradeCandidate = allG
            .filter(g => !g.contested && g.structure.level < 2 && canAffordUpgrade(p, g))
            .sort((a, b) => a.structure.level - b.structure.level)[0];
        if (upgradeCandidate) {
            return game.upgradeStructure(upgradeCandidate);
        }
    }

    let goldThreshold = snap.govCount < wantG * 0.5 ? 0 : 120;
    goldThreshold *= pr.economyGoldMult;
    if (p.gold > goldThreshold && snap.govCount < wantG) {
        if (canAffordType(p, 'G')) {
            const spot = findGovSpot(game, p.id, snap);
            if (spot) return game.buildStructure(spot, 'G', p.id);
        }
    }

    // Proactive: if we have no MF at all and gold is decent, get one before combat
    if (snap.mfCount === 0 && p.gold >= 130 && canAffordType(p, 'MF')) {
        const spot = pickSupplyAwareRearSpot(game, p, snap);
        if (spot) return game.buildStructure(spot, 'MF', p.id);
    }

    return false;
}

// ============================================================================
//  PRIORITY 5 — STRATEGIC BUILD
// ============================================================================
function tryStrategicBuild(game, p, snap, shared, phase, doctrine) {
    const pr = aiParams(game);
    const humanPressure = pr.humanPressureMult ?? 1;
    const targetG = effectiveTargetGovCount(game, p, snap, shared, doctrine);
    const govNeed = phasedGovNeed(targetG, phase);
    if (snap.govCount < govNeed && canAffordType(p, 'G')) {
        const spot = findGovSpot(game, p.id, snap);
        if (spot) return game.buildStructure(spot, 'G', p.id);
    }

    // Proactive missile economy: enough MF to feed launchers, capped so we do not wall off the map with factories
    const mfCap = maxMissileFactoriesForPlayer(game, p, snap);
    const futureConsumers = (snap.ownByType.RL?.length || 0) + (snap.ownByType.AB?.length || 0)
        + (snap.ownByType.DDG?.length || 0) + (snap.ownByType.SSG?.length || 0);
    const wantMf = Math.min(mfCap, 1 + (phase >= PHASES.PRESSURE ? 1 : 0) + (futureConsumers >= 3 ? 1 : 0));
    const needMoreMF = snap.mfCount < mfCap && (
        snap.mfCount < wantMf
        || (futureConsumers > 0 && snap.missileProd < snap.missileCons * 1.1)
    );
    if (needMoreMF && canAffordType(p, 'MF')) {
        const spot = pickSupplyAwareRearSpot(game, p, snap);
        if (spot) return game.buildStructure(spot, 'MF', p.id);
    }

    // Shield each Gov cluster with AAS
    if ((snap.ownByType.G?.length || 0) > 0) {
        const aasArr = snap.ownByType.AAS || [];
        for (const g of snap.ownByType.G) {
            const protectedByAAS = aasArr.some(a => Hex.distance(a, g) <= a.structure.stats.range);
            if (!protectedByAAS && canAffordType(p, 'AAS')) {
                const spot = findEmptyAdjacent(game, p.id, g);
                if (spot) return game.buildStructure(spot, 'AAS', p.id);
            }
        }
    }

    // Combat builds — start pressure as soon as we see enemies (FORTIFY+).
    // Without visible enemies, allow border-projection builds (mainly B) from FORTIFY onward
    // for defensive playstyles, and from PRESSURE onward otherwise.
    const psDefend = (doctrine.playstyle === 'defend');
    const wantCombat = snap.visibleEnemies.length > 0
        ? (phase >= PHASES.FORTIFY)
        : (snap.frontier.length > 0 && phase >= (psDefend ? PHASES.FORTIFY : PHASES.PRESSURE));
    if (wantCombat) {
        const have = (t) => snap.ownByType[t]?.length || 0;

        const valuableEnemies = snap.visibleEnemies
            .filter(e => (KILL_VALUE[e.structure.type] || 0) >= 35)
            .sort((a, b) => (KILL_VALUE[b.structure.type] || 0) - (KILL_VALUE[a.structure.type] || 0));

        let enemyBoost = snap.visibleEnemies.length > 0 ? 1 : 0.55;
        if (humanPressure !== 1 && snap.visibleEnemies.some(e => e.owner === game.humanId)) {
            enemyBoost *= humanPressure;
        }
        const w = {
            RL:  doctrine.RL  * (have('RL')  < 2 ? 1.75 : 1) * enemyBoost,
            AB:  doctrine.AB  * (have('AB')  < 1 ? 1.55 : 1) * (phase >= PHASES.DOMINATE ? 1.85 : 1) * enemyBoost,
            D:   doctrine.D   * (have('D')   < 2 ? 1.55 : 1) * enemyBoost,
            B:   doctrine.B   * (have('B')   < 2 ? 1.85 : 1) * (snap.visibleEnemies.length ? 1 : 1.4),
            AAS: doctrine.AAS * ((snap.aasCount < 2 || snap.visibleEnemies.some(e => e.structure.type === 'AB')) ? 1.55 : 0.6),
        };
        const ps = doctrine.playstyle || 'mixed';
        if (ps === 'defend') {
            w.AAS *= 1.15; w.B *= 1.25; w.RL *= 0.93; w.AB *= 0.92;
        } else if (ps === 'raid') {
            w.RL *= 1.06; w.AB *= 1.04; w.D *= 1.05; w.AAS *= 0.95;
        }

        const cMult = counterCompositionMults(snap, game);
        for (const k of Object.keys(cMult)) {
            if (w[k] != null) w[k] *= cMult[k];
        }

        // Suppress missile consumers if we can't fuel them — but suggest MF instead
        if (snap.missileProd < snap.missileCons * 0.7 || p.missiles < 3) {
            w.RL *= 0.2; w.AB *= 0.15;
            // Redirect toward non-missile units
            w.D *= 1.5; w.B *= 1.5;
        }

        for (const t of Object.keys(w)) {
            if (!canAffordType(p, t)) delete w[t];
        }
        if (Object.keys(w).length === 0) {
            return tryExpandWithMilitia(game, p, snap, phase, shared);
        }

        const type = weightedPick(w);

        // Pre-flight check: if we're about to build RL/AB, make sure we have MF capacity
        if ((type === 'RL' || type === 'AB' || type === 'DDG' || type === 'SSG') && snap.mfCount === 0 && canAffordType(p, 'MF')) {
            const mfSpot = pickSupplyAwareRearSpot(game, p, snap);
            if (mfSpot) return game.buildStructure(mfSpot, 'MF', p.id);
        }

        const spot = pickPlacementForType(game, p, snap, type, valuableEnemies.length ? valuableEnemies : snap.visibleEnemies);
        if (spot) return game.buildStructure(spot, type, p.id);
    }

    // Militia push — doctrines / playstyle tune how much we still flood after expand phase.
    // Route through tryExpandWithMilitia so the Gov save-up gate applies here too.
    const dM = (doctrine.M || 2) / 2.2;
    const psBoost = (doctrine.playstyle === 'raid') ? 1.2 : (doctrine.playstyle === 'defend' ? 0.75 : 1);
    const landBoost = 1 + Math.min(0.5, (snap.neutralAdjacentToFrontier || 0) * 0.06);
    const militiaWeight = (phase === PHASES.EXPAND ? 1 : pr.strategicMilitiaPhaseMult * dM * psBoost * landBoost)
        * (snap.visibleEnemies.length ? 0.8 : 1.05);
    if (Math.random() < militiaWeight) {
        if (tryExpandWithMilitia(game, p, snap, phase, shared)) return true;
    }

    return false;
}

// ============================================================================
//  PRIORITY 3b — PROACTIVE BORDER FORTIFICATION
//  Build a Barracks on the frontier facing enemy territory BEFORE the bot is
//  being attacked. B has huge influence (1450 at L1, comparable to Gov), so it
//  locks down a border segment, denies enemy capture, and answers ground swarms
//  that AA can't intercept. Without this, AI only builds B reactively (after
//  losing tiles or when a launcher is visible) which is far too late.
// ============================================================================
function tryBorderFortify(game, p, snap, phase, shared) {
    if (phase < PHASES.FORTIFY) return false;
    if (!canAffordType(p, 'B')) return false;
    if (!snap.frontier.length) return false;

    const doctrine = p.doctrine;
    const ps = doctrine?.playstyle || 'mixed';

    // How many border B do we want? Scale with frontier length AND threat memory.
    // Cap so we don't pave the whole map with B.
    const myB = snap.ownByType.B?.length || 0;
    const phaseCap = phase >= PHASES.PRESSURE ? 4 : (phase >= PHASES.FORTIFY ? 3 : 2);
    const psCap = ps === 'defend' ? phaseCap + 1 : phaseCap;
    if (myB >= psCap) return false;

    // Only fire if our gold isn't being saved for a Gov first.
    // Gov save-up is the most important compounding investment — don't undercut it
    // unless we're being actively pressured (visible enemies or sustained loss).
    const wantG = (shared && doctrine) ? effectiveTargetGovCount(game, p, snap, shared, doctrine) : 2;
    const needGov = snap.govCount < wantG;
    const underPressure = snap.visibleEnemies.length > 0 || (p._sustainedLoss || 0) >= 1.2;
    if (needGov && !underPressure) {
        const govCost = statsAtLevel('G', 0)?.cost || 1525;
        const bCost = statsAtLevel('B', 0)?.cost || 425;
        // Only build B if doing so leaves enough headroom to keep saving for the Gov.
        if (p.gold < govCost * 0.55 + bCost) return false;
    }

    // Build candidate frontier tiles that face enemy territory.
    // "Faces enemy" = the frontier tile has a neighbor owned by an enemy player.
    const frontierKeys = new Set(snap.frontier.map(tileKey));
    const supplySet = game.supplyByPlayer.get(p.id);
    const myBList = snap.ownByType.B || [];
    const govs = snap.ownByType.G || [];

    let best = null;
    let bestScore = -Infinity;
    for (const t of snap.emptyOwn) {
        if (t.contested) continue;
        const nbrs = new Hex(t.q, t.r).getNeighbors();

        // Must be adjacent to a frontier tile (so it actually projects to the border).
        let frontierAdj = false;
        let enemyAdjCount = 0;
        let neutralAdjCount = 0;
        for (const nh of nbrs) {
            const nt = game.grid.getTile(nh.q, nh.r);
            if (!nt) continue;
            if (frontierKeys.has(`${nh.q},${nh.r}`)) frontierAdj = true;
            if (nt.owner && nt.owner !== p.id) enemyAdjCount++;
            else if (!nt.owner && nt.buildable) neutralAdjCount++;
        }
        if (!frontierAdj) continue;

        // Need an actual border that touches enemy/neutral land — otherwise no border to defend.
        if (enemyAdjCount === 0 && neutralAdjCount === 0) continue;

        // Don't double up — skip if an existing B already covers this spot.
        // B influence radius lives on stats.radius (3/4/5 for B1/B2/B3).
        let alreadyCovered = false;
        for (const b of myBList) {
            const r = (b.structure.stats?.radius ?? 3) + 1;
            if (Hex.distance(t, b) <= r) {
                alreadyCovered = true; break;
            }
        }
        if (alreadyCovered) continue;

        // Threat direction: nearest visible enemy or stored attack vector.
        let threatPull = 0;
        if (snap.visibleEnemies.length) {
            let md = Infinity;
            for (const en of snap.visibleEnemies) {
                const d = Hex.distance(t, en);
                if (d < md) md = d;
            }
            threatPull = Math.max(0, 14 - md);
        } else if (p._attackVectors && p._attackVectors.length) {
            let md = Infinity;
            for (const av of p._attackVectors) {
                const d = Hex.distance(t, av);
                if (d < md) md = d;
            }
            threatPull = Math.max(0, 12 - md) * 0.6;
        }

        // Prefer spots NOT next to a Gov (Govs already shed influence there) and
        // prefer spots that are in supply (B starts producing ground units faster).
        let nearGov = false;
        for (const g of govs) {
            if (Hex.distance(t, g) <= 1) { nearGov = true; break; }
        }
        const supplyBonus = supplySet?.has(tileKey(t)) ? 3 : 0;
        const govPenalty = nearGov ? -3 : 0;

        const score =
            enemyAdjCount * 4
            + neutralAdjCount * 1.5
            + threatPull
            + supplyBonus
            + govPenalty
            + Math.random() * 1.2;

        if (score > bestScore) { bestScore = score; best = t; }
    }

    // Require a meaningful score — don't randomly drop B on an irrelevant tile.
    if (!best || bestScore < 3) return false;
    return game.buildStructure(best, 'B', p.id);
}

function tryNavyOpportunism(game, p, snap) {
    if (p.gold < 300) return false;
    if (Math.random() > 0.034) return false;

    // First: try to build a Port if none yet and a good coastal spot exists. Ports are infrastructure
    // (sea influence + trade gold + supply for fleets) and pay for themselves quickly.
    const portCount = snap.ownByType.PT?.length || 0;
    if (portCount === 0 && canAffordType(p, 'PT')) {
        const portRadius = UNIT_STATS.PT?.levels?.[0]?.radius ?? 4;
        const portSpot = findBestPortSpot(game, p.id, portRadius);
        if (portSpot && game.buildStructure(portSpot, 'PT', p.id)) return true;
    }

    if (p.missiles < 3) return false;
    const navyCount = (snap.ownByType.DDG?.length || 0) + (snap.ownByType.AF?.length || 0) + (snap.ownByType.SSG?.length || 0);
    if (navyCount >= 4) return false;
    if ((snap.missileProd || 0) < (snap.missileCons || 0) * 0.8) return false;
    const spot = findFirstNavyWater(game, p.id);
    if (!spot) return false;
    const w = {};
    if (canAffordType(p, 'DDG') && p.missiles >= 1) w.DDG = 0.5;
    if (canAffordType(p, 'AF') && p.missiles >= 0) w.AF = 0.38;
    if (canAffordType(p, 'SSG') && p.missiles >= 2) w.SSG = 0.12;
    if (Object.keys(w).length === 0) return false;
    return game.buildStructure(spot, weightedPick(w), p.id);
}

// ============================================================================
//  PRIORITY 2b — MISSILE ECONOMY GATE
//  Ensures AI ALWAYS has adequate MF before building missile consumers.
//  This is a hard gate: if missiles are short, build MF instead of anything.
// ============================================================================
function tryMissileEconomyGate(game, p, snap) {
    const prod = snap.missileProd;
    const cons = snap.missileCons;
    const missiles = p.missiles;
    const mfCount = snap.mfCount;
    const cap = maxMissileFactoriesForPlayer(game, p, snap);
    const wantBuf = 3 + Math.min(8, (cons || 0) * 2.0);

    // No missile users yet — stay light on factories until the stockpile is low
    if (cons === 0) {
        if (missiles >= 2) return false;
    }

    // Comfortable buffer: enough production, stockpile, and not over factory cap
    if (cons > 0 && prod >= cons * 1.05 && missiles >= wantBuf) return false;
    if (mfCount >= cap && prod >= (cons || 0.01) * 0.85 && missiles >= 3 + Math.min(4, (cons || 0))) return false;
    if (mfCount > cap && prod > cons * 1.12 && missiles >= 3) return false;

    // Missile-starved — build or upgrade MF, respect cap
    if (snap.ownByType.MF) {
        for (const mf of snap.ownByType.MF) {
            if (canAffordUpgrade(p, mf) && !mf.contested) {
                return game.upgradeStructure(mf);
            }
        }
    }

    if (mfCount < cap && canAffordType(p, 'MF')) {
        const spot = pickSupplyAwareRearSpot(game, p, snap);
        if (spot) return game.buildStructure(spot, 'MF', p.id);
    }

    return false;
}

// ============================================================================
//  PRIORITY 5b — MILITIA HQ ABUSE (M3 forward operating bases)
//  Upgrade militia far from home into M3 Militia HQ for:
//  - Surprise flanking attacks from unexpected positions
//  - Mini-income generation behind enemy lines
//  - Supply projection for ground troops
// ============================================================================
function tryMilitiaHQAbuse(game, p, snap, phase) {
    const doctrine = p.doctrine;
    const raider = (doctrine?.playstyle === 'raid' || (doctrine?.M ?? 0) >= 3.2);
    // Default: M3 from FORTIFY+. Raid / high-M doctrines: M3 in EXPAND for forward HQs
    if (phase === PHASES.EXPAND && !raider) return false;

    const militias = snap.ownByType.M || [];
    if (militias.length === 0) return false;

    const frontierKeys = new Set(snap.frontier.map(tileKey));
    const govs = snap.ownByType.G || [];
    const supplySet = game.supplyByPlayer.get(p.id);

    const candidates = [];
    for (const m of militias) {
        if (m.contested) continue;
        if (!canAffordUpgrade(p, m)) continue;
        const isFront = frontierKeys.has(tileKey(m));
        const inSupply = supplySet?.has(tileKey(m));
        const level = m.structure.level;

        let minGovDist = Infinity;
        for (const g of govs) {
            const d = Hex.distance(m, g);
            if (d < minGovDist) minGovDist = d;
        }

        // Check if near enemies (offensive position)
        let nearEnemy = false;
        for (const en of snap.visibleEnemies) {
            if (Hex.distance(m, en) <= 5) { nearEnemy = true; break; }
        }

        let score = 0;

        // M2→M3 (Militia HQ): Best when FAR from govs and near enemies
        // This creates forward operating bases for flanking
        if (level === 1) {
            score = 8 + Math.min(8, minGovDist) * 2.0;  // Distance from home = more valuable
            if (nearEnemy) score += 8;     // Near enemy = perfect flanking position
            if (!isFront) score += 2;      // Slightly prefer non-frontier (survives longer)
            if (!inSupply) score += 3;     // Out of supply = needs its own supply projection (M3 provides it!)
            if (raider && phase === PHASES.EXPAND) score += 4;
        }
        // M1→M2: upgrade for better range + damage on frontline
        else if (level === 0) {
            score = 4;
            if (isFront) score += 3;       // Frontline M1 benefits most from range upgrade
            if (nearEnemy) score += 2;
        }

        candidates.push({ tile: m, score });
    }

    if (candidates.length === 0) return false;
    candidates.sort((a, b) => b.score - a.score);

    // Gold: rush M3 on forward militia when raiding; defenders wait for surplus
    let goldThreshold = phase >= PHASES.PRESSURE ? 180 : 280;
    if (raider) goldThreshold -= 55;
    if (doctrine?.playstyle === 'defend') goldThreshold += 70;
    if (p.gold > goldThreshold) {
        return game.upgradeStructure(candidates[0].tile);
    }

    return false;
}

// ============================================================================
//  LEGACY MILITIA UPGRADE — now a lighter version for M1→M2
// ============================================================================
function tryMilitiaUpgradeStrategy(game, p, snap, phase) {
    // tryMilitiaHQAbuse handles M2→M3 now. This handles leftover M1→M2.
    if (phase < PHASES.EXPAND) return false;
    const militias = (snap.ownByType.M || []).filter(m =>
        m.structure.level === 0 && !m.contested && canAffordUpgrade(p, m)
    );
    if (militias.length === 0) return false;

    // Upgrade frontline M1 to M2 (range 2→3 is a big deal)
    const frontierKeys = new Set(snap.frontier.map(tileKey));
    const front = militias.filter(m => frontierKeys.has(tileKey(m)));
    const target = front.length > 0 ? front[0] : militias[0];

    if (p.gold > 200) {
        return game.upgradeStructure(target);
    }
    return false;
}

// ============================================================================
//  PRIORITY 6 — UPGRADE
// ============================================================================
const UPGRADE_VALUE = { G: 6, MF: 5, AB: 5, RL: 4, AAS: 4, B: 3, D: 3, M: 2 };

function tryUpgrade(game, p, snap, doctrine, shared) {
    const pr = aiParams(game);
    const effBias = Math.min(0.93, doctrine.upgradeBias * (pr.upgradeBiasScale ?? 1));
    if (Math.random() > effBias && (p.gold < 600)) return false;

    const frontierKeys = new Set(snap.frontier.map(tileKey));
    const supplySet = game.supplyByPlayer.get(p.id);

    const candidates = [];
    for (const tile of snap.structures) {
        if (tile.contested) continue;
        if (!canAffordUpgrade(p, tile)) continue;
        const def = UNIT_STATS[tile.structure.type];
        const next = def.levels[tile.structure.level + 1];
        if (!next) continue;

        const typ = tile.structure.type;
        const st = tile.structure.stats;
        const curLv = tile.structure.level;
        const nextMps = next.missilesPerShot;
        const curMps = st.missilesPerShot;

        let value = UPGRADE_VALUE[typ] || 1;
        const isFront = frontierKeys.has(tileKey(tile));
        if (!isFront) value *= 1.4;
        value += (3 - curLv);

        if (typ === 'MF' && snap.missileProd > snap.missileCons * 1.4) value *= 0.4;
        if (typ === 'MF' && snap.missileProd < snap.missileCons * 1.1) value *= 1.35;
        if (typ === 'MF' && p.missiles < 3 && snap.missileCons > 0) value *= 1.15;

        // RL/AB: higher levels burn more missiles per volley (Units.csv RL3×2, AB2+ heavy) — do not roll into that while starved
        if ((typ === 'RL' || typ === 'AB') && nextMps != null && curMps != null && nextMps > curMps) {
            if (snap.missileProd < snap.missileCons * 1.15 || p.missiles < 5) value *= 0.42;
            else if (p.missiles < 8) value *= 0.72;
        }

        // AAS: more valuable per level when enemy is drone-heavy (many interceptable projectiles)
        if (typ === 'AAS') {
            const ed = (snap.visibleEnemyTypeCounts?.D || 0) + (snap.visibleEnemyTypeCounts?.SU || 0);
            if (ed >= 2) value *= 1.1 + 0.04 * Math.min(4, ed);
        }

        // B: L3 command aura; frontline B supports the whole line (Units.csv)
        if (typ === 'B' && isFront && curLv >= 0 && next.radius != null) value *= 1.2;

        // D: D3 applies jamming — prioritize when many enemy AAS need debuff
        if ((typ === 'D' || typ === 'SU') && curLv < 2) {
            const aasE = snap.visibleEnemyTypeCounts?.AAS || 0;
            if (aasE >= 2) value *= 1.1 + 0.05 * Math.min(3, aasE);
        }

        // Prefer upgrading structures in supply
        if (supplySet?.has(tileKey(tile))) value *= 1.2;

        // Prefer upgrading structures that are actively contributing (have targets in range)
        if (ATTACKER_TYPES.has(typ) && st.range) {
            const hasTarget = snap.visibleEnemies.some(e => Hex.distance(tile, e) <= st.range);
            if (hasTarget) value *= 1.5;
        }

        candidates.push({ tile, value });
    }
    if (!candidates.length) return false;
    candidates.sort((a, b) => b.value - a.value);
    return game.upgradeStructure(candidates[0].tile);
}

// ============================================================================
//  PRIORITY 7 — DEMOLISH (reclaim gold from trapped/redundant structures)
// ============================================================================
function tryDemolish(game, p, snap, shared) {
    if (p.gold > 300) return false;
    if (snap.structures.length < 5) return false;

    const supplySet = game.supplyByPlayer.get(p.id);
    const frontierKeys = new Set(snap.frontier.map(tileKey));

    for (const tile of snap.structures) {
        if (tile.contested) continue;
        const s = tile.structure;

        // Demolish out-of-supply MF (they're 1.6x slower — not worth it)
        if (s.type === 'MF' && !supplySet?.has(tileKey(tile)) && snap.mfCount > 1) {
            return game.demolishStructure(tile, p.id);
        }

        // Demolish attackers that have no targets in range and are deep behind lines
        if (ATTACKER_TYPES.has(s.type) && s.type !== 'M' && s.stats.range) {
            const isFront = frontierKeys.has(tileKey(tile));
            if (!isFront) {
                const hasAnyTarget = snap.visibleEnemies.some(e => Hex.distance(tile, e) <= s.stats.range);
                if (!hasAnyTarget && !supplySet?.has(tileKey(tile))) {
                    return game.demolishStructure(tile, p.id);
                }
            }
        }

        // Demolish redundant AAS far from anything worth protecting
        if (s.type === 'AAS' && snap.aasCount > 2) {
            const govs = snap.ownByType.G || [];
            const nearGov = govs.some(g => Hex.distance(tile, g) <= 6);
            const nearAB = (snap.ownByType.AB || []).some(a => Hex.distance(tile, a) <= 4);
            if (!nearGov && !nearAB) {
                return game.demolishStructure(tile, p.id);
            }
        }
    }

    return false;
}

// ============================================================================
//  PLACEMENT — DIRECTIONAL FRONTIER (biased toward enemy)
// ============================================================================
function pickDirectionalFrontierSpot(game, p, snap, targetEnemies) {
    if (!snap.frontier.length) return null;
    const frontierKeys = new Set(snap.frontier.map(tileKey));

    const candidates = [];
    for (const t of snap.emptyOwn) {
        if (t.contested) continue;
        const nbrs = new Hex(t.q, t.r).getNeighbors();
        let isFrontierAdj = false;
        for (const nh of nbrs) {
            if (frontierKeys.has(`${nh.q},${nh.r}`)) { isFrontierAdj = true; break; }
        }
        if (!isFrontierAdj) continue;

        // Score: bias toward enemy direction
        let score = 0;
        const dirQ = t.q - snap.centroidQ;
        const dirR = t.r - snap.centroidR;
        const dot = dirQ * snap.enemyDirQ + dirR * snap.enemyDirR;
        score += dot * 2;

        // Bonus for proximity to target enemies
        if (targetEnemies && targetEnemies.length > 0) {
            let minDist = Infinity;
            for (const en of targetEnemies.slice(0, 5)) {
                const d = Hex.distance(t, en);
                if (d < minDist) minDist = d;
            }
            score += Math.max(0, 10 - minDist);
        }

        // Small random jitter to avoid identical placements
        score += Math.random() * 1.5;

        candidates.push({ tile: t, score });
    }

    if (candidates.length === 0) {
        // Fallback: frontier tiles themselves
        const empties = snap.frontier.filter(f => !f.structure && !f.contested);
        if (empties.length) return empties[Math.floor(Math.random() * empties.length)];
        return snap.emptyOwn.find(t => !t.contested) || null;
    }

    candidates.sort((a, b) => b.score - a.score);
    const pr = aiParams(game);
    const topN = Math.min(pr.frontierTopN ?? 3, candidates.length);
    return candidates[Math.floor(Math.random() * topN)].tile;
}

function pickSpotTowardDirection(game, p, snap, dirQ, dirR) {
    const mag = Math.sqrt(dirQ * dirQ + dirR * dirR) || 1;
    dirQ /= mag;
    dirR /= mag;

    let best = null, bestDot = -Infinity;
    for (const t of snap.emptyOwn) {
        if (t.contested) continue;
        const dq = t.q - snap.centroidQ;
        const dr = t.r - snap.centroidR;
        const dot = dq * dirQ + dr * dirR;
        if (dot > bestDot) { bestDot = dot; best = t; }
    }
    return best;
}

function findFirstNavyWater(game, ownerId) {
    for (const t of game.grid.tiles.values()) {
        if (t.structure) continue;
        if (game.canBuildNavyOn(t, ownerId)) return t;
    }
    return null;
}

/**
 * Score a coastal-land tile for a Port — count owned shore/sea tiles within `radius`.
 * Higher = more sea/shore coverage = more sea-trade gold for that Port.
 */
function findBestPortSpot(game, ownerId, radius = 4) {
    let best = null;
    let bestScore = -1;
    for (const t of game.grid.tiles.values()) {
        if (t.structure) continue;
        if (!game.canBuildPortOn(t, ownerId)) continue;
        let cov = 0;
        for (let dq = -radius; dq <= radius; dq++) {
            for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
                const nt = game.grid.getTile(t.q + dq, t.r + dr);
                if (!nt || nt.buildable) continue;
                if (nt.owner === ownerId && !nt.contested) cov++;
                else if (!nt.owner && !nt.contested) cov += 0.4; // unclaimed sea — Port will pull it in via influence
            }
        }
        if (cov > bestScore) { bestScore = cov; best = t; }
    }
    return bestScore >= 4 ? best : null;
}

function ownerHasPort(snap) {
    return (snap.ownByType.PT?.length || 0) > 0;
}

// ============================================================================
//  PLACEMENT — TYPE-AWARE spot picking
// ============================================================================
function pickPlacementForType(game, p, snap, type, valuableEnemies) {
    if (type === 'AAS') {
        const aasArr = snap.ownByType.AAS || [];
        const valuable = [
            ...(snap.ownByType.G  || []),
            ...(snap.ownByType.AB || []),
            ...(snap.ownByType.MF || []),
        ];
        for (const v of valuable) {
            const covered = aasArr.some(a => Hex.distance(a, v) <= a.structure.stats.range);
            if (!covered) {
                const sp = findEmptyAdjacent(game, p.id, v);
                if (sp) return sp;
            }
        }
        return pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies) ||
               pickSupplyAwareRearSpot(game, p, snap);
    }

    if (type === 'DDG' || type === 'AF' || type === 'SSG') {
        return findFirstNavyWater(game, p.id) ||
            null;
    }

    if (type === 'PT') {
        const portRadius = statsAtLevel('PT', 0)?.radius ?? 4;
        return findBestPortSpot(game, p.id, portRadius);
    }

    if (type === 'RL' || type === 'AB') {
        const baseStats = statsAtLevel(type, 0);
        const range = baseStats.range;
        let bestSpot = null;
        let bestScore = -Infinity;
        for (const t of snap.emptyOwn) {
            if (t.contested) continue;
            let inRange = 0;
            for (const en of valuableEnemies || []) {
                if (Hex.distance(t, en) <= range) inRange++;
            }
            if (inRange === 0) continue;
            let nearestEnemy = Infinity;
            for (const en of snap.visibleEnemies) {
                const d = Hex.distance(t, en);
                if (d < nearestEnemy) nearestEnemy = d;
            }
            const safetyBonus = nearestEnemy >= 3 ? 3 : (nearestEnemy >= 2 ? 1.5 : 0);
            // Prefer spots in supply
            const supplySet = game.supplyByPlayer.get(p.id);
            const supplyBonus = supplySet?.has(tileKey(t)) ? 2 : 0;
            const score = inRange * 5 + safetyBonus + supplyBonus;
            if (score > bestScore) { bestScore = score; bestSpot = t; }
        }
        if (bestSpot) return bestSpot;
        return pickDirectionalFrontierSpot(game, p, snap, valuableEnemies);
    }

    if (type === 'D' || type === 'SU') {
        const baseStats = statsAtLevel(type, 0);
        const range = baseStats.range;
        let bestSpot = null;
        let bestScore = -Infinity;
        for (const t of snap.emptyOwn) {
            if (t.contested) continue;
            let inRange = 0;
            for (const en of snap.visibleEnemies) {
                if ((KILL_VALUE[en.structure.type] || 0) >= 35 && Hex.distance(t, en) <= range) inRange++;
            }
            if (inRange === 0) continue;
            // Drones cluster near AAS to overwhelm — bonus for being near other drones
            let droneCluster = 0;
            for (const d of [...(snap.ownByType.D || []), ...(snap.ownByType.SU || [])]) {
                if (Hex.distance(t, d) <= 3) droneCluster++;
            }
            // Prefer hexes in range of enemy AAS (saturate intercept, apply debuffs)
            let aasInRange = 0;
            for (const en of snap.visibleEnemies) {
                if (en.structure.type === 'AAS' && Hex.distance(t, en) <= range) aasInRange++;
            }
            const score = inRange * 3 + droneCluster * 1.5 + aasInRange * 2.5 + Math.random();
            if (score > bestScore) { bestScore = score; bestSpot = t; }
        }
        return bestSpot || pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies);
    }

    if (type === 'B') {
        if ((snap.visibleEnemyTypeCounts?.RL || 0) + (snap.visibleEnemyTypeCounts?.AB || 0) >= 1) {
            const sc = pickScreenBarracksSpot(game, p, snap);
            if (sc) return sc;
        }
        return pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies);
    }

    if (type === 'MF') return pickSupplyAwareRearSpot(game, p, snap);
    if (type === 'G')  return findGovSpot(game, p.id, snap);

    return pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies);
}

// ============================================================================
//  PLACEMENT — SUPPLY-AWARE REAR SPOT (for MF, replaces naive pickRearBuildSpot)
// ============================================================================
function pickSupplyAwareRearSpot(game, p, snap) {
    if (!snap.emptyOwn.length) return null;

    const frontierKeys = new Set(snap.frontier.map(tileKey));
    const supplySet = game.supplyByPlayer.get(p.id);

    let best = null, bestScore = -Infinity;
    for (const t of snap.emptyOwn) {
        if (t.contested) continue;
        let minFrontDist = Infinity;
        for (const ft of snap.frontier) {
            const d = Hex.distance(t, ft);
            if (d < minFrontDist) minFrontDist = d;
        }
        if (minFrontDist === Infinity) minFrontDist = 5;

        const inSupply = supplySet?.has(tileKey(t));
        // In-supply dominates: out-of-supply structures run ~1.6x slower (game.js SUPPLY_OUT_MULT).
        // Rear is a tiebreaker, not an alternative.
        const score = (inSupply ? 60 : 0) + Math.min(minFrontDist, 6) * 1.5 + Math.random() * 0.5;
        if (score > bestScore) { bestScore = score; best = t; }
    }
    return best;
}

function findEmptyAdjacent(game, ownerId, tile) {
    const nbrs = new Hex(tile.q, tile.r).getNeighbors();
    const cands = [];
    for (const nh of nbrs) {
        const nt = game.grid.getTile(nh.q, nh.r);
        if (nt && nt.buildable && !nt.structure && nt.owner === ownerId && !nt.contested) cands.push(nt);
    }
    if (!cands.length) return null;
    return cands[Math.floor(Math.random() * cands.length)];
}

// ============================================================================
//  GOV PLACEMENT — maximize NEW tile coverage, minimize overlap
// ============================================================================
function findGovSpot(game, playerId, snap) {
    const govs = snap.ownByType.G || [];
    const candidates = snap.emptyOwn.filter(t => !t.contested);
    if (!candidates.length) return null;

    const govStats = statsAtLevel('G', 0);
    const govRadius = govStats?.radius || 4;

    let best = null;
    let bestScore = -Infinity;
    for (const t of candidates) {
        // Count how many tiles within radius are NOT already covered by an existing Gov
        let newTileCoverage = 0;
        let totalInRadius = 0;
        for (let dq = -govRadius; dq <= govRadius; dq++) {
            for (let dr = Math.max(-govRadius, -dq - govRadius); dr <= Math.min(govRadius, -dq + govRadius); dr++) {
                const nt = game.grid.getTile(t.q + dq, t.r + dr);
                if (!nt || !nt.buildable) continue;
                totalInRadius++;
                let coveredByExisting = false;
                for (const g of govs) {
                    const gRadius = g.structure.stats.radius || 4;
                    if (Hex.distance(nt, g) <= gRadius) { coveredByExisting = true; break; }
                }
                if (!coveredByExisting) newTileCoverage++;
            }
        }

        // Distance from frontier (safety)
        let minFrontDist = Infinity;
        for (const f of snap.frontier) {
            const d = Hex.distance(t, f);
            if (d < minFrontDist) minFrontDist = d;
        }
        if (minFrontDist === Infinity) minFrontDist = 0;
        const safeBonus = Math.min(4, minFrontDist);

        // Reward tiles we don't own yet in the radius (expansion potential)
        let neutralAround = 0;
        for (let dq = -govRadius; dq <= govRadius; dq++) {
            for (let dr = Math.max(-govRadius, -dq - govRadius); dr <= Math.min(govRadius, -dq + govRadius); dr++) {
                const nt = game.grid.getTile(t.q + dq, t.r + dr);
                if (nt && nt.buildable && nt.owner !== playerId) neutralAround++;
            }
        }

        // Primary: new tile coverage (anti-overlap). Secondary: neutrals. Tertiary: safety.
        const score = newTileCoverage * 2.0 + neutralAround * 0.5 + safeBonus * 1.0;
        if (score > bestScore) { bestScore = score; best = t; }
    }
    return best;
}

function findMilitiaSpot(game, playerId, snap) {
    const player = game.players[playerId - 1];
    if (!player) return null;
    const visible = player.fogVisible;
    const candidates = [];
    for (const ft of snap.frontier) {
        const nbrs = new Hex(ft.q, ft.r).getNeighbors();
        for (const nh of nbrs) {
            const nt = game.grid.getTile(nh.q, nh.r);
            if (!nt || !nt.buildable || nt.structure || nt.contested) continue;
            if (nt.owner && nt.owner !== playerId) continue;
            if (!visible.has(tileKey(nt))) continue;
            candidates.push(nt);
        }
    }
    if (!candidates.length) return null;

    candidates.sort((a, b) => {
        const aNeutral = a.owner == null ? 1 : 0;
        const bNeutral = b.owner == null ? 1 : 0;
        if (aNeutral !== bNeutral) return bNeutral - aNeutral;

        const aDot = (a.q - snap.centroidQ) * snap.enemyDirQ + (a.r - snap.centroidR) * snap.enemyDirR;
        const bDot = (b.q - snap.centroidQ) * snap.enemyDirQ + (b.r - snap.centroidR) * snap.enemyDirR;
        if (Math.abs(aDot - bDot) > 0.5) return bDot - aDot;

        const an = new Hex(a.q, a.r).getNeighbors().filter(nh => {
            const t = game.grid.getTile(nh.q, nh.r);
            return t && t.buildable && t.owner !== playerId;
        }).length;
        const bn = new Hex(b.q, b.r).getNeighbors().filter(nh => {
            const t = game.grid.getTile(nh.q, nh.r);
            return t && t.buildable && t.owner !== playerId;
        }).length;
        return bn - an;
    });

    const topN = Math.min(3, candidates.length);
    return candidates[Math.floor(Math.random() * topN)];
}

function tryExpandWithMilitia(game, p, snap, phase, shared) {
    if (p.units.M >= game.militiaCap(p)) return false;
    if (!canAffordType(p, 'M')) return false;

    const doctrine = p.doctrine;
    const mCost = m0Cost();
    const neutralNearby = snap.neutralAdjacentToFrontier || 0;
    const docM = (doctrine?.M ?? 2) / 2;
    const expandW = playstyleMilitiaExpandMult(doctrine) * clamp(docM, 0.75, 1.45);

    // Tighter reserve when there is a lot of free land (tiles > doctrine — always scale the map)
    const landUrgency = neutralNearby >= 8 ? 0.55 : neutralNearby >= 4 ? 0.72 : neutralNearby >= 1 ? 0.9 : 1;
    const baseRes = phase >= PHASES.DOMINATE ? 90 : (phase >= PHASES.PRESSURE ? 150 : 95);
    let reserveGold = baseRes * landUrgency / expandW;

    // ── GOV SAVE-UP GATE ──
    // Captured tiles only pay out under a Gov's influence. If we still need Govs, refuse
    // to drain gold below a save-up floor — otherwise we'd hit militia cap with 1 Gov
    // and never accumulate the 1525+ gold for a second/third one.
    const wantG = (shared && doctrine)
        ? effectiveTargetGovCount(game, p, snap, shared, doctrine)
        : 2;
    const govCost = statsAtLevel('G', 0)?.cost || 1525;
    const needGov = snap.govCount < wantG;
    const allG = snap.ownByType.G || [];
    const upgradableG = allG.find(g => !g.contested && g.structure.level < 2);
    const wantGovUpgrade = !!upgradableG && allG.length <= 2 && phase <= PHASES.FORTIFY;

    if (needGov || wantGovUpgrade) {
        // Cheaper of (new Gov) vs (next-tier upgrade on an existing Gov).
        let target = needGov ? govCost : Infinity;
        if (wantGovUpgrade) {
            const def = UNIT_STATS.G;
            const next = def?.levels?.[upgradableG.structure.level + 1];
            if (next) {
                const upCost = Math.floor(next.cost * GAME_CONFIG.UPGRADE_COST_MULT);
                if (upCost < target) target = upCost;
            }
        }
        // Only enforce save while still saving (target > current gold). Once affordable,
        // tryEconomy/tryUpgrade will pull the trigger and the floor releases.
        if (Number.isFinite(target) && target > p.gold) {
            const aggressiveLand = neutralNearby >= 7;
            // Reserve a sizeable fraction of the target so each militia purchase doesn't
            // strand the bot far from its next Gov. Lots of free land softens the floor.
            const saveupFloor = aggressiveLand
                ? Math.min(target * 0.42, 520)
                : Math.min(target * 0.62, 980);
            reserveGold = Math.max(reserveGold, saveupFloor);
        }
    }

    // AGGRESSIVE: grab neutrals with militia first — cheap permanent income
    if (neutralNearby > 0) {
        if (p.gold < reserveGold + mCost * 0.72) return false;

        const spot = findMilitiaSpot(game, p.id, snap);
        if (spot) return game.buildStructure(spot, 'M', p.id);
    }

    // No neutrals: still push a militia to pressure / steal with surplus (raid > defend)
    const pushGold = 280 + (doctrine?.playstyle === 'defend' ? 140 : 0);
    const pushFloor = Math.max(reserveGold + mCost * 0.72, pushGold * (1.15 / expandW));
    if (p.gold > pushFloor && snap.frontier.length > 0) {
        const spot = findMilitiaSpot(game, p.id, snap);
        if (spot) return game.buildStructure(spot, 'M', p.id);
    }

    return false;
}
