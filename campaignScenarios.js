// ============================================================================
//  Hand-tuned map changes after base Game.start (mission-specific)
// ============================================================================

import { Hex } from './hexGrid.js?v=sig3';
import { UNIT_STATS } from './constants.js?v=sig3';

function findGovTile(game, ownerId) {
    for (const t of game.grid.tiles.values()) {
        if (t.structure?.type === 'G' && t.owner === ownerId) return t;
    }
    return null;
}

function findMfTile(game, ownerId) {
    for (const t of game.grid.tiles.values()) {
        if (t.structure?.type === 'MF' && t.owner === ownerId) return t;
    }
    return null;
}

/**
 * @param {import('./game.js').Game} game
 * @param {string} type
 * @param {import('./hexGrid.js').Hex} tile
 * @returns {{ ok: boolean, msg?: string }}
 */
export function m1BuildTutorialCheckPlace(game, type, tile) {
    const bt = game.campaign?.buildTutorial;
    if (!bt?.active) return { ok: true };
    const step = bt.steps[bt.step];
    if (!step) {
        bt.active = false;
        return { ok: true };
    }
    if (type !== step.type) {
        return { ok: false, msg: `Training: only build your ${step.label} (key ${step.key}).` };
    }
    if (tile.q !== step.q || tile.r !== step.r) {
        return { ok: false, msg: 'Not that tile — build on the pulsing cyan hex.' };
    }
    return { ok: true };
}

/**
 * @param {import('./game.js').Game} game
 * @param {string} type
 * @param {import('./hexGrid.js').Hex} tile
 * @param {boolean} [placementSucceeded]
 * @returns {{ nudge: 'next' } | { nudge: 'complete' } | void}
 */
export function m1OnBuildPlaced(game, type, tile, placementSucceeded) {
    const bt = game.campaign?.buildTutorial;
    if (!bt?.active || !placementSucceeded) return;
    const step = bt.steps[bt.step];
    if (!step || type !== step.type || tile.q !== step.q || tile.r !== step.r) return;
    bt.step++;
    if (bt.step < bt.steps.length) {
        reseedM1BuildTutorial(bt);
        return { nudge: 'next' };
    } else {
        bt.active = false;
        bt.prematureFogReveal = false;
        bt.seedHexes = [];
        return { nudge: 'complete' };
    }
}

function reseedM1BuildTutorial(bt) {
    bt.seedHexes = [];
    for (let i = bt.step; i < bt.steps.length; i++) {
        const s = bt.steps[i];
        bt.seedHexes.push({ q: s.q, r: s.r, ownerId: 1 });
    }
}

function allOwnedTiles(grid, ownerId) {
    const a = [];
    for (const t of grid.tiles.values()) {
        if (t.owner === ownerId) a.push(t);
    }
    return a;
}

/**
 * Pick `count` buildable land tiles that are within `rlRange` of the enemy Government and
 * as close to the human Government as possible (i.e., on the forward edge of friendly land).
 * Tiles are also forced into player ownership via seedHexes so the build is legal.
 */
function pickForwardRlSlots(grid, humanGov, enemyGov, count, rlRange) {
    const seen = new Set();
    const out = [];
    const candidates = [];
    for (const t of grid.getTilesInRadius(enemyGov, rlRange)) {
        if (!t.buildable || t.structure) continue;
        if (t === enemyGov || t === humanGov) continue;
        candidates.push(t);
    }
    candidates.sort((a, b) => Hex.distance(a, humanGov) - Hex.distance(b, humanGov));
    for (const t of candidates) {
        const k = `${t.q},${t.r}`;
        if (seen.has(k)) continue;
        // Spread the slots a little so they don't stack on one tile cluster.
        if (out.some(o => Hex.distance(o, t) < 2)) continue;
        out.push(t);
        seen.add(k);
        if (out.length >= count) break;
    }
    return out;
}

