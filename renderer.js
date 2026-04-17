import { COLORS, UNIT_STATS } from './constants.js';

const TARGETABLE_TYPES = new Set(['RL', 'B', 'D', 'M', 'AB']);

export class Renderer {
    constructor(canvas, grid, camera) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.grid = grid;
        this.camera = camera;
        this.hoverTile = null;
        this.buildGhostType = null;
        this.buildGhostLevel = 0;
        this.radarAngle = 0;
        this.time = 0;
        this.settings = { screenShake: true, threatRings: true, hoverRange: true };
        this.multiSelected = [];
    }

    render(gameState) {
        const { ctx, canvas } = this;
        this.time = gameState.gameTime || performance.now();

        this._cw = canvas.clientWidth || canvas.width;
        this._ch = canvas.clientHeight || canvas.height;

        this._computeVisibleTiles();

        const shake = (this.settings.screenShake && gameState.screenShake) || 0;
        const sx = shake ? (Math.random() - 0.5) * shake : 0;
        const sy = shake ? (Math.random() - 0.5) * shake : 0;
        ctx.save();
        ctx.translate(sx, sy);

        ctx.clearRect(-10, -10, this._cw + 20, this._ch + 20);
        this.drawGridBackdrop();
        this.drawTiles(gameState);
        this.drawRangeRing(gameState);
        this.drawBuildGhost(gameState);
        this.drawAllTargetLines(gameState);
        this.drawProjectiles(gameState);
        this.drawParticles(gameState);
        this.drawSelection(gameState);
        this.drawTargetDragPreview(gameState);
        this.drawHitCallouts(gameState);
        if (this.settings.threatRings) this.drawThreatIndicators(gameState);

        ctx.restore();
        this.radarAngle = (this.radarAngle + 0.015) % (Math.PI * 2);
    }

    _computeVisibleTiles() {
        const { canvas, camera, grid } = this;
        const buffer = grid.hexSize * 2 * camera.scale;
        const w = canvas.clientWidth || canvas.width;
        const h = canvas.clientHeight || canvas.height;
        const list = this._visibleTiles || (this._visibleTiles = []);
        list.length = 0;
        for (const tile of grid.tiles.values()) {
            const pos = grid.hexToPixel(tile.q, tile.r);
            const sp = camera.worldToScreen(pos.x, pos.y, w, h);
            if (sp.x < -buffer || sp.x > w + buffer ||
                sp.y < -buffer || sp.y > h + buffer) continue;
            list.push({ tile, sx: sp.x, sy: sp.y });
        }
    }

    drawGridBackdrop() {
        const { ctx } = this;
        const W = this._cw, H = this._ch;
        const grad = ctx.createRadialGradient(
            W / 2, H / 2, H * 0.2,
            W / 2, H / 2, H * 0.9
        );
        grad.addColorStop(0, '#0e1520');
        grad.addColorStop(1, '#05070c');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.04)';
        ctx.lineWidth = 1;
        const step = 40;
        for (let x = 0; x < W; x += step) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = 0; y < H; y += step) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }
        ctx.restore();
    }

    // ------------------------------------------------------------------ TILES
    drawTiles(gameState) {
        const { grid, camera } = this;
        const humanId = gameState.humanId;
        const human = gameState.players[humanId - 1];
        const size = grid.hexSize * camera.scale;

        for (const v of this._visibleTiles) {
            const tile = v.tile;
            const key = `${tile.q},${tile.r}`;
            const visible  = human?.fogVisible.has(key);
            const explored = human?.fogExplored.has(key);

            this.drawHex(v.sx, v.sy, size, tile, { visible, explored, human }, gameState);
        }
    }

    drawHex(x, y, size, tile, fog, gameState) {
        const { ctx } = this;

        // ---- WATER ----
        if (!tile.buildable) {
            this.hexPath(x, y, size);
            const depth = tile.waterDepth || 0;
            const df = Math.min(1, depth / 6);
            ctx.fillStyle = `rgb(${Math.round(10 - df * 4)}, ${Math.round(22 + (1 - df) * 16)}, ${Math.round(40 + (1 - df) * 25)})`;
            ctx.globalAlpha = 0.75;
            ctx.fill();
            ctx.globalAlpha = 1;

            if (depth <= 2) {
                this.hexPath(x, y, size);
                ctx.fillStyle = `rgba(35, 85, 140, ${(0.25 - depth * 0.08).toFixed(2)})`;
                ctx.fill();
            }

            ctx.strokeStyle = COLORS.WATER_BORDER;
            ctx.lineWidth = 0.5;
            this.hexPath(x, y, size);
            ctx.stroke();

            const wave = Math.sin(this.time * 0.001 + tile.q * 0.5 + tile.r * 0.3) * 0.08 + 0.05;
            this.hexPath(x, y, size);
            ctx.fillStyle = `rgba(30, 100, 180, ${wave.toFixed(3)})`;
            ctx.fill();
            return;
        }

        // ---- UNDISCOVERED ----
        if (!fog.explored) {
            this.hexPath(x, y, size);
            ctx.fillStyle = COLORS.UNDISCOVERED;
            ctx.globalAlpha = 0.9;
            ctx.fill();
            ctx.globalAlpha = 1;
            const hash = Math.sin(tile.q * 127.1 + tile.r * 311.7) * 43758.5453;
            if ((hash - Math.floor(hash)) > 0.92) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
                ctx.beginPath();
                ctx.arc(x + ((hash * 3) % 2 - 1) * size * 0.3, y + ((hash * 7) % 2 - 1) * size * 0.3, 1, 0, Math.PI * 2);
                ctx.fill();
            }
            return;
        }

        // ---- MEMORY LAYER ----
        let renderOwner = tile.owner;
        let renderContested = tile.contested;
        let renderStructure = tile.structure;
        let renderHp = tile.hp, renderMax = tile.maxHp;

        if (!fog.visible && fog.human) {
            const mem = fog.human.memory.get(`${tile.q},${tile.r}`);
            if (mem) {
                renderOwner = mem.owner;
                renderContested = mem.contested;
                renderStructure = mem.type ? { type: mem.type, level: mem.level, stats: {} } : null;
                renderHp = mem.hp; renderMax = mem.maxHp;
            } else {
                renderOwner = null; renderContested = false; renderStructure = null;
            }
        }

        // ---- TERRAIN BASE ----
        const biome = tile.biome || 'plains';
        const biomeColor = COLORS.TERRAIN?.[biome] || '#263d22';
        this.hexPath(x, y, size);
        ctx.fillStyle = biomeColor;
        ctx.globalAlpha = fog.visible ? 0.4 : 0.22;
        ctx.fill();

        if (tile.elevation !== undefined) {
            const ev = (tile.elevation - 0.5) * 0.08;
            if (Math.abs(ev) > 0.005) {
                this.hexPath(x, y, size);
                ctx.fillStyle = ev > 0 ? `rgba(255,255,255,${ev.toFixed(3)})` : `rgba(0,0,0,${(-ev).toFixed(3)})`;
                ctx.fill();
            }
        }

        // ---- OWNER OVERLAY ----
        const ownerColor = renderContested ? COLORS.CONTESTED
                         : renderOwner ? COLORS[`PLAYER${renderOwner}`]
                         : null;

        if (ownerColor) {
            this.hexPath(x, y, size);
            ctx.fillStyle = ownerColor;
            ctx.globalAlpha = renderOwner
                ? (fog.visible ? 0.48 : 0.28)
                : (fog.visible ? 0.4 : 0.22);
            ctx.fill();
        }

        // Contested shimmer
        if (renderContested) {
            ctx.save();
            this.hexPath(x, y, size);
            ctx.clip();
            const shimmer = Math.sin(this.time * 0.003 + tile.q + tile.r) * 0.1 + 0.2;
            ctx.globalAlpha = shimmer;
            ctx.strokeStyle = "#ffcc00";
            ctx.lineWidth = 2;
            const step = Math.max(4, size * 0.4);
            for (let i = -size * 2; i < size * 2; i += step) {
                ctx.beginPath();
                ctx.moveTo(x - size + i, y - size);
                ctx.lineTo(x - size + i + size * 2, y + size);
                ctx.stroke();
            }
            ctx.restore();
        }

        ctx.globalAlpha = 1.0;
        const hasBorder = renderOwner || renderContested;
        ctx.strokeStyle = renderContested ? "#ffcc00" : (renderOwner ? "rgba(255,255,255,0.85)" : 'rgba(255,255,255,0.05)');
        ctx.lineWidth = hasBorder ? 1.8 : 0.5;
        ctx.setLineDash(hasBorder ? [] : [2, 2]);
        this.hexPath(x, y, size);
        ctx.stroke();
        ctx.setLineDash([]);

        // Ally tint: secondary inner ring when this tile belongs to a human ally
        if (fog.human && renderOwner && renderOwner !== fog.human.id && !renderContested && gameState.areAllied && gameState.areAllied(renderOwner, fog.human.id)) {
            ctx.save();
            ctx.strokeStyle = COLORS[`PLAYER${fog.human.id}`] || '#00e5ff';
            ctx.globalAlpha = fog.visible ? 0.55 : 0.3;
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 3]);
            this.hexPath(x, y, size * 0.82);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        if (renderStructure) this.drawStructure(x, y, size, tile, renderStructure, renderHp, renderMax, fog.visible, gameState);

        // Handshake badge on ally capitals
        if (fog.visible && fog.human && renderOwner && renderOwner !== fog.human.id
            && renderStructure && renderStructure.type === 'G'
            && gameState.areAllied && gameState.areAllied(renderOwner, fog.human.id)) {
            ctx.save();
            ctx.font = `${size * 0.45}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('\uD83E\uDD1D', x + size * 0.55, y - size * 0.55);
            ctx.restore();
        }

        // Fog overlay for explored-but-not-visible
        if (!fog.visible) {
            this.hexPath(x, y, size);
            ctx.fillStyle = COLORS.MEMORY_TINT;
            ctx.fill();
        }
    }

    hexPath(x, y, size) {
        const { ctx } = this;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = 2 * Math.PI / 6 * (i + 0.5);
            const px = x + size * Math.cos(angle);
            const py = y + size * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    drawStructure(x, y, size, tile, structure, hp, maxHp, isVisible, gameState) {
        const { ctx } = this;

        // ----- Special: procedural bunker for Barracks -----
        if (structure.type === 'B') {
            this.drawBarracksBunker(x, y, size, tile, structure, isVisible, gameState);
        } else {
            ctx.fillStyle = "white";
            ctx.font = `${size * 0.8}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            let icon = "❓";
            switch (structure.type) {
                case 'G':   icon = "🏛️"; break;
                case 'RL':  icon = "🚀"; break;
                case 'AAS': icon = "🛡️"; break;
                case 'MF':  icon = "🏭"; break;
                case 'M':   icon = structure.stats?.transformsToGov ? "🏯" : "🔫"; break;
                case 'D':   icon = "🚁"; break;
                case 'AB':  icon = "✈️"; break;
            }
            ctx.globalAlpha = isVisible ? 1 : 0.55;
            ctx.fillText(icon, x, y);
            ctx.globalAlpha = 1;
        }

        // Level pips
        const lvl = (structure.level || 0) + 1;
        if (lvl > 1) {
            ctx.fillStyle = "gold";
            for (let i = 0; i < lvl; i++) {
                ctx.beginPath();
                ctx.arc(x - size * 0.5 + i * 5, y - size * 0.55, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // HP bar
        if (isVisible && hp < maxHp && maxHp > 0) {
            const barW = size * 1.2;
            const barH = 3;
            ctx.fillStyle = "rgba(255,0,0,0.85)";
            ctx.fillRect(x - barW / 2, y + size * 0.6, barW, barH);
            ctx.fillStyle = hp / maxHp > 0.5 ? "#2ecc71" : "#ffcc00";
            ctx.fillRect(x - barW / 2, y + size * 0.6, barW * (hp / maxHp), barH);
        }

        // Idle animations (only for visible tiles on screen)
        if (isVisible && gameState) {
            this.drawIdleAnim(x, y, size, tile, structure, gameState);
        }
    }

    // ------------------------------------------------------------------ BARRACKS BUNKER
    // Procedural "FOB" look: dark rounded footprint with hazard chevrons,
    // central turret that rotates to aim at current target. All canvas primitives.
    drawBarracksBunker(x, y, size, tile, structure, isVisible, gameState) {
        const { ctx, grid } = this;
        const owner = COLORS[`PLAYER${tile.owner}`] || '#888';
        const alpha = isVisible ? 1 : 0.55;

        // -- FOOTPRINT (rounded rect) --
        const w = size * 1.55;
        const h = size * 1.15;
        const bx = x - w / 2, by = y - h / 2;
        const r = size * 0.22;

        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + w - r, by);
        ctx.quadraticCurveTo(bx + w, by, bx + w, by + r);
        ctx.lineTo(bx + w, by + h - r);
        ctx.quadraticCurveTo(bx + w, by + h, bx + w - r, by + h);
        ctx.lineTo(bx + r, by + h);
        ctx.quadraticCurveTo(bx, by + h, bx, by + h - r);
        ctx.lineTo(bx, by + r);
        ctx.quadraticCurveTo(bx, by, bx + r, by);
        ctx.closePath();

        ctx.fillStyle = 'rgba(18, 20, 24, 0.92)';
        ctx.fill();

        // Chevron hazard stripes clipped inside footprint
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = owner;
        ctx.globalAlpha = alpha * 0.22;
        ctx.lineWidth = 4;
        const step = 8;
        for (let off = -h; off < w + h; off += step * 2) {
            ctx.beginPath();
            ctx.moveTo(bx + off, by + h);
            ctx.lineTo(bx + off + h, by);
            ctx.stroke();
        }
        ctx.restore();

        // Outline
        ctx.strokeStyle = owner;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = alpha;
        ctx.stroke();

        // Corner rivets
        ctx.fillStyle = owner;
        const pad = size * 0.14;
        for (const [cx, cy] of [
            [bx + pad, by + pad],
            [bx + w - pad, by + pad],
            [bx + pad, by + h - pad],
            [bx + w - pad, by + h - pad],
        ]) {
            ctx.beginPath();
            ctx.arc(cx, cy, 1.4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // -- TURRET (rotates toward target or slowly idles) --
        let angle;
        const tgt = structure.target;
        let aiming = false;
        if (tgt) {
            const tgtTile = grid.getTile(tgt.q, tgt.r);
            if (tgtTile) {
                const tp = grid.hexToPixel(tgt.q, tgt.r);
                const mp = grid.hexToPixel(tile.q, tile.r);
                angle = Math.atan2(tp.y - mp.y, tp.x - mp.x);
                aiming = true;
            }
        }
        if (!aiming) angle = (this.time * 0.0006) % (Math.PI * 2);

        const barrelLen = size * 0.62;
        const barrelW   = size * 0.12;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.rotate(angle);

        // Barrel
        ctx.fillStyle = '#2a2d33';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 1;
        ctx.fillRect(size * 0.05, -barrelW / 2, barrelLen, barrelW);
        ctx.strokeRect(size * 0.05, -barrelW / 2, barrelLen, barrelW);

        // Turret dome
        ctx.fillStyle = owner;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1d22';
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.15, 0, Math.PI * 2);
        ctx.fill();

        // Tiny highlight when aiming
        if (aiming) {
            ctx.fillStyle = 'rgba(255, 80, 80, 0.8)';
            ctx.beginPath();
            ctx.arc(size * 0.04, 0, 1.4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    drawIdleAnim(x, y, size, tile, structure, gameState) {
        const { ctx } = this;
        const t = this.time;

        // AAS radar sweep
        if (structure.type === 'AAS' && structure.charge !== undefined) {
            const cap = structure.stats?.chargeCap || 10;
            const chargeRatio = (structure.charge || 0) / cap;
            const angle = (t * 0.002) % (Math.PI * 2);
            ctx.save();
            ctx.globalAlpha = 0.15 + chargeRatio * 0.2;
            ctx.strokeStyle = COLORS[`PLAYER${tile.owner}`] || "#00e5ff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            const radarLen = size * 0.8;
            ctx.lineTo(x + Math.cos(angle) * radarLen, y + Math.sin(angle) * radarLen);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, radarLen, angle - 0.6, angle, false);
            ctx.stroke();
            ctx.restore();
        }

        // Build cooldown "warming up" arc
        if (tile.buildCooldownUntil && gameState && gameState.gameTime < tile.buildCooldownUntil) {
            const total = tile.buildCooldownUntil - tile.buildCooldownStart;
            const elapsed = gameState.gameTime - tile.buildCooldownStart;
            const progress = Math.min(1, elapsed / total);          // 0 → 1 as cooldown expires
            const startAngle = -Math.PI / 2;                        // top of circle
            const endAngle = startAngle + Math.PI * 2 * progress;
            ctx.save();
            // Dim track (full ring)
            ctx.globalAlpha = 0.18;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(x, y, size * 0.72, 0, Math.PI * 2);
            ctx.stroke();
            // Bright fill arc (progress)
            ctx.globalAlpha = 0.75;
            ctx.strokeStyle = COLORS[`PLAYER${tile.owner}`] || '#00e5ff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(x, y, size * 0.72, startAngle, endAngle);
            ctx.stroke();
            // "WARMING UP" text at low zoom doesn't render well; skip label
            ctx.restore();
        }

        // Gov pulse ring
        if (structure.type === 'G') {
            const pulse = Math.sin(t * 0.003) * 0.5 + 0.5;
            ctx.save();
            ctx.globalAlpha = 0.08 + pulse * 0.07;
            ctx.strokeStyle = COLORS[`PLAYER${tile.owner}`] || "#00e5ff";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(x, y, size * (1.2 + pulse * 0.3), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Damaged structure sparks
        if (tile.hp < tile.maxHp * 0.5 && tile.hp > 0) {
            if (Math.random() < 0.03) {
                const sx = x + (Math.random() - 0.5) * size * 0.8;
                const sy = y + (Math.random() - 0.5) * size * 0.8;
                ctx.save();
                ctx.fillStyle = "#ffcc00";
                ctx.globalAlpha = 0.8;
                ctx.beginPath();
                ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // Contested freeze indicator
        if (tile.contested && tile.structure) {
            ctx.save();
            const freezePulse = Math.sin(t * 0.005) * 0.3 + 0.4;
            ctx.strokeStyle = `rgba(255, 200, 0, ${freezePulse})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            this.hexPath(x, y, size * 0.95);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    // ------------------------------------------------------------------ RANGE RING
    drawRangeRing(gameState) {
        if (this.settings.hoverRange && this.hoverTile?.structure
            && this.hoverTile.owner === gameState.humanId
            && this.hoverTile !== gameState.selectedTile) {
            const t = this.hoverTile;
            const s = t.structure.stats;
            if (s.range) {
                const col = s.damage ? "rgba(255, 61, 0, 0.10)" : "rgba(255, 255, 255, 0.08)";
                this.drawHexRing(t.q, t.r, s.range, col);
            }
            const hoverInfR = t.structure._lockedRadius ?? s.radius;
            if (hoverInfR) {
                this.drawHexRing(t.q, t.r, hoverInfR, "rgba(0, 229, 255, 0.08)");
            }
        }

        const tile = gameState.selectedTile;
        if (!tile?.structure) return;
        const s = tile.structure.stats;
        if (s.range) {
            const color = s.damage ? "rgba(255, 61, 0, 0.22)" : "rgba(255, 255, 255, 0.18)";
            this.drawHexRing(tile.q, tile.r, s.range, color);
        }
        const effectiveRadius = tile.structure._lockedRadius ?? s.radius;
        if (effectiveRadius) {
            this.drawHexRing(tile.q, tile.r, effectiveRadius, "rgba(0, 229, 255, 0.18)");
        }
    }

    drawBuildGhost(gameState) {
        if (!this.hoverTile || !this.buildGhostType) return;
        const { ctx, camera, canvas, grid } = this;
        const tile = this.hoverTile;
        const pos = grid.hexToPixel(tile.q, tile.r);
        const sp = camera.worldToScreen(pos.x, pos.y, this._cw, this._ch);
        const size = grid.hexSize * camera.scale;

        let valid = true;
        let color = "rgba(0, 229, 255, 0.85)";
        let fill  = "rgba(0, 229, 255, 0.08)";

        if (!tile.buildable) {
            valid = false;
        } else {
            const isOwn = tile.owner === gameState.humanId;
            const isNeutral = tile.owner == null && !tile.contested;
            if (this.buildGhostType === 'M') {
                const humanVisible = gameState.players[gameState.humanId - 1]?.fogVisible.has(`${tile.q},${tile.r}`);
                valid = (isOwn || isNeutral) && !tile.structure && !tile.contested && humanVisible;
            }
            else valid = isOwn && !tile.structure && !tile.contested;
        }
        if (!valid) { color = "rgba(255, 61, 0, 0.8)"; fill = "rgba(255, 61, 0, 0.1)"; }

        this.hexPath(sp.x, sp.y, size);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (valid && (this.buildGhostType === 'G' || this.buildGhostType === 'B')) {
            const ghostDef = UNIT_STATS[this.buildGhostType];
            const r = ghostDef?.levels?.[this.buildGhostLevel ?? 0]?.radius;
            if (r) {
                this.drawHexRing(tile.q, tile.r, r, "rgba(0, 229, 255, 0.08)");
            }
        }
    }

    drawHexRing(centerQ, centerR, radius, fillColor) {
        const { ctx, canvas, camera, grid } = this;
        ctx.save();
        for (let dq = -radius; dq <= radius; dq++) {
            for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
                if (dq === 0 && dr === 0) continue;
                const q = centerQ + dq;
                const r = centerR + dr;
                if (!grid.tiles.has(`${q},${r}`)) continue;
                const pos = grid.hexToPixel(q, r);
                const sp = camera.worldToScreen(pos.x, pos.y, this._cw, this._ch);
                const size = grid.hexSize * camera.scale;
                this.hexPath(sp.x, sp.y, size * 0.92);
                ctx.fillStyle = fillColor;
                ctx.fill();
            }
        }
        ctx.restore();
    }

    // ------------------------------------------------------------------ TARGETS
    drawAllTargetLines(gameState) {
        const { ctx, canvas, camera, grid } = this;
        const humanId = gameState.humanId;
        ctx.save();
        for (const tile of grid.tiles.values()) {
            if (!tile.structure || tile.owner !== humanId) continue;
            if (!TARGETABLE_TYPES.has(tile.structure.type)) continue;
            const tgt = tile.structure.target;
            if (!tgt) continue;
            const live = grid.getTile(tgt.q, tgt.r);
            if (!live) continue;

            const a = grid.hexToPixel(tile.q, tile.r);
            const b = grid.hexToPixel(live.q, live.r);
            const pa = camera.worldToScreen(a.x, a.y, this._cw, this._ch);
            const pb = camera.worldToScreen(b.x, b.y, this._cw, this._ch);

            ctx.strokeStyle = "rgba(0, 229, 255, 0.55)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();

            ctx.setLineDash([]);
            const s = 8;
            ctx.beginPath();
            ctx.moveTo(pb.x - s, pb.y); ctx.lineTo(pb.x + s, pb.y);
            ctx.moveTo(pb.x, pb.y - s); ctx.lineTo(pb.x, pb.y + s);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ------------------------------------------------------------------ PROJECTILES (per-type visuals)
    drawProjectiles(gameState) {
        const { ctx, camera, canvas } = this;
        for (const p of gameState.projectiles) {
            const sp = camera.worldToScreen(p.x, p.y, this._cw, this._ch);
            const sc = camera.scale;

            // Trail
            if (p.trail && p.trailPts.length > 1) {
                ctx.save();
                for (let i = 0; i < p.trailPts.length - 1; i++) {
                    const a = p.trailPts[i], b = p.trailPts[i + 1];
                    const pa = camera.worldToScreen(a.x, a.y, this._cw, this._ch);
                    const pb = camera.worldToScreen(b.x, b.y, this._cw, this._ch);
                    const alpha = (i / p.trailPts.length) * 0.6;
                    ctx.globalAlpha = alpha;

                    if (p.type === 'rocket') {
                        ctx.strokeStyle = "#ff6a00";
                        ctx.lineWidth = 2.5 * sc;
                    } else if (p.type === 'airstrike') {
                        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
                        ctx.lineWidth = 1.5 * sc;
                    } else if (p.type === 'drone') {
                        ctx.strokeStyle = "rgba(120, 200, 255, 0.7)";
                        ctx.lineWidth = 1 * sc;
                    } else {
                        ctx.strokeStyle = p.color || "white";
                        ctx.lineWidth = 2 * sc;
                    }
                    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
                }
                ctx.globalAlpha = 1;
                ctx.restore();
            }

            // Projectile head
            ctx.save();
            if (p.type === 'rocket') {
                // Cone shape oriented along velocity
                const dx = p.targetX - p.x, dy = p.targetY - p.y;
                const angle = Math.atan2(dy, dx);
                const len = 6 * sc, w = 3 * sc;
                ctx.translate(sp.x, sp.y);
                ctx.rotate(angle);
                ctx.fillStyle = p.color || "#ff6a00";
                ctx.beginPath();
                ctx.moveTo(len, 0);
                ctx.lineTo(-len * 0.3, -w);
                ctx.lineTo(-len * 0.3, w);
                ctx.closePath();
                ctx.fill();
                // Orange glow
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = "rgba(255, 120, 0, 0.3)";
                ctx.beginPath();
                ctx.arc(0, 0, 5 * sc, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'airstrike') {
                // Fast streak with white tip
                const dx = p.targetX - p.x, dy = p.targetY - p.y;
                const angle = Math.atan2(dy, dx);
                const len = 8 * sc, w = 2 * sc;
                ctx.translate(sp.x, sp.y);
                ctx.rotate(angle);
                ctx.fillStyle = "white";
                ctx.beginPath();
                ctx.moveTo(len, 0);
                ctx.lineTo(-len * 0.5, -w);
                ctx.lineTo(-len * 0.5, w);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = p.color || "#ff3d00";
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.ellipse(-len * 0.3, 0, len * 0.4, w * 0.8, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
                ctx.beginPath();
                ctx.arc(0, 0, 6 * sc, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'drone') {
                // Tiny zigzagging dart
                const jitter = Math.sin(this.time * 0.02 + p.x * 0.1) * 2 * sc;
                ctx.fillStyle = "rgba(120, 200, 255, 0.9)";
                ctx.beginPath();
                ctx.arc(sp.x + jitter, sp.y, 2.5 * sc, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = "rgba(120, 200, 255, 0.2)";
                ctx.beginPath();
                ctx.arc(sp.x + jitter, sp.y, 5 * sc, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'militia') {
                // Scrappy, dim tracer
                const jitter = (Math.random() - 0.5) * 2 * sc;
                ctx.fillStyle = p.color || "rgba(255,255,200,0.6)";
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.arc(sp.x + jitter, sp.y + jitter, 2 * sc, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            } else {
                // Ground (Barracks) - bullet dash
                const dx = p.targetX - p.x, dy = p.targetY - p.y;
                const angle = Math.atan2(dy, dx);
                ctx.translate(sp.x, sp.y);
                ctx.rotate(angle);
                ctx.fillStyle = "rgba(255, 255, 200, 0.9)";
                ctx.beginPath();
                ctx.ellipse(0, 0, 4 * sc, 1.5 * sc, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = "rgba(255, 200, 100, 0.25)";
                ctx.beginPath();
                ctx.arc(0, 0, 4 * sc, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    drawParticles(gameState) {
        const { ctx, camera, canvas } = this;
        for (const p of gameState.particles) {
            const sp = camera.worldToScreen(p.x, p.y, this._cw, this._ch);
            const alpha = 1 - p.age / p.life;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, (2 + (p.size || 0)) * camera.scale, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ------------------------------------------------------------------ SELECTION + DRAG PREVIEW
    drawSelection(gameState) {
        const { ctx, canvas } = this;

        if (this.multiSelected && this.multiSelected.length > 0) {
            for (const tile of this.multiSelected) {
                const pos = this.grid.hexToPixel(tile.q, tile.r);
                const sp = this.camera.worldToScreen(pos.x, pos.y, this._cw, this._ch);
                ctx.strokeStyle = "rgba(255, 215, 0, 0.85)";
                ctx.lineWidth = 3;
                this.hexPath(sp.x, sp.y, this.grid.hexSize * 1.1 * this.camera.scale);
                ctx.stroke();
            }
            return;
        }

        if (!gameState.selectedTile) return;
        const pos = this.grid.hexToPixel(gameState.selectedTile.q, gameState.selectedTile.r);
        const sp = this.camera.worldToScreen(pos.x, pos.y, this._cw, this._ch);
        ctx.strokeStyle = "rgba(0, 229, 255, 0.8)";
        ctx.lineWidth = 3;
        this.hexPath(sp.x, sp.y, this.grid.hexSize * 1.1 * this.camera.scale);
        ctx.stroke();
    }

    drawTargetDragPreview(gameState) {
        const { ctx, canvas } = this;
        if (!gameState.isTargeting || !gameState.currentTargetSource) return;
        const startPos = this.grid.hexToPixel(gameState.currentTargetSource.q, gameState.currentTargetSource.r);
        const ss = this.camera.worldToScreen(startPos.x, startPos.y, this._cw, this._ch);
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "rgba(255, 61, 0, 0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ss.x, ss.y);
        ctx.lineTo(gameState.mousePos.x, gameState.mousePos.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // ------------------------------------------------------------------ CALLOUTS + THREAT
    drawHitCallouts(gameState) {
        const { ctx, canvas, camera, grid } = this;
        const now = gameState.gameTime || performance.now();
        for (const ev of gameState.events) {
            if (ev.kind !== 'hit') continue;
            const tile = grid.getTile(ev.tile.q, ev.tile.r);
            if (!tile) continue;
            const pos = grid.hexToPixel(tile.q, tile.r);
            const sp = camera.worldToScreen(pos.x, pos.y, this._cw, this._ch);
            const age = (now - ev.t) / 1500;
            if (age > 1) continue;
            const alpha = 1 - age;
            const radius = 30 + age * 50;
            ctx.save();
            ctx.strokeStyle = `rgba(255, 61, 0, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    drawThreatIndicators(gameState) {
        const { ctx, canvas, camera, grid } = this;
        const now = gameState.gameTime || performance.now();
        const humanId = gameState.humanId;
        const sz = grid.hexSize * camera.scale;

        for (const v of this._visibleTiles) {
            const tile = v.tile;
            if (tile.owner !== humanId || !tile.structure) continue;
            const timeSinceDmg = now - (tile.lastDamageTime || 0);
            if (timeSinceDmg > 2000 || timeSinceDmg <= 0) continue;

            const pulse = Math.sin(now * 0.008) * 0.3 + 0.5;
            ctx.save();
            ctx.strokeStyle = `rgba(255, 61, 0, ${pulse * (1 - timeSinceDmg / 2000)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(v.sx, v.sy, sz * 1.3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // Incoming projectile threat preview
        for (const proj of gameState.projectiles) {
            if (proj.owner === humanId) continue;
            const tile = grid.getTile(proj.targetQR.q, proj.targetQR.r);
            if (!tile || tile.owner !== humanId) continue;

            const pos = grid.hexToPixel(tile.q, tile.r);
            const sp = camera.worldToScreen(pos.x, pos.y, this._cw, this._ch);

            ctx.save();
            ctx.strokeStyle = "rgba(255, 61, 0, 0.3)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, sz * 1.1, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
    }

    // ------------------------------------------------------------------ MINIMAP
    renderMinimap(miniCanvas, gameState) {
        const mctx = miniCanvas.getContext('2d');
        const W = miniCanvas.width, H = miniCanvas.height;
        mctx.clearRect(0, 0, W, H);

        mctx.fillStyle = '#060a12';
        mctx.fillRect(0, 0, W, H);
        mctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
        mctx.strokeRect(0.5, 0.5, W - 1, H - 1);

        const r = this.grid.radius;
        const ex = this.grid.hexSize * Math.sqrt(3) * (r + r / 2);
        const ey = this.grid.hexSize * 3 / 2 * r;
        const scale = Math.min(W, H) / (Math.max(ex, ey) * 2.2);
        const cx = W / 2, cy = H / 2;
        this._miniScale = scale;
        this._miniCx = cx;
        this._miniCy = cy;

        const humanId = gameState.humanId;
        const human = gameState.players[humanId - 1];

        for (const tile of this.grid.tiles.values()) {
            const pos = this.grid.hexToPixel(tile.q, tile.r);
            const px = cx + pos.x * scale;
            const py = cy + pos.y * scale;

            if (!tile.buildable) {
                const depth = tile.waterDepth || 0;
                const df = Math.min(1, depth / 5);
                mctx.fillStyle = `rgb(${Math.round(10 - df * 3)}, ${Math.round(22 + (1 - df) * 12)}, ${Math.round(40 + (1 - df) * 18)})`;
                mctx.globalAlpha = 0.5;
                mctx.fillRect(px - 1.5, py - 1.5, 3, 3);
                mctx.globalAlpha = 1;
                continue;
            }

            const key = `${tile.q},${tile.r}`;
            if (!human?.fogExplored.has(key)) continue;
            const fromMem = !human.fogVisible.has(key);
            const mem = human.memory.get(key);

            let owner = tile.owner, contested = tile.contested, hasStruct = !!tile.structure;
            if (fromMem && mem) {
                owner = mem.owner; contested = mem.contested; hasStruct = !!mem.type;
            } else if (fromMem) {
                owner = null; contested = false; hasStruct = false;
            }

            let color = COLORS.TERRAIN?.[tile.biome] || '#1a1f2e';
            if (contested) color = '#5d4037';
            else if (owner) color = COLORS[`PLAYER${owner}`];

            mctx.fillStyle = color;
            mctx.globalAlpha = fromMem ? 0.45 : 0.9;
            mctx.fillRect(px - 1.5, py - 1.5, 3, 3);

            if (hasStruct) {
                mctx.globalAlpha = 1;
                mctx.fillStyle = 'white';
                mctx.fillRect(px - 0.5, py - 0.5, 1, 1);
            }
        }
        mctx.globalAlpha = 1;

        // Viewport rectangle
        const mainW = this.canvas.clientWidth || this.canvas.width;
        const mainH = this.canvas.clientHeight || this.canvas.height;
        const vw = mainW / this.camera.scale * scale;
        const vh = mainH / this.camera.scale * scale;
        const vx = cx + (-this.camera.x) * scale - vw / 2;
        const vy = cy + (-this.camera.y) * scale - vh / 2;
        mctx.strokeStyle = 'rgba(0, 229, 255, 0.8)';
        mctx.lineWidth = 1;
        mctx.strokeRect(vx, vy, vw, vh);

        // Radar sweep
        mctx.save();
        const sweepGrad = mctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) / 2);
        sweepGrad.addColorStop(0, 'rgba(0, 229, 255, 0.22)');
        sweepGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
        mctx.fillStyle = sweepGrad;
        mctx.beginPath();
        mctx.moveTo(cx, cy);
        mctx.arc(cx, cy, Math.max(W, H), this.radarAngle - 0.4, this.radarAngle);
        mctx.closePath();
        mctx.fill();
        mctx.restore();
    }
}
