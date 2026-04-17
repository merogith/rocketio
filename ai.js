// ============================================================================
//  ROCKETIO — AI v0.6
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
//         c. Counter-play          — shape forces to counter enemy composition
//         d. Focus fire            — reassign attackers to a single high-value target
//         e. Economy               — MF when missile-starved, Gov when snowballing
//         f. Strategic build       — pick best STRUCTURE TYPE then best LOCATION
//         g. Upgrade               — high-value, behind-frontier structures
//         h. Militia-Gov strategy  — M1→M2→M3 forward territory grab
//         i. Coordinated strike    — point all attackers at the kill target
//         j. Demolish              — reclaim gold from trapped/redundant structures
// ============================================================================

import { UNIT_STATS, AI_DOCTRINES, GAME_CONFIG, DIPLOMACY } from './constants.js';
import { Hex } from './hexGrid.js';

const PHASES = { EXPAND: 0, FORTIFY: 1, PRESSURE: 2, DOMINATE: 3 };

const KILL_VALUE = { G: 100, AB: 60, MF: 55, AAS: 45, RL: 40, B: 35, D: 25, M: 8 };

const ATTACKER_TYPES = new Set(['RL', 'B', 'D', 'AB', 'M']);
const COMBAT_TYPES   = new Set(['RL', 'B', 'D', 'AB', 'M']);

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

/** Desired Government count scales with owned tiles, map size, and difficulty (capped). */
function computeTargetGovCount(game, p, snap, shared) {
    const landScale = Math.max(1, (shared.totalLandTiles || 400) / 400);
    const tc = p.tileCount;
    const difficulty = game.aiDifficulty || 'normal';
    let n = 2 + Math.floor((tc * landScale) / 42);
    if (difficulty === 'hard') n += 1;
    else if (difficulty === 'easy') n -= 1;
    return clamp(n, 2, MAX_TARGET_GOV);
}

/** Applies doctrine G preference (ECONOMIST builds more, baseline 2). */
function effectiveTargetGovCount(game, p, snap, shared, doctrine) {
    const base = computeTargetGovCount(game, p, snap, shared);
    const mult = clamp((doctrine?.G ?? 2) / 2, 0.75, 2);
    return clamp(Math.round(base * mult), 2, MAX_TARGET_GOV);
}

function phasedGovNeed(targetG, phase) {
    if (phase === PHASES.EXPAND) return Math.min(targetG, Math.max(1, Math.ceil(targetG * 0.4)));
    if (phase === PHASES.FORTIFY) return Math.min(targetG, Math.max(2, Math.ceil(targetG * 0.55)));
    if (phase === PHASES.PRESSURE) return Math.min(targetG, Math.max(3, Math.ceil(targetG * 0.75)));
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
            if (s.type === 'RL' || s.type === 'AB') {
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
    };
}