function downgradeEnemyGovToLv1(game, enemyId) {
    const enemyGov = findGovTile(game, enemyId);
    if (!enemyGov) return null;
    const tile = enemyGov;
    // If it's already L1, leave it alone.
    if (tile.structure?.level === 0) return tile;
    game.destroyStructure(tile, null, true);
    // After destroy, the tile reverts to no owner; force ownership back so the rebuild is legal.
    tile.owner = enemyId;
    tile.contested = false;
    const ok = game.buildStructure(tile, 'G', enemyId, 0, true);
    if (!ok) {
        // Last-ditch: build directly (bypasses owner check) — keeps a Government on the field.
        tile.structure = {
            type: 'G',
            level: 0,
            stats: UNIT_STATS.G.levels[0],
            hp: UNIT_STATS.G.levels[0].hp,
            lastAction: 0,
            lastFiredAt: 0,
        };
        tile.hp = UNIT_STATS.G.levels[0].hp;
        game._markStructuresDirty();
    }
    return tile;
}

function clearEnemyStructure(game, enemyId, type) {
    for (const t of game.grid.tiles.values()) {
        if (t.owner === enemyId && t.structure?.type === type) {
            game.destroyStructure(t, null, true);
            return t;
        }
    }
    return null;
}

function applyMission1(game, grid) {
    const enemyId = 2;
    const pEnemy = game.players[enemyId - 1];
    if (pEnemy) pEnemy.name = 'IRON COMPACT';

    const pHuman = game.players[0];
    if (pHuman) {
        pHuman.gold = Math.max(pHuman.gold, 1800);
        pHuman.missiles = Math.max(pHuman.missiles, 12);
    }

    // Keep the player's full starter (Gov L3 + MF L1). Mission 1 is a clean live-fire intro:
    // place two Rocket Launchers on the pulsing forward hexes and watch them dismantle the enemy node.
    const humanGov = findGovTile(game, 1);
    let enemyGov = findGovTile(game, enemyId);
    if (!humanGov || !enemyGov) {
        game._markStructuresDirty();
        game.updateBorders();
        game.recomputeSupply();
        game.recomputeFog();
        return;
    }

    // Strip every enemy combat / production structure so the target is a defenceless L1 Government.
    clearEnemyStructure(game, enemyId, 'MF');
    clearEnemyStructure(game, enemyId, 'RL');
    clearEnemyStructure(game, enemyId, 'AAS');
    clearEnemyStructure(game, enemyId, 'B');
    enemyGov = downgradeEnemyGovToLv1(game, enemyId) || enemyGov;
    if (pEnemy) pEnemy.missiles = 0;

    const rl0 = UNIT_STATS.RL.levels[0];
    // Pick within the launcher's own vision (smaller of range / vision) so it sees the target instantly on placement.
    const rlReach = Math.min(rl0.range || 7, rl0.vision || 6);
    const slots = pickForwardRlSlots(grid, humanGov, enemyGov, 2, rlReach);
    if (slots.length < 2 || !game.campaign) {
        game._markStructuresDirty();
        game.updateBorders();
        game.recomputeSupply();
        game.recomputeFog();
        return;
    }

    const steps = [
        {
            type: 'RL',
            level: 0,
            q: slots[0].q,
            r: slots[0].r,
            key: 9,
            label: 'Rocket Launcher (Lv1)',
            questPrimary: 'TRAINING — **1/2** · Press **[9]** then click the **pulsing cyan hex** to drop a Rocket Launcher.',
            questHint: 'Rocket Launchers spend a missile per shot. The pulsing tile is **already in range** of the enemy Government.',
        },
        {
            type: 'RL',
            level: 0,
            q: slots[1].q,
            r: slots[1].r,
            key: 9,
            label: 'Rocket Launcher (Lv1)',
            questPrimary: 'TRAINING — **2/2** · Drop a **second Rocket Launcher** on the next pulsing hex — saturate the target.',
            questHint: 'Two launchers fire alternately and your Missile Factory keeps them fed. Then wait — they auto-target the enemy **Government**.',
        },
    ];
    game.campaign.buildTutorial = {
        active: true,
        step: 0,
        steps,
        prematureFogReveal: true,
        revealRadius: 7,
    };
    reseedM1BuildTutorial(game.campaign.buildTutorial);

    game._markStructuresDirty();
    game.updateBorders();
    game.recomputeSupply();
    game.recomputeFog();
}

