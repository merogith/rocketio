import { Hex, HexGrid, Camera } from './hexGrid.js';
import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { UNIT_STATS } from './constants.js';

const canvas = document.getElementById('gameCanvas');
const grid = new HexGrid(45, 30); // Very big map as requested
const camera = new Camera();
const game = new Game(grid);
const renderer = new Renderer(canvas, grid, camera);

// UI Elements
const goldEl = document.getElementById('gold-count');
const tileEl = document.getElementById('tile-count');
const missileEl = document.getElementById('missile-count');
const buildBtns = document.querySelectorAll('.build-btn');
const infoPanel = document.getElementById('info-panel');
const infoContent = document.getElementById('info-content');
const upgradeBtn = document.getElementById('upgrade-btn');
const closeInfoBtn = document.getElementById('close-info');
const clearTargetBtn = document.getElementById('clear-target-btn');

// Which structure types accept an assigned attack-target.
const TARGETABLE_TYPES = new Set(['RL', 'B', 'D', 'M']);

let selectedBuildType = null;
let isDragging = false;
let dragStartPos = { x: 0, y: 0 };
let didDrag = false;
let lastMousePos = { x: 0, y: 0 };
let isRightClickDragging = false;
const keys = {};

function isAttacker(tile) {
    if (!tile?.structure) return false;
    if (!TARGETABLE_TYPES.has(tile.structure.type)) return false;
    const s = tile.structure.stats;
    return !!(s.damage && s.range);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Init Game
game.start(8);

// Center camera on Player 1
const p1Start = Array.from(grid.tiles.values()).find(t => t.owner === 1);
if (p1Start) {
    const pos = grid.hexToPixel(p1Start.q, p1Start.r);
    camera.x = -pos.x;
    camera.y = -pos.y;
}

// Input Handling
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click
        const worldPos = camera.screenToWorld(e.clientX, e.clientY, canvas.width, canvas.height);
        const hex = grid.pixelToHex(worldPos.x, worldPos.y);
        const tile = grid.getTile(hex.q, hex.r);

        if (tile) {
            if (selectedBuildType) {
                const success = game.buildStructure(tile, selectedBuildType, 1);
                if (!success) {
                    if (tile.contested) showNoti("Tile is contested — cannot build", "error");
                    else showNoti("Insufficient gold or limit reached", "error");
                }
                resetSelection();
            } else if (isAttacker(tile) && tile.owner === 1) {
                // Start target-drag from any owned attacker.
                game.isTargeting = true;
                game.currentTargetSource = tile;
                selectTile(tile); // also open info
            } else {
                selectTile(tile);
            }
        }
        isDragging = true;
        didDrag = false;
        dragStartPos = { x: e.clientX, y: e.clientY };
    } else if (e.button === 2) {
        isRightClickDragging = true;
    }
    lastMousePos = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mousemove', (e) => {
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;

    if (isRightClickDragging) camera.pan(dx, dy);
    if (isDragging) {
        const ddx = e.clientX - dragStartPos.x;
        const ddy = e.clientY - dragStartPos.y;
        if (Math.hypot(ddx, ddy) > 5) didDrag = true;
    }

    game.mousePos = { x: e.clientX, y: e.clientY };
    lastMousePos = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mouseup', (e) => {
    if (game.isTargeting && game.currentTargetSource) {
        const src = game.currentTargetSource;
        const worldPos = camera.screenToWorld(e.clientX, e.clientY, canvas.width, canvas.height);
        const hex = grid.pixelToHex(worldPos.x, worldPos.y);
        const targetTile = grid.getTile(hex.q, hex.r);

        // Only treat it as a target-assign if user actually dragged away, AND target is not the source.
        if (didDrag && targetTile && targetTile !== src) {
            if (Hex.distance(src, targetTile) <= src.structure.stats.range) {
                if (game.setAssignedTarget(src, targetTile)) {
                    showNoti(`Target set: (${targetTile.q}, ${targetTile.r})`, "success");
                    selectTile(src);
                }
            } else {
                showNoti("Target out of range", "error");
            }
        }
    }

    isDragging = false;
    isRightClickDragging = false;
    game.isTargeting = false;
});

window.addEventListener('keydown', e => {
    const code = e.code;
    const key = e.key;
    keys[code] = true;
    keys[key.toLowerCase()] = true; // Fallback for various keyboards
    
    console.log(`Key Pressed: ${code} (${key})`);

    // Numeric shortcuts 1-8
    if (code.startsWith('Digit') || (parseInt(key) >= 1 && parseInt(key) <= 8)) {
        const num = parseInt(code.replace('Digit', '')) || parseInt(key);
        if (num >= 1 && num <= 8) {
            const btn = buildBtns[num - 1];
            if (btn) {
                console.log(`Switching build to: ${btn.dataset.type}`);
                btn.click();
            }
        }
    }
});

