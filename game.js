import { UNIT_STATS, COLORS } from './constants.js';
import { Hex } from './hexGrid.js';

// Damage efficiency:
//   100% HP      -> 1.0x speed
//   [50%, 100%)  -> 0.8x speed  (interval * 1.25)
//   < 50% HP     -> 0.5x speed  (interval * 2.0)
function intervalMul(tile) {
    if (!tile.maxHp) return 1;
    const ratio = tile.hp / tile.maxHp;
    if (ratio < 0.5) return 2;
    if (ratio < 1)   return 1.25;
    return 1;
}

// Types that can own an assigned player target.
const ATTACK_TYPES = new Set(['RL', 'B', 'D', 'M']);

// Structures that project territorial influence.
function isInfluencer(structure) {
    if (!structure) return false;
    if (structure.type === 'G') return true;
    if (structure.type === 'B') return true;
    if (structure.type === 'M' && structure.stats?.transformsToGov) return true;
    return false;
}

export class Game {
    constructor(grid) {
        this.grid = grid;
        this.players = [];
        this.projectiles = [];
        this.lastTick = 0;
        this.tickRate = 1000;

        for (let i = 1; i <= 8; i++) {
            this.players.push({
                id: i,
                gold: 500,
                missiles: 0,
                tileCount: 0,
                units: { M: 0, D: 0, B: 0 }
            });
        }

        this.selectedTile = null;
        this.isTargeting = false;
        this.currentTargetSource = null;
        this.mousePos = { x: 0, y: 0 };
    }

    start(playerCount = 8) {
        const radius = this.grid.radius;
        const players = this.players.slice(0, playerCount);

        players.forEach((p, i) => {
            const angle = (i / playerCount) * Math.PI * 2;
            const dist = radius * 0.7;
            const q = Math.round(Math.cos(angle) * dist);
            const r = Math.round(Math.sin(angle) * dist);

            const tile = this.grid.getTile(q, r);
            if (tile) {
                tile.owner = p.id;
                this.buildStructure(tile, 'G', p.id, 0);
            }
        });

        this.updateBorders();
        this.tick();
    }

    update(time) {
        const dt = time - this.lastTick;
        if (dt >= this.tickRate) {
            this.tick();
            this.lastTick = time;
        }

        this.updateProjectiles(time);
        this.updateStructures(time);
    }

    tick() {
        let counts = new Array(this.players.length).fill(0);

        for (const tile of this.grid.tiles.values()) {
            if (tile.owner) {
                counts[tile.owner - 1]++;
                this.players[tile.owner - 1].gold += 0.5;
            }
        }

        this.players.forEach((p, i) => { p.tileCount = counts[i]; });
    }

    updateStructures(time) {
        for (const tile of this.grid.tiles.values()) {
            if (!tile.structure) continue;

            const s = tile.structure;
            const stats = s.stats;
            const p = this.players[tile.owner - 1];
            const eff = intervalMul(tile);

            // Missile Production
            if (s.type === 'MF') {
                if (time - tile.lastAction > stats.produceInterval * eff) {
                    p.missiles += stats.missilesProduced;
                    tile.lastAction = time;
                }
                continue;
            }

            // Anti-Air Recharge
            if (s.type === 'AAS') {
                if (time - tile.lastAction > stats.rechargeInterval * eff) {
                    s.charge = Math.min(10, (s.charge || 0) + stats.missilesRecharged);
                    tile.lastAction = time;
                }
                continue;
            }

            // Rocket Launcher - missile-dependent, interceptable
            if (s.type === 'RL') {
                if (time - tile.lastAction > stats.interval * eff && p.missiles >= stats.missilesPerShot) {
                    if (this.fireRocket(tile)) tile.lastAction = time;
                }
                continue;
            }

            // Barracks - uninterceptable, counter-role auto target
            if (s.type === 'B') {
                if (time - tile.lastAction > stats.interval * eff) {
                    if (this.fireGround(tile, this.autoBarracksTarget)) tile.lastAction = time;
                }
                continue;
            }

            // Drone - uninterceptable ground fire
            if (s.type === 'D') {
                if (time - tile.lastAction > stats.interval * eff) {
                    if (this.fireGround(tile, this.autoClosestEnemy)) tile.lastAction = time;
                }
                continue;
            }

            // Militia - uninterceptable, but M3 is gov-mode (no attack)
            if (s.type === 'M' && stats.damage) {
                if (time - tile.lastAction > stats.interval * eff) {
                    if (this.fireGround(tile, this.autoClosestEnemy)) tile.lastAction = time;
                }
                continue;
            }
        }
    }

