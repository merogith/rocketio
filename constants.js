// ============================================================================
//  ROCKETIO v0.3 — CONSTANTS
// ----------------------------------------------------------------------------
//  INFLUENCE
//    Influence at distance d = base * max(0, 1 - d/(radius+1)).
//    Highest summed score on a tile owns it; near-ties = contested.
//    Structures on contested tiles are PARALYZED (no fire/produce/regen)
//    but still project influence to prevent oscillation.
//
//  INTERVAL EFFICIENCY (NOTE: scales firing INTERVAL, not damage — lower = faster)
//    Internally referenced as `intervalEff()`. It multiplies the structure's
//    interval/recharge/produceInterval so damaged structures fire slower.
//    HP == 100%         -> 1.00x interval  (full rate)
//    50% <= HP < 100%   -> 1.25x interval  (20% slower)
//    HP < 50%           -> 2.00x interval  (half rate)
//
//  SUPPLY LINES
//    A structure is "in supply" if it sits within the influence radius of any
//    friendly Government, Barracks, or Militia-Gov (M3). Otherwise it operates
//    at SUPPLY_OUT_MULT speed.
//
//  FOG OF WAR
//    Each structure grants vision out to its explicit `vision` stat.
//    Tiles never seen render as undiscovered; tiles seen previously but not
//    currently visible render from a memory snapshot.
//
//  HP REGEN
//    All structures regenerate 0.8% maxHp per second, but only
//    when not contested and not damaged within REGEN_COOLDOWN_MS.
// ============================================================================

export const GAME_CONFIG = {
    SUPPLY_OUT_MULT: 1.6,
    GOLD_PER_TILE_TICK: 0.7,
    STARTING_GOLD: 2000,
    STARTING_MISSILES: 4,
    TICK_RATE_MS: 1000,
    DEFAULT_VISION: 3,
    HP_REGEN_RATE: 0.008,        // 0.8% of maxHp per second
    REGEN_COOLDOWN_MS: 5000,     // 5s after last damage before regen starts
    CONTESTED_EPSILON: 0.01,     // relative threshold for contested detection
    UPGRADE_COST_MULT: 0.77,     // upgrades cost ~23% less than next tier list price
    DEMOLISH_REFUND_MULT: 0.20,  // fraction of total gold spent on structure returned on demolish
    GOV_WARMUP_MS: 10000,        // new Govs produce 0 gold for 10s (anti-rush)
    MAP_RADII: { small: 20, medium: 30, large: 45 },
    MAX_PARTICLES: 400,
    // Auto-target: reduce overkill on one tile by treating in-flight shots as committed damage.
    // Interceptable projectiles count at a fraction (AA may shoot them down).
    AUTO_TARGET_USE_PENDING_DAMAGE: true,
    AUTO_TARGET_INTERCEPT_PENDING_MULT: 0.5,
    AUTO_TARGET_OVERKILL_BUFFER_HP: 8,
    AUTO_TARGET_FALLBACK_WHEN_ALL_SATURATED: true,
    // Within this many hexes of the closest enemy, prefer higher AUTO_TARGET_STRUCT_WEIGHT before HP tie-break.
    AUTO_TARGET_DISTANCE_TIE_HEXES: 1,
    AUTO_TARGET_STRUCT_WEIGHT: {
        G: 100,
        MF: 85,
        AB: 45,
        RL: 40,
        AAS: 35,
        B: 28,
        D: 22,
        M: 18,
    },
    // Missile-starved: prioritize targets (incoming shooters > enemy DPS > Gov > AAS/MF) and RL/AB fire order.
    MISSILE_SMART_PRIORITY: true,
    // When true, only apply smart targeting / launcher ordering if missiles < total demand from ready RL+AB this tick.
    MISSILE_SMART_STARVED_ONLY: true,
    // Initial build cooldowns: time (ms) before a newly built structure can act for the first time.
    // lastAction is set to (gameTime + cooldown - interval) so the first action fires at T + cooldown.
    BUILD_COOLDOWNS: {
        MF:  10000,   // 10 s before first missile production
        AAS:  3000,   // 3 s before first intercept charge
        RL:   5000,   // 5 s before first rocket
        AB:   5000,   // 5 s before first airstrike
        B:    5000,   // 5 s before first ground attack
        D:    5000,   // 5 s before first drone volley
        M:    5000,   // 5 s before first militia attack
    },
    // Lv3 Barracks: friendly structures on hexes within its influence radius (stats.radius) deal +10% damage
    // and take −10% damage from projectiles. Overlapping L3 Barracks do not stack (single application).
    BARRACKS_L3_COMMAND_OUT_MULT: 1.1,
    BARRACKS_L3_COMMAND_IN_MULT: 0.9,
};

