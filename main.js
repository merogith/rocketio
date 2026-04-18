import { Hex, HexGrid, Camera } from './hexGrid.js';
import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { UNIT_STATS, GAME_CONFIG, VICTORY_MODES, COLORS, DIPLOMACY } from './constants.js';
import { TUTORIAL_PAGES } from './tutorial.js';
import { Input } from './input.js';
import { updateAI } from './ai.js';
import { SFX } from './sfx.js';

// ============================================================================
//  DOM
// ============================================================================
const canvas = document.getElementById('gameCanvas');
const miniCanvas = document.getElementById('minimap');
const appEl = document.getElementById('app');
const homepageEl = document.getElementById('homepage');
const tutorialOverlay = document.getElementById('tutorial-overlay');
const tutBody = document.getElementById('tutorial-body');
const tutStepLabel = document.getElementById('tut-step-label');
const tutProgressFill = document.getElementById('tut-progress-fill');
const tutPrev = document.getElementById('tut-prev');
const tutNext = document.getElementById('tut-next');

const goldEl = document.getElementById('gold-count');
const tileEl = document.getElementById('tile-count');
const missileEl = document.getElementById('missile-count');
const goldRateEl = document.getElementById('gold-rate');
const missileRateEl = document.getElementById('missile-rate');
const buildBtns = document.querySelectorAll('.build-btn');
const infoPanel = document.getElementById('info-panel');
const infoContent = document.getElementById('info-content');
const upgradeBtn = document.getElementById('upgrade-btn');
const demolishBtn = document.getElementById('demolish-btn');
const closeInfoBtn = document.getElementById('close-info');
const clearTargetBtn = document.getElementById('clear-target-btn');
const upgradeAllBtn = document.getElementById('upgrade-all-btn');
const playerLabelEl = document.getElementById('player-label');
const threatEl = document.getElementById('threat-count');
const scoreboardEl = document.getElementById('scoreboard');
const minimapStatsLabelEl = document.getElementById('minimap-stats-label');
const minimapStatsLine1El = document.getElementById('minimap-stats-line1');
const minimapStatsLine2El = document.getElementById('minimap-stats-line2');
const minimapStatsPrevBtn = document.getElementById('minimap-stats-prev');
const minimapStatsNextBtn = document.getElementById('minimap-stats-next');
const endOverlay = document.getElementById('end-overlay');
const endTitle = document.getElementById('end-title');
const endSub = document.getElementById('end-sub');
const endStats = document.getElementById('end-stats');
const endRestart = document.getElementById('end-restart');
const buildModeBanner = document.getElementById('build-mode-banner');
const hoverChip = document.getElementById('hover-chip');
const pauseOverlay = document.getElementById('pause-overlay');
const gameMenu = document.getElementById('game-menu');
const settingsOverlay = document.getElementById('settings-overlay');
const combatLogEntries = document.getElementById('combat-log-entries');
const buildTooltip = document.getElementById('build-tooltip');
const diplomacyBtn = document.getElementById('diplomacy-btn');
const diplomacyBadge = document.getElementById('diplomacy-badge');
const diplomacyPanel = document.getElementById('diplomacy-panel');
const diplomacyList = document.getElementById('diplomacy-list');
const diplomacyCapUsed = document.getElementById('diplomacy-cap-used');
const diplomacyCapMax = document.getElementById('diplomacy-cap-max');
const diplomacyCloseBtn = document.getElementById('diplomacy-close');
const playerPortraitEl = document.getElementById('player-portrait');

const TARGETABLE_TYPES = new Set(['RL', 'B', 'D', 'M', 'AB']);

// ============================================================================
//  WORLD
// ============================================================================
let grid, game, renderer;
const camera = new Camera();

let selectedBuildType = null;
let selectedBuildLevel = 0;
let isDragging = false;
let dragStartPos = { x: 0, y: 0 };
let didDrag = false;
let lastMousePos = { x: 0, y: 0 };
let isRightClickDragging = false;
let gameMenuOpen = false;
let lastLogLength = 0;
let dragPaintedHexes = new Set();
let dragPaintWarned = false;
let multiSelected = [];
let loopRunning = false;
let prevSpeedBeforePause = 1;

function initWorld(mapSize, mapStyle, playerCount, playerName, victoryConfig, difficulty = 'normal') {
    const radius = GAME_CONFIG.MAP_RADII[mapSize] || GAME_CONFIG.MAP_RADII.medium;
    grid = new HexGrid(radius, 30, mapStyle, playerCount);
    game = new Game(grid);
    game.aiDifficulty = difficulty;
    game.diplomacyEnabled = Input.getSetting('diplomacyEnabled') !== false;
    renderer = new Renderer(canvas, grid, camera);
    renderer.settings.screenShake = Input.getSetting('screenShake');
    renderer.settings.threatRings = Input.getSetting('threatRings');
    renderer.settings.hoverRange = Input.getSetting('hoverRange') !== false;
    renderer.settings.projectileVisual = getProjectileVisualSetting();

    camera.x = 0; camera.y = 0; camera.scale = 0.6;

    game.start(playerCount, playerName, victoryConfig);

    const p1Start = Array.from(grid.tiles.values()).find(t => t.owner === 1);
    if (p1Start) {
        const pos = grid.hexToPixel(p1Start.q, p1Start.r);
        camera.x = -pos.x; camera.y = -pos.y;
    }

    playerLabelEl.textContent = game.players[0].name;
    if (playerPortraitEl) {
        playerPortraitEl.innerHTML = buildPortraitSvg(game.players[0], 28);
        playerPortraitEl.classList.remove('hidden');
    }
    updateDiplomacyBtnVisibility();
    lastLogLength = 0;
    lastDiploEventsLength = 0;
    _notifiedLockExpired.clear();
    combatLogEntries.innerHTML = '';
    lastDamageTakenSample = 0;
    musicIntensitySmoothed = 0;
}

function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function isAttacker(tile) {
    if (!tile?.structure) return false;
    if (!TARGETABLE_TYPES.has(tile.structure.type)) return false;
    const s = tile.structure.stats;
    return !!(s.damage && s.range);
}

// ============================================================================
//  INIT INPUT
// ============================================================================
Input.init();

// ============================================================================
//  HOMEPAGE WIRING
// ============================================================================
let selectedPlayerCount = 4;
let selectedMapSize = 'medium';
let selectedMapStyle = 'pangaea';
let selectedVictoryMode = 'conquest';
let selectedVictoryParam = null;
let selectedDifficulty = 'normal';
let commanderName = 'COMMANDER';

function wireOptionRow(rowId, callback) {
    document.querySelectorAll(`#${rowId} .option-btn`).forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll(`#${rowId} .option-btn`).forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            callback(btn.dataset.value);
        });
    });
}

wireOptionRow('player-count-row', v => { selectedPlayerCount = parseInt(v); });
wireOptionRow('map-size-row', v => { selectedMapSize = v; });
wireOptionRow('map-style-row', v => { selectedMapStyle = v; });
wireOptionRow('difficulty-row', v => { selectedDifficulty = v; });
wireOptionRow('victory-mode-row', v => {
    selectedVictoryMode = v;
    updateVictorySubPicker(v);
});

function updateVictorySubPicker(mode) {
    const sub = document.getElementById('victory-sub-picker');
    sub.innerHTML = '';
    sub.classList.add('hidden');
    selectedVictoryParam = null;

    const modeDef = VICTORY_MODES[mode.toUpperCase()];
    if (!modeDef) return;

    if (modeDef.options) {
        sub.classList.remove('hidden');
        modeDef.options.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = `option-btn${i === modeDef.options.indexOf(modeDef.defaultPct || modeDef.defaultN || modeDef.defaultMin) ? ' selected' : ''}`;
            if (mode === 'domination') {
                btn.textContent = `${Math.round(opt * 100)}%`;
                btn.dataset.value = opt;
                if (opt === modeDef.defaultPct) { btn.classList.add('selected'); selectedVictoryParam = opt; }
            } else if (mode === 'blitz') {
                btn.textContent = opt;
                btn.dataset.value = opt;
                if (opt === modeDef.defaultN) { btn.classList.add('selected'); selectedVictoryParam = opt; }
            } else if (mode === 'last_stand') {
                btn.textContent = `${opt}m`;
                btn.dataset.value = opt;
                if (opt === modeDef.defaultMin) { btn.classList.add('selected'); selectedVictoryParam = opt; }
            }
            btn.addEventListener('click', () => {
                sub.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedVictoryParam = parseFloat(btn.dataset.value);
            });
            sub.appendChild(btn);
        });
    }
}

document.getElementById('play-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('player-name');
    commanderName = (nameInput.value || '').trim().toUpperCase() || 'COMMANDER';
    homepageEl.classList.add('hidden');
    appEl.classList.remove('hidden');

    SFX.init();
    SFX.setSfxVolume(Input.getSetting('sfxVolume') ?? 0.7);
    SFX.setMusicVolume(Input.getSetting('musicVolume') ?? 0.7);
    SFX.setSfxEnabled(Input.getSetting('sfxEnabled') !== false);
    SFX.setMusicEnabled(Input.getSetting('musicEnabled') !== false);

    const victoryConfig = { mode: selectedVictoryMode, param: selectedVictoryParam };
    initWorld(selectedMapSize, selectedMapStyle, selectedPlayerCount, commanderName, victoryConfig, selectedDifficulty);
    if (!loopRunning) { loopRunning = true; requestAnimationFrame(loop); }
});

document.getElementById('tutorial-btn').addEventListener('click', () => {
    tutorialOverlay.classList.remove('hidden');
    renderTutorial(0);
});

document.getElementById('settings-btn-home')?.addEventListener('click', () => openSettings());

// ============================================================================
//  TUTORIAL
// ============================================================================
let tutStep = 0;
function renderTutorial(step) {
    tutStep = Math.max(0, Math.min(TUTORIAL_PAGES.length - 1, step));
    tutBody.innerHTML = TUTORIAL_PAGES[tutStep];
    tutStepLabel.textContent = `${tutStep + 1} / ${TUTORIAL_PAGES.length}`;
    tutProgressFill.style.width = `${((tutStep + 1) / TUTORIAL_PAGES.length) * 100}%`;
    tutPrev.disabled = tutStep === 0;
    tutNext.textContent = tutStep === TUTORIAL_PAGES.length - 1 ? 'CLOSE' : 'NEXT';
}
tutPrev.addEventListener('click', () => renderTutorial(tutStep - 1));
tutNext.addEventListener('click', () => {
    if (tutStep === TUTORIAL_PAGES.length - 1) tutorialOverlay.classList.add('hidden');
    else renderTutorial(tutStep + 1);
});