    // ==================== TARGETING ====================

    // Resolve target: assigned tile (if still valid and in range) wins; else auto rule.
    // Valid assigned = tile still exists and is either neutral with no structure, or has an enemy structure/unit.
    // We allow targeting empty tiles too (area denial / advance fire).
    resolveTarget(tile, stats, autoRuleFn) {
        const assigned = tile.structure.target;
        if (assigned) {
            // Tile still on the grid?
            const live = this.grid.getTile(assigned.q, assigned.r);
            if (live) {
                const d = Hex.distance(tile, live);
                if (d <= stats.range) {
                    // Don't attack own structures
                    if (live.owner !== tile.owner || !live.structure) {
                        return live;
                    }
                }
            }
        }
        return autoRuleFn.call(this, tile, stats.range);
    }

    // Auto-rule: nearest enemy STRUCTURE in range (ties -> random).
    autoClosestEnemy(source, range) {
        const candidates = [];
        let minDist = range + 1;
        for (const tile of this.grid.tiles.values()) {
            if (!tile.structure || !tile.owner || tile.owner === source.owner) continue;
            const d = Hex.distance(source, tile);
            if (d > range) continue;
            if (d < minDist) { minDist = d; candidates.length = 0; candidates.push(tile); }
            else if (d === minDist) candidates.push(tile);
        }
        return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    }

    // Auto-rule for Barracks: enemy Militia > enemy Drone > nearest other enemy structure.
    autoBarracksTarget(source, range) {
        let militia = null, mD = range + 1;
        let drone   = null, dD = range + 1;
        let other   = null, oD = range + 1;

        for (const tile of this.grid.tiles.values()) {
            if (!tile.structure || !tile.owner || tile.owner === source.owner) continue;
            const d = Hex.distance(source, tile);
            if (d > range) continue;
            if (tile.structure.type === 'M' && d < mD) { militia = tile; mD = d; }
            else if (tile.structure.type === 'D' && d < dD) { drone = tile; dD = d; }
            else if (d < oD) { other = tile; oD = d; }
        }
        return militia || drone || other;
    }

    // ==================== FIRING ====================

    fireRocket(tile) {
        const p = this.players[tile.owner - 1];
        const stats = tile.structure.stats;
        const target = this.resolveTarget(tile, stats, this.autoClosestEnemy);
        if (!target) return false;

        p.missiles -= stats.missilesPerShot;
        this.spawnProjectile(tile, target, {
            type: 'rocket',
            damage: stats.damage,
            speed: 2.5,
            interceptable: true
        });
        return true;
    }

    fireGround(tile, autoRuleFn) {
        const stats = tile.structure.stats;
        const target = this.resolveTarget(tile, stats, autoRuleFn);
        if (!target) return false;

        this.spawnProjectile(tile, target, {
            type: 'ground',
            damage: stats.damage,
            speed: 3.5,
            interceptable: false
        });
        return true;
    }

    spawnProjectile(fromTile, toTile, opts) {
        const startPos = this.grid.hexToPixel(fromTile.q, fromTile.r);
        const endPos   = this.grid.hexToPixel(toTile.q,   toTile.r);
        this.projectiles.push({
            type: opts.type,
            owner: fromTile.owner,
            x: startPos.x,
            y: startPos.y,
            targetX: endPos.x,
            targetY: endPos.y,
            targetQR: { q: toTile.q, r: toTile.r },
            damage: opts.damage,
            speed: opts.speed,
            interceptable: opts.interceptable,
            color: COLORS[`PLAYER${fromTile.owner}`]
        });
    }