// ============================================================================
//  PHASE DETECTION  (scales with map context)
// ============================================================================
function detectPhase(game, p, snap, shared) {
    const tc = p.tileCount;
    const hasAttacker = (snap.ownByType.RL?.length || 0) + (snap.ownByType.AB?.length || 0) > 0;
    const hasDrones   = (snap.ownByType.D?.length || 0) > 0;
    const hasCombat   = hasAttacker || hasDrones || (snap.ownByType.B?.length || 0) > 0;
    const isLeader    = shared.leaderId === p.id;

    const landScale = Math.max(1, (shared.totalLandTiles || 400) / 400);
    const scaledFortify  = Math.round(12 * landScale);
    const scaledPressure = Math.round(18 * landScale);
    const scaledDominate = Math.round(40 * landScale);

    if ((p.gold > 1400 && hasCombat && tc > scaledPressure) || (tc > scaledDominate && hasCombat))
        return PHASES.DOMINATE;
    if (tc > scaledPressure && hasCombat)
        return PHASES.PRESSURE;
    if (tc >= scaledFortify && snap.govCount >= 2)
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

    let dIdx = 0;
    for (const p of game.players) {
        if (p.id === game.humanId) continue;
        if (!p.doctrine) {
            const offset = (game._doctrineSeed = game._doctrineSeed ?? Math.floor(Math.random() * 4));
            p.doctrine = AI_DOCTRINES[DOCTRINE_KEYS[(dIdx + offset) % DOCTRINE_KEYS.length]];
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

        const baseDelay = phase >= PHASES.PRESSURE ? 300 : 500;
        const tickMult = game._difficulty?.tickMult ?? 1;
        p.nextAiAction = time + (baseDelay + Math.random() * 300) * tickMult;

        const actions = phase >= PHASES.DOMINATE ? 4 : (phase >= PHASES.PRESSURE ? 3 : 2);
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
    const isHard = difficulty === 'hard';

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
        if (q.id === game.humanId) score += 0.15;
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
//  AI TICK
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

    // Priority cascade
    if (tryEmergencyDefense(game, p, snap, tileLoss)) goto_done(p);
    else if (tryCounterPlay(game, p, snap)) goto_done(p);
    else if (tryFocusFire(game, p, snap, shared)) {
        tryEconomy(game, p, snap, phase, shared, doctrine) ||
        tryStrategicBuild(game, p, snap, shared, phase, doctrine) ||
        tryMilitiaGovStrategy(game, p, snap, phase) ||
        tryUpgrade(game, p, snap, doctrine, shared);
        goto_done(p);
    } else {
        tryEconomy(game, p, snap, phase, shared, doctrine) ||
        tryStrategicBuild(game, p, snap, shared, phase, doctrine) ||
        tryMilitiaGovStrategy(game, p, snap, phase) ||
        tryUpgrade(game, p, snap, doctrine, shared) ||
        tryDemolish(game, p, snap, shared) ||
        tryExpandWithMilitia(game, p, snap, phase);
        goto_done(p);
    }
}

function goto_done(p) {
    p._lastTileCount = p.tileCount;
}

// ============================================================================
//  PRIORITY 0 — OPENING BUILD ORDER
// ============================================================================
function tryOpeningBuildOrder(game, p, snap, shared, phase) {
    if (phase > PHASES.EXPAND) return false;

    const totalStructures = snap.structures.length;
    const govs = snap.ownByType.G?.length || 0;
    const mfs = snap.ownByType.MF?.length || 0;
    const militias = snap.ownByType.M?.length || 0;

    // Step 1: We need at least 1 MF (might already have one from spawn)
    if (mfs === 0 && canAffordType(p, 'MF')) {
        const spot = pickSupplyAwareRearSpot(game, p, snap);
        if (spot) return game.buildStructure(spot, 'MF', p.id);
    }

    // Step 2: Expand with militia to claim territory fast (3-4 militia)
    if (mfs >= 1 && militias < 3 && p.units.M < game.militiaCap(p)) {
        if (canAffordType(p, 'M')) {
            const spot = findMilitiaSpot(game, p.id, snap);
            if (spot) return game.buildStructure(spot, 'M', p.id);
        }
        return false;
    }

    // Step 3: Second Gov when we have enough territory (>= 6 tiles)
    if (govs < 2 && p.tileCount >= 6 && canAffordType(p, 'G')) {
        const spot = findGovSpot(game, p.id, snap);
        if (spot) return game.buildStructure(spot, 'G', p.id);
    }

    // Step 4: Keep expanding militia to 5-6 while waiting for gold
    if (govs >= 1 && mfs >= 1 && militias < 5 && p.units.M < game.militiaCap(p)) {
        if (canAffordType(p, 'M')) {
            const spot = findMilitiaSpot(game, p.id, snap);
            if (spot) return game.buildStructure(spot, 'M', p.id);
        }
    }

    // Step 5: First combat unit — doctrine-aware choice
    if (govs >= 2 && mfs >= 1 && totalStructures >= 6) {
        const doctrine = p.doctrine;
        if (doctrine) {
            // Pick first combat unit based on doctrine preference
            const options = [];
            if (canAffordType(p, 'B') && p.missiles >= 0)  options.push({ type: 'B', w: doctrine.B });
            if (canAffordType(p, 'RL') && p.missiles >= 2) options.push({ type: 'RL', w: doctrine.RL });
            if (canAffordType(p, 'D'))                      options.push({ type: 'D', w: doctrine.D });
            if (options.length > 0) {
                const weights = {};
                for (const o of options) weights[o.type] = o.w;
                const type = weightedPick(weights);
                const spot = pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies);
                if (spot) return game.buildStructure(spot, type, p.id);
            }
        }
    }

    // After step 5, exit opening — let normal priorities take over
    if (govs >= 2 && mfs >= 1 && totalStructures >= 7) return false;

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
        );
        if (protectedByAAS) continue;

        const spot = findEmptyAdjacent(game, p.id, vt);
        if (spot && canAffordType(p, 'AAS')) {
            return game.buildStructure(spot, 'AAS', p.id);
        }
    }

    // (b) Bleeding territory — respond proportionally
    if (tileLoss >= 2) {
        // Record attack vector for future defense decisions
        if (snap.nearestEnemyTile) {
            p._attackVectors = p._attackVectors || [];
            p._attackVectors.push({
                q: snap.nearestEnemyTile.q,
                r: snap.nearestEnemyTile.r,
                t: game.gameTime,
            });
        }

        const spot = pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies);
        if (spot) {
            if (tileLoss >= 4 && canAffordType(p, 'B')) return game.buildStructure(spot, 'B', p.id);
            if (canAffordType(p, 'B')) return game.buildStructure(spot, 'B', p.id);
            if (canAffordType(p, 'M')) return game.buildStructure(spot, 'M', p.id);
        }
    }

    // (c) Gov unshielded + enemy attackers nearby
    for (const g of govs) {
        const visEnemyAttackers = snap.visibleEnemies.filter(e =>
            (e.structure.type === 'RL' || e.structure.type === 'AB') &&
            Hex.distance(g, e) <= (e.structure.stats.range || 0) + 2
        );
        if (visEnemyAttackers.length === 0) continue;

        const protectedByAAS = (snap.ownByType.AAS || []).some(a =>
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

    const enemyTypeNearMe = {};
    for (const ft of snap.frontier) {
        for (const en of snap.visibleEnemies) {
            const d = Hex.distance(ft, en);
            if (d > 8) continue;
            const t = en.structure.type;
            enemyTypeNearMe[t] = (enemyTypeNearMe[t] || 0) + 1;
        }
    }

    const myAAS = snap.ownByType.AAS?.length || 0;
    const myRL  = snap.ownByType.RL?.length || 0;
    const myAB  = snap.ownByType.AB?.length || 0;

    // Heavy drone presence → AAS (proportional response)
    const enemyDrones = enemyTypeNearMe.D || 0;
    if (enemyDrones >= 2 && myAAS < Math.ceil(enemyDrones / 2) && canAffordType(p, 'AAS')) {
        const spot = pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies.filter(e => e.structure.type === 'D'));
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

    // Militia swarm → Barracks (great area denial + DPS vs cheap units)
    if ((enemyTypeNearMe.M || 0) >= 3 && canAffordType(p, 'B')) {
        const spot = pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies.filter(e => e.structure.type === 'M'));
        if (spot) return game.buildStructure(spot, 'B', p.id);
    }

    // Enemy heavy AAS presence + we have shooters → switch to ground/drones to saturate
    const enemyAAS = enemyTypeNearMe.AAS || 0;
    if (enemyAAS >= 2 && (myRL + myAB) >= 2 && (snap.ownByType.D?.length || 0) < 2) {
        if (canAffordType(p, 'D')) {
            const spot = pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies.filter(e => e.structure.type === 'AAS'));
            if (spot) return game.buildStructure(spot, 'D', p.id);
        }
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

        if (en.owner === snap.primaryEnemyId) value *= 1.4;
        if (en.owner === shared.leaderId)     value *= 1.25;

        const hpFrac = en.maxHp ? (en.hp / en.maxHp) : 1;
        if (hpFrac < 0.3)  value *= 2.0;
        else if (hpFrac < 0.5) value *= 1.6;
        else if (hpFrac < 0.7) value *= 1.2;

        if (missileShort && incomingShooterKeys?.has(`${en.q},${en.r}`)) {
            value *= 1.55;
        }
        if (missileShort && (t === 'RL' || t === 'AB' || t === 'D')) {
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
        ...attackers.filter(a => a.structure.type === 'D'),
        ...attackers.filter(a => a.structure.type === 'AB' || a.structure.type === 'RL'),
        ...attackers.filter(a => a.structure.type === 'B'),
        ...attackers.filter(a => a.structure.type === 'M'),
    ];

    let primaryAssigned = 0;
    let acted = false;

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
        const primaryCap = Math.max(2, Math.ceil(orderedAttackers.length * 0.7));
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
    const goldThreshold = snap.govCount < wantG * 0.45 ? 380 : 650;
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
    const targetG = effectiveTargetGovCount(game, p, snap, shared, doctrine);
    const govNeed = phasedGovNeed(targetG, phase);
    if (snap.govCount < govNeed && canAffordType(p, 'G')) {
        const spot = findGovSpot(game, p.id, snap);
        if (spot) return game.buildStructure(spot, 'G', p.id);
    }

    // Proactive missile economy: ensure MF capacity BEFORE building missile consumers
    const mfNeed = phase >= PHASES.PRESSURE ? 2 : 1;
    const futureConsumers = (snap.ownByType.RL?.length || 0) + (snap.ownByType.AB?.length || 0);
    const needMoreMF = snap.mfCount < mfNeed ||
        (futureConsumers > 0 && snap.missileProd < snap.missileCons * 1.1);
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

    // Combat builds
    if (phase >= PHASES.FORTIFY && snap.visibleEnemies.length > 0) {
        const have = (t) => snap.ownByType[t]?.length || 0;

        const valuableEnemies = snap.visibleEnemies
            .filter(e => (KILL_VALUE[e.structure.type] || 0) >= 35)
            .sort((a, b) => (KILL_VALUE[b.structure.type] || 0) - (KILL_VALUE[a.structure.type] || 0));

        const w = {
            RL:  doctrine.RL  * (have('RL')  < 2 ? 1.6 : 1),
            AB:  doctrine.AB  * (have('AB')  < 1 ? 1.4 : 1) * (phase >= PHASES.DOMINATE ? 1.8 : 1),
            D:   doctrine.D   * (have('D')   < 2 ? 1.4 : 1),
            B:   doctrine.B   * (have('B')   < 1 ? 1.6 : 1),
            AAS: doctrine.AAS * ((snap.aasCount < 2 || snap.visibleEnemies.some(e => e.structure.type === 'AB')) ? 1.5 : 0.6),
        };

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
            return tryExpandWithMilitia(game, p, snap, phase);
        }

        const type = weightedPick(w);

        // Pre-flight check: if we're about to build RL/AB, make sure we have MF capacity
        if ((type === 'RL' || type === 'AB') && snap.mfCount === 0 && canAffordType(p, 'MF')) {
            const mfSpot = pickSupplyAwareRearSpot(game, p, snap);
            if (mfSpot) return game.buildStructure(mfSpot, 'MF', p.id);
        }

        const spot = pickPlacementForType(game, p, snap, type, valuableEnemies);
        if (spot) return game.buildStructure(spot, type, p.id);
    }

    // Militia push
    if (p.units.M < game.militiaCap(p) && canAffordType(p, 'M')) {
        const mSpot = findMilitiaSpot(game, p.id, snap);
        if (mSpot) return game.buildStructure(mSpot, 'M', p.id);
    }

    return false;
}

