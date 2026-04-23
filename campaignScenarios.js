// ============================================================================
//  Hand-tuned map changes after base Game.start (mission-specific)
// ============================================================================

import { Hex } from './hexGrid.js?v=balance2026';
import { UNIT_STATS } from './constants.js?v=balance2026';

function findGovTile(game, ownerId) {
    for (const t of game.grid.tiles.values()) {
        if (t.structure?.type === 'G' && t.owner === ownerId) return t;
    }
    return null;
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
        pHuman.gold = Math.max(pHuman.gold, 2200);
        pHuman.missiles = Math.max(pHuman.missiles, 10);
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

    const hGov = findGovTile(game, 1);
    let best = null;
    let bestD = -1;
    for (const t of candidates) {
        const d = hGov ? Hex.distance(t, hGov) : 0;
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
}
