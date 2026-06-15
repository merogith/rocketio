import { describe, it, expect } from 'vitest';
import { HexGrid } from '../src/core/hexGrid.js';
import { Game } from '../src/core/game.js';
import { updateAI } from '../src/ai/ai.js';
import { getEffectiveMapRadius, AI_DOCTRINES } from '../src/core/constants.js';

/**
 * Headless integration smoke test: build a real map, run an all-AI match for a
 * bounded number of ticks, and assert the engine advances and terminates cleanly.
 * This exercises the full module graph (hexGrid → game → ai → constants/data) and
 * is the regression guard for the src/ restructure.
 */
describe('headless game simulation', () => {
    it('runs an all-AI match without throwing and advances game time', () => {
        const playerCount = 2;
        const grid = new HexGrid(getEffectiveMapRadius('small', playerCount), 30, 'pangaea', playerCount);
        const game = new Game(grid);
        game.humanId = -1; // all AI
        game.aiDifficulty = 'normal';
        game.diplomacyEnabled = true;
        game.start(playerCount, 'BOT-1', { mode: 'conquest', param: null });

        expect(game.players).toHaveLength(playerCount);

        const docKeys = Object.keys(AI_DOCTRINES);
        for (const p of game.players) {
            p.doctrine = AI_DOCTRINES[docKeys[(p.id - 1) % docKeys.length]];
        }

        const tickStep = 16.67;
        const maxGameTime = 120000; // 2 minutes of simulated time
        let simTime = 0;
        let ticks = 0;
        while (!game.winner && simTime < maxGameTime) {
            game._lastRealTime = simTime;
            simTime += tickStep;
            game.update(simTime);
            updateAI(game, simTime);
            ticks++;
        }

        expect(ticks).toBeGreaterThan(100);
        expect(game.gameTime).toBeGreaterThan(0);
        // Either someone won or we hit the time cap — both are clean terminations.
        expect(game.winner == null || game.players.some((p) => p.id === game.winner)).toBe(true);
    });
});
