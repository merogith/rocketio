import { UNIT_STATS, GAME_CONFIG, govGoldForDistance } from './constants.js';
import { REAL_WORLD_MAPS, parseTemplate, isRealWorldMap } from '../data/realWorldMaps.js';

export class Hex {
    constructor(q, r) {
        this.q = q;
        this.r = r;
    }

    static fromQR(q, r) {
        return new Hex(q, r);
    }

    static distance(a, b) {
        return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    }

    getNeighbors() {
        const directions = [
            [1, 0],
            [1, -1],
            [0, -1],
            [-1, 0],
            [-1, 1],
            [0, 1],
        ];
        return directions.map(([dq, dr]) => new Hex(this.q + dq, this.r + dr));
    }

    toString() {
        return `${this.q},${this.r}`;
    }
}

function mulberry32(seed) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Seeded 2D gradient noise with permutation table for high-quality terrain
function createGradientNoise(rng) {
    const perm = new Uint8Array(512);
    const grad = [];
    for (let i = 0; i < 256; i++) {
        perm[i] = i;
        const angle = rng() * Math.PI * 2;
        grad.push([Math.cos(angle), Math.sin(angle)]);
    }
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

    function fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    return function (x, y) {
        const X = Math.floor(x) & 255,
            Y = Math.floor(y) & 255;
        const xf = x - Math.floor(x),
            yf = y - Math.floor(y);
        const u = fade(xf),
            v = fade(yf);
        const aa = perm[perm[X] + Y] & 255;
        const ab = perm[perm[X] + Y + 1] & 255;
        const ba = perm[perm[X + 1] + Y] & 255;
        const bb = perm[perm[X + 1] + Y + 1] & 255;
        const mix = (a, b, t) => a + t * (b - a);
        return (
            mix(
                mix(grad[aa][0] * xf + grad[aa][1] * yf, grad[ba][0] * (xf - 1) + grad[ba][1] * yf, u),
                mix(grad[ab][0] * xf + grad[ab][1] * (yf - 1), grad[bb][0] * (xf - 1) + grad[bb][1] * (yf - 1), u),
                v
            ) *
                0.5 +
            0.5
        );
    };
}

function fbm(noiseFn, x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let val = 0,
        amp = 1,
        freq = 1,
        total = 0;
    for (let i = 0; i < octaves; i++) {
        val += noiseFn(x * freq, y * freq) * amp;
        total += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    return val / total;
}

const origin = { q: 0, r: 0 };

function carvePangaea(tiles, radius, rng) {
    const noise = createGradientNoise(rng);
    const nScale = 0.08 + rng() * 0.05;
    const nOff = (rng() - 0.5) * 40;
    const threshold = radius - 2 + (rng() * 1.1 - 0.55);
    for (const tile of tiles.values()) {
        const dist = Hex.distance(origin, tile);
        const coastNoise = fbm(noise, (tile.q + nOff) * nScale, (tile.r - nOff * 0.3) * nScale, 3) * 3.5 - 1.75;
        if (dist > threshold + coastNoise) {
            tile.buildable = false;
        }
    }
    cellularAutomataPass(tiles, 1);
}

function carveContinents(tiles, radius, rng, playerCount) {
    const n = Math.max(2, Math.floor(playerCount * 0.75) + 1 + (radius >= 40 ? 1 : 0));
    const noise = createGradientNoise(rng);
    const nScale = 0.07 + rng() * 0.04;
    const globalSpin = (rng() - 0.5) * 1.2;
    const centers = [];
    const innerRadius = radius * (0.5 + rng() * 0.1);
    for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i) / n + (rng() - 0.5) * 0.95 + globalSpin;
        const dist = innerRadius * (0.28 + rng() * 0.55);
        centers.push({ q: Math.round(dist * Math.cos(angle)), r: Math.round(dist * Math.sin(angle)) });
    }

    const straitTight = 0.76 + rng() * 0.06;
    for (const tile of tiles.values()) {
        const edgeDist = Hex.distance(origin, tile);
        const edgeNoise = fbm(noise, tile.q * 0.08, tile.r * 0.08, 3) * 4 - 2;
        if (edgeDist > radius - 2 + edgeNoise) {
            tile.buildable = false;
            continue;
        }
        const dists = centers.map((c) => Hex.distance(c, tile)).sort((a, b) => a - b);
        if (dists.length >= 2 && dists[0] > 0) {
            const ratio = dists[0] / dists[1];
            const boundary = straitTight + fbm(noise, tile.q * nScale + 50, tile.r * nScale + 50, 2) * 0.18 - 0.09;
            if (ratio > boundary) tile.buildable = false;
        }
    }
    cellularAutomataPass(tiles, 2);
}

