import { describe, it, expect } from 'vitest';
import { UNIT_STATS } from '../src/core/constants.js';
import { FACTION_UNIT_STATS } from '../src/data/factionUnits.js';

/** Flatten every unit definition into { id, levels[] } records from both rosters. */
function allUnitDefs() {
    const defs = [];
    for (const [key, def] of Object.entries(UNIT_STATS)) {
        const levels = Array.isArray(def) ? def : def.levels;
        if (Array.isArray(levels)) defs.push({ key, levels });
    }
    for (const [key, def] of Object.entries(FACTION_UNIT_STATS)) {
        if (Array.isArray(def.levels)) defs.push({ key, levels: def.levels });
    }
    return defs;
}

describe('unit data integrity', () => {
    it('every level has a positive cost and hp with no NaN stats', () => {
        for (const { key, levels } of allUnitDefs()) {
            for (const lv of levels) {
                expect(lv.cost, `${key}/${lv.id} cost`).toBeGreaterThan(0);
                expect(lv.hp, `${key}/${lv.id} hp`).toBeGreaterThan(0);
                for (const f of ['damage', 'interval', 'projectiles', 'range', 'vision']) {
                    if (lv[f] !== undefined) {
                        expect(Number.isFinite(lv[f]), `${key}/${lv.id} ${f} finite`).toBe(true);
                        expect(lv[f], `${key}/${lv.id} ${f} >= 0`).toBeGreaterThanOrEqual(0);
                    }
                }
            }
        }
    });

    it('cost and hp increase monotonically with level (L1 < L2 < L3)', () => {
        for (const { key, levels } of allUnitDefs()) {
            for (let i = 1; i < levels.length; i++) {
                expect(levels[i].cost, `${key} cost L${i + 1} > L${i}`).toBeGreaterThan(levels[i - 1].cost);
                expect(levels[i].hp, `${key} hp L${i + 1} > L${i}`).toBeGreaterThan(levels[i - 1].hp);
            }
        }
    });
});

/**
 * Balance guardrail: no standard combat structure should exceed an absolute
 * damage-per-gold-per-second ceiling. This catches gross efficiency outliers (the
 * pre-rebalance Houdong Swarm sat at 0.125 — ~4.4x its naval peers). Superweapons
 * (cost >= 3000, e.g. ICBM) and 0-damage support/aura units are exempt.
 * See docs/BALANCE.md for the methodology behind this threshold.
 */
describe('balance: damage efficiency ceiling', () => {
    const DPC_CEILING = 0.085;

    function dpsPerCost(lv) {
        const dps = ((lv.damage || 0) * (lv.projectiles || 0)) / ((lv.interval || 1) / 1000);
        const cost = lv.cost || 0;
        if (!dps || !cost) return null;
        return dps / cost;
    }

    it('keeps every non-superweapon combat unit at or under the DPS/gold ceiling', () => {
        for (const { key, levels } of allUnitDefs()) {
            for (const lv of levels) {
                if ((lv.cost || 0) >= 3000) continue; // superweapons priced as finishers
                const dpc = dpsPerCost(lv);
                if (dpc == null) continue; // support / interceptor / economy unit
                expect(dpc, `${key}/${lv.id} dps-per-gold`).toBeLessThanOrEqual(DPC_CEILING);
            }
        }
    });
});
