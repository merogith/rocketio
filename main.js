import { Hex, HexGrid, Camera } from './hexGrid.js?v=units3';
import { Game } from './game.js?v=units3';
import { Renderer } from './renderer.js?v=units3';
import { UNIT_STATS, GAME_CONFIG, getEffectiveMapRadius, VICTORY_MODES, COLORS, DIPLOMACY, govGoldBandLinesHtml } from './constants.js?v=units3';
import { getFactionSignatureL3, getSpecialUnitName } from './factions.js?v=units3';
import { TUTORIAL_PAGES } from './tutorial.js?v=units3';
import { getMissionById, CAMPAIGN_MISSIONS } from './campaignData.js?v=units3';
import { loadCampaignProgress, canStartMission, markMissionBeaten } from './campaignProgress.js?v=units3';
import { applyCampaignScenario, m1BuildTutorialCheckPlace, m1OnBuildPlaced } from './campaignScenarios.js?v=units3';
import { Input } from './input.js?v=units3';
import { updateAI } from './ai.js?v=units3';
import { SFX } from './sfx.js?v=units3';
import { FACTIONS, getFaction, describeModsList, getPlayerMods } from './factions.js?v=units3';
import { FACTION_BANNERS, PLACEHOLDER_LEADER_PORTRAIT, getSpecialUnitBlurb, getLeaderPerkText } from './factionsDisplay.js?v=units3';

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
const rushBtn = document.getElementById('rush-btn');
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
const campaignScreenEl = document.getElementById('campaign-screen');
const campaignMissionListEl = document.getElementById('campaign-mission-list');
const campaignBackBtn = document.getElementById('campaign-back');
const campaignBriefingOverlay = document.getElementById('campaign-briefing-overlay');
const campaignBriefingTitle = document.getElementById('campaign-briefing-title');
const campaignBriefingBody = document.getElementById('campaign-briefing-body');
const campaignBriefingBegin = document.getElementById('campaign-briefing-begin');
const campaignQuestEl = document.getElementById('campaign-quest');
const campaignQuestPrimary = document.getElementById('campaign-quest-primary');
const campaignQuestHint = document.getElementById('campaign-quest-hint');
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

const TARGETABLE_TYPES = new Set(['RL', 'B', 'D', 'SU', 'M', 'AB', 'DDG', 'SSG']);
const NAVY_BUILD_TYPES_UI = new Set(['DDG', 'AF', 'SSG', 'CV']);

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

/** @type {{ missionId: number } | null} */
let activeCampaign = null;
let endReturnTarget = 'home';

function campaignLineToHtml(line) {
    if (!line) return '';
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc(line).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function showCampaignQuestPanel(m) {
    if (!campaignQuestEl) return;
    if (!m) {
        campaignQuestEl.classList.add('hidden');
        return;
    }
    campaignQuestEl.classList.remove('hidden');
    if (campaignQuestPrimary) {
        campaignQuestPrimary.innerHTML = campaignLineToHtml(m.objectivePrimary || '');
    }
    if (campaignQuestHint) {
        const h = m.objectiveHint || '';
        campaignQuestHint.innerHTML = h ? campaignLineToHtml(h) : '';
        campaignQuestHint.classList.toggle('hidden', !h);
    }
}

function hideCampaignQuestPanel() {
    campaignQuestEl?.classList.add('hidden');
}

function syncCampaignBuildQuestPanel() {
    if (!game?.campaign || !campaignQuestPrimary) return;
    const c = game.campaign;
    const bt = c.buildTutorial;
    if (bt?.active) {
        const st = bt.steps[bt.step];
        if (st) {
            campaignQuestPrimary.innerHTML = campaignLineToHtml(st.questPrimary);
            if (campaignQuestHint) {
                campaignQuestHint.innerHTML = campaignLineToHtml(st.questHint);
                campaignQuestHint.classList.remove('hidden');
            }
        }
        return;
    }
    const op = c._objectivePrimary ?? c.mission?.objectivePrimary;
    if (op) campaignQuestPrimary.innerHTML = campaignLineToHtml(op);
    if (campaignQuestHint) {
        const h = c._objectiveHint ?? c.mission?.objectiveHint;
        campaignQuestHint.innerHTML = h ? campaignLineToHtml(h) : '';
        campaignQuestHint.classList.toggle('hidden', !h);
    }
}

function m1AutoselectBuild() {
    const st = game?.campaign?.buildTutorial?.steps[game.campaign?.buildTutorial?.step];
    if (!st) return;
    const btn = document.querySelector(`.build-btn[data-type="${st.type}"]`);
    if (btn) btn.click();
}

function updateM1BuildButtonLock() {
    const on = game?.campaign?.buildTutorial?.active;
    if (!on) {
        buildBtns.forEach(b => b.classList.remove('campaign-locked'));
        return;
    }
    const st = game.campaign.buildTutorial.steps[game.campaign.buildTutorial.step];
    buildBtns.forEach(btn => {
        const t = btn.dataset.type;
        btn.classList.toggle('campaign-locked', !!(st && t !== st.type));
    });
}

function showCampaignBriefingInGame(m) {
    if (!campaignBriefingOverlay || !m) return;
    if (campaignBriefingTitle) campaignBriefingTitle.textContent = m.briefingTitle || 'BRIEFING';
    if (campaignBriefingBody) {
        campaignBriefingBody.innerHTML = (m.briefingLines || [])
            .map(p => `<p class="cb-line">${campaignLineToHtml(p)}</p>`)
            .join('');
    }
    campaignBriefingOverlay.classList.remove('hidden');
    if (game) {
        game.paused = true;
        pauseOverlay?.classList.remove('hidden');
    }
}

function closeCampaignBriefingInGame() {
    campaignBriefingOverlay?.classList.add('hidden');
    if (game) {
        game.paused = false;
        if (!gameMenuOpen) pauseOverlay?.classList.add('hidden');
    }
    m1AutoselectBuild();
    updateM1BuildButtonLock();
}

function openCampaignScreen() {
    if (campaignScreenEl) {
        campaignScreenEl.classList.remove('hidden');
        renderCampaignMissionList();
    }
}

function closeCampaignScreen() {
    campaignScreenEl?.classList.add('hidden');
}

function startCampaignMission(missionId) {
    const m = getMissionById(missionId);
    if (!m || !m.implemented) {
        showNoti('That operation is not available yet.', 'info');
        return;
    }
    const prog = loadCampaignProgress();
    if (!canStartMission(missionId, prog.beaten)) {
        showNoti('Locked — clear the prior op first.', 'info');
        return;
    }
    const nameInput = document.getElementById('player-name');
    const playerName = ((nameInput?.value || '').trim() || 'ECLIPSE').toUpperCase();
    if (nameInput) nameInput.value = playerName;

    activeCampaign = { missionId: m.id };
    endReturnTarget = 'campaign';
    endShown = false;
    endOutcomeAt = 0;
    gameMenuOpen = false;
    gameMenu?.classList.add('hidden');

    closeCampaignScreen();
    homepageEl.classList.add('hidden');
    appEl.classList.remove('hidden');

    SFX.init();
    SFX.setSfxVolume(Input.getSetting('sfxVolume') ?? 0.7);
    SFX.setMusicVolume(Input.getSetting('musicVolume') ?? 0.7);
    SFX.setSfxEnabled(Input.getSetting('sfxEnabled') !== false);
    SFX.setMusicEnabled(Input.getSetting('musicEnabled') !== false);

    const victoryConfig = { mode: m.victoryMode, param: m.victoryParam == null ? null : m.victoryParam };
    initWorld(m.mapSize, m.mapStyle, m.playerCount, playerName, victoryConfig, m.difficulty, { missionId: m.id });

    showCampaignQuestPanel(m);
    syncCampaignBuildQuestPanel();
    showCampaignBriefingInGame(m);
    if (!loopRunning) {
        loopRunning = true;
        requestAnimationFrame(loop);
    }
}

function renderCampaignMissionList() {
    if (!campaignMissionListEl) return;
    const prog = loadCampaignProgress();
    campaignMissionListEl.innerHTML = '';
    for (const m of CAMPAIGN_MISSIONS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'campaign-mission-item';
        const can = canStartMission(m.id, prog.beaten) && m.implemented;
        const prefix = m.act === 1 ? 'I' : 'II';
        const done = !!prog.beaten[m.id];
        const label = m.implemented
            ? (done ? 'CLEARED' : (can ? 'DEPLOY' : 'LOCKED'))
            : 'SOON';
        btn.innerHTML = `
            <span class="cm-idx">M${m.id} · ${prefix}</span>
            <span class="cm-name">${m.codename}</span>
            <span class="cm-st ${done ? 'cm-cleared' : (can && m.implemented ? 'cm-ready' : 'cm-locked')}">${label}</span>
        `;
        if (can) {
            btn.addEventListener('click', () => startCampaignMission(m.id));
        } else if (!m.implemented) {
            btn.disabled = true;
            btn.classList.add('campaign-mission-dim');
        } else {
            btn.disabled = true;
            btn.classList.add('campaign-mission-dim');
        }
        campaignMissionListEl.appendChild(btn);
    }
}

function openSentinelCampaignFromMenu(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    if (!campaignScreenEl) {
        console.error('RocketIO: #campaign-screen missing');
        return;
    }
    homepageEl?.classList.add('hidden');
    try {
        openCampaignScreen();
    } catch (err) {
        console.error('RocketIO: campaign open failed', err);
        showNoti('Campaign failed to load. Check the console (F12).', 'info');
        homepageEl?.classList.remove('hidden');
    }
}

function registerCampaignOnWindow() {
    if (!document.getElementById('campaign-btn')) {
        console.error('RocketIO: #campaign-btn not in DOM. Hard-refresh the page (Ctrl+Shift+R).');
        return;
    }
    window.rocketioOpenCampaign = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (!homepageEl) return;
        openSentinelCampaignFromMenu(e);
    };
}
registerCampaignOnWindow();
if (campaignScreenEl && !campaignScreenEl.classList.contains('hidden')) {
    renderCampaignMissionList();
}

