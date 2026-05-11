// ============================================================================
//  Hand-tuned map changes after base Game.start (mission-specific)
// ============================================================================

import { Hex } from './hexGrid.js?v=naval2027';
import { UNIT_STATS } from './constants.js?v=naval2027';

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

function applyMission1(game, grid) {
    const enemyId = 2;
    const pEnemy = game.players[enemyId - 1];
    if (pEnemy) pEnemy.name = 'IRON COMPACT';

    const pHuman = game.players[0];
    if (pHuman) {
        pHuman.gold = Math.max(pHuman.gold, 2500);
        pHuman.missiles = Math.max(pHuman.missiles, 10);
    }

    // Hands-on start: no free Government/Factory — the player must place L1 Gov then MF on the marked hexes.
    const hGov = findGovTile(game, 1);
    const hMf = findMfTile(game, 1);
    if (hGov && hMf && game.campaign) {
        const gQ = hGov.q;
        const gR = hGov.r;
        const mfQ = hMf.q;
        const mfR = hMf.r;
        // MF first, then Government — keeps a brief influence anchor so borders don't spuriously flip mid-teardown in odd maps.
        game.destroyStructure(hMf, null, false);
        game.destroyStructure(hGov, null, false);
        const steps = [
            {
                type: 'G',
                level: 0,
                q: gQ,
                r: gR,
                key: 1,
                label: 'Government (Lv1)',
                questPrimary: 'TRAINING — **1/2** · Build a **Government (Lv1)** on the **pulsing hex**.',
                questHint: 'Press **[1]**, then click the highlighted tile (starter tier — you earn this income core back).',
            },
            {
                type: 'MF',
                level: 0,
                q: mfQ,
                r: mfR,
                key: 4,
                label: 'Missile Factory (Lv1)',
                questPrimary: 'TRAINING — **2/2** · Build a **Missile Factory (Lv1)** on the next **pulsing** hex.',
                questHint: 'Press **[4]**, then click the adjacent highlight — factories refill **missiles** for your launchers.',
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

    // Remove AI's starter Missile Factory — we replace the forward slot with a pressure RL.
    let mfTile = null;
    for (const t of grid.tiles.values()) {
        if (t.owner === enemyId && t.structure?.type === 'MF') {
            mfTile = t;
            break;
        }
    }
    if (mfTile) {
        game.destroyStructure(mfTile, null, true);
    }

    const rl0 = UNIT_STATS.RL.levels[0];
    const rlRange = rl0.range || 7;

    const p1Tiles = allOwnedTiles(grid, 1);
    if (p1Tiles.length === 0) {
        game._markStructuresDirty();
        game.updateBorders();
        game.recomputeSupply();
        game.recomputeFog();
        return;
    }

    const candidates = [];
    for (const t of grid.tiles.values()) {
        if (t.owner !== enemyId || !t.buildable || t.structure) continue;
        const inRange = p1Tiles.some(u => Hex.distance(t, u) <= rlRange);
        if (inRange) candidates.push(t);
    }

    const humanGovForRl = findGovTile(game, 1);
    let best = null;
    let bestD = -1;
    for (const t of candidates) {
        const d = humanGovForRl ? Hex.distance(t, humanGovForRl) : 0;
        if (d > bestD) {
            bestD = d;
            best = t;
        }
    }

    if (best) {
        game.buildStructure(best, 'RL', enemyId, 0, true);
    } else {
        for (const t of grid.tiles.values()) {
            if (t.owner === enemyId && t.buildable && !t.structure) {
                if (game.buildStructure(t, 'RL', enemyId, 0, true)) break;
            }
        }
    }

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
        pHuman.gold = Math.max(pHuman.gold, 2000);
        pHuman.missiles = Math.max(pHuman.missiles, 6);
    }

    const humanGov = findGovTile(game, 1);
    const enemyGov = findGovTile(game, enemyId);
    if (!humanGov || !enemyGov) {
        game._markStructuresDirty();
        game.updateBorders();
        game.recomputeSupply();
        game.recomputeFog();
        return;
    }

    // Pick a defensive tile next to the player's Government for the AAS step.
    const aasNeighbors = humanGov.getNeighbors()
        .map(h => grid.getTile(h.q, h.r))
        .filter(t => t && t.owner === 1 && t.buildable && !t.structure);
    aasNeighbors.sort((a, b) => Hex.distance(a, enemyGov) - Hex.distance(b, enemyGov));
    const aasTile = aasNeighbors[0] || null;

    // Pick a forward Barracks tile: own land, closest to enemy gov, not the AAS tile.
    const ownTiles = allOwnedTiles(grid, 1)
        .filter(t => t.buildable && !t.structure && t !== aasTile);
    ownTiles.sort((a, b) => Hex.distance(a, enemyGov) - Hex.distance(b, enemyGov));
    const barracksTile = ownTiles[0] || null;

    if (aasTile && barracksTile && game.campaign) {
        const steps = [
            {
                type: 'AAS',
                level: 0,
                q: aasTile.q,
                r: aasTile.r,
                key: 3,
                label: 'Anti-Air System (Lv1)',
                questPrimary: 'TRAINING — **1/2** · Build an **Anti-Air System (Lv1)** on the **pulsing hex** next to your Government.',
                questHint: 'Press **[3]**, then click the highlighted tile. AAS auto-intercepts incoming missiles in range.',
            },
            {
                type: 'B',
                level: 0,
                q: barracksTile.q,
                r: barracksTile.r,
                key: 5,
                label: 'Barracks (Lv1)',
                questPrimary: 'TRAINING — **2/2** · Build a **Barracks (Lv1)** on the **forward pulsing hex**.',
                questHint: 'Press **[5]**, then click the highlight. Barracks are tanky, project influence, and anchor your push.',
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

    // Strip enemy starter Missile Factory — we replace it with forward pressure RLs.
    for (const t of grid.tiles.values()) {
        if (t.owner === enemyId && t.structure?.type === 'MF') {
            game.destroyStructure(t, null, true);
            break;
        }
    }

    const rl0 = UNIT_STATS.RL.levels[0];
    const rlRange = rl0.range || 7;

    // Forward enemy RL #1: in range of the player's gov.
    const cand1 = [];
    for (const t of grid.tiles.values()) {
        if (t.owner !== enemyId || !t.buildable || t.structure) continue;
        if (Hex.distance(t, humanGov) <= rlRange) cand1.push(t);
    }
    cand1.sort((a, b) => Hex.distance(a, humanGov) - Hex.distance(b, humanGov));
    const rl1 = cand1[0] || null;
    if (rl1) game.buildStructure(rl1, 'RL', enemyId, 0, true);

    // Forward enemy RL #2: also in range, but a different tile, biased away from the first RL.
    const cand2 = [];
    for (const t of grid.tiles.values()) {
        if (t.owner !== enemyId || !t.buildable || t.structure) continue;
        if (Hex.distance(t, humanGov) <= rlRange) cand2.push(t);
    }
    cand2.sort((a, b) => {
        const da = Hex.distance(a, humanGov) - (rl1 ? Math.min(Hex.distance(a, rl1), 3) : 0);
        const db = Hex.distance(b, humanGov) - (rl1 ? Math.min(Hex.distance(b, rl1), 3) : 0);
        return da - db;
    });
    const rl2 = cand2[0] || null;
    if (rl2) game.buildStructure(rl2, 'RL', enemyId, 0, true);

    // Give the AI a small missile reserve so its RLs actually fire during the puzzle.
    if (pEnemy) pEnemy.missiles = Math.max(pEnemy.missiles, 8);

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
    if (missionId === 1) {
        applyMission1(game, grid);
        return;
    }
    if (missionId === 2) {
        applyMission2(game, grid);
        return;
    }
}
