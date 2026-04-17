export class Hex {
    constructor(q, r) {
        this.q = q;
        this.r = r;
    }

    static fromQR(q, r) {
        return new Hex(q, r);
    }

    static distance(a, b) {
        return (Math.abs(a.q - b.q) + 
                Math.abs(a.q + a.r - b.q - b.r) + 
                Math.abs(a.r - b.r)) / 2;
    }

    getNeighbors() {
        const directions = [
            [1, 0], [1, -1], [0, -1],
            [-1, 0], [-1, 1], [0, 1]
        ];
        return directions.map(([dq, dr]) => new Hex(this.q + dq, this.r + dr));
    }

    toString() {
        return `${this.q},${this.r}`;
    }
}

import { UNIT_STATS } from './constants.js';

function mulberry32(seed) {
    return function() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
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

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

    return function(x, y) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        const xf = x - Math.floor(x), yf = y - Math.floor(y);
        const u = fade(xf), v = fade(yf);
        const aa = perm[perm[X] + Y] & 255;
        const ab = perm[perm[X] + Y + 1] & 255;
        const ba = perm[perm[X + 1] + Y] & 255;
        const bb = perm[perm[X + 1] + Y + 1] & 255;
        const mix = (a, b, t) => a + t * (b - a);
        return mix(
            mix(grad[aa][0] * xf + grad[aa][1] * yf,
                grad[ba][0] * (xf - 1) + grad[ba][1] * yf, u),
            mix(grad[ab][0] * xf + grad[ab][1] * (yf - 1),
                grad[bb][0] * (xf - 1) + grad[bb][1] * (yf - 1), u),
            v
        ) * 0.5 + 0.5;
    };
}

function fbm(noiseFn, x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let val = 0, amp = 1, freq = 1, total = 0;
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
    const threshold = radius - 2;
    for (const tile of tiles.values()) {
        const dist = Hex.distance(origin, tile);
        const coastNoise = fbm(noise, tile.q * 0.1, tile.r * 0.1, 3) * 3.5 - 1.75;
        if (dist > threshold + coastNoise) {
            tile.buildable = false;
        }
    }
    cellularAutomataPass(tiles, 1);
}

function carveContinents(tiles, radius, rng, playerCount) {
    const n = Math.max(2, Math.floor(playerCount * 0.75) + 1);
    const noise = createGradientNoise(rng);
    const centers = [];
    const innerRadius = radius * 0.55;
    for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i) / n + (rng() - 0.5) * 0.8;
        const dist = innerRadius * (0.3 + rng() * 0.5);
        centers.push({ q: Math.round(dist * Math.cos(angle)), r: Math.round(dist * Math.sin(angle)) });
    }

    for (const tile of tiles.values()) {
        const edgeDist = Hex.distance(origin, tile);
        const edgeNoise = fbm(noise, tile.q * 0.08, tile.r * 0.08, 3) * 4 - 2;
        if (edgeDist > radius - 2 + edgeNoise) {
            tile.buildable = false;
            continue;
        }
        const dists = centers.map(c => Hex.distance(c, tile)).sort((a, b) => a - b);
        if (dists.length >= 2 && dists[0] > 0) {
            const ratio = dists[0] / dists[1];
            const boundary = 0.78 + fbm(noise, tile.q * 0.15 + 50, tile.r * 0.15 + 50, 2) * 0.18 - 0.09;
            if (ratio > boundary) tile.buildable = false;
        }
    }
    cellularAutomataPass(tiles, 2);
}

function carveArchipelago(tiles, radius, rng) {
    const noise = createGradientNoise(rng);

    for (const tile of tiles.values()) {
        const dist = Hex.distance(origin, tile);
        if (dist > radius - 1) { tile.buildable = false; continue; }
        const edgeFalloff = Math.max(0, 1 - Math.pow(dist / (radius - 1), 2.5));
        const n = fbm(noise, tile.q * 0.13, tile.r * 0.13, 4);
        if (n - edgeFalloff * 0.25 < 0.43) tile.buildable = false;
    }

    cellularAutomataPass(tiles, 3);
    removeSmallIslands(tiles, 10);
}

function carveInlandSea(tiles, radius, rng) {
    const noise = createGradientNoise(rng);
    const seaRadius = radius * 0.35;
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

    for (const tile of tiles.values()) {
        const dist = Hex.distance(origin, tile);
        if (dist > radius - 1) { tile.buildable = false; continue; }
        const edgeFactor = 1 - Math.pow(dist / radius, 2);
        const warpX = fbm(warpNoise, tile.q * 0.06, tile.r * 0.06, 3) * 6 - 3;
        const warpY = fbm(warpNoise, tile.q * 0.06 + 100, tile.r * 0.06 + 100, 3) * 6 - 3;
        const n = fbm(noise, (tile.q + warpX) * 0.09, (tile.r + warpY) * 0.09, 5);
        if (n < 0.46 - edgeFactor * 0.12) tile.buildable = false;
    }

    cellularAutomataPass(tiles, 2);
    removeSmallIslands(tiles, 8);
}