export const VICTORY_MODES = {
    CONQUEST:      { id: 'conquest',      name: 'Conquest',      desc: 'Eliminate every enemy' },
    DOMINATION:    { id: 'domination',    name: 'Domination',    desc: 'Hold X% of land tiles', defaultPct: 0.60, options: [0.50, 0.60, 0.75] },
    REGIME_CHANGE: { id: 'regime_change', name: 'Regime Change', desc: 'Topple all enemy Governments' },
    BLITZ:         { id: 'blitz',         name: 'Blitz',         desc: 'Destroy N enemy structures first', defaultN: 25, options: [15, 25, 40] },
    LAST_STAND:    { id: 'last_stand',    name: 'Last Stand',    desc: 'Survive T minutes (you vs all)', defaultMin: 10, options: [5, 10, 15, 20] },
};

export const MAP_STYLES = {
    PANGAEA:     { id: 'pangaea',     name: 'Pangaea',     desc: 'One connected landmass' },
    CONTINENTS:  { id: 'continents',  name: 'Continents',  desc: 'Land blobs separated by water' },
    ARCHIPELAGO: { id: 'archipelago', name: 'Archipelago', desc: 'Many small islands' },
    INLAND_SEA:  { id: 'inland_sea',  name: 'Inland Sea',  desc: 'Ring of land around central water' },
    FRACTAL:     { id: 'fractal',     name: 'Fractal',     desc: 'Noise-based random coasts' },
};