function initWorld(mapSize, mapStyle, playerCount, playerName, victoryConfig, difficulty = 'normal', campaign = null, playerOptions = null) {
    const radius = getEffectiveMapRadius(mapSize, playerCount);
    grid = new HexGrid(radius, 30, mapStyle, playerCount);
    game = new Game(grid);
    game.aiDifficulty = difficulty;
    game.diplomacyEnabled = campaign ? false : (Input.getSetting('diplomacyEnabled') !== false);
    renderer = new Renderer(canvas, grid, camera);
    renderer.settings.screenShake = Input.getSetting('screenShake');
    renderer.settings.threatRings = Input.getSetting('threatRings') !== false;
    renderer.settings.hoverRange = Input.getSetting('hoverRange') !== false;
    renderer.settings.projectileVisual = getProjectileVisualSetting();

    camera.x = 0; camera.y = 0; camera.scale = 0.6;

    const po = playerOptions && typeof playerOptions === 'object' ? playerOptions : {};
    const startOpt = {
        humanFactionId: po.humanFactionId != null ? (po.humanFactionId | 0) : 0,
        humanLeaderIdx: po.humanLeaderIdx != null ? (po.humanLeaderIdx | 0) : 0,
    };
    game.start(playerCount, playerName, victoryConfig, startOpt);
    game.campaign = null;

    if (campaign && campaign.missionId != null) {
        const m = getMissionById(campaign.missionId);
        if (m && m.implemented) {
            game.campaign = {
                missionId: m.id,
                mission: m,
                freezeEnemyAi: !!m.freezeEnemyAi,
                _objectivePrimary: m.objectivePrimary,
                _objectiveHint: m.objectiveHint
            };
            applyCampaignScenario(game, grid, m.id);

            // Defensive guard: if the scenario somehow left the human player without a Government
            // (e.g. an old/buggy scenario script destroyed the starter without rebuilding),
            // restore a Gov L3 + adjacent MF L1 so we can't get instant-defeated by checkVictory.
            const humanHasGov = Array.from(grid.tiles.values())
                .some(t => t.owner === 1 && t.structure?.type === 'G');
            if (!humanHasGov) {
                console.warn('[RocketIO] Scenario left the human without a Government — restoring starter.');
                const rebuildAt = Array.from(grid.tiles.values())
                    .find(t => t.buildable && !t.structure
                        && (t.owner === 1 || t.owner == null));
                if (rebuildAt) {
                    rebuildAt.owner = 1;
                    rebuildAt.contested = false;
                    game.buildStructure(rebuildAt, 'G', 1, 2, true);
                    const neighbor = new Hex(rebuildAt.q, rebuildAt.r).getNeighbors()
                        .map(h => grid.getTile(h.q, h.r))
                        .find(t => t && t.buildable && !t.structure);
                    if (neighbor) {
                        neighbor.owner = 1;
                        game.buildStructure(neighbor, 'MF', 1, 0, true, true);
                    }
                    if (game.campaign) game.campaign.buildTutorial = null;
                    game._markStructuresDirty();
                    game.updateBorders();
                    game.recomputeSupply();
                    game.recomputeFog();
                }
            }
        }
    }

    const p1Start = Array.from(grid.tiles.values()).find(t => t.owner === 1);
    if (p1Start) {
        const pos = grid.hexToPixel(p1Start.q, p1Start.r);
        camera.x = -pos.x; camera.y = -pos.y;
    }

    {
        const p0 = game.players[0];
        const f0 = getFaction(p0.factionId);
        const l0 = f0.leaders[p0.leaderIdx] || f0.leaders[0];
        playerLabelEl.textContent = `${p0.name} · ${f0.code} · ${l0.name}`;
    }
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
    missileStarvedSince = 0;
    endShown = false;
    endOutcomeAt = 0;
}

function resize() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
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

function updatePlayerCountDiplomacyHint() {
    const el = document.getElementById('diplomacy-player-hint');
    if (!el) return;
    const show = selectedPlayerCount < 3;
    el.classList.toggle('hidden', !show);
}
wireOptionRow('player-count-row', v => {
    selectedPlayerCount = parseInt(v, 10);
    updatePlayerCountDiplomacyHint();
});
updatePlayerCountDiplomacyHint();
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

document.getElementById('play-btn')?.addEventListener('click', () => {
    // #region agent log
    fetch('http://127.0.0.1:7800/ingest/05987a93-cd05-4494-a5fb-56e4fc3c37c8', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7abbd6' }, body: JSON.stringify({ sessionId: '7abbd6', location: 'main.js:play-btn', message: 'play clicked', hypothesisId: 'H2', data: { map: selectedMapStyle, players: selectedPlayerCount }, timestamp: Date.now() }) }).catch(() => { });
    // #endregion
    const nameInput = document.getElementById('player-name');
    commanderName = (nameInput.value || '').trim().toUpperCase() || 'COMMANDER';
    activeCampaign = null;
    endReturnTarget = 'home';
    endShown = false;
    endOutcomeAt = 0;
    closeCampaignScreen();
    hideCampaignQuestPanel();
    closeCampaignBriefingInGame();
    homepageEl.classList.add('hidden');
    appEl.classList.remove('hidden');

    SFX.init();
    SFX.setSfxVolume(Input.getSetting('sfxVolume') ?? 0.7);
    SFX.setMusicVolume(Input.getSetting('musicVolume') ?? 0.7);
    SFX.setSfxEnabled(Input.getSetting('sfxEnabled') !== false);
    SFX.setMusicEnabled(Input.getSetting('musicEnabled') !== false);

    const victoryConfig = { mode: selectedVictoryMode, param: selectedVictoryParam };
    const fSel = document.getElementById('faction-select');
    const lSel = document.getElementById('leader-select');
    const hF = fSel ? (parseInt(fSel.value, 10) || 0) : 0;
    const hL = lSel ? (parseInt(lSel.value, 10) || 0) : 0;
    try {
        initWorld(selectedMapSize, selectedMapStyle, selectedPlayerCount, commanderName, victoryConfig, selectedDifficulty, null, { humanFactionId: hF, humanLeaderIdx: hL });
    } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7800/ingest/05987a93-cd05-4494-a5fb-56e4fc3c37c8', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7abbd6' }, body: JSON.stringify({ sessionId: '7abbd6', location: 'main.js:play-btn', message: 'initWorld threw', hypothesisId: 'H3', data: { err: String(e) }, timestamp: Date.now() }) }).catch(() => { });
        // #endregion
        throw e;
    }
    // #region agent log
    fetch('http://127.0.0.1:7800/ingest/05987a93-cd05-4494-a5fb-56e4fc3c37c8', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7abbd6' }, body: JSON.stringify({ sessionId: '7abbd6', location: 'main.js:play-btn', message: 'initWorld ok', hypothesisId: 'H3', data: { hasGame: !!game }, timestamp: Date.now() }) }).catch(() => { });
    // #endregion
    if (!loopRunning) { loopRunning = true; requestAnimationFrame(loop); }
});