// ============================================================================
//  SETTINGS
// ============================================================================
let settingsOpen = false;

function openSettings() {
    if (settingsOpen) return;
    settingsOpen = true;

    // Always hide the game menu so settings sits on top.
    if (gameMenu) gameMenu.classList.add('hidden');
    gameMenuOpen = false;

    // Always pause while in settings (no-op on homepage / post-game).
    if (game && !game.paused) setPaused(true);

    settingsOverlay.classList.remove('hidden');
    renderKeybindList();
    syncSettingsToggles();
}

function closeSettings() {
    settingsOverlay.classList.add('hidden');
    Input.stopRebind();
    if (!settingsOpen) return;
    settingsOpen = false;

    // Return directly to the game (no forced trip through Resume).
    if (game) setPaused(false);
}
document.getElementById('settings-close')?.addEventListener('click', closeSettings);

settingsOverlay.querySelector('.tutorial-backdrop')?.addEventListener('click', closeSettings);

function renderKeybindList() {
    const list = document.getElementById('keybind-list');
    if (!list) return;
    list.innerHTML = '';
    const binds = Input.getKeybinds();
    for (const [action, code] of Object.entries(binds)) {
        const label = document.createElement('span');
        label.className = 'keybind-action';
        label.textContent = action.replace(/_/g, ' ');
        const keyBtn = document.createElement('button');
        keyBtn.className = 'keybind-key';
        keyBtn.textContent = Input.getDisplayName(code);
        keyBtn.addEventListener('click', () => {
            keyBtn.classList.add('listening');
            keyBtn.textContent = '...';
            Input.startRebind(action, (act, newCode) => {
                keyBtn.classList.remove('listening');
                if (act) {
                    keyBtn.textContent = Input.getDisplayName(newCode);
                    renderKeybindList();
                } else {
                    keyBtn.textContent = Input.getDisplayName(binds[action]);
                }
            });
        });
        list.appendChild(label);
        list.appendChild(keyBtn);
    }
}
document.getElementById('reset-keybinds-btn')?.addEventListener('click', () => {
    Input.resetKeybinds();
    renderKeybindList();
});

function getProjectileVisualSetting() {
    const v = Input.getSetting('projectileVisual');
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'unlimited') return v;
    return 'medium';
}

function syncSettingsToggles() {
    const qb = document.getElementById('opt-quick-build');
    const hu = document.getElementById('opt-hover-upgrade');
    const dp = document.getElementById('opt-drag-paint');
    const ss = document.getElementById('opt-screen-shake');
    const tr = document.getElementById('opt-threat-rings');
    const fs = document.getElementById('opt-fullscreen');
    const dipl = document.getElementById('opt-diplomacy');
    const sx = document.getElementById('opt-sfx');
    const mx = document.getElementById('opt-music');
    const sVol = document.getElementById('opt-sfx-volume');
    const mVol = document.getElementById('opt-music-volume');
    if (qb) qb.checked = Input.getSetting('quickBuild');
    if (hu) hu.checked = Input.getSetting('hoverUpgrade');
    if (dp) dp.checked = Input.getSetting('dragPaintBuild');
    if (ss) ss.checked = Input.getSetting('screenShake');
    if (tr) tr.checked = Input.getSetting('threatRings');
    if (fs) fs.checked = !!document.fullscreenElement;
    if (dipl) dipl.checked = Input.getSetting('diplomacyEnabled') !== false;
    if (sx) sx.checked = Input.getSetting('sfxEnabled') !== false;
    if (mx) mx.checked = Input.getSetting('musicEnabled') !== false;
    if (sVol) sVol.value = Math.round((Input.getSetting('sfxVolume') ?? 0.7) * 100);
    if (mVol) mVol.value = Math.round((Input.getSetting('musicVolume') ?? 0.7) * 100);
    const pvRow = document.getElementById('opt-projectile-visual-row');
    if (pvRow) {
        const sel = getProjectileVisualSetting();
        pvRow.querySelectorAll('.option-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.value === sel);
        });
    }
}
['opt-quick-build', 'opt-hover-upgrade', 'opt-drag-paint', 'opt-screen-shake', 'opt-threat-rings', 'opt-diplomacy', 'opt-sfx', 'opt-music'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const key = {
        'opt-quick-build':'quickBuild',
        'opt-hover-upgrade':'hoverUpgrade',
        'opt-drag-paint':'dragPaintBuild',
        'opt-screen-shake':'screenShake',
        'opt-threat-rings':'threatRings',
        'opt-diplomacy':'diplomacyEnabled',
        'opt-sfx':'sfxEnabled',
        'opt-music':'musicEnabled',
    }[id];
    el.addEventListener('change', () => {
        Input.setSetting(key, el.checked);
        if (renderer) {
            renderer.settings.screenShake = Input.getSetting('screenShake');
            renderer.settings.threatRings = Input.getSetting('threatRings');
            renderer.settings.projectileVisual = getProjectileVisualSetting();
        }
        if (key === 'diplomacyEnabled' && game) {
            game.setDiplomacyEnabled(el.checked);
            updateDiplomacyBtnVisibility();
            if (!el.checked) closeDiplomacyPanel();
        }
        if (key === 'sfxEnabled') SFX.setSfxEnabled(el.checked);
        if (key === 'musicEnabled') SFX.setMusicEnabled(el.checked);
    });
});
function _wireVolumeSlider(id, settingKey, apply) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
        const v = Math.max(0, Math.min(100, parseInt(el.value, 10) || 0)) / 100;
        Input.setSetting(settingKey, v);
        apply(v);
    });
}
_wireVolumeSlider('opt-sfx-volume', 'sfxVolume', v => SFX.setSfxVolume(v));
_wireVolumeSlider('opt-music-volume', 'musicVolume', v => SFX.setMusicVolume(v));

(function wireProjectileVisualRow() {
    const row = document.getElementById('opt-projectile-visual-row');
    if (!row) return;
    row.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.dataset.value;
            Input.setSetting('projectileVisual', v);
            if (renderer) renderer.settings.projectileVisual = v;
            row.querySelectorAll('.option-btn').forEach(b => {
                b.classList.toggle('selected', b.dataset.value === v);
            });
        });
    });
})();

const fsToggle = document.getElementById('opt-fullscreen');
if (fsToggle) {
    fsToggle.addEventListener('change', () => {
        if (fsToggle.checked) {
            document.documentElement.requestFullscreen().catch(() => { fsToggle.checked = false; });
        } else if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    });
}
document.addEventListener('fullscreenchange', () => {
    const fs = document.getElementById('opt-fullscreen');
    if (fs) fs.checked = !!document.fullscreenElement;
});

