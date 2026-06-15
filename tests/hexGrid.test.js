import { describe, it, expect } from 'vitest';
import { Hex } from '../src/core/hexGrid.js';

describe('Hex.distance', () => {
    it('is zero to itself', () => {
        const a = new Hex(3, -2);
        expect(Hex.distance(a, a)).toBe(0);
    });

    it('is 1 to each immediate neighbor', () => {
        const center = new Hex(0, 0);
        for (const n of center.getNeighbors()) {
            expect(Hex.distance(center, n)).toBe(1);
        }
    });

    it('is symmetric', () => {
        const a = new Hex(2, 5);
        const b = new Hex(-3, 1);
        expect(Hex.distance(a, b)).toBe(Hex.distance(b, a));
    });

    it('matches known axial distances', () => {
        // Straight line along +q
        expect(Hex.distance(new Hex(0, 0), new Hex(5, 0))).toBe(5);
        // Diagonal across two axes
        expect(Hex.distance(new Hex(0, 0), new Hex(3, -3))).toBe(3);
        expect(Hex.distance(new Hex(0, 0), new Hex(-2, 5))).toBe(5);
    });
});

describe('Hex.getNeighbors', () => {
    it('returns exactly 6 unique neighbors', () => {
        const ns = new Hex(0, 0).getNeighbors();
        expect(ns).toHaveLength(6);
        const keys = new Set(ns.map((h) => h.toString()));
        expect(keys.size).toBe(6);
    });
});
