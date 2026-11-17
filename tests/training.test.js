import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hex, HexGrid } from '../src/core/hexGrid.js';
import { Game } from '../src/core/game.js';
import { getEffectiveMapRadius, UNIT_STATS } from '../src/core/constants.js';
import { CAMPAIGN_MISSIONS, getTrainingOutcome } from '../src/data/campaignData.js';
import { applyCampaignScenario, m1BuildTutorialCheckPlace, m1OnBuildPlaced } from '../src/data/campaignScenarios.js';
import { canStartMission, loadCampaignProgress, markMissionBeaten } from '../src/data/campaignProgress.js';
import { formatInstructions, keyLabel } from '../src/ui/instructions.js';

function seededWorld(mission, seed) {
    vi.spyOn(Math, 'random').mockImplementation(() => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    });
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const grid = new HexGrid(getEffectiveMapRadius(mission.mapSize, 2), 30, mission.mapStyle, 2);
    const game = new Game(grid);
    game.aiDifficulty = mission.difficulty;
    game.diplomacyEnabled = false;
    game.start(2, 'ECLIPSE', { mode: mission.victoryMode, param: null });
    game.campaign = { missionId: mission.id, mission, freezeEnemyAi: true };
    applyCampaignScenario(game, grid, mission.id);
    return { game, grid };
}

function advance(game, duration) {
    const end = game.gameTime + duration;
    // Preserve the real frame size used by combat, while bounding the simulation.
    for (let time = game.gameTime + 16; !game.winner && time < end; time += 16) {
        game._lastRealTime = time - 16;
        game.update(time);
    }
}

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

describe('Sentinel training', () => {
    it('unlocks the next operation, persists progress, and ends after two wins', () => {
        expect(CAMPAIGN_MISSIONS).toHaveLength(2);
        expect(canStartMission(1, loadCampaignProgress().beaten)).toBe(true);
        expect(canStartMission(2, loadCampaignProgress().beaten)).toBe(false);
        markMissionBeaten(1);
        expect(canStartMission(2, loadCampaignProgress().beaten)).toBe(true);
        expect(getTrainingOutcome(1, true).nextMissionId).toBe(2);
        markMissionBeaten(2);
        expect(loadCampaignProgress().beaten.slice(1)).toEqual([true, true]);
        expect(canStartMission(3, loadCampaignProgress().beaten)).toBe(false);
        expect(getTrainingOutcome(2, true)).toMatchObject({
            title: 'TRAINING COMPLETE',
            action: 'CHOOSE A SKIRMISH',
            nextMissionId: null,
        });
        // Older builds stored ten slots; the two implemented operations remain replayable.
        localStorage.setItem(
            'rocketio_campaign_v1',
            JSON.stringify({
                v: 1,
                beaten: [false, true, true, false, false, false, false, false, false, false, false],
            })
        );
        expect(canStartMission(1, loadCampaignProgress().beaten)).toBe(true);
        expect(canStartMission(2, loadCampaignProgress().beaten)).toBe(true);
        expect(getTrainingOutcome(2, false)).toMatchObject({ action: 'RETRY OPERATION', nextMissionId: 2 });
    });

    it('uses current bindings in briefing, objectives and tutorial instructions', () => {
        const bindings = { build_RL: 'KeyR', build_AAS: 'KeyA', build_B: 'KeyB' };
        const text = [...CAMPAIGN_MISSIONS[1].briefingLines, CAMPAIGN_MISSIONS[1].objectivePrimary].join(' ');
        const rendered = formatInstructions(text, bindings);
        expect(rendered).toContain('AAS, key A');
        expect(rendered).toContain('B, key B');
        expect(rendered).toContain('Rocket Launchers (key R)');
        expect(rendered).not.toContain('{key:');
        expect(formatInstructions('{key:build_RL}', { build_RL: '' })).toContain('build palette');
        expect(keyLabel('speed_up')).toBe('+');
        expect(keyLabel('cycle_minimap_stats')).toBe(']');
    });

    for (const mission of CAMPAIGN_MISSIONS) {
        for (const seed of [42, 7, 2026]) {
            it(`completes ${mission.codename} through guided builds and combat (seed ${seed})`, () => {
                const { game, grid } = seededWorld(mission, seed);
                const tutorial = game.campaign.buildTutorial;
                expect(tutorial?.steps).toHaveLength(2);
                for (const step of tutorial.steps) {
                    const tile = grid.getTile(step.q, step.r);
                    expect(m1BuildTutorialCheckPlace(game, 'G', tile).ok).toBe(false);
                    expect(m1BuildTutorialCheckPlace(game, step.type, tile).ok).toBe(true);
                    const built = game.buildStructure(tile, step.type, 1, step.level);
                    expect(built).toBe(true);
                    m1OnBuildPlaced(game, step.type, tile, built);
                }
                expect(tutorial.active).toBe(false);
                game.recomputeFog();
                if (mission.id === 2) {
                    advance(game, 30000);
                    // Follow the displayed counter-attack objective: add launchers on owned forward land.
                    const enemyGov = [...grid.tiles.values()].find((t) => t.owner === 2 && t.structure?.type === 'G');
                    const forward = [...grid.tiles.values()].filter(
                        (t) =>
                            t.owner === 1 &&
                            t.buildable &&
                            !t.structure &&
                            !t.contested &&
                            Hex.distance(t, enemyGov) <= UNIT_STATS.RL.levels[0].range
                    );
                    expect(forward.length).toBeGreaterThanOrEqual(2);
                    for (const tile of forward.slice(0, 3)) expect(game.buildStructure(tile, 'RL', 1, 0)).toBe(true);
                }
                advance(game, 180000);
                expect(game.winner).toBe(1);
                expect(game.defeated.has(2)).toBe(true);
                expect(game.players[0].stats.structuresBuilt).toBeGreaterThanOrEqual(4);
            }, 15000);
        }
    }
});
