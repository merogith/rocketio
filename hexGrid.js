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

export class HexGrid {
    constructor(radius, hexSize) {
        this.radius = radius;
        this.hexSize = hexSize;
        this.tiles = new Map();
        this.generate(radius);
    }

    generate(radius) {
        for (let q = -radius; q <= radius; q++) {
            let r1 = Math.max(-radius, -q - radius);
            let r2 = Math.min(radius, -q + radius);
            for (let r = r1; r <= r2; r++) {
                this.tiles.set(`${q},${r}`, {
                    q, r,
                    owner: null,
                    structure: null,
                    hp: 0,
                    lastAction: 0
                });
            }
        }
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
        
        // Adjust x,y to zoom towards cursor
        const zoomRatio = this.scale / oldScale;
        const wx = (sx - width / 2) / oldScale - this.x;
        const wy = (sy - height / 2) / oldScale - this.y;
        
        this.x -= wx * (1 / zoomRatio - 1);
        this.y -= wy * (1 / zoomRatio - 1);
    }
}