// ============================================================================
//  INPUT
// ============================================================================
canvas.addEventListener('mousedown', (e) => {
    if (!game || game.paused) return;
    if (e.button === 0) {
        const worldPos = camera.screenToWorld(e.clientX, e.clientY, canvas.clientWidth, canvas.clientHeight);
        const hex = grid.pixelToHex(worldPos.x, worldPos.y);
        const tile = grid.getTile(hex.q, hex.r);

        if (tile) {
            if (selectedBuildType) {
                const success = game.buildStructure(tile, selectedBuildType, 1);
                if (!success) {
                    if (!tile.buildable) showNoti("Can't build on water", "error");
                    else if (tile.contested) showNoti("Tile is contested", "error");
                    else if (selectedBuildType === 'M' && !game.isVisibleTo(tile, 1)) showNoti("No vision — need a structure nearby", "error");
                    else if (selectedBuildType === 'M' && tile.owner && tile.owner !== 1) showNoti("Militia: your territory or neutral only", "error");
                    else if (tile.owner !== 1 && selectedBuildType !== 'M') showNoti("Must build on your territory", "error");
                    else showNoti("Insufficient gold, limit reached, or occupied", "error");
                }
                if (!Input.getSetting('quickBuild')) resetSelection();
                dragPaintedHexes = new Set();
                dragPaintWarned = false;
                if (tile) dragPaintedHexes.add(`${tile.q},${tile.r}`);
            } else if (e.ctrlKey) {
                if (tile.owner === 1 && tile.structure) {
                    const idx = multiSelected.findIndex(t => t.q === tile.q && t.r === tile.r);
                    if (idx >= 0) {
                        multiSelected.splice(idx, 1);
                    } else {
                        multiSelected.push(tile);
                    }
                    if (multiSelected.length > 0) {
                        showMultiSelectPanel();
                    } else {
                        infoPanel.classList.add('hidden');
                    }
                }
            } else if (isAttacker(tile) && tile.owner === 1) {
                multiSelected = [];
                game.isTargeting = true;
                game.currentTargetSource = tile;
                selectTile(tile);
            } else {
                multiSelected = [];
                selectTile(tile);
            }
        }
        isDragging = true;
        didDrag = false;
        dragStartPos = { x: e.clientX, y: e.clientY };
    } else if (e.button === 2) {
        if (selectedBuildType) {
            resetSelection();
        } else if (game.isTargeting) {
            game.isTargeting = false;
            game.currentTargetSource = null;
            isDragging = false;
        } else {
            isRightClickDragging = true;
        }
    }
    lastMousePos = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mousemove', (e) => {
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    if (isRightClickDragging) camera.pan(dx, dy);
    if (isDragging && !selectedBuildType && !game?.isTargeting) {
        const ddx = e.clientX - dragStartPos.x;
        const ddy = e.clientY - dragStartPos.y;
        if (Math.hypot(ddx, ddy) > 5) {
            didDrag = true;
            camera.pan(dx, dy);
        }
    }
    if (isDragging && selectedBuildType) {
        const ddx = e.clientX - dragStartPos.x;
        const ddy = e.clientY - dragStartPos.y;
        if (Math.hypot(ddx, ddy) > 5) didDrag = true;
    }

    if (game) {
        game.mousePos = { x: e.clientX, y: e.clientY };
        const worldPos = camera.screenToWorld(e.clientX, e.clientY, canvas.clientWidth, canvas.clientHeight);
        const hex = grid.pixelToHex(worldPos.x, worldPos.y);
        const tile = grid.getTile(hex.q, hex.r);
        if (renderer) {
            renderer.hoverTile = tile || null;
            renderer.buildGhostType = selectedBuildType;
            renderer.buildGhostLevel = selectedBuildLevel;
        }

        if (isDragging && selectedBuildType && Input.getSetting('dragPaintBuild') && tile) {
            const key = `${tile.q},${tile.r}`;
            if (!dragPaintedHexes.has(key)) {
                dragPaintedHexes.add(key);
                const ok = game.buildStructure(tile, selectedBuildType, 1);
                if (!ok && !dragPaintWarned) {
                    const def = UNIT_STATS[selectedBuildType];
                    if (def && game.players[0].gold < def.levels[0].cost) {
                        showNoti("Out of gold", "error");
                        dragPaintWarned = true;
                    }
                }
            }
        }

        updateHoverChip(tile, e.clientX, e.clientY);

        // Edge-of-screen pan while in build mode
        if (selectedBuildType) {
            const margin = 40;
            const edgeSpeed = 12 / camera.scale;
            if (e.clientX < margin) camera.x += edgeSpeed;
            if (e.clientX > canvas.clientWidth - margin) camera.x -= edgeSpeed;
            if (e.clientY < margin) camera.y += edgeSpeed;
            if (e.clientY > canvas.clientHeight - margin) camera.y -= edgeSpeed;
        }
    }
    lastMousePos = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mouseup', (e) => {
    if (!game) return;
    if (game.isTargeting && game.currentTargetSource && didDrag) {
        const src = game.currentTargetSource;
        const worldPos = camera.screenToWorld(e.clientX, e.clientY, canvas.clientWidth, canvas.clientHeight);
        const hex = grid.pixelToHex(worldPos.x, worldPos.y);
        const targetTile = grid.getTile(hex.q, hex.r);

        if (targetTile && targetTile !== src) {
            if (Hex.distance(src, targetTile) <= src.structure.stats.range) {
                if (game.setAssignedTarget(src, targetTile)) {
                    showNoti(`Target locked: (${targetTile.q}, ${targetTile.r})`, "success");
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
    dragPaintedHexes = new Set();
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.88 : 1.14;
    camera.zoom(delta, e.clientX, e.clientY, canvas.clientWidth, canvas.clientHeight);
}, { passive: false });

canvas.addEventListener('dblclick', (e) => {
    if (!game) return;
    const worldPos = camera.screenToWorld(e.clientX, e.clientY, canvas.clientWidth, canvas.clientHeight);
    const hex = grid.pixelToHex(worldPos.x, worldPos.y);
    const tile = grid.getTile(hex.q, hex.r);
    if (tile && tile.owner === 1 && tile.structure && !selectedBuildType) {
        const sType = tile.structure.type;
        multiSelected = [];
        for (const t of grid.tiles.values()) {
            if (t.owner === 1 && t.structure?.type === sType) {
                multiSelected.push(t);
            }
        }
        if (multiSelected.length > 0) {
            showNoti(`Selected all ${multiSelected.length} ${UNIT_STATS[sType]?.name || sType}`, "success");
            showMultiSelectPanel();
        }
    }
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

let minimapDragging = false;
function centerCameraFromMinimapEvent(e) {
    if (!game || !renderer || !miniCanvas) return;
    const rect = miniCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const sx = miniCanvas.width / rect.width;
    const sy = miniCanvas.height / rect.height;
    const px = mx * sx, py = my * sy;
    const scale = renderer._miniScale;
    const cx = renderer._miniCx, cy = renderer._miniCy;
    if (!scale) return;
    camera.x = -(px - cx) / scale;
    camera.y = -(py - cy) / scale;
}
miniCanvas?.addEventListener('mousedown', (e) => {
    minimapDragging = true;
    centerCameraFromMinimapEvent(e);
    e.preventDefault();
    e.stopPropagation();
});
window.addEventListener('mousemove', (e) => {
    if (minimapDragging) centerCameraFromMinimapEvent(e);
});
window.addEventListener('mouseup', () => { minimapDragging = false; });

function clearDragState() {
    isDragging = false;
    isRightClickDragging = false;
    didDrag = false;
    dragPaintedHexes = new Set();
    if (game) {
        game.isTargeting = false;
        game.currentTargetSource = null;
    }
}

window.addEventListener('mouseup', (e) => {
    if (e.target === canvas) return;
    clearDragState();
});
window.addEventListener('blur', clearDragState);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        clearDragState();
        if (game && !game.paused && !game.winner && !game.defeated.has(1)) setPaused(true);
    }
});

// ============================================================================
//  KEYBOARD via Input module
// ============================================================================
function handleInput() {
    if (!game) return;

    const speed = 18;
    if (Input.isDown('pan_up'))    camera.y += speed / camera.scale;
    if (Input.isDown('pan_down'))  camera.y -= speed / camera.scale;
    if (Input.isDown('pan_left'))  camera.x += speed / camera.scale;
    if (Input.isDown('pan_right')) camera.x -= speed / camera.scale;

    if (Input.consumePress('cancel')) {
        if (!settingsOverlay.classList.contains('hidden')) { closeSettings(); }
        else if (diplomacyOpen) { closeDiplomacyPanel(); }
        else if (game.isTargeting) { game.isTargeting = false; game.currentTargetSource = null; isDragging = false; }
        else if (selectedBuildType) { resetSelection(); }
        else if (multiSelected.length > 0) { multiSelected = []; infoPanel.classList.add('hidden'); }
        else if (!infoPanel.classList.contains('hidden')) { infoPanel.classList.add('hidden'); }
        else { toggleGameMenu(); }
    }

    if (Input.consumePress('pause')) {
        setPaused(!game.paused);
    }

    if (Input.consumePress('speed_up') && !game.paused) setSpeed(Math.min(3, game.speedMultiplier + 1));
    if (Input.consumePress('speed_down') && !game.paused) setSpeed(Math.max(1, game.speedMultiplier - 1));

    if (Input.consumePress('toggle_log')) {
        const entries = document.getElementById('combat-log-entries');
        const log = document.getElementById('combat-log');
        if (entries && log) {
            entries.classList.toggle('hidden');
        }
    }

    if (Input.consumePress('cycle_minimap_stats')) {
        minimapStatPage = (minimapStatPage + 1) % MINIMAP_STAT_PAGE_COUNT;
    }

    if (Input.consumePress('upgrade') && !isDragging) {
        if (multiSelected.length > 0) {
            let upgraded = 0;
            for (const tile of multiSelected) {
                if (game.upgradeStructure(tile)) upgraded++;
            }
            if (upgraded > 0) {
                showNoti(`Upgraded ${upgraded} structures!`, "success");
                showMultiSelectPanel();
            } else {
                showNoti("Can't upgrade", "error");
            }
        } else {
            const target = (Input.getSetting('hoverUpgrade') && renderer?.hoverTile?.owner === 1)
                ? renderer.hoverTile
                : game.selectedTile;
            if (target && target.owner === 1 && target.structure) {
                if (game.upgradeStructure(target)) {
                    showNoti("Upgraded!", "success");
                    if (target === game.selectedTile) selectTile(target);
                } else {
                    showNoti("Can't upgrade", "error");
                }
            }
        }
    }

    if (Input.consumePress('upgrade_all')) {
        const count = game.upgradeAll(1);
        if (count > 0) showNoti(`Upgraded ${count} structures!`, "success");
        else showNoti("Nothing to upgrade", "error");
        if (multiSelected.length > 0) showMultiSelectPanel();
        if (game.selectedTile && !infoPanel.classList.contains('hidden')) selectTile(game.selectedTile);
    }

    if (Input.consumePress('demolish')) {
        if (multiSelected.length > 0) {
            let totalRefund = 0;
            const count = multiSelected.length;
            for (const tile of [...multiSelected]) {
                const r = game.demolishStructure(tile, 1);
                if (r !== false) totalRefund += r;
            }
            if (totalRefund > 0) showNoti(`Demolished ${count} (+$${totalRefund})`, "success");
            multiSelected = [];
            infoPanel.classList.add('hidden');
        } else {
            const target = renderer?.hoverTile?.owner === 1 ? renderer.hoverTile : game.selectedTile;
            if (target && target.owner === 1 && target.structure) {
                const refund = game.demolishStructure(target, 1);
                if (refund !== false) {
                    showNoti(`Demolished (+$${refund})`, "success");
                    infoPanel.classList.add('hidden');
                }
            }
        }
    }

    if (Input.consumePress('center_cap')) {
        const gov = Array.from(grid.tiles.values()).find(t => t.owner === 1 && t.structure?.type === 'G');
        if (gov) {
            const pos = grid.hexToPixel(gov.q, gov.r);
            camera.x = -pos.x; camera.y = -pos.y;
        }
    }

    if (Input.consumePress('center_last_hit')) {
        if (game.lastOwnDamageTile) {
            const pos = grid.hexToPixel(game.lastOwnDamageTile.q, game.lastOwnDamageTile.r);
            camera.x = -pos.x; camera.y = -pos.y;
        } else {
            showNoti("No recent hits", "info");
        }
    }

    if (Input.consumePress('settings')) openSettings();

    // Build hotkeys
    const buildTypes = ['G', 'RL', 'AAS', 'MF', 'B', 'M', 'D', 'AB'];
    buildTypes.forEach((type, i) => {
        if (Input.consumePress(`build_${type}`)) {
            const btn = buildBtns[i];
            if (btn) btn.click();
        }
    });

    if (Input.consumePress('select_all_type')) {
        const hover = renderer?.hoverTile;
        const ref = hover?.owner === 1 && hover?.structure ? hover : game.selectedTile;
        if (ref && ref.owner === 1 && ref.structure) {
            const sType = ref.structure.type;
            multiSelected = [];
            for (const tile of grid.tiles.values()) {
                if (tile.owner === 1 && tile.structure?.type === sType) {
                    multiSelected.push(tile);
                }
            }
            if (multiSelected.length > 0) {
                showNoti(`Selected ${multiSelected.length} ${UNIT_STATS[sType]?.name || sType}`, "success");
                showMultiSelectPanel();
            }
        }
    }
}

// ============================================================================
//  SPEED CONTROLS
// ============================================================================
function setSpeed(mult) {
    if (!game) return;
    if (mult > 0) prevSpeedBeforePause = mult;
    game.speedMultiplier = mult;
    game.paused = mult === 0;
    pauseOverlay.classList.toggle('hidden', !game.paused);
    document.getElementById('speed-pause').classList.toggle('active', mult === 0);
    document.getElementById('speed-1x').classList.toggle('active', mult === 1);
    document.getElementById('speed-2x').classList.toggle('active', mult === 2);
    document.getElementById('speed-3x').classList.toggle('active', mult === 3);
}

function setPaused(pause) {
    if (!game) return;
    if (pause) {
        setSpeed(0);
    } else {
        setSpeed(prevSpeedBeforePause || 1);
    }
}
document.getElementById('speed-pause')?.addEventListener('click', () => setSpeed(0));
document.getElementById('speed-1x')?.addEventListener('click', () => setSpeed(1));
document.getElementById('speed-2x')?.addEventListener('click', () => setSpeed(2));
document.getElementById('speed-3x')?.addEventListener('click', () => setSpeed(3));

// ============================================================================
//  GAME MENU
// ============================================================================
function toggleGameMenu() {
    gameMenuOpen = !gameMenuOpen;
    gameMenu.classList.toggle('hidden', !gameMenuOpen);
    if (game) setPaused(gameMenuOpen);
}
document.getElementById('gear-btn')?.addEventListener('click', toggleGameMenu);
document.getElementById('menu-resume')?.addEventListener('click', () => {
    gameMenuOpen = false;
    gameMenu.classList.add('hidden');
    if (game) setPaused(false);
});
document.getElementById('menu-settings')?.addEventListener('click', openSettings);
document.getElementById('menu-restart')?.addEventListener('click', () => {
    gameMenuOpen = false;
    gameMenu.classList.add('hidden');
    if (game) {
        endShown = false;
        endOutcomeAt = 0;
        endOverlay.classList.add('hidden');
        setPaused(false);
        const vc = { mode: selectedVictoryMode, param: selectedVictoryParam };
        initWorld(selectedMapSize, selectedMapStyle, selectedPlayerCount, commanderName, vc, selectedDifficulty);
    }
});
let surrenderArmed = false;
let surrenderArmTimer = null;
document.getElementById('menu-surrender')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (!surrenderArmed) {
        surrenderArmed = true;
        btn.textContent = 'CONFIRM SURRENDER';
        btn.classList.add('armed');
        clearTimeout(surrenderArmTimer);
        surrenderArmTimer = setTimeout(() => {
            surrenderArmed = false;
            btn.textContent = 'SURRENDER';
            btn.classList.remove('armed');
        }, 3000);
        return;
    }
    clearTimeout(surrenderArmTimer);
    surrenderArmed = false;
    btn.textContent = 'SURRENDER';
    btn.classList.remove('armed');
    gameMenuOpen = false;
    gameMenu.classList.add('hidden');
    if (game) {
        game.defeated.add(1);
        setPaused(false);
    }
});
document.getElementById('menu-quit')?.addEventListener('click', () => {
    gameMenuOpen = false;
    gameMenu.classList.add('hidden');
    endShown = false;
    endOutcomeAt = 0;
    appEl.classList.add('hidden');
    homepageEl.classList.remove('hidden');
});

// ============================================================================
//  BUILD UI
// ============================================================================
let tooltipTimer = null;
buildBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (selectedBuildType === type) { resetSelection(); return; }
        buildBtns.forEach(b => b.classList.remove('active'));
        selectedBuildType = type;
        btn.classList.add('active');
        infoPanel.classList.add('hidden');

        const def = UNIT_STATS[type];
        const lvl = def.levels[0];
        const label = def.name.toUpperCase();
        const costStr = `$${lvl.cost}`;
        const hint = type === 'M' ? 'PLACE on a VISIBLE tile you own or neutral land' : 'PLACE on your own territory';
        buildModeBanner.innerHTML = `<b>${label}</b> — ${costStr} <span class="dim">· ${hint} · ESC to cancel</span>`;
        buildModeBanner.classList.remove('hidden');
    });

    btn.addEventListener('mouseenter', () => {
        tooltipTimer = setTimeout(() => showBuildTooltip(btn), 100);
    });
    btn.addEventListener('mouseleave', () => {
        clearTimeout(tooltipTimer);
        buildTooltip.classList.add('hidden');
    });
});