campaignBackBtn?.addEventListener('click', () => {
    closeCampaignScreen();
    homepageEl.classList.remove('hidden');
});

campaignBriefingBegin?.addEventListener('click', () => {
    closeCampaignBriefingInGame();
});

document.getElementById('tutorial-btn')?.addEventListener('click', () => {
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
    if (!settingsOpen) {
        settingsOverlay.classList.add('hidden');
        Input.stopRebind();
        return;
    }
    settingsOverlay.classList.add('hidden');
    Input.stopRebind();
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
    if (v === 'none' || v === 'low' || v === 'medium' || v === 'high' || v === 'unlimited') return v;
    return 'medium';
}

function syncSettingsToggles() {
    const qb = document.getElementById('opt-quick-build');
    const hu = document.getElementById('opt-hover-upgrade');
    const dp = document.getElementById('opt-drag-paint');
    const ss = document.getElementById('opt-screen-shake');
    const tr = document.getElementById('opt-threat-rings');
    const hr = document.getElementById('opt-hover-range');
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
    if (tr) tr.checked = Input.getSetting('threatRings') !== false;
    if (hr) hr.checked = Input.getSetting('hoverRange') !== false;
    if (fs) fs.checked = !!document.fullscreenElement;
    const aph = document.getElementById('opt-auto-pause-hidden');
    if (aph) aph.checked = Input.getSetting('autoPauseOnHidden') !== false;
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
['opt-quick-build', 'opt-hover-upgrade', 'opt-drag-paint', 'opt-auto-pause-hidden', 'opt-screen-shake', 'opt-threat-rings', 'opt-hover-range', 'opt-diplomacy', 'opt-sfx', 'opt-music'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const key = {
        'opt-quick-build':'quickBuild',
        'opt-hover-upgrade':'hoverUpgrade',
        'opt-drag-paint':'dragPaintBuild',
        'opt-auto-pause-hidden':'autoPauseOnHidden',
        'opt-screen-shake':'screenShake',
        'opt-threat-rings':'threatRings',
        'opt-hover-range':'hoverRange',
        'opt-diplomacy':'diplomacyEnabled',
        'opt-sfx':'sfxEnabled',
        'opt-music':'musicEnabled',
    }[id];
    el.addEventListener('change', () => {
        Input.setSetting(key, el.checked);
        if (renderer) {
            renderer.settings.screenShake = Input.getSetting('screenShake');
            renderer.settings.threatRings = Input.getSetting('threatRings') !== false;
            renderer.settings.hoverRange = Input.getSetting('hoverRange') !== false;
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
            const sel = getProjectileVisualSetting();
            if (renderer) renderer.settings.projectileVisual = sel;
            row.querySelectorAll('.option-btn').forEach(b => {
                b.classList.toggle('selected', b.dataset.value === sel);
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
                const m1c = m1BuildTutorialCheckPlace(game, selectedBuildType, tile);
                if (!m1c.ok) {
                    showNoti(m1c.msg, 'error');
                } else {
                    const success = game.buildStructure(tile, selectedBuildType, 1);
                    if (!success) {
                        if (NAVY_BUILD_TYPES_UI.has(selectedBuildType)) {
                            const nDef = UNIT_STATS[selectedBuildType];
                            const nCost = nDef?.levels?.[0]?.cost ?? 0;
                            if (tile.buildable) {
                                showNoti("Navy: not on land — only on your owned, uncontested water (claim with Government, M3, or Port influence)", "error");
                            } else if (tile.contested) {
                                showNoti("Navy: that water is contested", "error");
                            } else if (tile.owner !== 1) {
                                showNoti("Navy: need water you control. Build a Port on the coast or push Government/M3 influence over it", "error");
                            } else if (tile.structure) {
                                showNoti("That hex already has a structure", "error");
                            } else if (game.players[0].gold < nCost) {
                                showNoti("Insufficient gold", "error");
                            } else {
                                showNoti("Cannot place navy here", "error");
                            }
                        } else if (selectedBuildType === 'PT') {
                            const ptCost = UNIT_STATS.PT?.levels?.[0]?.cost ?? 0;
                            if (!tile.buildable) {
                                showNoti("Port: must build on coastal land (next to water)", "error");
                            } else if (!game.isCoastalLand(tile)) {
                                showNoti("Port: not coastal — pick land that touches the sea", "error");
                            } else if (tile.contested) {
                                showNoti("Port: tile is contested", "error");
                            } else if (tile.structure) {
                                showNoti("That hex already has a structure", "error");
                            } else if (tile.owner !== 1) {
                                showNoti("Port: must build on your own coastal land", "error");
                            } else if (game.players[0].gold < ptCost) {
                                showNoti("Insufficient gold", "error");
                            } else {
                                showNoti("Cannot place port here", "error");
                            }
                        } else if (!tile.buildable) {
                            showNoti("Can't build on water", "error");
                        } else if (tile.contested) showNoti("Tile is contested", "error");
                        else if (selectedBuildType === 'M' && !game.isVisibleTo(tile, 1)) showNoti("No vision — need a structure nearby", "error");
                        else if (selectedBuildType === 'M' && tile.owner && tile.owner !== 1) showNoti("Militia: your territory or neutral only", "error");
                        else if (tile.owner !== 1 && selectedBuildType !== 'M') showNoti("Must build on your territory", "error");
                        else showNoti("Insufficient gold, limit reached, or occupied", "error");
                    } else {
                        const m1n = m1OnBuildPlaced(game, selectedBuildType, tile, true);
                        game.recomputeFog();
                        if (m1n?.nudge === 'next') showNoti('Next: Missile Factory — key 4, then the new pulsing hex.', 'info');
                        if (m1n?.nudge === 'complete') {
                            showNoti('Training complete. Main objective is in the op panel — take their Government.', 'success');
                        }
                        syncCampaignBuildQuestPanel();
                        updateM1BuildButtonLock();
                        m1AutoselectBuild();
                    }
                }
                if (m1c.ok && !Input.getSetting('quickBuild')) resetSelection();
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

        if (isDragging && selectedBuildType && !game.campaign?.buildTutorial?.active
            && Input.getSetting('dragPaintBuild') && tile) {
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
        if (game && !game.paused && !game.winner && !game.defeated.has(1) && Input.getSetting('autoPauseOnHidden') !== false) {
            setPaused(true);
        }
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
        if (game.campaign?.buildTutorial?.active) {
            showNoti('Finish the training builds first (pulsing hexes).', 'error');
        } else if (multiSelected.length > 0) {
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
        if (game.campaign?.buildTutorial?.active) {
            showNoti('Finish the training builds first.', 'error');
        } else {
        const count = game.upgradeAll(1);
        if (count > 0) showNoti(`Upgraded ${count} structures!`, "success");
        else showNoti("Nothing to upgrade", "error");
        if (multiSelected.length > 0) showMultiSelectPanel();
        if (game.selectedTile && !infoPanel.classList.contains('hidden')) selectTile(game.selectedTile);
        }
    }

    if (Input.consumePress('demolish')) {
        if (game.campaign?.buildTutorial?.active) {
            showNoti('No demolitions during training — follow the pulsing hexes.', 'error');
        } else if (multiSelected.length > 0) {
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
    const buildTypes = ['G', 'RL', 'AAS', 'MF', 'B', 'M', 'D', 'SU', 'AB', 'BUNK', 'RC', 'TH', 'EW', 'PT', 'DDG', 'AF', 'SSG', 'CV', 'ICBM'];
    buildTypes.forEach((type, i) => {
        if (Input.consumePress(`build_${type}`)) {
            if (game.campaign?.buildTutorial?.active) {
                const st = game.campaign.buildTutorial.steps[game.campaign.buildTutorial.step];
                if (st && type !== st.type) {
                    showNoti(`Training: use the ${st.label} hotkey (key ${st.key}) first.`, 'error');
                    return;
                }
            }
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
        if (activeCampaign) {
            const m = getMissionById(activeCampaign.missionId);
            if (m && m.implemented) {
                const nameInput = document.getElementById('player-name');
                const pn = ((nameInput?.value || '').trim() || game.players[0].name).toUpperCase();
                const vc = { mode: m.victoryMode, param: m.victoryParam == null ? null : m.victoryParam };
                initWorld(m.mapSize, m.mapStyle, m.playerCount, pn, vc, m.difficulty, { missionId: m.id });
                showCampaignQuestPanel(m);
                syncCampaignBuildQuestPanel();
                showCampaignBriefingInGame(m);
            }
        } else {
            const vc = { mode: selectedVictoryMode, param: selectedVictoryParam };
            const fSel = document.getElementById('faction-select');
            const lSel = document.getElementById('leader-select');
            const hF = fSel ? (parseInt(fSel.value, 10) || 0) : 0;
            const hL = lSel ? (parseInt(lSel.value, 10) || 0) : 0;
            initWorld(selectedMapSize, selectedMapStyle, selectedPlayerCount, commanderName, vc, selectedDifficulty, null, { humanFactionId: hF, humanLeaderIdx: hL });
            hideCampaignQuestPanel();
        }
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
    closeCampaignBriefingInGame();
    hideCampaignQuestPanel();
    if (activeCampaign) {
        homepageEl.classList.add('hidden');
        endReturnTarget = 'campaign';
        openCampaignScreen();
    } else {
        homepageEl.classList.remove('hidden');
    }
});

// ============================================================================
//  BUILD UI
// ============================================================================
let tooltipTimer = null;
buildBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (game?.campaign?.buildTutorial?.active) {
            const st = game.campaign.buildTutorial.steps[game.campaign.buildTutorial.step];
            if (st && type !== st.type) {
                showNoti(`Training: select ${st.label} only (key ${st.key}).`, 'error');
                return;
            }
        }
        if (selectedBuildType === type) { resetSelection(); return; }
        buildBtns.forEach(b => b.classList.remove('active'));
        selectedBuildType = type;
        btn.classList.add('active');
        infoPanel.classList.add('hidden');

        const def = UNIT_STATS[type];
        const lvl = def.levels[0];
        const label = def.name.toUpperCase();
        const costStr = `$${lvl.cost}`;
        const hint = type === 'M'
            ? 'PLACE on a VISIBLE tile you own or neutral land'
            : (NAVY_BUILD_TYPES_UI.has(type) ? 'PLACE on your owned, uncontested water'
            : (type === 'PT' ? 'PLACE on your coastal land (touching water)'
            : 'PLACE on your own territory (land)'));
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

function infoStatRow(label, val) {
    return `<div class="info-row"><span class="info-label">${label}</span><span class="info-val">${val}</span></div>`;
}

function computeStructureDps(stats) {
    if (!stats.damage || !stats.interval) return null;
    const volley = stats.damage * (stats.projectiles || 1);
    return volley / (stats.interval / 1000);
}

/** Lv3 (levelIdx 2) special — shown in selection info panel. */
function structureL3PerkHtml(type, levelIdx, opts = {}) {
    if (levelIdx !== 2) return '';
    switch (type) {
        case 'G':
            return `<p class="info-perk"><b>Lv3 — Capitol</b> · Friendly tiles in influence: +${Math.round((GAME_CONFIG.GOV_L3_GOLD_AURA_MULT - 1) * 100)}% gold AND friendly structures regenerate ×${GAME_CONFIG.GOV_L3_REGEN_AURA_MULT} HP/s (non-stacking).</p>`;
        case 'RL':
            return `<p class="info-perk"><b>Lv3 — Siege</b> · 2 missiles per volley. ${Math.round(GAME_CONFIG.RL_L3_SPLASH_CHANCE * 100)}% chance to deal ${Math.round(GAME_CONFIG.RL_L3_SPLASH_MULT * 100)}% splash damage to adjacent enemy structures.</p>`;
        case 'AB':
            return `<p class="info-perk"><b>Lv3 — Stealth sortie</b> · ${Math.round(GAME_CONFIG.AB_L3_STEALTH_CHANCE * 100)}% non-interceptable strike using ${GAME_CONFIG.AB_L3_STEALTH_MISSILES} missiles.</p>`;
        case 'D':
            return `<p class="info-perk"><b>Lv3 — Jamming</b> · Enemy RL, AB, Barracks, Militia &amp; AAS in range: +${Math.round((GAME_CONFIG.DRONE_L3_RECHARGE_DEBUFF_MULT - 1) * 100)}% fire interval (MF excluded).</p>`;
        case 'SU': {
            // Faction-unique doctrine string. opts.factionId is passed by the selection panel renderer.
            const fid = opts.factionId ?? 0;
            const sig = getFactionSignatureL3(fid);
            const sn = getSpecialUnitName(fid);
            return `<p class="info-perk"><b>Lv3 — ${sig.label}</b> · ${sn}: ${sig.desc}</p>`;
        }
        case 'MF':
            return `<p class="info-perk"><b>Lv3 — Arsenal</b> · Adjacent friendly factories: +${Math.round((GAME_CONFIG.MF_L3_NEIGHBOR_PRODUCTION_MULT - 1) * 100)}% output. <b>MF3 itself</b>: +${Math.round(GAME_CONFIG.MF_L3_SELF_BONUS_PER_ADJACENT_MF * 100)}% output per adjacent friendly MF (cap +${Math.round(GAME_CONFIG.MF_L3_SELF_BONUS_CAP * 100)}%).</p>`;
        case 'B':
            return `<p class="info-perk"><b>Lv3 — Command</b> · In influence: allies +${Math.round((GAME_CONFIG.BARRACKS_L3_COMMAND_OUT_MULT - 1) * 100)}% damage dealt, −${Math.round((1 - GAME_CONFIG.BARRACKS_L3_COMMAND_IN_MULT) * 100)}% damage taken (non-stacking).</p>`;
        case 'M':
            return `<p class="info-perk"><b>Lv3 — Insurgency</b> · Militia HQ keeps Lv2 range &amp; damage; influence radius 1 (+$${UNIT_STATS.M.levels[2].goldPerTile}/tile/s). <b>Operates while contested</b> — fire, regen and influence project through enemy pressure.</p>`;
        case 'AAS':
            return `<p class="info-perk"><b>Lv3 — Iron Dome</b> · Deeper magazine (cap ${UNIT_STATS.AAS.levels[2].chargeCap}) and reliable salvo (×${UNIT_STATS.AAS.levels[2].missilesRecharged} intercepts per recharge). Saturation-defense.</p>`;
        case 'DDG':
            return `<p class="info-perk"><b>Lv3 — CEC Datalink</b> · +${Math.round((GAME_CONFIG.DDG3_CEC_DMG_MULT - 1) * 100)}% damage vs <b>enemy ships</b> when any friendly <b>navy</b> is within ${GAME_CONFIG.DDG3_CEC_RADIUS} hex.</p>`;
        case 'AF':
            return `<p class="info-perk"><b>Lv3 — Aegis BMD</b> · +${GAME_CONFIG.AF3_NAVY_ORIGIN_RANGE} intercept range vs naval-fired shots. Spotted shooters take +${Math.round((GAME_CONFIG.AF3_ILLUM_DMG_MULT - 1) * 100)}% damage from your DDG &amp; SSG.</p>`;
        case 'SSG':
            return `<p class="info-perk"><b>Lv3 — Bastion</b> · +${Math.round((GAME_CONFIG.SSG3_BASTION_DMG_MULT - 1) * 100)}% damage vs <b>enemy ships</b> with friendly navy adjacent. <b>${Math.round(GAME_CONFIG.SSG_L3_STEALTH_CHANCE * 100)}% of cruise missiles fire as stealth</b> (non-interceptable).</p>`;
        case 'PT':
            return `<p class="info-perk"><b>Lv3 — Free Trade &amp; Fleet Command</b> · Navy in influence: +${Math.round((GAME_CONFIG.PORT_L3_NAVY_DAMAGE_MULT - 1) * 100)}% damage, −${Math.round((1 - GAME_CONFIG.PORT_L3_NAVY_INTERVAL_MULT) * 100)}% fire interval. Port sea income +${Math.round(GAME_CONFIG.PORT_L3_TRADE_PER_OTHER_PORT * 100)}% per OTHER friendly Port (cap +${Math.round(GAME_CONFIG.PORT_L3_TRADE_CAP * 100)}%).</p>`;
        case 'BUNK':
            return `<p class="info-perk"><b>Lv3 — Hardened</b> · Takes ${Math.round((1 - GAME_CONFIG.BUNK_L3_TAKEN_MULT) * 100)}% less damage from all sources. No attack, no income — pure HP wall.</p>`;
        case 'RC':
            return `<p class="info-perk"><b>Lv3 — Aerial Surveillance</b> · Largest vision radius in the game (${UNIT_STATS.RC.levels[2].vision} hex). Spots stealth strikes, deep enemy movements, and ambushes before they land.</p>`;
        case 'TH':
            return `<p class="info-perk"><b>Lv3 — Trade Network</b> · +$${UNIT_STATS.TH.levels[2].tradeBase}/s base, +$${UNIT_STATS.TH.levels[2].tradePerGov} per other Gov, +$${UNIT_STATS.TH.levels[2].tradePerPort} per Port. Also <b>+${Math.round(UNIT_STATS.TH.levels[2].tradeGovBonus * 100)}% gold</b> to all your Govs (capped 20%).</p>`;
        case 'EW':
            return `<p class="info-perk"><b>Lv3 — Spoofing</b> · Friendly tiles in range take ${Math.round((1 - UNIT_STATS.EW.levels[2].ewDmgMult) * 100)}% less damage from interceptable missiles, and ${Math.round(UNIT_STATS.EW.levels[2].ewCancelChance * 100)}% of incoming missiles are fully spoofed (no damage).</p>`;
        case 'CV':
            return `<p class="info-perk"><b>Lv3 — Air Wing</b> · Volley adds one extra non-interceptable stealth sortie. Combined with the base ${UNIT_STATS.CV.levels[2].projectiles} interceptable sorties, an L3 Carrier launches ${UNIT_STATS.CV.levels[2].projectiles + 1} projectiles per shot.</p>`;
        case 'ICBM':
            return `<p class="info-perk"><b>Strategic Strike</b> · Global range. ${UNIT_STATS.ICBM.levels[0].damage} dmg warhead with ${Math.round(GAME_CONFIG.ICBM_SPLASH_MULT * 100)}% splash to all 6 adjacent hexes. Only Lv3 AAS / Lv3 AF can intercept.</p>`;
        default:
            return '';
    }
}

/** One-line summary of a tier's stats for build tooltips (matches UNIT_STATS). */
function summarizeLevelForTooltip(type, lv) {
    const parts = [];
    if (lv.hp != null) parts.push(`${lv.hp} HP`);
    if (lv.range != null) parts.push(`rng ${lv.range}`);
    if (lv.radius != null && type === 'B') parts.push(`cmd ${lv.radius}`);
    if (lv.radius != null && type === 'G') parts.push(`inf rng ${lv.radius}`);
    if (lv.radius != null && type === 'M') parts.push(`inf rng ${lv.radius}`);
    if (lv.radius != null && type === 'PT') parts.push(`sea rng ${lv.radius}`);
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
    if (lv.influence != null && (type === 'G' || type === 'B' || type === 'PT')) parts.push(`inf ${lv.influence}`);
    if (lv.goldPerTile != null) parts.push(type === 'G' ? 'gold: banded rings' : `+${lv.goldPerTile}/tile`);
    if (lv.seaGoldPerTile != null) parts.push(`+${lv.seaGoldPerTile}/sea-tile`);
    if (lv.chargeCap) parts.push(`cap ${lv.chargeCap}`);
    if (lv.missilesPerShot != null && lv.missilesPerShot > 1) parts.push(`×${lv.missilesPerShot} msl`);
    if (lv.projectiles != null && lv.projectiles > 1) parts.push(`×${lv.projectiles} proj`);
    if (lv.splash) {
        parts.push(`splash ${Math.round(GAME_CONFIG.RL_L3_SPLASH_CHANCE * 100)}% → ${Math.round(GAME_CONFIG.RL_L3_SPLASH_MULT * 100)}% adj`);
    }
    if (lv.jamming) parts.push(`jam −${Math.round((GAME_CONFIG.DRONE_L3_RECHARGE_DEBUFF_MULT - 1) * 100)}% enemy recharge`);
    if (lv.signatureJam) parts.push('faction-unique doctrine');
    if (lv.cec) parts.push(`CEC vs ships (+${Math.round((GAME_CONFIG.DDG3_CEC_DMG_MULT - 1) * 100)}%)`);
    if (lv.illuminator) parts.push('Aegis BMD + spot');
    if (lv.bastion) parts.push(`+stealth cruise (${Math.round(GAME_CONFIG.SSG_L3_STEALTH_CHANCE * 100)}%)`);
    if (lv.navyAura) parts.push('navy aura + free trade');
    if (lv.displayName) parts.unshift(lv.displayName);
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

    if (type === 'G' && def.levels.length >= 3) {
        html += `<div class="tt-stat"><span class="tt-label">Gold</span><span class="tt-val">Banded by r from Gov; disk $/s ≈ Lv1–3 as before</span></div>`;
    } else if (l1.goldPerTile) {
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

    if (type === 'G') {
        html += `<div class="tt-upgrade dim">Lv3 "Capitol": +${Math.round((GAME_CONFIG.GOV_L3_GOLD_AURA_MULT - 1) * 100)}% gold AND friendly structures regenerate ×${GAME_CONFIG.GOV_L3_REGEN_AURA_MULT} HP/s on tiles within its influence (non-stacking).</div>`;
    }

    if (type === 'RL') {
        html += `<div class="tt-upgrade dim">Lv3: 2 missiles per shot; ${Math.round(GAME_CONFIG.RL_L3_SPLASH_CHANCE * 100)}% chance to splash ${Math.round(GAME_CONFIG.RL_L3_SPLASH_MULT * 100)}% damage to adjacent enemy structures</div>`;
    }

    if (type === 'AAS') {
        const aas3 = def.levels[2];
        html += `<div class="tt-upgrade dim">Lv3 "Iron Dome": ×${aas3.missilesRecharged} intercepts per recharge, magazine cap ${aas3.chargeCap}. Reliable saturation-defense.</div>`;
    }

    if (type === 'AB') {
        html += `<div class="tt-upgrade dim">Lv3: ${Math.round(GAME_CONFIG.AB_L3_STEALTH_CHANCE * 100)}% stealth strike (${GAME_CONFIG.AB_L3_STEALTH_MISSILES} missiles, cannot be intercepted)</div>`;
    }

    if (type === 'D') {
        html += `<div class="tt-upgrade dim">Lv3: jamming — enemy military &amp; AA in range fire ${Math.round((GAME_CONFIG.DRONE_L3_RECHARGE_DEBUFF_MULT - 1) * 100)}% slower (MF excluded)</div>`;
    }

    if (type === 'MF') {
        html += `<div class="tt-upgrade dim">Lv3 "Arsenal": +${Math.round((GAME_CONFIG.MF_L3_NEIGHBOR_PRODUCTION_MULT - 1) * 100)}% to adjacent friendly factories. MF3 itself: +${Math.round(GAME_CONFIG.MF_L3_SELF_BONUS_PER_ADJACENT_MF * 100)}% per adjacent MF (cap +${Math.round(GAME_CONFIG.MF_L3_SELF_BONUS_CAP * 100)}%). Cluster for huge output.</div>`;
    }

    if (type === 'M') {
        html += `<div class="tt-upgrade">Max: ${GAME_CONFIG.MILITIA_BASE_CAP} + ${GAME_CONFIG.MILITIA_PER_EXTRA_GOV} per Gov beyond your first</div>`;
        const m3 = def.levels[2];
        html += `<div class="tt-upgrade dim">Lv3 "Insurgency": <b>${m3.displayName || 'Militia HQ'}</b> — influence radius ${m3.radius ?? 1}, +$${m3.goldPerTile ?? 0.3}/tile/s. <b>Operates while contested</b>: fires, regens, and projects influence through enemy pressure.</div>`;
    }

    if (type === 'DDG') {
        html += `<div class="tt-upgrade dim">Lv3 "CEC Datalink": +${Math.round((GAME_CONFIG.DDG3_CEC_DMG_MULT - 1) * 100)}% vs enemy ships when any friendly navy within ${GAME_CONFIG.DDG3_CEC_RADIUS} hex.</div>`;
    }

    if (type === 'AF') {
        html += `<div class="tt-upgrade dim">Lv3 "Aegis BMD": +${GAME_CONFIG.AF3_NAVY_ORIGIN_RANGE} intercept range vs naval shots. Spotted shooters take +${Math.round((GAME_CONFIG.AF3_ILLUM_DMG_MULT - 1) * 100)}% damage from your DDG/SSG.</div>`;
    }

    if (type === 'SSG') {
        html += `<div class="tt-upgrade dim">Lv3 "Bastion": +${Math.round((GAME_CONFIG.SSG3_BASTION_DMG_MULT - 1) * 100)}% vs enemy ships with friendly navy adjacent. ${Math.round(GAME_CONFIG.SSG_L3_STEALTH_CHANCE * 100)}% of cruise missiles fire stealth (uninterceptable).</div>`;
    }

    if (type === 'PT') {
        html += `<div class="tt-upgrade dim">Lv3 "Free Trade": navy in influence +${Math.round((GAME_CONFIG.PORT_L3_NAVY_DAMAGE_MULT - 1) * 100)}% damage and −${Math.round((1 - GAME_CONFIG.PORT_L3_NAVY_INTERVAL_MULT) * 100)}% fire interval. Sea income +${Math.round(GAME_CONFIG.PORT_L3_TRADE_PER_OTHER_PORT * 100)}% per OTHER friendly Port (cap +${Math.round(GAME_CONFIG.PORT_L3_TRADE_CAP * 100)}%).</div>`;
    }

    if (type === 'SU') {
        html += `<div class="tt-upgrade dim">Lv3: <b>faction-unique doctrine</b> — your signature unit gains a bonus tied to your nation. Hover the unit in-game to see the active effect.</div>`;
    }

    if (type === 'BUNK') {
        html += `<div class="tt-upgrade dim">No attack, no influence, no income. Pure HP wall — anchor chokepoints. Lv3 "Hardened": takes ${Math.round((1 - GAME_CONFIG.BUNK_L3_TAKEN_MULT) * 100)}% less damage.</div>`;
    }

    if (type === 'RC') {
        html += `<div class="tt-upgrade dim">Fog breaker. Cheap, fragile. Largest vision-per-cost in the game. No attack, no income. Critical counter-play to stealth (AB3) and ambush.</div>`;
    }

    if (type === 'TH') {
        const l1 = def.levels[0];
        html += `<div class="tt-upgrade dim">Pays $${l1.tradeBase}/s base + $${l1.tradePerGov} per OTHER friendly Gov on the map (network income, no range). Lv3 also pays per Port and buffs all your Govs.</div>`;
    }

    if (type === 'EW') {
        const l1 = def.levels[0];
        html += `<div class="tt-upgrade dim">Soft-kill defense. Friendly tiles in range ${l1.range} hex take ${Math.round((1 - l1.ewDmgMult) * 100)}% less damage from interceptable missiles. Non-stacking (best aura wins). Distinct from AAS/AF physical intercept.</div>`;
    }

    if (type === 'CV') {
        html += `<div class="tt-upgrade dim">Naval air-projection. Built on owned water. Long range, multi-sortie volleys, missile-consuming. Lv3 "Air Wing": +1 stealth sortie per volley.</div>`;
    }

    if (type === 'ICBM') {
        const l = def.levels[0];
        html += `<div class="tt-upgrade dim">Strategic finisher. Global range, ${(l.interval / 1000) | 0}s recharge, ${l.missilesPerShot} missiles per launch. ${l.damage} dmg with ${Math.round(GAME_CONFIG.ICBM_SPLASH_MULT * 100)}% splash to all adjacent hexes. ONLY Lv3 AAS / Lv3 AF can intercept — lesser interceptors cannot reach.</div>`;
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
    updateM1BuildButtonLock();
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
    rushBtn?.classList.add('hidden');

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
            return;
        }
        if (game.isVisibleTo(tile, 1) || game.isExploredBy(tile, 1)) {
            const owner = tile.owner;
            const name = owner
                ? (game.players[owner - 1]?.name || `Player ${owner}`)
                : 'Neutral';
            const kind = tile.buildable
                ? 'Land'
                : (tile.shoreIncome ? 'Shore water' : 'Open sea');
            const g = game.previewGoldPerSecOnTile(tile);
            const gStr = g > 0 ? `+$${g.toFixed(2)}/s` : '$0/s';
            const lineCont = tile.contested
                ? '<p class="supply-line bad">Contested — no income while tied.</p>'
                : '';
            const seaNote = !tile.buildable && !tile.shoreIncome
                ? `<p class="hint dim">Open sea: earns <b>+$${GAME_CONFIG.SEA_TRADE_GOLD_PER_TILE_TICK}/s sea trade</b> per owned tile (no Gov needed). Build navy only on <b>water you control</b>.</p>`
                : '';
            infoPanel.classList.remove('hidden');
            infoContent.innerHTML = `
                <h4>${kind.toUpperCase()}</h4>
                <p class="info-owner">Controller: <b>${name}</b></p>
                <div class="info-card-stats">${infoStatRow('Gold (this tile)', gStr)}</div>
                <p class="hint dim">Land &amp; shore pay Gov/M3 within range. Overlapping govs: diminishing returns.</p>
                ${seaNote}
                ${lineCont}`;
            upgradeBtn.classList.add('hidden');
            upgradeAllBtn.classList.add('hidden');
            demolishBtn.classList.add('hidden');
            clearTargetBtn.classList.add('hidden');
            return;
        }
        infoPanel.classList.add('hidden');
        return;
    }

    if (tile.owner !== 1 && !game.isVisibleTo(tile, 1)) {
        const mem = game.players[0].memory.get(`${tile.q},${tile.r}`);
        infoPanel.classList.remove('hidden');
        let name = 'Unknown';
        if (mem?.type) {
            const def = UNIT_STATS[mem.type];
            const lv = mem.level != null ? def?.levels?.[mem.level] : null;
            name = lv?.displayName || def?.name || mem.type;
        }
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

    const stype = tile.structure.type;
    const levelIdx = tile.structure.level;
    const effectiveRadius = tile.structure._lockedRadius ?? stats.radius;

    let govWarmupBlock = '';
    const statRows = [];
    statRows.push(infoStatRow('HP', `${Math.round(tile.hp)} / ${tile.maxHp}`));
    if (stats.goldPerTile) {
        const warmingUp = tile.govWarmupUntil && game.gameTime < tile.govWarmupUntil;
        if (warmingUp) {
            const secsLeft = Math.ceil((tile.govWarmupUntil - game.gameTime) / 1000);
            govWarmupBlock = `<p class="supply-line bad">GOV WARMUP — ${secsLeft}s (no gold yet)</p>`;
        } else if (stype === 'G') {
            // Ring detail is in govRingHtml
        } else {
            statRows.push(infoStatRow('Gold/tile', `+${stats.goldPerTile}/s`));
        }
    }
    if (stats.range != null) statRows.push(infoStatRow('Atk range', String(stats.range)));
    if (stats.damage != null) statRows.push(infoStatRow('Damage / hit', String(stats.damage)));
    const dps = computeStructureDps(stats);
    if (dps != null) statRows.push(infoStatRow('DPS (max HP)', dps.toFixed(1)));
    if ((stype === 'RL' || stype === 'AB') && stats.missilesPerShot != null) {
        statRows.push(infoStatRow('Missiles / shot', String(stats.missilesPerShot)));
    }
    if (stats.projectiles > 1) statRows.push(infoStatRow('Projectiles / volley', String(stats.projectiles)));
    if (effectiveRadius != null && (stype === 'G' || stype === 'B' || stype === 'PT' || (stype === 'M' && stats.radius))) {
        const rv = String(effectiveRadius);
        const label = stype === 'G' ? 'Inf. range'
            : stype === 'PT' ? 'Sea inf. range'
            : stype === 'M' ? 'Inf. radius'
            : 'Cmd radius';
        statRows.push(infoStatRow(label, rv));
    }
    if (stats.influence) statRows.push(infoStatRow('Influence', String(stats.influence)));
    if (stats.seaGoldPerTile) statRows.push(infoStatRow('Gold / sea-tile', `+$${stats.seaGoldPerTile}/s`));
    if (stats.vision) statRows.push(infoStatRow('Vision', String(stats.vision)));
    if (stats.interval) statRows.push(infoStatRow('Fire interval', `${(stats.interval / 1000).toFixed(1)}s`));
    else if (stats.rechargeInterval) {
        statRows.push(infoStatRow('Recharge', `${(stats.rechargeInterval / 1000).toFixed(1)}s ×${stats.missilesRecharged || 1}`));
    } else if (stats.produceInterval && stype === 'MF') {
        const raw = stats.missilesProduced || 0;
        const eff = Math.floor(raw * GAME_CONFIG.MF_GLOBAL_PRODUCTION_MULT);
        statRows.push(infoStatRow('Cycle', `${(stats.produceInterval / 1000).toFixed(1)}s`));
        statRows.push(infoStatRow('Missiles / cycle', `${eff} <span class="dim">(${raw}×${GAME_CONFIG.MF_GLOBAL_PRODUCTION_MULT})</span>`));
    } else if (stats.produceInterval) {
        statRows.push(infoStatRow('Cycle', `${(stats.produceInterval / 1000).toFixed(1)}s`));
    }
    if (stype === 'AAS') {
        statRows.push(infoStatRow('Charges', `${tile.structure.charge || 0} / ${stats.chargeCap || 10}`));
    }

    const supplyLine = (stats.interval || stats.produceInterval || stats.rechargeInterval)
        ? `<p class="supply-line ${inSupply ? 'ok' : 'bad'}">${inSupply ? 'IN SUPPLY' : 'OUT OF SUPPLY'}</p>`
        : '';
    const contestLine = tile.contested ? `<p class="supply-line bad">PARALYZED — CONTESTED</p>` : '';
    const hint = (attacker && isOwn) ? `<p class="hint">Drag to assign target.</p>` : '';
    let doctrineLine = '';
    if (!isOwn && stype === 'G' && game.isVisibleTo(tile, 1)) {
        const owner = game.players[tile.owner - 1];
        if (owner?.doctrine?.name) {
            doctrineLine = `<p class="hint" style="color:${owner.doctrine.color}">Doctrine: ${owner.doctrine.name}</p>`;
        }
    }
    let facPlayerLine = '';
    {
        const fo = game.players[tile.owner - 1];
        if (fo) {
            const f = getFaction(fo.factionId);
            const l = f.leaders[fo.leaderIdx] || f.leaders[0];
            facPlayerLine = `<p class="hint dim">${f.code} — ${l.name} · <span title="Nation + leader modifiers apply to this player">${f.specialName} signature</span></p>`;
        }
    }

    const owner = game.players[tile.owner - 1];
    const perk = structureL3PerkHtml(stype, levelIdx, { factionId: owner?.factionId ?? 0 });
    const govRingHtml = (stype === 'G' && !govWarmupBlock) ? govGoldBandLinesHtml(levelIdx) : '';
    const titleName = (tile.structure.displayName || stats.displayName || UNIT_STATS[stype].name).toUpperCase();
    infoContent.innerHTML = `
        <h4>${titleName} · LVL ${levelIdx + 1}</h4>
        <p class="info-owner">Owner: ${game.players[tile.owner - 1]?.name || ('P' + tile.owner)}</p>
        ${facPlayerLine}
        ${govWarmupBlock}
        <div class="info-card-stats">${statRows.join('')}</div>
        ${govRingHtml}
        ${perk}
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
        // RUSH: appears while the structure is still in its build cooldown.
        // Cost scales with remaining time, so it gets cheaper the longer you wait.
        if (rushBtn && tile.buildCooldownUntil && game.gameTime < tile.buildCooldownUntil) {
            const remaining = tile.buildCooldownUntil - game.gameTime;
            const cost = Math.max(20, Math.ceil(remaining / 30));
            rushBtn.classList.remove('hidden');
            rushBtn.innerText = `RUSH ($${cost} · ${(remaining / 1000).toFixed(1)}s)`;
            rushBtn.onclick = () => {
                const spent = game.rushBuildCooldown(tile, 1);
                if (spent !== false) {
                    showNoti(`Rushed (-$${spent})`, "success");
                    selectTile(tile);
                } else {
                    showNoti("Can't rush", "error");
                }
            };
        } else if (rushBtn) {
            rushBtn.classList.add('hidden');
        }

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

    const typeList = Object.entries(types).map(([t, n]) => `${n}× ${UNIT_STATS[t]?.name || t}`).join(', ');
    infoContent.innerHTML = `
        <h4>MULTI-SELECT · ${count} STRUCTURES</h4>
        <p class="info-owner">${typeList}</p>
        <p class="hint">Select a single structure for full stats, DPS, and Lv3 ability text.</p>
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
        else if (entry.kind === 'kill' && entry.defenderId === humanId) cls = 'lost-own';
        else if (entry.kind === 'kill') cls = 'kill';
        else if (entry.kind === 'intercepted') cls = 'intercepted';
        else if (entry.kind === 'upgrade') cls = 'upgrade';
        else if (entry.kind === 'demolish') cls = 'demolish';
        else if (entry.kind === 'incoming') cls = 'incoming';
        else if (entry.kind === 'low-gold') cls = 'low-gold';
        else if (entry.kind === 'build-ready') cls = 'build-ready';
        else if (entry.kind === 'rush') cls = 'rush';

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
            if (game.campaign?.mission && humanWon) {
                endSub.textContent = game.campaign.mission.debrief
                    || `Commander ${game.players[0].name} dominates the theatre.`;
            } else {
                endSub.textContent = humanWon
                    ? `Commander ${game.players[0].name} dominates the theatre.`
                    : `Forces overrun. ${game.players[game.winner - 1].name} takes the field.`;
            }
        }
        if (game.campaign && humanWon) {
            markMissionBeaten(game.campaign.missionId);
        }
        renderEndStats();
        endOverlay.classList.remove('hidden');
    } else if (game.defeated.has(1)) {
        endShown = true;
        endTitle.textContent = 'DEFEAT';
        endTitle.className = 'end-title loss';
        endSub.textContent = game.campaign?.mission?.defeat || 'Your government has fallen.';
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

    const coalition = Array.isArray(game.coWinners) && game.coWinners.length > 1
        ? `<div class="end-stat-card end-stat-wide"><div class="stat-label">Coalition</div><div class="stat-value">${game.coWinners.map(id => game.players[id - 1]?.name || `P${id}`).join(' · ')}</div></div>`
        : '';

    endStats.innerHTML = `
        ${coalition}
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
    closeCampaignBriefingInGame();
    hideCampaignQuestPanel();
    if (endReturnTarget === 'campaign' && activeCampaign) {
        homepageEl.classList.add('hidden');
        openCampaignScreen();
    } else {
        activeCampaign = null;
        endReturnTarget = 'home';
        homepageEl.classList.remove('hidden');
    }
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
            {
                const s = p.seaTileCount | 0;
                minimapStatsLine1El.textContent = s > 0
                    ? `${p.tileCount} + ${s} sea`
                    : `${p.tileCount} tiles`;
            }
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
            ? (() => {
                const s = p.seaTileCount | 0;
                const t = s > 0 ? `${p.tileCount}+${s}` : String(p.tileCount);
                return `<span class="sb-tiles" title="Land/shore + sea">${t}</span><span class="sb-sep">·</span><span class="sb-gold">$${fmtCompactGold(p.gold)}</span><span class="sb-sep">·</span><span class="sb-miss">M${Math.floor(p.missiles)}</span>`;
            })()
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
let _agentLoopLogOnce = false;

function loop(time) {
    // #region agent log
    if (!_agentLoopLogOnce) {
        _agentLoopLogOnce = true;
        fetch('http://127.0.0.1:7800/ingest/05987a93-cd05-4494-a5fb-56e4fc3c37c8', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7abbd6' }, body: JSON.stringify({ sessionId: '7abbd6', location: 'main.js:loop', message: 'first frame', hypothesisId: 'H4', data: { hasGame: !!game }, timestamp: Date.now() }) }).catch(() => { });
    }
    // #endregion
    handleInput();
    Input.clearFrame();

    if (game) {
        game.update(time);
        if (!game.campaign?.freezeEnemyAi) {
            updateAI(game, game.gameTime);
        }
        renderer.multiSelected = multiSelected;
        renderer.render(game);
        renderer.renderMinimap(miniCanvas, game);

        const p1 = game.players[0];
        goldEl.innerText = Math.floor(p1.gold);
        {
            const s = p1.seaTileCount | 0;
            tileEl.innerText = s > 0 ? `${p1.tileCount}+${s}` : String(p1.tileCount);
            tileEl.title = s > 0 ? 'Land + near-shore (economy) + open-sea hexes' : 'Land + near-shore (economy tiles)';
        }
        missileEl.innerText = p1.missiles;
        goldRateEl.innerText = `+${(p1.goldRate).toFixed(1)}/s`;

        const shared = game._aiShared;
        const mp = shared?.missileProd?.get(p1.id) ?? 0;
        const mc = shared?.missileCons?.get(p1.id) ?? 0;
        missileRateEl.innerText = `+${mp.toFixed(1)}/s · -${mc.toFixed(1)}/s`;
        missileRateEl.title = 'Missiles per second: produced (factories) · max consumption (rocket launchers + air bases, if firing continuously)';

        refreshMinimapStatsOverlay();

        const ownStructCounts = shared?.structuresByPlayer?.get(p1.id);
        const hasMissileLauncher = (ownStructCounts?.RL || 0) > 0 || (ownStructCounts?.AB || 0) > 0;
        if (p1.missiles === 0 && hasMissileLauncher) {
            if (missileStarvedSince === 0) missileStarvedSince = time;
            missileEl.parentElement.classList.toggle('live', time - missileStarvedSince > 5000);
        } else {
            missileStarvedSince = 0;
            missileEl.parentElement.classList.remove('live');
        }

        if (game.campaign?.missionId === 1 && game.campaign.mission?.tutorialNags
            && !game._m1MfNag
            && p1.missiles === 0 && hasMissileLauncher) {
            game._m1MfNag = true;
            showNoti('Missile Factories (key 4) resupply launchers. No missiles = your rockets sit idle.', 'info');
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
                ? `${t.owner}|${t.contested ? 1 : 0}|${t.structure.type}|${t.structure.level}|${Math.round(t.hp)}|${t.maxHp}|${t.structure.target ? (t.structure.target.q+','+t.structure.target.r) : '-'}|${(t.structure.charge ?? '')}|${(t.structure.missilesProduced ?? '')}|${t.structure.displayName || ''}`
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

let _homeFactionUiBound = false;

function refreshHomeFactionBrief() {
    const brief = document.getElementById('faction-brief');
    const fs = document.getElementById('faction-select');
    const ls = document.getElementById('leader-select');
    if (!brief || !fs || !ls) return;
    const fi = Math.max(0, Math.min(FACTIONS.length - 1, parseInt(fs.value, 10) || 0));
    const li = Math.max(0, Math.min(2, parseInt(ls.value, 10) || 0));
    const f = FACTIONS[fi] || FACTIONS[0];
    const L = f.leaders[li] || f.leaders[0];
    const banner = FACTION_BANNERS[fi] || FACTION_BANNERS[0];

    const hdr = document.getElementById('fb-header');
    if (hdr) {
        hdr.style.setProperty('--fb-accent', banner.accent);
    }
    const fl = document.getElementById('fb-flag');
    if (fl) {
        fl.textContent = '';
        const sp = document.createElement('span');
        sp.className = 'fb-emoji';
        sp.textContent = banner.flag;
        sp.title = f.name;
        fl.appendChild(sp);
    }
    const fline = document.getElementById('fb-faction-line');
    if (fline) fline.textContent = `${f.name} · ${f.code}`;
    const sub = document.getElementById('fb-subline');
    if (sub) sub.textContent = f.specialName + ' — signature build';

    const ulN = document.getElementById('fb-nation');
    if (ulN) {
        ulN.innerHTML = '';
        for (const line of describeModsList(f.nation)) {
            const li0 = document.createElement('li');
            li0.textContent = line;
            ulN.appendChild(li0);
        }
    }
    const ulL = document.getElementById('fb-leader');
    if (ulL) {
        ulL.innerHTML = '';
        for (const line of describeModsList(L.mods || {})) {
            const li0 = document.createElement('li');
            li0.textContent = line;
            ulL.appendChild(li0);
        }
    }
    const lore = document.getElementById('fb-leader-lore');
    if (lore) {
        lore.textContent = getLeaderPerkText(fi, li);
    }
    const su = document.getElementById('fb-special');
    if (su) {
        su.textContent = getSpecialUnitBlurb(f);
    }
    const png = document.getElementById('fb-portrait');
    if (png) {
        png.src = PLACEHOLDER_LEADER_PORTRAIT;
        png.alt = L.name;
    }
    const lname = document.getElementById('fb-lname');
    if (lname) {
        lname.textContent = L.name;
    }
    const comb = getPlayerMods(fi, li);
    const effLines = describeModsList({ ...comb, startMissiles: comb.startMissiles });
    const mrg = document.getElementById('fb-merged');
    if (mrg) {
        mrg.textContent = effLines.length ? ('Combined: ' + effLines.join(' · ')) : 'Combined: baseline (no modifiers).';
    }
}

function initHomePageFactionUI() {
    if (_homeFactionUiBound) return;
    const fs = document.getElementById('faction-select');
    const ls = document.getElementById('leader-select');
    if (!fs || !ls) {
        return;
    }
    try {
        fs.innerHTML = '';
        for (let i = 0; i < FACTIONS.length; i++) {
            const f = FACTIONS[i];
            const b = FACTION_BANNERS[i] || FACTION_BANNERS[0];
            const o = document.createElement('option');
            o.value = String(i);
            o.textContent = `${b.flag} ${f.code} — ${f.name}`;
            fs.appendChild(o);
        }
        fs.selectedIndex = 0;
        const refill = () => {
            const idx = Math.max(0, Math.min(FACTIONS.length - 1, parseInt(fs.value, 10) || 0));
            const fact = FACTIONS[idx] || FACTIONS[0];
            ls.innerHTML = '';
            fact.leaders.forEach((le, j) => {
                const o = document.createElement('option');
                o.value = String(j);
                o.textContent = le.name;
                ls.appendChild(o);
            });
            ls.selectedIndex = 0;
        };
        fs.addEventListener('change', () => { refill(); refreshHomeFactionBrief(); });
        ls.addEventListener('change', refreshHomeFactionBrief);
        refill();
        refreshHomeFactionBrief();
        _homeFactionUiBound = true;
    } catch (err) {
        console.error('RocketIO: initHomePageFactionUI failed', err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomePageFactionUI);
} else {
    initHomePageFactionUI();
}

// #region agent log
fetch('http://127.0.0.1:7800/ingest/05987a93-cd05-4494-a5fb-56e4fc3c37c8', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7abbd6' }, body: JSON.stringify({ sessionId: '7abbd6', location: 'main.js:EOF', message: 'main module init finished', hypothesisId: 'H1', data: { playWired: true }, timestamp: Date.now() }) }).catch(() => { });
// #endregion