function cellularAutomataPass(tiles, passes = 1) {
    for (let p = 0; p < passes; p++) {
        const changes = [];
        for (const tile of tiles.values()) {
            const neighbors = getNeighborTiles(tiles, tile.q, tile.r);
            const waterCount = neighbors.filter(n => !n.buildable).length;
            const landCount = neighbors.filter(n => n.buildable).length;
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
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
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
        const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
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
    const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

    // BFS from water tiles to compute distance-to-water for land tiles
    const dtw = new Map();
    const queue = [];
    for (const [key, tile] of tiles) {
        if (!tile.buildable) { dtw.set(key, 0); queue.push(key); }
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
        if (tile.buildable) { wd.set(key, 0); wq.push(key); }
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

        if (distWater <= 1)              tile.biome = 'shore';
        else if (tile.elevation < 0.38)  tile.biome = tile.moisture > 0.55 ? 'marsh' : 'plains';
        else if (tile.elevation < 0.55)  tile.biome = tile.moisture > 0.5 ? 'forest' : 'plains';
        else if (tile.elevation < 0.72)  tile.biome = 'hills';
        else                             tile.biome = 'highland';
    }
}

export class HexGrid {
    constructor(radius, hexSize, style = 'pangaea', playerCount = 4) {
        this.radius = radius;
        this.hexSize = hexSize;
        this.tiles = new Map();
        this.landTileCount = 0;
        this.seed = Date.now();
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
                    q, r,
                    owner: null,
                    structure: null,
                    hp: 0,
                    maxHp: 0,
                    lastAction: 0,
                    lastDamageTime: 0,
                    contested: false,
                    buildable: true
                });
            }
        }

        const maxAttempts = 5;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const rng = mulberry32(this.seed + attempt);

            for (const tile of this.tiles.values()) {
                tile.buildable = true;
            }

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

            this.islands = computeIslands(this.tiles);

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

    /** Buildable tiles within starter Government (G1) influence radius — used to pick spawn centers with a full land disk. */
    countBuildableInGovDisk(center, radius) {
        let n = 0;
        for (const t of this.getTilesInRadius(center, radius)) {
            if (t.buildable) n++;
        }
        return n;
    }

    findSpawnPoints(playerCount) {
        const spawns = [];
        if (this.islands.length === 0 || playerCount <= 0) return spawns;

        // Assign players round-robin across islands large enough to host them
        const usableIslands = this.islands.filter(isl => isl.length >= 12);
        if (usableIslands.length === 0) return spawns;

        const spawnGovRadius = UNIT_STATS.G.levels[0].radius;

        const assignments = usableIslands.map(() => []);
        for (let i = 0; i < playerCount; i++) {
            assignments[i % usableIslands.length].push(i);
        }

        for (let iIdx = 0; iIdx < usableIslands.length; iIdx++) {
            const playerIndices = assignments[iIdx];
            if (playerIndices.length === 0) continue;
            const island = usableIslands[iIdx];

            for (let p = 0; p < playerIndices.length; p++) {
                let bestTile = null;
                let bestLandDisk = -1;
                let bestMinDist = -1;

                for (const key of island) {
                    const tile = this.tiles.get(key);
                    if (!tile || !tile.buildable) continue;

                    const landDisk = this.countBuildableInGovDisk(tile, spawnGovRadius);

                    let minDist = Infinity;
                    for (const existing of spawns) {
                        const d = Hex.distance(tile, existing);
                        if (d < minDist) minDist = d;
                    }

                    if (spawns.length === 0) minDist = Hex.distance(origin, tile);

                    if (landDisk > bestLandDisk ||
                        (landDisk === bestLandDisk && minDist > bestMinDist)) {
                        bestLandDisk = landDisk;
                        bestMinDist = minDist;
                        bestTile = tile;
                    }
                }

                if (bestTile) {
                    spawns.push({ q: bestTile.q, r: bestTile.r });
                }
            }
        }

        return spawns;
    }

    hexToPixel(q, r) {
        const x = this.hexSize * Math.sqrt(3) * (q + r / 2);
        const y = this.hexSize * 3 / 2 * r;
        return { x, y };
    }

    pixelToHex(x, y) {
        const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / this.hexSize;
        const r = (2 / 3 * y) / this.hexSize;
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
            y: (sy - height / 2) / this.scale - this.y
        };
    }

    worldToScreen(wx, wy, width, height) {
        return {
            x: (wx + this.x) * this.scale + width / 2,
            y: (wy + this.y) * this.scale + height / 2
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