/** One-line summary of a tier's stats for build tooltips (matches UNIT_STATS). */
function summarizeLevelForTooltip(type, lv) {
    const parts = [];
    if (lv.hp != null) parts.push(`${lv.hp} HP`);
    if (lv.range != null) parts.push(`rng ${lv.range}`);
    if (lv.radius != null && type === 'B') parts.push(`cmd ${lv.radius}`);
    if (lv.radius != null && (type === 'G' || lv.transformsToGov)) parts.push(`inf rng ${lv.radius}`);
    if (lv.damage != null) parts.push(`dmg ${lv.damage}`);
    if (lv.interval != null) parts.push(`${(lv.interval / 1000).toFixed(1)}s`);
    if (lv.rechargeInterval != null) {
        let s = `rech ${(lv.rechargeInterval / 1000).toFixed(1)}s`;
        if (lv.missilesRecharged) s += ` ×${lv.missilesRecharged}`;
        parts.push(s);
    }
    if (lv.produceInterval != null && lv.missilesProduced != null) {
        parts.push(`${(lv.produceInterval / 1000).toFixed(1)}s +${lv.missilesProduced} msl`);
    }
    if (lv.influence != null && (type === 'G' || type === 'B')) parts.push(`inf ${lv.influence}`);
    if (lv.chargeCap) parts.push(`cap ${lv.chargeCap}`);
    if (lv.missilesPerShot != null && lv.missilesPerShot > 1) parts.push(`×${lv.missilesPerShot} msl`);
    if (lv.projectiles != null && lv.projectiles > 1) parts.push(`×${lv.projectiles} proj`);
    if (lv.transformsToGov) parts.push(`mini-Gov inf ${lv.influence}`);
    return parts.join(' · ');
}

function showBuildTooltip(btn) {
    const type = btn.dataset.type;
    const def = UNIT_STATS[type];
    if (!def) return;
    const l1 = def.levels[0];

    let html = `<h4>${def.name.toUpperCase()}</h4>`;
    const stats = [
        l1.hp && ['HP', l1.hp],
        l1.range && ['Atk Range', l1.range],
        l1.damage && ['Damage', l1.damage],
        l1.damage && l1.interval && ['DPS', (l1.damage / (l1.interval / 1000)).toFixed(1)],
        l1.vision && ['Vision', l1.vision],
        l1.interval && ['Interval', `${(l1.interval / 1000).toFixed(0)}s`],
        l1.influence && ['Influence', l1.influence],
        l1.radius && ['Inf. Range', l1.radius],
        l1.projectiles && l1.projectiles > 1 && ['Projectiles', l1.projectiles],
        l1.missilesPerShot && ['Missiles/shot', l1.missilesPerShot],
        l1.interceptable != null && ['Interceptable', l1.interceptable ? 'Yes' : 'No'],
        l1.missilesProduced && ['Produces', `${l1.missilesProduced}/cycle`],
        l1.produceInterval && ['Cycle', `${(l1.produceInterval / 1000).toFixed(1)}s`],
        l1.rechargeInterval && ['Recharge', `${(l1.rechargeInterval / 1000).toFixed(0)}s (×${l1.missilesRecharged || 1})`],
        l1.chargeCap && ['Capacity', l1.chargeCap],
    ].filter(Boolean);

    html += `<div class="tt-stat"><span class="tt-label">Cost</span><span class="tt-val">$${l1.cost}</span></div>`;
    stats.forEach(([label, val]) => {
        html += `<div class="tt-stat"><span class="tt-label">${label}</span><span class="tt-val">${val}</span></div>`;
    });

    if (l1.goldPerTile) {
        html += `<div class="tt-stat"><span class="tt-label">Gold/tile</span><span class="tt-val">+${l1.goldPerTile}/s</span></div>`;
    }

    if (def.levels.length > 1) {
        html += '<div class="tt-upgrade">';
        for (let i = 1; i < def.levels.length; i++) {
            const lv = def.levels[i];
            const discCost = Math.floor(lv.cost * GAME_CONFIG.UPGRADE_COST_MULT);
            const sum = summarizeLevelForTooltip(type, lv);
            html += `<div class="tt-tier">Lv${i + 1}: <b>$${discCost}</b> <span class="tt-list">(list $${lv.cost})</span> — ${sum}</div>`;
        }
        html += '</div>';
        html += `<div class="tt-upgrade dim">Upgrade price is −${Math.round((1 - GAME_CONFIG.UPGRADE_COST_MULT) * 100)}% vs that tier's list cost; stats become that tier's values.</div>`;
    }

    if (type === 'B') {
        html += `<div class="tt-upgrade dim">Lv3: +${Math.round((GAME_CONFIG.BARRACKS_L3_COMMAND_OUT_MULT - 1) * 100)}% ally damage & −${Math.round((1 - GAME_CONFIG.BARRACKS_L3_COMMAND_IN_MULT) * 100)}% damage taken in influence (non-stacking)</div>`;
    }

    if (type === 'M') {
        html += `<div class="tt-upgrade">Max: ${GAME_CONFIG.MILITIA_BASE_CAP} + ${GAME_CONFIG.MILITIA_PER_EXTRA_GOV} per Gov beyond your first</div>`;
    }

    buildTooltip.innerHTML = html;
    buildTooltip.classList.remove('hidden');
    const rect = btn.getBoundingClientRect();
    const tw = buildTooltip.offsetWidth || 220;
    const th = buildTooltip.offsetHeight || 120;
    let left = rect.right + 8;
    if (left + tw > window.innerWidth - 8) left = Math.max(8, rect.left - tw - 8);
    let top = rect.top;
    if (top + th > window.innerHeight - 8) top = Math.max(8, window.innerHeight - th - 8);
    buildTooltip.style.left = `${left}px`;
    buildTooltip.style.top = `${top}px`;
}