function carveArchipelago(tiles, radius, rng) {
    const noise = createGradientNoise(rng);
    const nScale = 0.11 + rng() * 0.05;
    const landCut = 0.41 + rng() * 0.06;
    const edgePow = 2.2 + rng() * 0.6;

    for (const tile of tiles.values()) {
        const dist = Hex.distance(origin, tile);
        if (dist > radius - 1) {
            tile.buildable = false;
            continue;
        }
        const edgeFalloff = Math.max(0, 1 - Math.pow(dist / (radius - 1), edgePow));
        const n = fbm(noise, tile.q * nScale, tile.r * nScale, 4);
        if (n - edgeFalloff * 0.25 < landCut) tile.buildable = false;
    }

    cellularAutomataPass(tiles, 3);
    removeSmallIslands(tiles, 10);
}

function carveInlandSea(tiles, radius, rng) {
    const noise = createGradientNoise(rng);
    const seaPortion = 0.3 + rng() * 0.1;
    const seaRadius = radius * seaPortion;
    for (const tile of tiles.values()) {
        const dist = Hex.distance(origin, tile);
        const innerNoise = fbm(noise, tile.q * 0.12, tile.r * 0.12, 3) * 3 - 1.5;
        const outerNoise = fbm(noise, tile.q * 0.08 + 50, tile.r * 0.08 + 50, 3) * 3.5 - 1.75;
        if (dist < seaRadius + innerNoise || dist > radius - 2 + outerNoise) {
            tile.buildable = false;
        }
    }
    cellularAutomataPass(tiles, 2);
}

function carveFractal(tiles, radius, rng) {
    const noise = createGradientNoise(rng);
    const warpNoise = createGradientNoise(rng);
    const sCoast = 0.085 + rng() * 0.04;
    const wAmp = 4.5 + rng() * 3.5;
    const landThresh = 0.44 + rng() * 0.06;

    for (const tile of tiles.values()) {
        const dist = Hex.distance(origin, tile);
        if (dist > radius - 1) {
            tile.buildable = false;
            continue;
        }
        const edgeFactor = 1 - Math.pow(dist / radius, 2);
        const warpX = fbm(warpNoise, tile.q * 0.06, tile.r * 0.06, 3) * wAmp - wAmp / 2;
        const warpY = fbm(warpNoise, tile.q * 0.06 + 100, tile.r * 0.06 + 100, 3) * wAmp - wAmp / 2;
        const n = fbm(noise, (tile.q + warpX) * sCoast, (tile.r + warpY) * sCoast, 5);
        if (n < landThresh - edgeFactor * 0.12) tile.buildable = false;
    }

    cellularAutomataPass(tiles, 2);
    removeSmallIslands(tiles, 8);
}

function carveFromTemplate(tiles, template) {
    const { land } = parseTemplate(template.rows);
    for (const tile of tiles.values()) {
        tile.buildable = land.has(`${tile.q},${tile.r}`);
    }
}

function cellularAutomataPass(tiles, passes = 1) {
    for (let p = 0; p < passes; p++) {
        const changes = [];
        for (const tile of tiles.values()) {
            const neighbors = getNeighborTiles(tiles, tile.q, tile.r);
            const waterCount = neighbors.filter((n) => !n.buildable).length;
            const landCount = neighbors.filter((n) => n.buildable).length;
            if (tile.buildable && waterCount >= 4) {
                changes.push({ key: `${tile.q},${tile.r}`, buildable: false });
            } else if (!tile.buildable && landCount >= 5) {
                changes.push({ key: `${tile.q},${tile.r}`, buildable: true });
            }
        }
        for (const c of changes) {
            const t = tiles.get(c.key);
            if (t) t.buildable = c.buildable;
        }
    }
}