window.addEventListener('keyup', e => {
    keys[e.code] = false;
    keys[e.key.toLowerCase()] = false;
});

function handleKeyboard() {
    const speed = 10;
    if (keys['KeyW'] || keys['ArrowUp'] || keys['w']) camera.y += speed / camera.scale;
    if (keys['KeyS'] || keys['ArrowDown'] || keys['s']) camera.y -= speed / camera.scale;
    if (keys['KeyA'] || keys['ArrowLeft'] || keys['a']) camera.x += speed / camera.scale;
    if (keys['KeyD'] || keys['ArrowRight'] || keys['d']) camera.x -= speed / camera.scale;
}

canvas.addEventListener('wheel', (e) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    camera.zoom(delta, e.clientX, e.clientY, canvas.width, canvas.height);
}, { passive: false });

// UI Interaction
buildBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        buildBtns.forEach(b => b.classList.remove('active'));
        if (selectedBuildType === btn.dataset.type) {
            selectedBuildType = null;
        } else {
            selectedBuildType = btn.dataset.type;
            btn.classList.add('active');
            infoPanel.classList.add('hidden'); // Close info if building
        }
    });
});

function selectTile(tile) {
    game.selectedTile = tile;
    if (!tile.structure) {
        if (tile.contested) {
            infoPanel.classList.remove('hidden');
            infoContent.innerHTML = `<h4>Contested Tile</h4><p>Neither player has the higher influence here. Nobody can build until the balance is broken.</p>`;
            upgradeBtn.classList.add('hidden');
            clearTargetBtn.classList.add('hidden');
        } else {
            infoPanel.classList.add('hidden');
        }
        return;
    }

    infoPanel.classList.remove('hidden');
    const stats = tile.structure.stats;
    const isOwn = tile.owner === 1;
    const attacker = isAttacker(tile);

    // Target readout
    let targetLine = '';
    if (attacker) {
        const tgt = tile.structure.target;
        if (tgt) {
            const live = grid.getTile(tgt.q, tgt.r);
            const inRange = live && Hex.distance(tile, live) <= stats.range;
            targetLine = `<p class="target-line">Target: (${tgt.q}, ${tgt.r}) ${inRange ? '' : '<span class="oor">OUT OF RANGE → auto</span>'}</p>`;
        } else {
            targetLine = `<p class="target-line">Target: <span class="auto">AUTO</span></p>`;
        }
    }

    const influence = stats.influence ? `<p>Influence: ${stats.influence}</p>` : '';
    const radius    = stats.radius    ? `<p>Radius: ${stats.radius}</p>` : '';
    const intervalSec = stats.interval ? `<p>Fire Rate: ${(stats.interval/1000).toFixed(0)}s</p>`
                      : stats.rechargeInterval ? `<p>Recharge: ${(stats.rechargeInterval/1000).toFixed(0)}s</p>`
                      : stats.produceInterval  ? `<p>Cycle: ${(stats.produceInterval/1000).toFixed(0)}s</p>` : '';
    const missiles = tile.structure.type === 'AAS' ? `<p>Intercept Charge: ${tile.structure.charge || 0}/10</p>` : '';
    const hint = (attacker && isOwn) ? `<p class="hint">Drag to a tile to assign target.</p>` : '';

    infoContent.innerHTML = `
        <h4>${UNIT_STATS[tile.structure.type].name} (Lvl ${tile.structure.level + 1})</h4>
        <p>Owner: P${tile.owner}</p>
        <p>HP: ${Math.round(tile.hp)} / ${tile.maxHp}</p>
        ${stats.range  ? `<p>Range: ${stats.range}</p>` : ''}
        ${stats.damage ? `<p>Damage: ${stats.damage}</p>` : ''}
        ${radius}
        ${influence}
        ${intervalSec}
        ${missiles}
        ${targetLine}
        ${hint}
    `;

    // Clear-target button
    if (attacker && isOwn && tile.structure.target) {
        clearTargetBtn.classList.remove('hidden');
        clearTargetBtn.onclick = () => {
            game.clearAssignedTarget(tile);
            showNoti("Target cleared — back to auto", "success");
            selectTile(tile);
        };
    } else {
        clearTargetBtn.classList.add('hidden');
    }

    // Upgrade button
    const nextLevel = UNIT_STATS[tile.structure.type].levels?.[tile.structure.level + 1];
    if (nextLevel && isOwn) {
        upgradeBtn.classList.remove('hidden');
        upgradeBtn.innerText = `UPGRADE ($${nextLevel.cost})`;
        upgradeBtn.onclick = () => {
            if (game.players[0].gold >= nextLevel.cost) {
                game.players[0].gold -= nextLevel.cost;
                tile.structure.level++;
                tile.structure.stats = nextLevel;
                tile.maxHp = nextLevel.hp || tile.maxHp;
                tile.hp   = nextLevel.hp || tile.hp;
                // M3 transforms into a gov: drop attack target, refresh borders.
                if (tile.structure.type === 'M' && nextLevel.transformsToGov) {
                    tile.structure.target = null;
                }
                game.updateBorders();
                selectTile(tile);
            } else {
                showNoti("Not enough gold", "error");
            }
        };
    } else {
        upgradeBtn.classList.add('hidden');
    }
}