function resetSelection() {
    selectedBuildType = null;
    selectedBuildLevel = 0;
    if (renderer) renderer.buildGhostType = null;
    buildBtns.forEach(b => b.classList.remove('active'));
    buildModeBanner.classList.add('hidden');
}

function refreshBuildAffordability() {
    if (!game) return;
    const p = game.players[0];
    buildBtns.forEach(btn => {
        const type = btn.dataset.type;
        const def = UNIT_STATS[type];
        if (!def) return;
        const lvl = def.levels[0];
        const canAfford = p.gold >= lvl.cost;
        btn.classList.toggle('cannot-afford', !canAfford);
        const costEl = btn.querySelector('.cost');
        if (costEl) costEl.textContent = `$${lvl.cost}`;
    });
}

// ============================================================================
//  HOVER UPGRADE CHIP
// ============================================================================
function updateHoverChip(tile, mx, my) {
    if (!Input.getSetting('hoverUpgrade') || !tile || tile.owner !== 1 || !tile.structure) {
        hoverChip.classList.add('hidden');
        return;
    }
    const def = UNIT_STATS[tile.structure.type];
    const next = def?.levels?.[tile.structure.level + 1];
    if (!next) { hoverChip.classList.add('hidden'); return; }

    const discCost = Math.floor(next.cost * GAME_CONFIG.UPGRADE_COST_MULT);
    const canAfford = game.players[0].gold >= discCost;
    const keyName = Input.getDisplayName(Input.getKeybinds().upgrade);
    hoverChip.textContent = `[${keyName}] Upgrade to Lv${tile.structure.level + 2} ($${discCost})`;
    hoverChip.className = canAfford ? '' : 'dim';
    hoverChip.style.left = `${mx + 16}px`;
    hoverChip.style.top = `${my + 20}px`;
    hoverChip.classList.remove('hidden');
}

// ============================================================================
//  INFO PANEL
// ============================================================================
function selectTile(tile) {
    game.selectedTile = tile;

    if (!game.isExploredBy(tile, 1) && tile.owner !== 1) {
        infoPanel.classList.add('hidden');
        return;
    }

    if (!tile.structure) {
        if (tile.contested && game.isVisibleTo(tile, 1)) {
            infoPanel.classList.remove('hidden');
            infoContent.innerHTML = `<h4>CONTESTED GROUND</h4>
                <p>Structures here are paralyzed. Break the contest to regain control.</p>`;
            upgradeBtn.classList.add('hidden');
            upgradeAllBtn.classList.add('hidden');
            demolishBtn.classList.add('hidden');
            clearTargetBtn.classList.add('hidden');
        } else {
            infoPanel.classList.add('hidden');
        }
        return;
    }

    if (tile.owner !== 1 && !game.isVisibleTo(tile, 1)) {
        const mem = game.players[0].memory.get(`${tile.q},${tile.r}`);
        infoPanel.classList.remove('hidden');
        const name = mem?.type ? UNIT_STATS[mem.type].name : 'Unknown';
        infoContent.innerHTML = `<h4>${name.toUpperCase()} — LAST SEEN</h4><p>Outside fog. Information may be outdated.</p>`;
        upgradeBtn.classList.add('hidden');
        upgradeAllBtn.classList.add('hidden');
        demolishBtn.classList.add('hidden');
        clearTargetBtn.classList.add('hidden');
        return;
    }

    infoPanel.classList.remove('hidden');
    const stats = tile.structure.stats;
    const isOwn = tile.owner === 1;
    const attacker = isAttacker(tile);
    const inSupply = game.isInSupply(tile, tile.owner);

    let targetLine = '';
    if (attacker && isOwn) {
        const tgt = tile.structure.target;
        if (tgt) {
            const live = grid.getTile(tgt.q, tgt.r);
            const inRange = live && Hex.distance(tile, live) <= stats.range;
            targetLine = `<p class="target-line">Target: (${tgt.q}, ${tgt.r}) ${inRange ? '' : '<span class="oor">OUT OF RANGE</span>'}</p>`;
        } else {
            targetLine = `<p class="target-line">Target: <span class="auto">AUTO</span></p>`;
        }
    }

    let goldPerTile = '';
    if (stats.goldPerTile) {
        const warmingUp = tile.govWarmupUntil && game.gameTime < tile.govWarmupUntil;
        if (warmingUp) {
            const secsLeft = Math.ceil((tile.govWarmupUntil - game.gameTime) / 1000);
            goldPerTile = `<p class="supply-line bad">WARMING UP — ${secsLeft}s</p>`;
        } else {
            goldPerTile = `<p>Gold/tile: +${stats.goldPerTile}/s</p>`;
        }
    }
    const effectiveRadius = tile.structure._lockedRadius ?? stats.radius;
    const influence = stats.influence ? `<p>Influence: ${stats.influence}</p>` : '';
    const radius    = effectiveRadius ? `<p>Inf. Range: ${effectiveRadius}${(stats.radius || effectiveRadius) && isOwn ? ` <span class="dim">(build new to expand)</span>` : ''}</p>` : '';
    const visionStat = stats.vision   ? `<p>Vision: ${stats.vision}</p>` : '';
    const intervalSec = stats.interval ? `<p>Fire Rate: ${(stats.interval/1000).toFixed(0)}s</p>`
                      : stats.rechargeInterval ? `<p>Recharge: ${(stats.rechargeInterval/1000).toFixed(0)}s (×${stats.missilesRecharged || 1})</p>`
                      : stats.produceInterval  ? `<p>Cycle: ${(stats.produceInterval/1000).toFixed(0)}s</p>` : '';
    const missiles = tile.structure.type === 'AAS' ? `<p>Charges: ${tile.structure.charge || 0}/${stats.chargeCap || 10}</p>` : '';
    const supplyLine = (stats.interval || stats.produceInterval || stats.rechargeInterval)
        ? `<p class="supply-line ${inSupply ? 'ok' : 'bad'}">${inSupply ? 'IN SUPPLY' : 'OUT OF SUPPLY'}</p>`
        : '';
    const contestLine = tile.contested ? `<p class="supply-line bad">PARALYZED — CONTESTED</p>` : '';
    const hint = (attacker && isOwn) ? `<p class="hint">Drag to assign target.</p>` : '';
    let doctrineLine = '';
    if (!isOwn && tile.structure.type === 'G' && game.isVisibleTo(tile, 1)) {
        const owner = game.players[tile.owner - 1];
        if (owner?.doctrine?.name) {
            doctrineLine = `<p class="hint" style="color:${owner.doctrine.color}">Doctrine: ${owner.doctrine.name}</p>`;
        }
    }

    infoContent.innerHTML = `
        <h4>${UNIT_STATS[tile.structure.type].name.toUpperCase()} · LVL ${tile.structure.level + 1}</h4>
        <p>Owner: ${game.players[tile.owner - 1]?.name || ('P' + tile.owner)}</p>
        <p>HP: ${Math.round(tile.hp)} / ${tile.maxHp}</p>
        ${stats.range  ? `<p>Atk Range: ${stats.range}</p>` : ''}
        ${stats.damage ? `<p>Damage: ${stats.damage}</p>` : ''}
        ${radius}${influence}${goldPerTile}${visionStat}${intervalSec}${missiles}
        ${supplyLine}${contestLine}${targetLine}${doctrineLine}${hint}
    `;

    if (attacker && isOwn && tile.structure.target) {
        clearTargetBtn.classList.remove('hidden');
        clearTargetBtn.onclick = () => {
            game.clearAssignedTarget(tile);
            showNoti("Target cleared", "success");
            selectTile(tile);
        };
    } else {
        clearTargetBtn.classList.add('hidden');
    }

    const def = UNIT_STATS[tile.structure.type];
    const nextLevel = def?.levels?.[tile.structure.level + 1];
    if (nextLevel && isOwn) {
        const discountedCost = Math.floor(nextLevel.cost * GAME_CONFIG.UPGRADE_COST_MULT);
        upgradeBtn.classList.remove('hidden');
        upgradeBtn.innerText = `UPGRADE ($${discountedCost})`;
        upgradeBtn.onclick = () => {
            if (game.upgradeStructure(tile)) {
                selectTile(tile);
                showNoti("Upgraded!", "success");
            } else {
                showNoti("Not enough gold", "error");
            }
        };
    } else {
        upgradeBtn.classList.add('hidden');
    }

    if (isOwn) {
        upgradeAllBtn.classList.remove('hidden');
        upgradeAllBtn.onclick = () => {
            const count = game.upgradeAll(1);
            if (count > 0) {
                showNoti(`Upgraded ${count} structures!`, "success");
                selectTile(tile);
            } else {
                showNoti("Nothing to upgrade", "error");
            }
        };

        demolishBtn.classList.remove('hidden');
        let totalCost = def.levels[0]?.cost || 0;
        for (let i = 1; i <= tile.structure.level; i++) totalCost += Math.floor((def.levels[i]?.cost || 0) * GAME_CONFIG.UPGRADE_COST_MULT);
        const refund = Math.floor(totalCost * GAME_CONFIG.DEMOLISH_REFUND_MULT);
        demolishBtn.innerText = `DEMOLISH (+$${refund})`;
        demolishBtn.onclick = () => {
            const r = game.demolishStructure(tile, 1);
            if (r !== false) {
                showNoti(`Demolished (+$${r})`, "success");
                infoPanel.classList.add('hidden');
            }
        };
    } else {
        upgradeAllBtn.classList.add('hidden');
        demolishBtn.classList.add('hidden');
    }
}