function getNeighborTiles(tiles, q, r) {
    const dirs = [
        [1, 0],
        [1, -1],
        [0, -1],
        [-1, 0],
        [-1, 1],
        [0, 1],
    ];
    const result = [];
    for (const [dq, dr] of dirs) {
        const t = tiles.get(`${q + dq},${r + dr}`);
        if (t) result.push(t);
    }
    return result;
}

function floodFill(tiles, startKey, visited) {
    const component = [];
    const stack = [startKey];
    while (stack.length > 0) {
        const key = stack.pop();
        if (visited.has(key)) continue;
        const tile = tiles.get(key);
        if (!tile || !tile.buildable) continue;
        visited.add(key);
        component.push(key);
        const dirs = [
            [1, 0],
            [1, -1],
            [0, -1],
            [-1, 0],
            [-1, 1],
            [0, 1],
        ];
        for (const [dq, dr] of dirs) {
            const nk = `${tile.q + dq},${tile.r + dr}`;
            if (!visited.has(nk)) stack.push(nk);
        }
    }
    return component;
}

function computeIslands(tiles) {
    const visited = new Set();
    const islands = [];
    for (const [key, tile] of tiles) {
        if (!visited.has(key) && tile.buildable) {
            const component = floodFill(tiles, key, visited);
            if (component.length > 0) islands.push(component);
        }
    }
    islands.sort((a, b) => b.length - a.length);
    return islands;
}

function removeSmallIslands(tiles, minSize) {
    const islands = computeIslands(tiles);
    for (const island of islands) {
        if (island.length < minSize) {
            for (const key of island) {
                const t = tiles.get(key);
                if (t) t.buildable = false;
            }
        }
    }
}

function assignTerrain(tiles, rng, radius) {
    const elevNoise = createGradientNoise(rng);
    const moistNoise = createGradientNoise(rng);
    const dirs = [
        [1, 0],
        [1, -1],
        [0, -1],
        [-1, 0],
        [-1, 1],
        [0, 1],
    ];

    // BFS from water tiles to compute distance-to-water for land tiles
    const dtw = new Map();
    const queue = [];
    for (const [key, tile] of tiles) {
        if (!tile.buildable) {
            dtw.set(key, 0);
            queue.push(key);
        }
    }
    let head = 0;
    while (head < queue.length) {
        const key = queue[head++];
        const tile = tiles.get(key);
        const d = dtw.get(key);
        for (const [dq, dr] of dirs) {
            const nk = `${tile.q + dq},${tile.r + dr}`;
            if (!dtw.has(nk) && tiles.has(nk)) {
                dtw.set(nk, d + 1);
                queue.push(nk);
            }
        }
    }

    // BFS from land tiles to compute water depth
    const wd = new Map();
    const wq = [];
    for (const [key, tile] of tiles) {
        if (tile.buildable) {
            wd.set(key, 0);
            wq.push(key);
        }
    }
    head = 0;
    while (head < wq.length) {
        const key = wq[head++];
        const tile = tiles.get(key);
        const d = wd.get(key);
        for (const [dq, dr] of dirs) {
            const nk = `${tile.q + dq},${tile.r + dr}`;
            if (!wd.has(nk) && tiles.has(nk)) {
                wd.set(nk, d + 1);
                wq.push(nk);
            }
        }
    }

    for (const [key, tile] of tiles) {
        const distWater = dtw.get(key) || 0;
        tile.distToWater = distWater;

        if (!tile.buildable) {
            tile.waterDepth = wd.get(key) || 0;
            tile.elevation = 0;
            tile.moisture = 1;
            tile.biome = 'water';
            continue;
        }

        tile.waterDepth = 0;
        const e = fbm(elevNoise, tile.q * 0.07, tile.r * 0.07, 4);
        const m = fbm(moistNoise, tile.q * 0.05 + 200, tile.r * 0.05 + 200, 3);
        const coastPull = Math.min(1, distWater / 6);
        tile.elevation = e * 0.55 + coastPull * 0.45;
        tile.moisture = m;

        if (distWater <= 1) tile.biome = 'shore';
        else if (tile.elevation < 0.38) tile.biome = tile.moisture > 0.55 ? 'marsh' : 'plains';
        else if (tile.elevation < 0.55) tile.biome = tile.moisture > 0.5 ? 'forest' : 'plains';
        else if (tile.elevation < 0.72) tile.biome = 'hills';
        else tile.biome = 'highland';
    }
    markShoreIncomeFromLand(tiles);
}