// ============================================================================
//  PRIORITY 5b — MILITIA-GOV STRATEGY
// ============================================================================
function tryMilitiaGovStrategy(game, p, snap, phase) {
    if (phase < PHASES.FORTIFY) return false;

    const militias = snap.ownByType.M || [];
    if (militias.length === 0) return false;

    // Prioritize upgrading militia that are well-positioned:
    // - NOT on the frontier (they'll die)
    // - Far from existing govs (maximizes new territory)
    // - In supply
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

        let score = 0;
        // M2→M3 (transforms to mini-gov) is highest priority
        if (level === 1) {
            score = 10 + Math.min(6, minGovDist) * 1.5;
            if (!isFront) score += 3;
            if (inSupply) score += 2;
        }
        // M1→M2 (double range, more damage) is good for forward militia
        else if (level === 0) {
            score = 4;
            if (isFront) score += 2;
            if (inSupply) score += 1;
        }

        candidates.push({ tile: m, score });
    }

    if (candidates.length === 0) return false;
    candidates.sort((a, b) => b.score - a.score);

    // Only upgrade if we have enough gold buffer
    const goldThreshold = phase >= PHASES.PRESSURE ? 200 : 300;
    if (p.gold > goldThreshold) {
        return game.upgradeStructure(candidates[0].tile);
    }

    return false;
}

