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
//    friendly Government or Barracks. Otherwise it operates at SUPPLY_OUT_MULT speed.
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
    /** Max economy ticks processed in one animation frame (catch-up after long frames / tab background). */
    MAX_TICKS_CATCHUP_PER_FRAME: 120,
    DEFAULT_VISION: 3,
    HP_REGEN_RATE: 0.008,        // 0.8% of maxHp per second
    REGEN_COOLDOWN_MS: 5000,     // 5s after last damage before regen starts
    CONTESTED_EPSILON: 0.01,     // relative threshold for contested detection
    UPGRADE_COST_MULT: 0.77,     // upgrades cost ~23% less than next tier list price
    DEMOLISH_REFUND_MULT: 0.20,  // fraction of total gold spent on structure returned on demolish
    GOV_WARMUP_MS: 5000,         // new Govs produce 0 gold for 5s (anti-rush)
    MAP_RADII: { small: 20, medium: 30, large: 45 },
    MAX_PARTICLES: 400,
    // Auto-target: reduce overkill on one tile by treating in-flight shots as committed damage.
    // Interceptable projectiles count at a fraction (AA may shoot them down).
    AUTO_TARGET_USE_PENDING_DAMAGE: true,
    AUTO_TARGET_INTERCEPT_PENDING_MULT: 0.75,
    AUTO_TARGET_OVERKILL_BUFFER_HP: 14,
    AUTO_TARGET_FALLBACK_WHEN_ALL_SATURATED: true,
    /** Linear falloff for pending damage: at 0 remaining travel px weight is 1; at/above this distance weight is 0. 0 = treat all in-flight damage as full (legacy). */
    AUTO_TARGET_PENDING_ETA_MAX_DIST_PX: 2400,
    /** Per projectile `type` (see spawnProjectile): max allied shots of that type in flight to the same enemy hex before auto-target prefers another structure. 0 = no cap for that type. */
    AUTO_TARGET_MAX_INBOUND_BY_PROJECTILE_TYPE: {
        rocket: 6,
        airstrike: 2,
        drone: 7,
        ground: 2,
        militia: 3,
    },
    // Within this many hexes of the closest enemy, prefer higher AUTO_TARGET_STRUCT_WEIGHT before HP tie-break.
    AUTO_TARGET_DISTANCE_TIE_HEXES: 2,
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
    MISSILE_SMART_STARVED_ONLY: false,
    /** In missileTargetPriority, add this to priority if the enemy tile fired within the last N ms (active threat). */
    MISSILE_RECENT_FIRE_MS: 3000,
    MISSILE_RECENT_FIRE_PRIORITY_BONUS: 75_000,
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
    /** Lv3 Government: tiles within its radius that earn gov gold get this mult (non-stacking across G3). */
    GOV_L3_GOLD_AURA_MULT: 1.2,
    /** RL3: each hit has this chance to deal splash to adjacent enemy structures. */
    RL_L3_SPLASH_CHANCE: 0.3,
    /** When RL3 splash procs, adjacent enemies take this fraction of the rocket's damage. */
    RL_L3_SPLASH_MULT: 0.5,
    /** AAS3: on each recharge tick, this chance to gain +1 intercept charge (beyond missilesRecharged). */
    AAS_L3_BONUS_RECHARGE_CHANCE: 0.2,
    /** AB L3: chance per shot for a stealth strike (non-interceptable, uses AB_L3_STEALTH_MISSILES). */
    AB_L3_STEALTH_CHANCE: 0.3,
    AB_L3_STEALTH_MISSILES: 2,
    /** Enemy L3 Drone: military + AAS in range get this mult on interval/recharge (slower fire). MF excluded. */
    DRONE_L3_RECHARGE_DEBUFF_MULT: 1.25,
    /** All Missile Factories: missiles produced × this (1.0 = honest base numbers, no hidden nerf). */
    MF_GLOBAL_PRODUCTION_MULT: 1.0,
    /** Non–MF3 factory adjacent (hex 1) to a friendly MF3: production × this; MF3 does not buff itself. Non-stack. */
    MF_L3_NEIGHBOR_PRODUCTION_MULT: 1.3,
    /** Max militia with one Government; +MILITIA_PER_EXTRA_GOV for each additional Gov. */
    MILITIA_BASE_CAP: 5,
    MILITIA_PER_EXTRA_GOV: 2,
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
            { id: "RL3", hp: 413, range: 14, damage: 102, cost: 425, interval: 5050,  missilesPerShot: 2, projectiles: 1, interceptable: true, vision: 11, splash: true }
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
            { id: "MF1", hp: 105, cost: 230, produceInterval: 11111, missilesProduced: 1, vision: 4 },
            { id: "MF2", hp: 233, cost: 330, produceInterval: 10600, missilesProduced: 3, vision: 5 },
            { id: "MF3", hp: 399, cost: 430, produceInterval: 10000, missilesProduced: 5, vision: 6 }
        ]
    },
    G: {
        name: "Government",
        // List costs vs full-disk income (N=1+3r(r+1), one Gov): (income/cost) ≈ 0.020 / 0.022 / 0.0242 $/s per $.
        levels: [
            { id: "G1", hp: 375,  radius: 4,  cost: 1525, influence: 2000, vision: 8,  goldPerTile: 0.50 },
            { id: "G2", hp: 1081, radius: 6,  cost: 2019, influence: 3050, vision: 10, goldPerTile: 0.35 },
            { id: "G3", hp: 2457, radius: 9,  cost: 2800, influence: 6050, vision: 12, goldPerTile: 0.25 }
        ]
    },
    D: {
        name: "Drone Operator",
        levels: [
            { id: "D1", hp: 58,  range: 5, damage: 11, cost: 155, interval: 6200, projectiles: 1, interceptable: true, vision: 5 },
            { id: "D2", hp: 125, range: 6, damage: 13, cost: 205, interval: 5250, projectiles: 2, interceptable: true, vision: 6 },
            { id: "D3", hp: 200, range: 7, damage: 13, cost: 255, interval: 4750, projectiles: 3, interceptable: true, vision: 7, jamming: true }
        ]
    },
    M: {
        name: "Militia",
        // Budget glass cannon: cheap, solid damage, low HP. L2+ hp follows same upgrade rule from L1 baseline.
        levels: [
            { id: "M1", hp: 40,  range: 2, damage: 38, cost: 135, interval: 7600,  projectiles: 1, interceptable: false, vision: 4 },
            { id: "M2", hp: 86,  range: 3, damage: 40, cost: 185, interval: 5400,  projectiles: 1, interceptable: false, vision: 5 },
            { id: "M3_MILITIA_GOV", displayName: "Militia HQ", hp: 155, range: 3, damage: 40, cost: 1500, interval: 5400, projectiles: 1, interceptable: false, vision: 6,
              radius: 1, influence: 900, goldPerTile: 0.3 }
        ]
    },
    AB: {
        name: "Air Base",
        // Higher DPS/$ than RL at same tier, slower cadence; HP/$ near RL. Stealth strike on L3 (see GAME_CONFIG).
        levels: [
            { id: "AB1", hp: 175, range: 7,  damage: 145, cost: 350,  interval: 15800, missilesPerShot: 1, projectiles: 1, interceptable: true, projectileSpeed: 4.5, vision: 7  },
            { id: "AB2", hp: 500, range: 10, damage: 255, cost: 750,  interval: 10200, missilesPerShot: 2, projectiles: 1, interceptable: true, projectileSpeed: 5.5, vision: 10  },
            { id: "AB3", hp: 1250, range: 13, damage: 600, cost: 1400, interval: 8800,  missilesPerShot: 3, projectiles: 1, interceptable: true, projectileSpeed: 6.5, vision: 13 }
        ]
    },
    B: {
        name: "Barracks",
        // Tanky: highest HP/$ among combat structures; DPS tuned low–medium.
        levels: [
            { id: "B1", hp: 250, range: 4, radius: 3, damage: 45,  cost: 425,  interval: 7200, projectiles: 1, interceptable: false, influence: 1450, vision: 8  },
            { id: "B2", hp: 680, range: 5, radius: 4, damage: 68,  cost: 900,  interval: 5200, projectiles: 1, interceptable: false, influence: 1850, vision: 10 },
            { id: "B3", hp: 1780, range: 6, radius: 5, damage: 88, cost: 1700, interval: 3400, projectiles: 1, interceptable: false, influence: 2480, vision: 12 }
        ]
    }
};