/** Water (non-buildable) within `maxD` steps of any land: can be claimed and earn gold like land. */
function markShoreIncomeFromLand(tiles, maxD = 3) {
    const INF = 1e7;
    const q = [];
    for (const t of tiles.values()) {
        t.shoreIncome = false;
        if (t.buildable) {
            t.distToLand = 0;
            q.push(t);
        } else {
            t.distToLand = INF;
        }
    }
    const dirs = [
        [1, 0],
        [1, -1],
        [0, -1],
        [-1, 0],
        [-1, 1],
        [0, 1],
    ];
    let qi = 0;
    while (qi < q.length) {
        const t = q[qi++];
        const d0 = t.distToLand;
        for (const [dq, dr] of dirs) {
            const n = tiles.get(`${t.q + dq},${t.r + dr}`);
            if (!n || n.buildable) continue;
            const d1 = d0 + 1;
            if (d1 < n.distToLand) {
                n.distToLand = d1;
                q.push(n);
            }
        }
    }
    for (const t of tiles.values()) {
        if (t.buildable) t.distToLand = 0;
        else t.shoreIncome = t.distToLand >= 1 && t.distToLand <= maxD;
    }
}

export class HexGrid {
    constructor(radius, hexSize, style = 'pangaea', playerCount = 4) {
        this.radius = radius;
        this.hexSize = hexSize;
        this.tiles = new Map();
        this.landTileCount = 0;
        let s = (Date.now() & 0xffffffff) ^ 0;
        s ^= (style || 'pangaea').split('').reduce((a, c) => Math.imul(a + c.charCodeAt(0), 31) | 0, 7);
        s ^= ((playerCount | 0) * 0x9e3779b1) | 0;
        s ^= ((radius | 0) * 0x6a09e667) | 0;
        s ^= (Math.random() * 0x1fffffff) | 0;
        this.seed = s | 0;
        this.islands = [];
        this.generate(radius, style, playerCount);
    }

    generate(radius, style, playerCount) {
        this.tiles.clear();

        for (let q = -radius; q <= radius; q++) {
            let r1 = Math.max(-radius, -q - radius);
            let r2 = Math.min(radius, -q + radius);
            for (let r = r1; r <= r2; r++) {
                this.tiles.set(`${q},${r}`, {
                    q,
                    r,
                    owner: null,
                    structure: null,
                    hp: 0,
                    maxHp: 0,
                    lastAction: 0,
                    lastDamageTime: 0,
                    contested: false,
                    buildable: true,
                    shoreIncome: false,
                });
            }
        }

        const maxAttempts = 5;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const rng = mulberry32(this.seed + attempt);

            for (const tile of this.tiles.values()) {
                tile.buildable = true;
            }

            if (isRealWorldMap(style)) {
                carveFromTemplate(this.tiles, REAL_WORLD_MAPS[style]);
            } else {
                switch (style) {
                    case 'continents':
                        carveContinents(this.tiles, radius, rng, playerCount);
                        break;
                    case 'archipelago':
                        carveArchipelago(this.tiles, radius, rng);
                        break;
                    case 'inland_sea':
                        carveInlandSea(this.tiles, radius, rng);
                        break;
                    case 'fractal':
                        carveFractal(this.tiles, radius, rng);
                        break;
                    case 'pangaea':
                    default:
                        carvePangaea(this.tiles, radius, rng);
                        break;
                }
            }

            this.islands = computeIslands(this.tiles);

            if (isRealWorldMap(style)) {
                assignTerrain(this.tiles, rng, radius);
                break;
            }

            if (this.islands.length > 0 && this.islands[0].length >= 12) {
                assignTerrain(this.tiles, rng, radius);
                break;
            }

            if (attempt === maxAttempts - 1) {
                for (const tile of this.tiles.values()) {
                    tile.buildable = true;
                }
                carvePangaea(this.tiles, radius, rng);
                this.islands = computeIslands(this.tiles);
                assignTerrain(this.tiles, rng, radius);
            }
        }