function resetSelection() {
    selectedBuildType = null;
    buildBtns.forEach(b => b.classList.remove('active'));
}

closeInfoBtn.onclick = () => infoPanel.classList.add('hidden');

function showNoti(msg, type) {
    const noti = document.createElement('div');
    noti.className = `noti ${type} glass`;
    noti.innerText = msg;
    document.getElementById('notis').appendChild(noti);
    setTimeout(() => noti.remove(), 3000);
}

// AI Players — build, upgrade, and harass using new rules.
function updateAI(time) {
    game.players.forEach(p => {
        if (p.id === 1) return;
        if (Math.random() >= 0.04) return;

        const myTiles = Array.from(grid.tiles.values()).filter(t => t.owner === p.id);
        if (myTiles.length === 0) return;

        // Occasionally upgrade an existing structure.
        if (Math.random() < 0.35) {
            const withStruct = myTiles.filter(t => t.structure);
            const upgradable = withStruct.filter(t => {
                const lvls = UNIT_STATS[t.structure.type].levels;
                return lvls && lvls[t.structure.level + 1];
            });
            if (upgradable.length) {
                const t = upgradable[Math.floor(Math.random() * upgradable.length)];
                const next = UNIT_STATS[t.structure.type].levels[t.structure.level + 1];
                if (p.gold >= next.cost) {
                    p.gold -= next.cost;
                    t.structure.level++;
                    t.structure.stats = next;
                    t.maxHp = next.hp || t.maxHp;
                    t.hp   = next.hp || t.hp;
                    if (t.structure.type === 'M' && next.transformsToGov) t.structure.target = null;
                    game.updateBorders();
                    return;
                }
            }
        }

        // Edge tiles: own tiles with at least one neutral neighbor -> best for placing govs.
        const edgeTiles = myTiles.filter(t => !t.structure).filter(t => {
            const n = new Hex(t.q, t.r).getNeighbors();
            return n.some(h => {
                const nt = grid.getTile(h.q, h.r);
                return nt && nt.owner == null && !nt.contested;
            });
        });

        const empty = myTiles.filter(t => !t.structure);
        const candidate = edgeTiles.length ? edgeTiles[Math.floor(Math.random() * edgeTiles.length)]
                                           : empty[Math.floor(Math.random() * empty.length)];
        if (!candidate) return;

        // Pick structure based on gold budget and strategic need.
        let type = 'G';
        const r = Math.random();
        if (p.gold > 600) type = r < 0.3 ? 'G' : r < 0.55 ? 'RL' : r < 0.75 ? 'AAS' : r < 0.9 ? 'MF' : 'B';
        else if (p.gold > 300) type = r < 0.4 ? 'RL' : r < 0.7 ? 'G' : 'AAS';
        else type = r < 0.5 ? 'MF' : 'RL';

        game.buildStructure(candidate, type, p.id);
    });
}

let lastInfoRefresh = 0;

function loop(time) {
    handleKeyboard();
    game.update(time);
    updateAI(time);
    renderer.render(game);

    const p1 = game.players[0];
    goldEl.innerText = Math.floor(p1.gold);
    tileEl.innerText = p1.tileCount;
    missileEl.innerText = p1.missiles;

    // Live refresh of the info panel every 400ms while open.
    if (game.selectedTile && !infoPanel.classList.contains('hidden') && time - lastInfoRefresh > 400) {
        selectTile(game.selectedTile);
        lastInfoRefresh = time;
    }

    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
