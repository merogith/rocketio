import { describe, it, expect } from 'vitest';
import {
    hexDiskTileCount,
    govGoldForDistance,
    totalSoloGovDiskGoldPerSec,
    getEffectiveMapRadius,
} from '../src/core/constants.js';

describe('hexDiskTileCount', () => {
    it('matches the centered-hexagonal-number sequence', () => {
        // 1, 7, 19, 37, 61, 91, 127, ... and r=9 -> 271
        expect(hexDiskTileCount(0)).toBe(1);
        expect(hexDiskTileCount(1)).toBe(7);
        expect(hexDiskTileCount(2)).toBe(19);
        expect(hexDiskTileCount(4)).toBe(61);
        expect(hexDiskTileCount(6)).toBe(127);
        expect(hexDiskTileCount(9)).toBe(271);
    });
});

describe('govGoldForDistance', () => {
    it('returns 0 for negative distance', () => {
        expect(govGoldForDistance(2, -1)).toBe(0);
    });

    it('gives full inner rate inside the inner disk for every level', () => {
        for (const level of [0, 1, 2]) {
            expect(govGoldForDistance(level, 0)).toBeGreaterThan(0);
            expect(govGoldForDistance(level, 4)).toBe(govGoldForDistance(level, 0));
        }
    });

    it('falls off to zero beyond each level radius', () => {
        expect(govGoldForDistance(0, 5)).toBe(0); // G1 caps at d<=4
        expect(govGoldForDistance(1, 7)).toBe(0); // G2 caps at d<=6
        expect(govGoldForDistance(2, 10)).toBe(0); // G3 caps at d<=9
    });

    it('is non-increasing as distance grows for the top-tier Gov', () => {
        let prev = Infinity;
        for (let d = 0; d <= 12; d++) {
            const v = govGoldForDistance(2, d);
            expect(v).toBeLessThanOrEqual(prev);
            prev = v;
        }
    });
});

describe('totalSoloGovDiskGoldPerSec', () => {
    it('matches the legacy flat model for G1 (61 tiles * 0.5)', () => {
        expect(totalSoloGovDiskGoldPerSec(0)).toBeCloseTo(61 * 0.5, 6);
    });

    it('increases with Gov level', () => {
        const g1 = totalSoloGovDiskGoldPerSec(0);
        const g2 = totalSoloGovDiskGoldPerSec(1);
        const g3 = totalSoloGovDiskGoldPerSec(2);
        expect(g2).toBeGreaterThan(g1);
        expect(g3).toBeGreaterThan(g2);
    });

    it('returns 0 for out-of-range levels', () => {
        expect(totalSoloGovDiskGoldPerSec(-1)).toBe(0);
        expect(totalSoloGovDiskGoldPerSec(3)).toBe(0);
    });
});

describe('getEffectiveMapRadius', () => {
    it('grows (or holds) with map size', () => {
        const small = getEffectiveMapRadius('small', 4);
        const medium = getEffectiveMapRadius('medium', 4);
        const large = getEffectiveMapRadius('large', 4);
        expect(medium).toBeGreaterThanOrEqual(small);
        expect(large).toBeGreaterThanOrEqual(medium);
    });

    it('grows (or holds) with player count', () => {
        const few = getEffectiveMapRadius('medium', 2);
        const many = getEffectiveMapRadius('medium', 7);
        expect(many).toBeGreaterThanOrEqual(few);
    });
});