        this.landTileCount = 0;
        for (const tile of this.tiles.values()) {
            if (tile.buildable) this.landTileCount++;
        }
    }

    /** Buildable land hexes under a Government influence disk (axial radius) — used to pick spawn centers. */
    countBuildableInGovDisk(center, radius) {
        let n = 0;
        for (const t of this.getTilesInRadius(center, radius)) {
            if (t.buildable) n++;
        }
        return n;
    }

    /**
     * Starter MF (mf1) is placed on the first buildable neighbor in fixed hex order.
     * Only hexes with at least one such neighbor can host a valid G+MF start.
     */
    hasBuildableEmptyNeighborForStarterMf(tile) {
        if (!tile || !tile.buildable) return false;
        for (const h of new Hex(tile.q, tile.r).getNeighbors()) {
            const n = this.getTile(h.q, h.r);
            if (n && n.buildable && !n.structure) return true;
        }
        return false;
    }

    /**
     * Notional G3 $/s from all land + shore income hexes in the free Gov influence disk, using banded
     * gov gold (not tile count) — optimizes Lv3 placement vs. thin/outer-heavy disks.
     */
    sumG3SoloDiskGoldValue(center, govLevel = GAME_CONFIG.STARTER_GOV_LEVEL) {
        const r = UNIT_STATS.G.levels[govLevel].radius;
        let s = 0;
        for (const t of this.getTilesInRadius(center, r)) {
            if (!t.buildable && !t.shoreIncome) continue;
            const d = Hex.distance(center, t);
            s += govGoldForDistance(govLevel, d);
        }
        return s;
    }

    findSpawnPoints(playerCount) {
        if (this.islands.length === 0 || playerCount <= 0) return [];

        // Assign players round-robin across islands large enough to host them
        const usableIslands = this.islands.filter((isl) => isl.length >= 12);
        if (usableIslands.length === 0) return [];

        // Must match `Game.start` free Government — G3, max tier (`sumG3SoloDiskGoldValue` / `countBuildableInGovDisk`).

        const islandMaxGovValue = new Map();
        for (const isl of usableIslands) {
            let m = 0;
            for (const key of isl) {
                const t = this.tiles.get(key);
                if (!t || !t.buildable || !this.hasBuildableEmptyNeighborForStarterMf(t)) continue;
                const d = this.sumG3SoloDiskGoldValue(t, GAME_CONFIG.STARTER_GOV_LEVEL);
                if (d > m) m = d;
            }
            islandMaxGovValue.set(isl, m);
        }
        // Round-robin uses island order: put the best G3 economic potential landmasses first for fairer splits.
        usableIslands.sort((a, b) => islandMaxGovValue.get(b) - islandMaxGovValue.get(a) || b.length - a.length);

        // Vary the "first spawn" bias so games don't all anchor the same way vs map center
        const rot = ((this.seed >>> 0) % 6283) / 1000;
        const refD = this.radius * (0.22 + ((this.seed >>> 8) % 17) * 0.01);
        const firstSpawnBias = { q: Math.round(Math.cos(rot) * refD), r: Math.round(Math.sin(rot) * refD) };

        const assignments = usableIslands.map(() => []);
        for (let i = 0; i < playerCount; i++) {
            assignments[i % usableIslands.length].push(i);
        }

        // Index i matches `Game.start` (0 = first player / human). Result must be parallel to `spawnPoints[i]`.
        const out = new Array(playerCount).fill(null);

        // Player 0: best G3 spawn over the map — max banded Gov gold on land+shore in the L3 influence disk, with
        // a buildable empty neighbor (required for the free mf1). Tie-break: farther from seed bias (spread).
        let p0Tile = null;
        let p0GovScore = -1;
        let p0BiasD = -1;
        for (const isl of usableIslands) {
            for (const key of isl) {
                const tile = this.tiles.get(key);
                if (!tile || !tile.buildable || !this.hasBuildableEmptyNeighborForStarterMf(tile)) continue;
                const govValue = this.sumG3SoloDiskGoldValue(tile, GAME_CONFIG.STARTER_GOV_LEVEL);
                const dBias = Hex.distance(firstSpawnBias, tile);
                if (govValue > p0GovScore || (govValue === p0GovScore && dBias > p0BiasD)) {
                    p0GovScore = govValue;
                    p0BiasD = dBias;
                    p0Tile = tile;
                }
            }
        }
        if (p0Tile) {
            out[0] = { q: p0Tile.q, r: p0Tile.r };
        }

        for (let iIdx = 0; iIdx < usableIslands.length; iIdx++) {
            const playerIndices = assignments[iIdx];
            if (playerIndices.length === 0) continue;
            const island = usableIslands[iIdx];

            for (let p = 0; p < playerIndices.length; p++) {
                const playerIndex = playerIndices[p];
                if (out[playerIndex]) continue;

                let bestTile = null;
                let bestGovScore = -1;
                let bestMinDist = -1;

                for (const key of island) {
                    const tile = this.tiles.get(key);
                    if (!tile || !tile.buildable || !this.hasBuildableEmptyNeighborForStarterMf(tile)) continue;

                    const govValue = this.sumG3SoloDiskGoldValue(tile, GAME_CONFIG.STARTER_GOV_LEVEL);

                    let minDist = Infinity;
                    for (let o = 0; o < playerCount; o++) {
                        if (!out[o]) continue;
                        const d = Hex.distance(tile, out[o]);
                        if (d < minDist) minDist = d;
                    }
                    if (!out.some(Boolean)) {
                        minDist = Hex.distance(firstSpawnBias, tile);
                    }

                    if (govValue > bestGovScore || (govValue === bestGovScore && minDist > bestMinDist)) {
                        bestGovScore = govValue;
                        bestMinDist = minDist;
                        bestTile = tile;
                    }
                }

                if (bestTile) {
                    out[playerIndex] = { q: bestTile.q, r: bestTile.r };
                }
            }
        }

        return out;
    }

    hexToPixel(q, r) {
        const x = this.hexSize * Math.sqrt(3) * (q + r / 2);
        const y = ((this.hexSize * 3) / 2) * r;
        return { x, y };
    }

    pixelToHex(x, y) {
        const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / this.hexSize;
        const r = ((2 / 3) * y) / this.hexSize;
        return this.hexRound(q, r);
    }

    hexRound(q, r) {
        let s = -q - r;
        let rq = Math.round(q);
        let rr = Math.round(r);
        let rs = Math.round(s);

        let qDiff = Math.abs(rq - q);
        let rDiff = Math.abs(rr - r);
        let sDiff = Math.abs(rs - s);

        if (qDiff > rDiff && qDiff > sDiff) {
            rq = -rr - rs;
        } else if (rDiff > sDiff) {
            rr = -rq - rs;
        }
        return new Hex(rq, rr);
    }

    getTile(q, r) {
        return this.tiles.get(`${q},${r}`);
    }

    getTilesInRadius(center, radius) {
        const results = [];
        for (let q = -radius; q <= radius; q++) {
            for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
                const tile = this.getTile(center.q + q, center.r + r);
                if (tile) results.push(tile);
            }
        }
        return results;
    }
}

export class Camera {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.scale = 0.5;
        this.minScale = 0.1;
        this.maxScale = 2.0;
    }

    screenToWorld(sx, sy, width, height) {
        return {
            x: (sx - width / 2) / this.scale - this.x,
            y: (sy - height / 2) / this.scale - this.y,
        };
    }

    worldToScreen(wx, wy, width, height) {
        return {
            x: (wx + this.x) * this.scale + width / 2,
            y: (wy + this.y) * this.scale + height / 2,
        };
    }

    pan(dx, dy) {
        this.x += dx / this.scale;
        this.y += dy / this.scale;
    }

    zoom(delta, sx, sy, width, height) {
        const oldScale = this.scale;
        this.scale *= delta;
        this.scale = Math.min(Math.max(this.scale, this.minScale), this.maxScale);

        const zoomRatio = this.scale / oldScale;
        const wx = (sx - width / 2) / oldScale - this.x;
        const wy = (sy - height / 2) / oldScale - this.y;

        this.x -= wx * (1 / zoomRatio - 1);
        this.y -= wy * (1 / zoomRatio - 1);
    }
}