// ============================================================================
//  PRIORITY 6 — UPGRADE
// ============================================================================
const UPGRADE_VALUE = { G: 6, MF: 5, AB: 5, RL: 4, AAS: 4, B: 3, D: 3, M: 2 };

function tryUpgrade(game, p, snap, doctrine, shared) {
    if (Math.random() > doctrine.upgradeBias && (p.gold < 600)) return false;

    const frontierKeys = new Set(snap.frontier.map(tileKey));
    const supplySet = game.supplyByPlayer.get(p.id);

    const candidates = [];
    for (const tile of snap.structures) {
        if (tile.contested) continue;
        if (!canAffordUpgrade(p, tile)) continue;
        const def = UNIT_STATS[tile.structure.type];
        const next = def.levels[tile.structure.level + 1];
        if (!next) continue;

        let value = UPGRADE_VALUE[tile.structure.type] || 1;
        const isFront = frontierKeys.has(tileKey(tile));
        if (!isFront) value *= 1.4;
        value += (3 - tile.structure.level);

        // M3 transformation gets handled by tryMilitiaGovStrategy now
        if (tile.structure.type === 'M' && next.transformsToGov) continue;

        if (tile.structure.type === 'MF' && snap.missileProd > snap.missileCons * 1.4) value *= 0.4;

        // Prefer upgrading structures in supply
        if (supplySet?.has(tileKey(tile))) value *= 1.2;

        // Prefer upgrading structures that are actively contributing (have targets in range)
        if (ATTACKER_TYPES.has(tile.structure.type) && tile.structure.stats.range) {
            const hasTarget = snap.visibleEnemies.some(e => Hex.distance(tile, e) <= tile.structure.stats.range);
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
    const topN = Math.min(3, candidates.length);
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

    if (type === 'D') {
        const baseStats = statsAtLevel('D', 0);
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
            for (const d of snap.ownByType.D || []) {
                if (Hex.distance(t, d) <= 3) droneCluster++;
            }
            const score = inRange * 3 + droneCluster * 1.5 + Math.random();
            if (score > bestScore) { bestScore = score; bestSpot = t; }
        }
        return bestSpot || pickDirectionalFrontierSpot(game, p, snap, snap.visibleEnemies);
    }

    if (type === 'B') {
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
        // Strongly prefer rear AND in-supply; still ok if rear but out of supply
        const score = minFrontDist * 2 + (inSupply ? 8 : 0) + Math.random() * 0.5;
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

function tryExpandWithMilitia(game, p, snap, phase) {
    if (p.units.M >= game.militiaCap(p)) return false;
    if (!canAffordType(p, 'M')) return false;
    const spot = findMilitiaSpot(game, p.id, snap);
    if (!spot) return false;
    return game.buildStructure(spot, 'M', p.id);
}