function applyMission2(game, grid) {
    const enemyId = 2;
    const pEnemy = game.players[enemyId - 1];
    if (pEnemy) pEnemy.name = 'IRON COMPACT';

    const pHuman = game.players[0];
    if (pHuman) {
        pHuman.gold = Math.max(pHuman.gold, 2200);
        pHuman.missiles = Math.max(pHuman.missiles, 10);
    }

    const humanGov = findGovTile(game, 1);
    let enemyGov = findGovTile(game, enemyId);
    if (!humanGov || !enemyGov) {
        game._markStructuresDirty();
        game.updateBorders();
        game.recomputeSupply();
        game.recomputeFog();
        return;
    }

    // Downgrade enemy Gov to L1 so the post-tutorial counter-attack is winnable in a few volleys.
    clearEnemyStructure(game, enemyId, 'MF');
    enemyGov = downgradeEnemyGovToLv1(game, enemyId) || enemyGov;

    // AAS tile: adjacent to player's Government, on the side facing the enemy.
    const aasTile = humanGov.getNeighbors()
        .map(h => grid.getTile(h.q, h.r))
        .filter(t => t && t.owner === 1 && t.buildable && !t.structure)
        .sort((a, b) => Hex.distance(a, enemyGov) - Hex.distance(b, enemyGov))[0] || null;

    // Barracks tile: forward player land, distinct from AAS tile.
    const barracksTile = allOwnedTiles(grid, 1)
        .filter(t => t.buildable && !t.structure && t !== aasTile)
        .sort((a, b) => Hex.distance(a, enemyGov) - Hex.distance(b, enemyGov))[0] || null;

    if (aasTile && barracksTile && game.campaign) {
        const steps = [
            {
                type: 'AAS',
                level: 0,
                q: aasTile.q,
                r: aasTile.r,
                key: 5,
                label: 'Anti-Air System (Lv1)',
                questPrimary: 'TRAINING — **1/2** · Press **[5]** then click the **pulsing hex** next to your Government to drop an AAS.',
                questHint: 'AAS auto-intercepts incoming missiles in range. Build this first or you eat the enemy salvo.',
            },
            {
                type: 'B',
                level: 0,
                q: barracksTile.q,
                r: barracksTile.r,
                key: 'F3',
                label: 'Barracks (Lv1)',
                questPrimary: 'TRAINING — **2/2** · Press **[F3]** then click the **forward pulsing hex** for a Barracks.',
                questHint: 'Barracks are tanky and push your border forward — they anchor your Rocket Launchers for the counter-attack.',
            },
        ];
        game.campaign.buildTutorial = {
            active: true,
            step: 0,
            steps,
            prematureFogReveal: true,
            revealRadius: 7,
        };
        reseedM1BuildTutorial(game.campaign.buildTutorial);
    }

    const rl0 = UNIT_STATS.RL.levels[0];
    const rlRange = rl0.range || 7;

    // Two forward enemy Rocket Launchers, both in range of the player's Gov, spaced apart.
    const cand = [];
    for (const t of grid.tiles.values()) {
        if (t.owner !== enemyId || !t.buildable || t.structure) continue;
        if (Hex.distance(t, humanGov) <= rlRange) cand.push(t);
    }
    cand.sort((a, b) => Hex.distance(a, humanGov) - Hex.distance(b, humanGov));
    const placed = [];
    for (const t of cand) {
        if (placed.length >= 2) break;
        if (placed.some(p => Hex.distance(p, t) < 2)) continue;
        if (game.buildStructure(t, 'RL', enemyId, 0, true)) placed.push(t);
    }

    // Give the AI a bounded missile reserve so its RLs fire during the puzzle but eventually starve
    // (player can outlast the salvo and counter-attack).
    if (pEnemy) pEnemy.missiles = 8;

    game._markStructuresDirty();
    game.updateBorders();
    game.recomputeSupply();
    game.recomputeFog();
}

/**
 * @param {import('./game.js').Game} game
 * @param {import('./hexGrid.js').HexGrid} grid
 * @param {number} missionId
 */
export function applyCampaignScenario(game, grid, missionId) {
    console.info('[RocketIO] campaignScenarios build: sig3 / mission', missionId);
    if (missionId === 1) {
        applyMission1(game, grid);
        return;
    }
    if (missionId === 2) {
        applyMission2(game, grid);
        return;
    }
}