function showMultiSelectPanel() {
    multiSelected = multiSelected.filter(t => t && t.structure && t.owner === 1);
    if (multiSelected.length === 0) {
        infoPanel.classList.add('hidden');
        return;
    }
    infoPanel.classList.remove('hidden');
    const count = multiSelected.length;
    const types = {};
    let allUpgradable = true;
    let totalUpgradeCost = 0;
    let totalDemolishRefund = 0;

    for (const tile of multiSelected) {
        if (!tile.structure) continue;
        const t = tile.structure.type;
        types[t] = (types[t] || 0) + 1;

        const def = UNIT_STATS[t];
        const next = def?.levels?.[tile.structure.level + 1];
        if (next) {
            totalUpgradeCost += Math.floor(next.cost * GAME_CONFIG.UPGRADE_COST_MULT);
        } else {
            allUpgradable = false;
        }

        let totalCost = def.levels[0]?.cost || 0;
        for (let i = 1; i <= tile.structure.level; i++) totalCost += Math.floor((def.levels[i]?.cost || 0) * GAME_CONFIG.UPGRADE_COST_MULT);
        totalDemolishRefund += Math.floor(totalCost * GAME_CONFIG.DEMOLISH_REFUND_MULT);
    }

    const typeList = Object.entries(types).map(([t, n]) => `${n}x ${UNIT_STATS[t]?.name || t}`).join(', ');
    infoContent.innerHTML = `
        <h4>MULTI-SELECT · ${count} STRUCTURES</h4>
        <p>${typeList}</p>
    `;

    if (allUpgradable && totalUpgradeCost > 0) {
        upgradeBtn.classList.remove('hidden');
        upgradeBtn.innerText = `UPGRADE SELECTED ($${totalUpgradeCost})`;
        upgradeBtn.onclick = () => {
            let upgraded = 0;
            for (const tile of multiSelected) {
                if (game.upgradeStructure(tile)) upgraded++;
            }
            if (upgraded > 0) showNoti(`Upgraded ${upgraded} structures!`, "success");
            else showNoti("Can't upgrade", "error");
            showMultiSelectPanel();
        };
    } else {
        upgradeBtn.classList.add('hidden');
    }

    upgradeAllBtn.classList.remove('hidden');
    upgradeAllBtn.onclick = () => {
        const count = game.upgradeAll(1);
        if (count > 0) {
            showNoti(`Upgraded ${count} structures!`, "success");
            showMultiSelectPanel();
        } else {
            showNoti("Nothing to upgrade", "error");
        }
    };

    demolishBtn.classList.remove('hidden');
    demolishBtn.innerText = `DEMOLISH ALL (+$${totalDemolishRefund})`;
    demolishBtn.onclick = () => {
        let totalRefund = 0;
        for (const tile of [...multiSelected]) {
            const r = game.demolishStructure(tile, 1);
            if (r !== false) totalRefund += r;
        }
        if (totalRefund > 0) showNoti(`Demolished ${multiSelected.length} (+$${totalRefund})`, "success");
        multiSelected = [];
        infoPanel.classList.add('hidden');
    };

    clearTargetBtn.classList.add('hidden');
}

closeInfoBtn.onclick = () => { infoPanel.classList.add('hidden'); multiSelected = []; };

// ============================================================================
//  NOTIFICATIONS
// ============================================================================
const NOTI_MAX = 5;
const NOTI_DURATION = 3000;
const _notiTimers = new Map();

function showNoti(msg, type) {
    const container = document.getElementById('notis');
    const key = `${type}::${msg}`;

    const existing = _notiTimers.get(key);
    if (existing && existing.el.parentNode) {
        clearTimeout(existing.timeout);
        existing.count++;
        existing.el.innerText = existing.count > 1 ? `${msg} (x${existing.count})` : msg;
        existing.el.style.animation = 'none';
        existing.el.offsetHeight;
        existing.el.style.animation = '';
        existing.timeout = setTimeout(() => { existing.el.remove(); _notiTimers.delete(key); }, NOTI_DURATION);
        return;
    }

    while (container.children.length >= NOTI_MAX) {
        const oldest = container.firstElementChild;
        const oldKey = oldest?.dataset.notiKey;
        if (oldKey) { clearTimeout(_notiTimers.get(oldKey)?.timeout); _notiTimers.delete(oldKey); }
        oldest?.remove();
    }

    const noti = document.createElement('div');
    noti.className = `noti ${type} glass`;
    noti.innerText = msg;
    noti.dataset.notiKey = key;
    container.appendChild(noti);

    const timeout = setTimeout(() => { noti.remove(); _notiTimers.delete(key); }, NOTI_DURATION);
    _notiTimers.set(key, { el: noti, timeout, count: 1 });
}