// UNIT_STATS hp on L2+: each upgrade adds round(upgradeGold * 1.1 * (L1.hp / L1.cost)),
// upgradeGold = floor(nextTier.cost * GAME_CONFIG.UPGRADE_COST_MULT). L1 hp unchanged (baseline).
export const UNIT_STATS = {
    RL: {
        name: "Rocket Launcher",
        levels: [
            { id: "RL1", hp: 108, range: 7,  damage: 52,  cost: 225, interval: 10200, missilesPerShot: 1, projectiles: 1, interceptable: true, vision: 6  },
            { id: "RL2", hp: 240, range: 10, damage: 74,  cost: 325, interval: 7100,  missilesPerShot: 1, projectiles: 1, interceptable: true, vision: 8  },
            { id: "RL3", hp: 413, range: 14, damage: 102, cost: 425, interval: 5050,  missilesPerShot: 2, projectiles: 1, interceptable: true, vision: 11 }
        ]
    },
    AAS: {
        name: "Anti-Air System",
        // rechargeInterval per level ≈ 1.05× same-tier Rocket Launcher interval (slightly slower cycle)
        levels: [
            { id: "AAS1", hp: 105, range: 4, cost: 205, rechargeInterval: 10710, missilesRecharged: 1, chargeCap: 4,  vision: 5 },
            { id: "AAS2", hp: 237, range: 6, cost: 305, rechargeInterval: 7455, missilesRecharged: 2, chargeCap: 6, vision: 7 },
            { id: "AAS3", hp: 412, range: 9, cost: 405, rechargeInterval: 5303, missilesRecharged: 3, chargeCap: 9, vision: 9 }
        ]
    },
    MF: {
        name: "Missile Factory",
        levels: [
            { id: "MF1", hp: 105, cost: 230, produceInterval: 11111, missilesProduced: 2, vision: 4 },
            { id: "MF2", hp: 233, cost: 330, produceInterval: 10600, missilesProduced: 4, vision: 5 },
            { id: "MF3", hp: 399, cost: 430, produceInterval: 10000, missilesProduced: 7, vision: 6 }
        ]
    },
    G: {
        name: "Government",
        levels: [
            { id: "G1", hp: 375,  radius: 4,  cost: 450,  influence: 1050, vision: 8,  goldPerTile: 0.5  },
            { id: "G2", hp: 1081, radius: 7,  cost: 1000, influence: 2300, vision: 10, goldPerTile: 0.5  },
            { id: "G3", hp: 2457, radius: 11, cost: 1950, influence: 4150, vision: 12, goldPerTile: 0.5  }
        ]
    },
    D: {
        name: "Drone Operator",
        levels: [
            { id: "D1", hp: 65,  range: 5, damage: 11, cost: 155, interval: 6200, projectiles: 1, interceptable: true, vision: 5 },
            { id: "D2", hp: 137, range: 6, damage: 13, cost: 205, interval: 5250, projectiles: 2, interceptable: true, vision: 6 },
            { id: "D3", hp: 227, range: 7, damage: 13, cost: 255, interval: 4750, projectiles: 3, interceptable: true, vision: 7 }
        ]
    },
    M: {
        name: "Militia",
        // Budget glass cannon: cheap, solid damage, low HP. L2+ hp follows same upgrade rule from L1 baseline.
        levels: [
            { id: "M1", hp: 40,  range: 1, damage: 38, cost: 135, interval: 7600,  projectiles: 1, interceptable: false, vision: 4 },
            { id: "M2", hp: 86,  range: 2, damage: 52, cost: 185, interval: 4800,  projectiles: 1, interceptable: false, vision: 5 },
            { id: "M3", hp: 154, radius: 2, cost: 275, transformsToGov: true, influence: 780, vision: 6, goldPerTile: 0.5 }
        ],
        limit: 10
    },
    AB: {
        name: "Air Base",
        // Best sustained DPS/$ vs RL/B; expensive. Interceptable strikes — AA is the hard counter. HP kept moderate so focus fire / AA punish overextension.
        levels: [
            { id: "AB1", hp: 160, range: 7,  damage: 136, cost: 350,  interval: 15200, missilesPerShot: 1, projectiles: 1, interceptable: true, projectileSpeed: 4.5, vision: 7  },
            { id: "AB2", hp: 455, range: 10, damage: 230, cost: 750,  interval: 10000, missilesPerShot: 2, projectiles: 1, interceptable: true, projectileSpeed: 5.5, vision: 10  },
            { id: "AB3", hp: 1000, range: 13, damage: 420, cost: 1400, interval: 8100,  missilesPerShot: 3, projectiles: 1, interceptable: true, projectileSpeed: 6.5, vision: 13 }
        ]
    },
    B: {
        name: "Barracks",
        levels: [
            { id: "B1", hp: 215, range: 3, radius: 3, damage: 52,  cost: 425,  interval: 6700, projectiles: 1, interceptable: false, influence: 1450, vision: 8  },
            { id: "B2", hp: 601, range: 4, radius: 4, damage: 78,  cost: 900,  interval: 4800, projectiles: 1, interceptable: false, influence: 1850, vision: 10 },
            { id: "B3", hp: 1329, range: 5, radius: 5, damage: 105, cost: 1700, interval: 2850, projectiles: 1, interceptable: false, influence: 2480, vision: 12 }
        ]
    }
};

export const AI_DOCTRINES = {
    AGGRESSOR:  { name: "AGGRESSOR",  G: 2,   RL: 3,   AAS: 1.5, MF: 2,   B: 2.5, D: 2.5, AB: 2,   M: 3,   upgradeBias: 0.35, color: "#ff3d00" },
    TURTLE:     { name: "TURTLE",     G: 3,   RL: 1.5, AAS: 3,   MF: 2,   B: 2,   D: 1.5, AB: 1,   M: 1.5, upgradeBias: 0.55, color: "#00e5ff" },
    BOMBER:     { name: "BOMBER",     G: 2,   RL: 3,   AAS: 1.5, MF: 3,   B: 1.5, D: 1.5, AB: 3,   M: 2,   upgradeBias: 0.4,  color: "#ffd700" },
    ECONOMIST:  { name: "ECONOMIST",  G: 4,   RL: 1.5, AAS: 2,   MF: 2.5, B: 2,   D: 1.5, AB: 1.5, M: 2,   upgradeBias: 0.5,  color: "#2ecc71" }
};