    updateProjectiles(time) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 5) {
                this.impact(p);
                this.projectiles.splice(i, 1);
            } else {
                p.x += (dx / dist) * p.speed;
                p.y += (dy / dist) * p.speed;

                if (p.interceptable && this.checkInterception(p)) {
                    this.projectiles.splice(i, 1);
                }
            }
        }
    }

    checkInterception(proj) {
        const hex = this.grid.pixelToHex(proj.x, proj.y);
        for (const tile of this.grid.tiles.values()) {
            if (tile.owner && tile.owner !== proj.owner && tile.structure?.type === 'AAS') {
                const d = Hex.distance(hex, tile);
                if (d <= tile.structure.stats.range && (tile.structure.charge || 0) > 0) {
                    tile.structure.charge--;
                    return true;
                }
            }
        }
        return false;
    }

    impact(proj) {
        const tile = this.grid.getTile(proj.targetQR.q, proj.targetQR.r);
        if (tile && tile.structure) {
            tile.hp -= proj.damage;
            if (tile.hp <= 0) this.destroyStructure(tile);
        }
    }

    // ==================== BUILD / DESTROY ====================

    buildStructure(tile, type, ownerId, levelIdx = 0) {
        const p = this.players[ownerId - 1];
        if (!p) return false;

        // Contested tiles are unbuildable by anyone.
        if (tile.contested) return false;

        const def = UNIT_STATS[type];
        const stats = Array.isArray(def?.levels) ? def.levels[levelIdx] : def;
        if (!stats) return false;

        // Zone rules:
        // - Militia can go on own, neutral, OR empty enemy tiles (harass-deployer).
        // - Everyone else: own tiles only.
        // - Cannot stack: tile must have no existing structure.
        if (tile.structure) return false;

        const isOwn     = tile.owner === ownerId;
        const isNeutral = tile.owner == null;
        const isEnemy   = tile.owner != null && tile.owner !== ownerId;

        if (type === 'M') {
            if (!isOwn && !isNeutral && !isEnemy) return false;
        } else {
            if (!isOwn) return false;
        }

        if (p.gold < stats.cost) return false;

        if ((type === 'D' || type === 'M') && p.units[type] >= (def.limit || 3)) return false;

        p.gold -= stats.cost;
        tile.structure = { type, level: levelIdx, stats, charge: 0, target: null };
        tile.owner = ownerId;
        tile.hp = stats.hp || 100;
        tile.maxHp = tile.hp;
        tile.lastAction = performance.now();

        if (type === 'D' || type === 'M') p.units[type]++;

        this.updateBorders();
        return true;
    }

    destroyStructure(tile) {
        if (tile.structure) {
            const p = this.players[tile.owner - 1];
            const t = tile.structure.type;
            if (p && (t === 'D' || t === 'M')) p.units[t] = Math.max(0, p.units[t] - 1);
            tile.structure = null;
            tile.hp = 0;
        }
        this.updateBorders();
    }

    setAssignedTarget(tile, targetTile) {
        if (!tile?.structure || !ATTACK_TYPES.has(tile.structure.type)) return false;
        // Only attacking variants (damage > 0, range > 0). M3 has no damage.
        const stats = tile.structure.stats;
        if (!stats.damage || !stats.range) return false;
        tile.structure.target = targetTile || null;
        return true;
    }

    clearAssignedTarget(tile) {
        if (tile?.structure) tile.structure.target = null;
    }

    // ==================== INFLUENCE-BASED TERRITORY ====================

    updateBorders() {
        // 1. Collect influence sources
        const sources = [];
        for (const tile of this.grid.tiles.values()) {
            if (!isInfluencer(tile.structure)) continue;
            const stats = tile.structure.stats;
            sources.push({
                tile,
                owner: tile.owner,
                influence: stats.influence || 0,
                radius: stats.radius || 0
            });
        }

        // 2. Score every tile
        for (const tile of this.grid.tiles.values()) {
            // Tile with structure: owner is whoever built it. Never contested while occupied.
            if (tile.structure) {
                tile.contested = false;
                continue;
            }

            let best = null;
            let bestScore = 0;
            let tied = false;
            const scoresByPlayer = {};

            for (const src of sources) {
                const d = Hex.distance(tile, src.tile);
                if (d > src.radius) continue;
                const falloff = Math.max(0, 1 - 0.2 * d);
                if (falloff <= 0) continue;
                const add = src.influence * falloff;
                scoresByPlayer[src.owner] = (scoresByPlayer[src.owner] || 0) + add;
            }

            for (const [pidStr, score] of Object.entries(scoresByPlayer)) {
                const pid = +pidStr;
                if (score > bestScore + 0.001) {
                    best = pid; bestScore = score; tied = false;
                } else if (Math.abs(score - bestScore) <= 0.001 && pid !== best) {
                    tied = true;
                }
            }

            if (bestScore <= 0) {
                tile.owner = null;
                tile.contested = false;
            } else if (tied) {
                tile.owner = null;
                tile.contested = true;
            } else {
                tile.owner = best;
                tile.contested = false;
            }
        }
    }
}