// ============================================================================
//  PORTRAITS
// ============================================================================
function buildPortraitSvg(player, size = 48) {
    if (!player || !player.portrait) return '';
    const color = COLORS[player.portrait.colorKey] || '#888';
    const glyph = player.portrait.glyph || '';
    const initial = player.portrait.initial || '';
    const half = size / 2;
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
        <defs>
            <linearGradient id="pg${player.id}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${color}" stop-opacity="0.95"/>
                <stop offset="100%" stop-color="#0a0f18" stop-opacity="0.95"/>
            </linearGradient>
        </defs>
        <path d="M50 4 L92 18 L92 58 Q92 86 50 96 Q8 86 8 58 L8 18 Z" fill="url(#pg${player.id})" stroke="${color}" stroke-width="3"/>
        <text x="50" y="42" text-anchor="middle" font-size="28" font-family="Orbitron, sans-serif" font-weight="700" fill="#fff" opacity="0.95">${escapeXml(initial)}</text>
        <text x="50" y="78" text-anchor="middle" font-size="30" fill="${color}" opacity="0.95">${escapeXml(glyph)}</text>
    </svg>`;
}
function escapeXml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    }[c]));
}

// ============================================================================
//  DIPLOMACY UI
// ============================================================================
let diplomacyOpen = false;
let lastDiploEventsLength = 0;

function updateDiplomacyBtnVisibility() {
    if (!diplomacyBtn || !game) return;
    const shouldShow = game.diplomacyEnabled && game.playerCount >= 3 && !game.defeated.has(1);
    diplomacyBtn.classList.toggle('hidden', !shouldShow);
}

function countIncomingRequestsForHuman() {
    if (!game) return 0;
    let n = 0;
    for (const rel of Object.values(game.relations || {})) {
        if (rel.status !== 'pending') continue;
        if (rel.lastRequestFrom === 1) continue;
        if (rel.a === 1 || rel.b === 1) n++;
    }
    return n;
}

function refreshDiplomacyBadge() {
    if (!diplomacyBadge || !game) return;
    const n = countIncomingRequestsForHuman();
    if (n > 0) {
        diplomacyBadge.textContent = n;
        diplomacyBadge.classList.remove('hidden');
    } else {
        diplomacyBadge.classList.add('hidden');
    }
}

function openDiplomacyPanel() {
    if (!game || !game.diplomacyEnabled) return;
    diplomacyOpen = true;
    diplomacyPanel.classList.remove('hidden');
    renderDiplomacyPanel();
}
function closeDiplomacyPanel() {
    diplomacyOpen = false;
    diplomacyPanel.classList.add('hidden');
}
diplomacyBtn?.addEventListener('click', () => {
    if (diplomacyOpen) closeDiplomacyPanel();
    else openDiplomacyPanel();
});
diplomacyCloseBtn?.addEventListener('click', closeDiplomacyPanel);
diplomacyPanel?.querySelector('.tutorial-backdrop')?.addEventListener('click', closeDiplomacyPanel);

function fmtSec(ms) {
    return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

function renderDiplomacyPanel() {
    if (!game || !diplomacyList) return;
    const human = game.players[0];
    const cap = game.maxPeacesAllowed();
    const used = game.peaceCountFor(human.id);
    diplomacyCapMax.textContent = cap;
    diplomacyCapUsed.textContent = used;

    const rows = [];
    for (const p of game.players) {
        if (p.id === human.id) continue;
        const met = game.haveMet(human.id, p.id);
        const defeated = game.defeated.has(p.id);
        const rel = game.getRelation(human.id, p.id);
        const status = rel?.status || 'none';
        const color = COLORS[`PLAYER${p.id}`] || '#888';
        const portraitSvg = buildPortraitSvg(p, 44);

        let stanceHtml = '';
        let actionsHtml = '';

        if (defeated) {
            stanceHtml = `<span class="stance-chip dead">DEFEATED</span>`;
        } else if (!met) {
            stanceHtml = `<span class="stance-chip unknown">UNKNOWN</span>`;
        } else if (status === 'peace') {
            const elapsed = game.gameTime - (rel.formedAt || 0);
            const remaining = DIPLOMACY.PEACE_LOCK_MS - elapsed;
            if (remaining > 0) {
                stanceHtml = `<span class="stance-chip allied">ALLIED · LOCKED ${fmtSec(remaining)}</span>`;
                actionsHtml = `<button class="action-btn diplo-btn disabled" disabled>FORFEIT (LOCKED)</button>`;
            } else {
                stanceHtml = `<span class="stance-chip allied">ALLIED</span>`;
                actionsHtml = `<button class="action-btn diplo-btn danger" data-act="forfeit" data-id="${p.id}">FORFEIT</button>`;
            }
        } else if (status === 'pending') {
            if (rel.lastRequestFrom === human.id) {
                const remaining = game.remainingCooldown(human.id, p.id);
                stanceHtml = `<span class="stance-chip pending">REQUEST SENT</span>`;
                actionsHtml = `<button class="action-btn diplo-btn disabled" disabled>WAITING ${fmtSec(remaining)}</button>`;
            } else {
                stanceHtml = `<span class="stance-chip pending">INCOMING REQUEST</span>`;
                actionsHtml = `
                    <button class="action-btn diplo-btn accept" data-act="accept" data-id="${p.id}">ACCEPT</button>
                    <button class="action-btn diplo-btn danger" data-act="reject" data-id="${p.id}">REJECT</button>
                `;
            }
        } else {
            stanceHtml = `<span class="stance-chip hostile">HOSTILE</span>`;
            const chk = game.canPropose(human.id, p.id);
            if (chk.ok) {
                actionsHtml = `<button class="action-btn diplo-btn" data-act="propose" data-id="${p.id}">PROPOSE PEACE</button>`;
            } else {
                const cd = game.remainingCooldown(human.id, p.id);
                let label = 'UNAVAILABLE';
                if (cd > 0) label = `COOLDOWN ${fmtSec(cd)}`;
                else if (chk.reason === 'you at cap' || chk.reason === 'target at cap') label = 'CAP REACHED';
                else if (chk.reason === 'cap zero') label = 'NO PEACE IN 2P';
                else if (chk.reason === 'not met') label = 'NOT MET';
                actionsHtml = `<button class="action-btn diplo-btn disabled" disabled>${label}</button>`;
            }
        }

        const power = Math.round(game._aiShared?.power?.get(p.id) || 0);
        const displayName = met ? (p.name || `P${p.id}`) : 'UNKNOWN COMMANDER';
        rows.push(`
            <div class="diplo-row ${defeated ? 'dead' : ''} ${!met ? 'unmet' : ''}" style="--player-color: ${color}">
                <div class="diplo-portrait">${portraitSvg}</div>
                <div class="diplo-info">
                    <div class="diplo-name"><span class="diplo-dot" style="background:${color}"></span>${escapeXml(displayName)}</div>
                    <div class="diplo-sub">Power: ${power}</div>
                    ${stanceHtml}
                </div>
                <div class="diplo-actions">${actionsHtml}</div>
            </div>
        `);
    }

    diplomacyList.innerHTML = rows.join('') || `<div class="diplo-empty">No other commanders.</div>`;

    diplomacyList.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id, 10);
            const act = btn.dataset.act;
            let ok = false;
            if (act === 'propose') ok = game.proposePeace(1, id);
            else if (act === 'accept') ok = game.acceptPeace(1, id);
            else if (act === 'reject') ok = game.rejectPeace(1, id);
            else if (act === 'forfeit') ok = game.forfeitPeace(1, id);
            if (ok) {
                const targetName = game.players[id - 1]?.name || `P${id}`;
                if (act === 'propose') showNoti(`Peace proposal sent to ${targetName}`, 'success');
                else if (act === 'accept') showNoti(`Peace formed with ${targetName}`, 'success');
                else if (act === 'reject') showNoti(`Rejected peace with ${targetName}`, 'info');
                else if (act === 'forfeit') showNoti(`Peace broken with ${targetName}`, 'error');
                renderDiplomacyPanel();
            } else {
                showNoti('Action unavailable', 'error');
            }
        });
    });
}

function showIncomingRequestNoti(fromId) {
    const fromName = game.players[fromId - 1]?.name || `P${fromId}`;
    const container = document.getElementById('notis');

    while (container.children.length >= NOTI_MAX) container.firstElementChild?.remove();

    const noti = document.createElement('div');
    noti.className = 'noti info glass diplo-noti';
    noti.innerHTML = `
        <div class="diplo-noti-text"><b>${escapeXml(fromName)}</b> proposes peace</div>
        <div class="diplo-noti-actions">
            <button class="diplo-noti-btn accept">ACCEPT</button>
            <button class="diplo-noti-btn reject">REJECT</button>
        </div>
    `;
    container.appendChild(noti);
    const tid = setTimeout(() => noti.remove(), 15000);
    noti.querySelector('.accept').addEventListener('click', () => {
        if (game.acceptPeace(1, fromId)) showNoti(`Peace formed with ${fromName}`, 'success');
        clearTimeout(tid); noti.remove();
        if (diplomacyOpen) renderDiplomacyPanel();
    });
    noti.querySelector('.reject').addEventListener('click', () => {
        if (game.rejectPeace(1, fromId)) showNoti(`Rejected peace with ${fromName}`, 'info');
        clearTimeout(tid); noti.remove();
        if (diplomacyOpen) renderDiplomacyPanel();
    });
}

const _notifiedLockExpired = new Set();

function processDiplomacyEvents() {
    if (!game || !game.diploEvents) return;
    // Watch for peace locks expiring
    for (const rel of Object.values(game.relations || {})) {
        if (rel.status !== 'peace') continue;
        if (rel.a !== 1 && rel.b !== 1) continue;
        const other = rel.a === 1 ? rel.b : rel.a;
        const key = `${Math.min(rel.a, rel.b)}:${Math.max(rel.a, rel.b)}:${rel.formedAt}`;
        if (_notifiedLockExpired.has(key)) continue;
        if (game.gameTime - rel.formedAt >= DIPLOMACY.PEACE_LOCK_MS) {
            _notifiedLockExpired.add(key);
            const name = game.players[other - 1]?.name || `P${other}`;
            showNoti(`You may now forfeit peace with ${name}`, 'info');
        }
    }
    const evts = game.diploEvents;
    for (let i = lastDiploEventsLength; i < evts.length; i++) {
        const ev = evts[i];
        if (ev.kind === 'propose' && ev.to === 1) {
            showIncomingRequestNoti(ev.from);
        } else if (ev.kind === 'accept' && (ev.from === 1 || ev.to === 1)) {
            const other = ev.from === 1 ? ev.to : ev.from;
            const name = game.players[other - 1]?.name || `P${other}`;
            showNoti(`Peace formed with ${name}`, 'success');
        } else if (ev.kind === 'reject' && ev.to === 1) {
            const name = game.players[ev.from - 1]?.name || `P${ev.from}`;
            showNoti(`${name} rejected your peace offer`, 'error');
        } else if (ev.kind === 'forfeit' && (ev.from === 1 || ev.to === 1)) {
            const other = ev.from === 1 ? ev.to : ev.from;
            const name = game.players[other - 1]?.name || `P${other}`;
            const initiator = ev.from === 1 ? 'You' : name;
            showNoti(`${initiator} broke the peace`, 'error');
        }
    }
    lastDiploEventsLength = evts.length;
}

// ============================================================================
//  COMBAT LOG
// ============================================================================
function updateCombatLog() {
    if (!game) return;
    const log = game.combatLog;
    if (log.length === lastLogLength) return;

    const humanId = game.humanId;
    for (let i = lastLogLength; i < log.length; i++) {
        const entry = log[i];
        const div = document.createElement('div');
        const mins = Math.floor(entry.t / 60000);
        const secs = Math.floor((entry.t % 60000) / 1000);
        const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        let cls = 'build';
        if (entry.kind === 'hit' && entry.defenderId === humanId) cls = 'hit-own';
        else if (entry.kind === 'hit' && entry.attackerId === humanId) cls = 'hit-enemy';
        else if (entry.kind === 'kill') cls = 'kill';
        else if (entry.kind === 'intercepted') cls = 'intercepted';
        else if (entry.kind === 'upgrade') cls = 'upgrade';
        else if (entry.kind === 'demolish') cls = 'demolish';

        div.className = `log-entry ${cls}`;
        div.textContent = `[${timeStr}] ${entry.message}`;
        combatLogEntries.appendChild(div);
    }
    lastLogLength = log.length;
    combatLogEntries.scrollTop = combatLogEntries.scrollHeight;
}

document.getElementById('combat-log-toggle')?.addEventListener('click', () => {
    combatLogEntries.classList.toggle('hidden');
});

// ============================================================================
//  THREAT METRIC
// ============================================================================
function computeThreat() {
    if (!game) return 0;
    let n = 0;
    for (const proj of game.projectiles) {
        if (proj.owner === 1) continue;
        const tile = grid.getTile(proj.targetQR.q, proj.targetQR.r);
        if (tile && tile.owner === 1) n++;
    }
    return n;
}

// ============================================================================
//  END-GAME
// ============================================================================
let endShown = false;
let endOutcomeAt = 0;
const END_DELAY_MS = 6000;
function maybeShowEndGame() {
    if (!game || endShown) return;
    const nowReal = performance.now();
    const outcome = game.winner ? 'over' : (game.defeated.has(1) ? 'defeat' : null);
    if (!outcome) { endOutcomeAt = 0; return; }
    if (endOutcomeAt === 0) {
        endOutcomeAt = nowReal;
        showNoti(outcome === 'defeat' ? 'Your forces have fallen. Watching the battlefield…' : 'The theatre is decided. Final sweep…', 'info');
        return;
    }
    if (nowReal - endOutcomeAt < END_DELAY_MS) return;

    if (game.winner) {
        endShown = true;
        const coWinners = Array.isArray(game.coWinners) ? game.coWinners : null;
        const humanWon = coWinners ? coWinners.includes(1) : (game.winner === 1);
        endTitle.textContent = coWinners ? (humanWon ? 'SHARED VICTORY' : 'STANDOFF') : (humanWon ? 'VICTORY' : 'DEFEAT');
        endTitle.className = humanWon ? 'end-title win' : 'end-title loss';
        if (coWinners) {
            const names = coWinners.map(id => game.players[id - 1]?.name || `P${id}`).join(' \u2194 ');
            endSub.textContent = humanWon
                ? `Allied victory secured with ${names}.`
                : `The remaining coalition (${names}) holds the theatre.`;
        } else {
            endSub.textContent = humanWon
                ? `Commander ${game.players[0].name} dominates the theatre.`
                : `Forces overrun. ${game.players[game.winner - 1].name} takes the field.`;
        }
        renderEndStats();
        endOverlay.classList.remove('hidden');
    } else if (game.defeated.has(1)) {
        endShown = true;
        endTitle.textContent = 'DEFEAT';
        endTitle.className = 'end-title loss';
        endSub.textContent = 'Your government has fallen.';
        renderEndStats();
        endOverlay.classList.remove('hidden');
    }
}

function renderEndStats() {
    const p = game.players[0];
    const s = p.stats;
    const elapsed = game.gameTime / 1000;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);

    endStats.innerHTML = `
        <div class="end-stat-card"><div class="stat-label">Time</div><div class="stat-value">${mins}:${String(secs).padStart(2,'0')}</div></div>
        <div class="end-stat-card"><div class="stat-label">Built</div><div class="stat-value">${s.structuresBuilt}</div></div>
        <div class="end-stat-card"><div class="stat-label">Destroyed</div><div class="stat-value">${s.structuresDestroyed}</div></div>
        <div class="end-stat-card"><div class="stat-label">Lost</div><div class="stat-value">${s.structuresLost}</div></div>
        <div class="end-stat-card"><div class="stat-label">Gold Earned</div><div class="stat-value">${Math.floor(s.goldEarned)}</div></div>
        <div class="end-stat-card"><div class="stat-label">Gold Spent</div><div class="stat-value">${Math.floor(s.goldSpent)}</div></div>
        <div class="end-stat-card"><div class="stat-label">Damage Dealt</div><div class="stat-value">${Math.floor(s.damageDealt)}</div></div>
        <div class="end-stat-card"><div class="stat-label">Intercepted</div><div class="stat-value">${Math.floor(s.missilesIntercepted)}</div></div>
        <div class="end-stat-card"><div class="stat-label">Peak Tiles</div><div class="stat-value">${s.peakTiles}</div></div>
    `;
}

endRestart.addEventListener('click', () => {
    endOverlay.classList.add('hidden');
    endShown = false;
    endOutcomeAt = 0;
    appEl.classList.add('hidden');
    homepageEl.classList.remove('hidden');
});

// ============================================================================
//  MAIN LOOP
// ============================================================================
let lastInfoRefresh = 0;
let _lastInfoHash = '';
let missileStarvedSince = 0;
let lastScoreboardRefresh = 0;
let lastMusicIntensityUpdate = 0;
let musicIntensitySmoothed = 0;
let lastDamageTakenSample = 0;

const MINIMAP_STAT_PAGE_COUNT = 4;
let minimapStatPage = 0;

function sumStructureCount(shared, pid) {
    const o = shared?.structuresByPlayer?.get(pid);
    if (!o) return 0;
    let n = 0;
    for (const v of Object.values(o)) n += v;
    return n;
}

function fmtCompactGold(n) {
    const x = Math.floor(Math.abs(n));
    if (x >= 10000) return `${(x / 1000).toFixed(1)}k`;
    return String(x);
}

function refreshMinimapStatsOverlay() {
    if (!minimapStatsLabelEl || !minimapStatsLine1El || !minimapStatsLine2El || !game) return;
    const p = game.players[game.humanId - 1];
    if (!p) return;
    const shared = game._aiShared;
    const mp = shared?.missileProd?.get(p.id) ?? 0;
    const mc = shared?.missileCons?.get(p.id) ?? 0;
    const bld = sumStructureCount(shared, p.id);
    const s = p.stats;
    const page = ((minimapStatPage % MINIMAP_STAT_PAGE_COUNT) + MINIMAP_STAT_PAGE_COUNT) % MINIMAP_STAT_PAGE_COUNT;
    switch (page) {
        case 0:
            minimapStatsLabelEl.textContent = 'ECONOMY';
            minimapStatsLine1El.textContent = `$${Math.floor(p.gold)}`;
            minimapStatsLine2El.textContent = `+${p.goldRate.toFixed(1)}/s`;
            break;
        case 1:
            minimapStatsLabelEl.textContent = 'MISSILES';
            minimapStatsLine1El.textContent = String(Math.floor(p.missiles));
            minimapStatsLine2El.textContent = `+${mp.toFixed(1)}/s · -${mc.toFixed(1)}/s`;
            break;
        case 2:
            minimapStatsLabelEl.textContent = 'TERRITORY';
            minimapStatsLine1El.textContent = `${p.tileCount} tiles`;
            minimapStatsLine2El.textContent = `${bld} structures`;
            break;
        case 3:
        default:
            minimapStatsLabelEl.textContent = 'COMBAT';
            minimapStatsLine1El.textContent = `${Math.floor(s.damageDealt)} dmg`;
            minimapStatsLine2El.textContent = `${Math.floor(s.missilesIntercepted)} intercepted`;
            break;
    }
}

function refreshScoreboard() {
    if (!scoreboardEl || !game) return;
    const shared = game._aiShared;
    const humanId = game.humanId;

    const rows = game.players.map(p => {
        const alive = !game.defeated.has(p.id);
        const color = COLORS[`PLAYER${p.id}`] || '#888';
        const name = p.id === humanId ? (p.name || 'YOU') : (p.name || `CPU-${p.id}`);
        const mp = shared?.missileProd?.get(p.id) ?? 0;
        const mc = shared?.missileCons?.get(p.id) ?? 0;
        const bld = sumStructureCount(shared, p.id);
        const s = p.stats;
        let stance = '';
        if (p.id !== humanId && alive && game.diplomacyEnabled) {
            if (game.areAllied(humanId, p.id)) stance = '<span class="sb-stance allied" title="Allied">\uD83E\uDD1D</span>';
            else {
                const rel = game.getRelation(humanId, p.id);
                if (rel && rel.status === 'pending') stance = '<span class="sb-stance pending" title="Pending">\u29D6</span>';
            }
        }
        const metrics = alive
            ? `<span class="sb-tiles">${p.tileCount}</span><span class="sb-sep">·</span><span class="sb-gold">$${fmtCompactGold(p.gold)}</span><span class="sb-sep">·</span><span class="sb-miss">M${Math.floor(p.missiles)}</span>`
            : `<span class="sb-tiles">\u2014</span><span class="sb-sep">·</span><span class="sb-gold">\u2014</span><span class="sb-sep">·</span><span class="sb-miss">\u2014</span>`;
        const detail = alive
            ? `+${p.goldRate.toFixed(1)}/s · M +${mp.toFixed(1)}/-${mc.toFixed(1)}/s · DMG ${Math.floor(s.damageDealt)} · INT ${Math.floor(s.missilesIntercepted)} · BLD ${bld}`
            : '\u2014';
        return { id: p.id, alive, color, name, stance, metrics, detail, tileSort: alive ? p.tileCount : -1 };
    });
    rows.sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        if (a.id === humanId) return -1;
        if (b.id === humanId) return 1;
        return b.tileSort - a.tileSort;
    });
    scoreboardEl.innerHTML = rows.map(r =>
        `<div class="sb-row ${r.alive ? '' : 'dead'}" data-pid="${r.id}">` +
            `<div class="sb-line1">` +
                `<span class="sb-dot" style="background:${r.color}"></span>` +
                `<div class="sb-identity"><span class="sb-name">${escapeXml(r.name)}</span>${r.stance}</div>` +
                `<div class="sb-metrics">${r.metrics}</div>` +
            `</div>` +
            `<div class="sb-line2">${escapeXml(r.detail)}</div>` +
        `</div>`
    ).join('');
    scoreboardEl.querySelectorAll('.sb-row').forEach(row => {
        const pid = parseInt(row.dataset.pid, 10);
        if (pid && pid !== humanId && game.diplomacyEnabled && game.playerCount >= 3) {
            row.addEventListener('click', () => openDiplomacyPanel());
            row.style.cursor = 'pointer';
        }
    });
}

minimapStatsPrevBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    minimapStatPage = (minimapStatPage + MINIMAP_STAT_PAGE_COUNT - 1) % MINIMAP_STAT_PAGE_COUNT;
});
minimapStatsNextBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    minimapStatPage = (minimapStatPage + 1) % MINIMAP_STAT_PAGE_COUNT;
});

let lastBuildRefresh = 0;

function loop(time) {
    handleInput();
    Input.clearFrame();

    if (game) {
        game.update(time);
        updateAI(game, game.gameTime);
        renderer.multiSelected = multiSelected;
        renderer.render(game);
        renderer.renderMinimap(miniCanvas, game);

        const p1 = game.players[0];
        goldEl.innerText = Math.floor(p1.gold);
        tileEl.innerText = p1.tileCount;
        missileEl.innerText = p1.missiles;
        goldRateEl.innerText = `+${(p1.goldRate).toFixed(1)}/s`;

        const shared = game._aiShared;
        const mp = shared?.missileProd?.get(p1.id) ?? 0;
        const mc = shared?.missileCons?.get(p1.id) ?? 0;
        missileRateEl.innerText = `+${mp.toFixed(1)}/s · -${mc.toFixed(1)}/s`;
        missileRateEl.title = 'Missiles per second: produced (factories) · max consumption (rocket launchers + air bases, if firing continuously)';

        refreshMinimapStatsOverlay();

        if (p1.missiles === 0 && (p1.units.RL > 0 || p1.units.AB > 0)) {
            if (missileStarvedSince === 0) missileStarvedSince = time;
            missileEl.parentElement.classList.toggle('live', time - missileStarvedSince > 5000);
        } else {
            missileStarvedSince = 0;
            missileEl.parentElement.classList.remove('live');
        }

        const threat = computeThreat();
        threatEl.parentElement.classList.toggle('live', threat > 0);
        threatEl.innerText = threat;

        if (time - lastMusicIntensityUpdate > 500) {
            const dmgSnap = game.players[0].stats.damageTaken;
            const rawDamage = Math.max(0, dmgSnap - lastDamageTakenSample);
            lastDamageTakenSample = dmgSnap;
            const combatBusy = Math.min(1, threat / 6) * 0.7
                             + Math.min(1, game.projectiles.length / 40) * 0.3;
            const recentHit = rawDamage > 0 ? 0.4 : 0;
            musicIntensitySmoothed = musicIntensitySmoothed * 0.7
                                   + Math.min(1, combatBusy + recentHit) * 0.3;
            SFX.setMusicIntensity(musicIntensitySmoothed);
            lastMusicIntensityUpdate = time;
        }

        if (time - lastBuildRefresh > 150) {
            refreshBuildAffordability();
            lastBuildRefresh = time;
        }

        if (time - lastScoreboardRefresh > 500) {
            refreshScoreboard();
            refreshDiplomacyBadge();
            if (diplomacyOpen) renderDiplomacyPanel();
            lastScoreboardRefresh = time;
        }

        processDiplomacyEvents();

        if (game.selectedTile && !infoPanel.classList.contains('hidden') && time - lastInfoRefresh > 250) {
            const t = game.selectedTile;
            const hash = t.structure
                ? `${t.owner}|${t.contested ? 1 : 0}|${t.structure.type}|${t.structure.level}|${Math.round(t.hp)}|${t.maxHp}|${t.structure.target ? (t.structure.target.q+','+t.structure.target.r) : '-'}|${(t.structure.charge ?? '')}|${(t.structure.missilesProduced ?? '')}`
                : `${t.owner}|${t.contested ? 1 : 0}|empty`;
            if (hash !== _lastInfoHash) {
                selectTile(t);
                _lastInfoHash = hash;
            }
            lastInfoRefresh = time;
        }

        updateCombatLog();
        maybeShowEndGame();
    }
    requestAnimationFrame(loop);
}