export const DIFFICULTY = {
    easy:   { name: 'EASY',   goldMult: 0.75, tickMult: 1.5, startGoldDelta: -100 },
    normal: { name: 'NORMAL', goldMult: 1.0,  tickMult: 1.0, startGoldDelta: 0 },
    hard:   { name: 'HARD',   goldMult: 1.25, tickMult: 0.7, startGoldDelta: 150 },
};

export const DIPLOMACY = {
    REQUEST_COOLDOWN_MS: 60_000,
    PEACE_LOCK_MS:      120_000,
    AI_ACTION_THROTTLE_MS: 5_000,
    // Per-player peace cap. Matches spec: 2p->0, 3p->1, 4p->1, 5p->2, 6p->2, 7p->3, 8p->3.
    maxPeacesFor: (n) => Math.max(0, Math.ceil(n / 2) - 1),
    PORTRAIT_GLYPHS: ['\u2605', '\u2694', '\u2617', '\u2726', '\u25C8', '\u2756', '\u2B22', '\u265C'],
};

export const DEFAULT_KEYBINDS = {
    build_G:    'Digit1',
    build_RL:   'Digit2',
    build_AAS:  'Digit3',
    build_MF:   'Digit4',
    build_B:    'Digit5',
    build_M:    'Digit6',
    build_D:    'Digit7',
    build_AB:   'Digit8',
    upgrade:    'Space',
    cancel:     'Escape',
    pan_up:     'KeyW',
    pan_down:   'KeyS',
    pan_left:   'KeyA',
    pan_right:  'KeyD',
    center_cap: 'KeyH',
    center_last_hit: 'KeyJ',
    pause:      'KeyP',
    speed_up:   'Equal',
    speed_down: 'Minus',
    demolish:   'KeyX',
    toggle_log: 'KeyL',
    cycle_minimap_stats: 'BracketRight',
    settings:   'Comma',
    select_all_type: 'KeyQ',
    upgrade_all: 'KeyU',
};

export const DEFAULT_SETTINGS = {
    quickBuild: true,
    hoverUpgrade: true,
    dragPaintBuild: true,
    screenShake: false,
    threatRings: true,
    hoverRange: true,
    autoPauseOnHidden: true,
    diplomacyEnabled: true,
    sfxEnabled: true,
    musicEnabled: true,
    sfxVolume: 0.7,
    musicVolume: 0.7,
    /** Visual-only cap: low / medium / high, or unlimited (no culling). */
    projectileVisual: 'medium',
};

/** Renderer-only limits; simulation keeps all projectiles. */
export const PROJECTILE_VISUAL_PRESETS = {
    low: { global: 55, perTargetType: 2 },
    medium: { global: 110, perTargetType: 3 },
    high: { global: 200, perTargetType: 5 },
    unlimited: null,
};

export const COLORS = {
    NEUTRAL:      "#1a1f2e",
    CONTESTED:    "#5d4037",
    UNDISCOVERED: "#050608",
    WATER:        "#0a1628",
    WATER_BORDER: "rgba(30, 80, 140, 0.3)",
    MEMORY_TINT:  "rgba(10, 12, 18, 0.55)",
    TERRAIN: {
        shore:    '#3a5a35',
        plains:   '#263d22',
        forest:   '#1a3018',
        hills:    '#3d342a',
        highland: '#352d3a',
        marsh:    '#1f3528',
    },
    PLAYER1: "#00e5ff",
    PLAYER2: "#ff3d00",
    PLAYER3: "#2ecc71",
    PLAYER4: "#ffd700",
    PLAYER5: "#9b59b6",
    PLAYER6: "#e67e22",
    PLAYER7: "#1abc9c",
    PLAYER8: "#ecf0f1"
};
