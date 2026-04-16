import { COLORS } from './constants.js';

const TARGETABLE_TYPES = new Set(['RL', 'B', 'D', 'M']);

export class Renderer {
    constructor(canvas, grid, camera) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.grid = grid;
        this.camera = camera;
    }

    render(gameState) {
        const { ctx, canvas } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        this.drawTiles(gameState);
        this.drawAllTargetLines(gameState);
        this.drawProjectiles(gameState);
        this.drawUI(gameState);
    }

    drawTiles(gameState) {
        const { ctx, canvas, camera, grid } = this;
        const width = canvas.width;
        const height = canvas.height;

        for (const tile of grid.tiles.values()) {
            const pos = grid.hexToPixel(tile.q, tile.r);
            const screenPos = camera.worldToScreen(pos.x, pos.y, width, height);

            const buffer = grid.hexSize * 2 * camera.scale;
            if (screenPos.x < -buffer || screenPos.x > width + buffer ||
                screenPos.y < -buffer || screenPos.y > height + buffer) {
                continue;
            }

            this.drawHex(screenPos.x, screenPos.y, grid.hexSize * camera.scale, tile, gameState);
        }
    }

    drawHex(x, y, size, tile, gameState) {
        const { ctx } = this;
        const ownerColor = tile.contested ? COLORS.CONTESTED
                         : tile.owner ? COLORS[`PLAYER${tile.owner}`]
                         : COLORS.NEUTRAL;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = 2 * Math.PI / 6 * (i + 0.5);
            const px = x + size * Math.cos(angle);
            const py = y + size * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();

        ctx.fillStyle = ownerColor;
        ctx.globalAlpha = tile.owner ? 0.6 : (tile.contested ? 0.45 : 0.1);
        ctx.fill();

        // Diagonal stripes for contested tiles (visible caution pattern).
        if (tile.contested) {
            ctx.save();
            ctx.clip();
            ctx.globalAlpha = 0.35;
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
        const hasBorder = tile.owner || tile.contested;
        ctx.strokeStyle = tile.contested ? "#ffcc00" : (tile.owner ? "white" : 'rgba(255,255,255,0.05)');
        ctx.lineWidth = hasBorder ? 2 : 0.5;
        ctx.setLineDash(hasBorder ? [] : [2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (tile.structure) this.drawStructure(x, y, size, tile);
    }

    drawStructure(x, y, size, tile) {
        const { ctx } = this;
        ctx.fillStyle = "white";
        ctx.font = `${size * 0.8}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        let icon = "❓";
        switch (tile.structure.type) {
            case 'G':   icon = "🏛️"; break;
            case 'RL':  icon = "🚀"; break;
            case 'AAS': icon = "🛡️"; break;
            case 'MF':  icon = "🏭"; break;
            case 'B':   icon = "🪖"; break;
            case 'M':   icon = tile.structure.stats.transformsToGov ? "🏯" : "🔫"; break;
            case 'D':   icon = "🚁"; break;
        }

        ctx.fillText(icon, x, y);

        // Level dots (top-right)
        const lvl = (tile.structure.level || 0) + 1;
        if (lvl > 1) {
            ctx.fillStyle = "gold";
            for (let i = 0; i < lvl; i++) {
                ctx.beginPath();
                ctx.arc(x - size * 0.5 + i * 5, y - size * 0.55, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // HP bar if damaged
        if (tile.hp < tile.maxHp) {
            const barW = size * 1.2;
            const barH = 3;
            ctx.fillStyle = "red";
            ctx.fillRect(x - barW / 2, y + size * 0.6, barW, barH);
            ctx.fillStyle = "green";
            ctx.fillRect(x - barW / 2, y + size * 0.6, barW * (tile.hp / tile.maxHp), barH);
        }
    }

    // Draws a subtle dashed line from every player-1 structure that has an assigned target
    // to that target tile, so the player can see what's locked on at a glance.
    drawAllTargetLines(gameState) {
        const { ctx, canvas, camera, grid } = this;
        ctx.save();
        for (const tile of grid.tiles.values()) {
            if (!tile.structure || tile.owner !== 1) continue;
            if (!TARGETABLE_TYPES.has(tile.structure.type)) continue;
            const tgt = tile.structure.target;
            if (!tgt) continue;
            const live = grid.getTile(tgt.q, tgt.r);
            if (!live) continue;

            const a = grid.hexToPixel(tile.q, tile.r);
            const b = grid.hexToPixel(live.q, live.r);
            const pa = camera.worldToScreen(a.x, a.y, canvas.width, canvas.height);
            const pb = camera.worldToScreen(b.x, b.y, canvas.width, canvas.height);

            ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();

            // Small crosshair at target
            ctx.setLineDash([]);
            const s = 8;
            ctx.beginPath();
            ctx.moveTo(pb.x - s, pb.y); ctx.lineTo(pb.x + s, pb.y);
            ctx.moveTo(pb.x, pb.y - s); ctx.lineTo(pb.x, pb.y + s);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawProjectiles(gameState) {
        const { ctx, camera, canvas } = this;
        const width = canvas.width;
        const height = canvas.height;

        gameState.projectiles.forEach(p => {
            const screenPos = camera.worldToScreen(p.x, p.y, width, height);
            ctx.fillStyle = p.color || "white";
            ctx.beginPath();
            const size = (p.type === 'ground' ? 2 : 3) * camera.scale;
            ctx.arc(screenPos.x, screenPos.y, size, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    drawUI(gameState) {
        const { ctx, canvas } = this;

        if (gameState.selectedTile) {
            const pos = this.grid.hexToPixel(gameState.selectedTile.q, gameState.selectedTile.r);
            const screenPos = this.camera.worldToScreen(pos.x, pos.y, canvas.width, canvas.height);
            ctx.strokeStyle = "rgba(0, 229, 255, 0.8)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = 2 * Math.PI / 6 * (i + 0.5);
                const px = screenPos.x + this.grid.hexSize * 1.1 * this.camera.scale * Math.cos(angle);
                const py = screenPos.y + this.grid.hexSize * 1.1 * this.camera.scale * Math.sin(angle);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
        }

        // Active target-drag preview line.
        if (gameState.isTargeting && gameState.currentTargetSource) {
            const startPos = this.grid.hexToPixel(gameState.currentTargetSource.q, gameState.currentTargetSource.r);
            const startScreen = this.camera.worldToScreen(startPos.x, startPos.y, canvas.width, canvas.height);

            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = "rgba(255, 61, 0, 0.75)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(startScreen.x, startScreen.y);
            ctx.lineTo(gameState.mousePos.x, gameState.mousePos.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}