/**
 * playstyle (AI macro layers — after land grab + missile comfort):
 *   raid    — more militia, forward M3, pressure, fewer passive turrets
 *   defend  — thicker AAS/B, safer Gov/MF, slower militia spend
 *   mixed   — middle path
 */
export const AI_DOCTRINES = {
    // -- Original 4 --
    AGGRESSOR:  { name: "AGGRESSOR",  G: 2,   RL: 3,   AAS: 1.5, MF: 2,   B: 2.5, D: 2.5, AB: 2,   M: 3,   upgradeBias: 0.35, playstyle: 'raid',   color: "#ff3d00" },
    TURTLE:     { name: "TURTLE",     G: 3,   RL: 1.5, AAS: 3,   MF: 2,   B: 2,   D: 1.5, AB: 1,   M: 1.5, upgradeBias: 0.55, playstyle: 'defend', color: "#00e5ff" },
    BOMBER:     { name: "BOMBER",     G: 2,   RL: 3,   AAS: 1.5, MF: 3,   B: 1.5, D: 1.5, AB: 3,   M: 2,   upgradeBias: 0.4,  playstyle: 'raid',   color: "#ffd700" },
    ECONOMIST:  { name: "ECONOMIST",  G: 4,   RL: 1.5, AAS: 2,   MF: 2.5, B: 2,   D: 1.5, AB: 1.5, M: 2,   upgradeBias: 0.5,  playstyle: 'mixed',  color: "#2ecc71" },
    // -- New 4 --
    /** Militia-heavy: floods map with cheap units, abuses M3 HQ for forward bases. */
    RAIDER:     { name: "RAIDER",     G: 2.5, RL: 1,   AAS: 1,   MF: 1.5, B: 3,   D: 2,   AB: 1,   M: 4,   upgradeBias: 0.3,  playstyle: 'raid',   color: "#e91e63" },
    /** Maximum AAS coverage: fortress mentality. Lets enemies waste missiles on interceptions. */
    IRON_DOME:  { name: "IRON DOME",  G: 2.5, RL: 2,   AAS: 4,   MF: 2.5, B: 2.5, D: 1,   AB: 1.5, M: 2,   upgradeBias: 0.6,  playstyle: 'defend', color: "#607d8b" },
    /** Drone swarm: saturates AAS with cheap projectiles, drains enemy charges. */
    SWARM:      { name: "SWARM",      G: 2,   RL: 1.5, AAS: 1.5, MF: 1.5, B: 1.5, D: 4,   AB: 2,   M: 3,   upgradeBias: 0.35, playstyle: 'raid',   color: "#9c27b0" },
    /** Balanced aggression: mix of everything, adapts to the situation. */
    WARLORD:    { name: "WARLORD",    G: 2.5, RL: 2.5, AAS: 2,   MF: 2.5, B: 2.5, D: 2,   AB: 2,   M: 2.5, upgradeBias: 0.45, playstyle: 'mixed',  color: "#ff9800" },
    // -- Extra variety (same rules: tiles + missiles first, then weights) --
    CITADEL:    { name: "CITADEL",    G: 3,   RL: 1,   AAS: 3.5, MF: 2,   B: 3,   D: 1,   AB: 1,   M: 1,   upgradeBias: 0.65, playstyle: 'defend', color: "#5c6bc0" },
    BLITZ:      { name: "BLITZ",      G: 2,   RL: 3,   AAS: 1,   MF: 2,   B: 2,   D: 3,   AB: 2,   M: 3,   upgradeBias: 0.3,  playstyle: 'raid',   color: "#ff5722" },
    AMBITIOUS:  { name: "AMBITIOUS",  G: 3.5, RL: 1.5, AAS: 1.5, MF: 2,   B: 2,   D: 2,   AB: 1,   M: 2.5, upgradeBias: 0.4,  playstyle: 'mixed',  color: "#26a69a" },
};

export const DIFFICULTY = {
    easy:      { name: 'EASY',      goldMult: 0.75, tickMult: 1.5,  startGoldDelta: -100 },
    normal:    { name: 'NORMAL',    goldMult: 1.0,  tickMult: 1.0,  startGoldDelta: 0 },
    hard:      { name: 'HARD',      goldMult: 1.25, tickMult: 0.7,  startGoldDelta: 150 },
    /** Faster AI ticks, stronger income, earlier pressure — for experienced players. */
    very_hard: { name: 'VERY HARD', goldMult: 1.45, tickMult: 0.55, startGoldDelta: 320 },
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
    low: { global: 45, perTargetType: 2 },
    medium: { global: 100, perTargetType: 3 },
    high: { global: 180, perTargetType: 5 },
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
