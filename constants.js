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
    /**
     * Menu map sizes (axial "radius" R of the containing hex; total hexes = 1 + 3R(R+1)).
     *   small R=20  -> 1,261 cells   · medium R=30 -> 2,791   · large R=45 -> 6,211
     * Free starting Government: STARTER_GOV_LEVEL = top Gov tier in UNIT_STATS (G3 / in‑game “level 3”, radius 9).
     * `hexGrid.findSpawnPoints` uses the same tier and scores banded G3+shore $/s in the disk, with a valid mf1 slot.
     * Nudge with player count via getEffectiveMapRadius (same preset feels tight at 7p, roomy at 2p).
     */
    MAP_RADII: { small: 20, medium: 30, large: 45 },
    /** 0-based index into `UNIT_STATS.G.levels` (2 = G3, max Government tier; matches spawn influence radius). */
    STARTER_GOV_LEVEL: 2,
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
        /** Naval cruise / anti-ship (DDG) — keep undertuned saturation vs land RL. */
        navy: 4,
        cruise: 2,
        drone: 7,
        ground: 2,
        militia: 3,
    },
    /** @deprecated Superseded by `AUTO_TARGET_SCORE.DIST_PER_HEX` (continuous distance in pick score). */
    AUTO_TARGET_DISTANCE_TIE_HEXES: 2,
    AUTO_TARGET_STRUCT_WEIGHT: {
        G: 100,
        MF: 85,
        AB: 45,
        RL: 40,
        /** Port — economy + sea influence, juicy mid-priority target on shore. */
        PT: 70,
        /** Navy — for tie-break; fleet combat uses targeting logic in game.js */
        SSG: 25,
        DDG: 24,
        AAS: 35,
        AF: 33,
        B: 28,
        D: 22,
        SU: 21,
        M: 18,
        BUNK: 8,
        RC: 12,
        TH: 50,
        EW: 38,
        CV: 55,
    },
    /**
     * Optional per-**source** structure type weights: `bySource[RL|AB][G|MF|…]`.
     * Omitted source types and missing keys fall back to `AUTO_TARGET_STRUCT_WEIGHT`.
     */
    AUTO_TARGET_STRUCT_WEIGHT_BY_SOURCE: {
        // Example: RL: { G: 100, MF: 90 },
    },
    /**
     * Scored auto-pick: higher = better. Distance + spread/finish + peer spread + layer; missile-smart stack still first.
     * (intervalEff: any damage → slower fire — use FULL_HP_SPREAD to also chip fresh buildings.)
     */
    AUTO_TARGET_SCORE: {
        /** Score per hex closer to this launcher than the farthest in-range candidate. */
        DIST_PER_HEX: 8000,
        /** Multiply `AUTO_TARGET_STRUCT_WEIGHT` (and BY_SOURCE) into the same score range as distance. */
        STRUCT_MULT: 110,
        /**
         * Per other same-type friendly launcher already on this hex this tick (alloc) or on manual `structure.target` (peers excl. self).
         * Large value discourages 50 launchers piling the same place while inbound cap covers mixed types.
         */
        PEER_SAME_TYPE: 24_000,
        /** Up to this much extra score to finish off low-HP (hpRatio = hp/maxHp, lower → higher score). */
        FINISH_LOW_HPRATIO: 9_000,
        /** If essentially full HP, add this to spread *intervalEff* slows onto more buildings. */
        FULL_HP_SPREAD: 11_000,
    },
    /**
     * MTG-style layers for future land vs navy: only applies when a side is "sea" (Navy type or `stats.autoTargetLayer` / water tile).
     * Same layer gets SAME_LAYER_BONUS; cross gets penalties (negative in score = avoid).
     */
    AUTO_TARGET_LAYER: {
        /** Both sea or both land — undertuned: fleet vs fleet / land vs land. */
        SAME_LAYER_BONUS: 36_000,
        /** Land→sea (e.g. RL vs ship); cancelled if `NAVY_COASTAL_LAND_EXCEPT_HEX` in game.js. */
        LAND_TO_SEA_PENALTY: -40_000,
        /** Sea→land (e.g. destroyer vs coastal base). */
        SEA_TO_LAND_PENALTY: -30_000,
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
        DDG:  5500,
        AF:   3200,
        SSG:  6000,
        SU:   5000,
        CV:   7000,
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
    /**
     * AAS3 "Iron Dome": reliable saturation defense. Reworked from RNG bonus to a deterministic
     * deeper magazine + larger volley on each recharge tick. Set to 0 to disable the legacy RNG bonus.
     */
    AAS_L3_BONUS_RECHARGE_CHANCE: 0,
    /** AB L3: chance per shot for a stealth strike (non-interceptable, uses AB_L3_STEALTH_MISSILES). */
    AB_L3_STEALTH_CHANCE: 0.3,
    AB_L3_STEALTH_MISSILES: 2,
    /** Enemy L3 Drone: military + AAS in range get this mult on interval/recharge (slower fire). MF excluded. */
    DRONE_L3_RECHARGE_DEBUFF_MULT: 1.25,
    /** Enemy Lv3 Signature (SU): default weaker jam — only used by factions whose signatureL3.id === 'jam'. */
    SIGNATURE_L3_RECHARGE_DEBUFF_MULT: 1.12,
    /** All Missile Factories: missiles produced × this (1.0 = honest base numbers, no hidden nerf). */
    MF_GLOBAL_PRODUCTION_MULT: 1.0,
    /** Non–MF3 factory adjacent (hex 1) to a friendly MF3: production × this; MF3 does not buff itself. Non-stack. */
    MF_L3_NEIGHBOR_PRODUCTION_MULT: 1.3,
    /** MF3 "Arsenal" self-boost: per adjacent friendly MF (any tier), this fraction is added to its own output. */
    MF_L3_SELF_BONUS_PER_ADJACENT_MF: 0.15,
    /** Cap on MF3 self-boost (so a 6-neighbor MF cluster doesn't explode). */
    MF_L3_SELF_BONUS_CAP: 0.60,
    /** G3 "Capitol": friendly structures inside G3 radius regenerate HP at this multiplier. */
    GOV_L3_REGEN_AURA_MULT: 2.0,
    /** M3 "Insurgency": when true, Militia HQ may continue to operate (fire, regen, project influence) on contested tiles. */
    MILITIA_HQ_L3_OPERATES_CONTESTED: true,
    /** M3 "Insurgency": damage multiplier applied to all M3 fire (small offensive bump to emphasize identity). */
    MILITIA_HQ_L3_DMG_MULT: 1.10,
    /** DDG3 "CEC Datalink": radius (hex) within which a friendly navy unlocks the CEC bonus. Was 3; widened to 5. */
    DDG3_CEC_RADIUS: 5,
    /** AF3 "Aegis BMD": enemies illuminated by AF3 take this multiplier in additional damage from friendly DDG/SSG. */
    AF3_ILLUM_DMG_MULT: 1.10,
    /** SSG3 "Bastion": chance per cruise missile to fire as stealth (non-interceptable). */
    SSG_L3_STEALTH_CHANCE: 0.25,
    /** PT3 "Free Trade": +5% gold to all owned Port sea income per OTHER friendly Port on the map. */
    PORT_L3_TRADE_PER_OTHER_PORT: 0.05,
    /** Cap on PT3 trade bonus regardless of Port count (caps at +20%, i.e. ~4 partner Ports). */
    PORT_L3_TRADE_CAP: 0.20,
    /** Bunker Lv3 "Hardened": damage taken multiplier applied at impact when defender is a BUNK3. */
    BUNK_L3_TAKEN_MULT: 0.75,
    // --- Navy ---
    /** In missileTargetPriority: DDG/SSG add this when target is an enemy **naval** (sea) unit. */
    NAVY_FIRST_TARGET_BONUS: 310_000,
    /** In missileTargetPriority: land-based RL/AB with missile-smart de-prioritize “deep” enemy navy. */
    NAVY_LAND_DEPRIOR_PENALTY: 620_000,
    /** If enemy navy is within this (hex) of your **buildable** land, no deprioritization. */
    NAVY_COASTAL_LAND_EXCEPT_HEX: 2,
    /** All Destroyers: base damage multiplier vs enemy naval targets — gives DDG a clear "anti-ship" identity. */
    DDG_ANTISHIP_DMG_MULT: 1.25,
    /** DDG3: with another friendly **navy** (DDG/AF/SSG) in 3 hexes, additional damage vs **enemy** ships only. */
    DDG3_CEC_DMG_MULT: 1.20,
    /** SSG3: with another friendly navy adjacent (1 hex), +damage vs enemy **naval** only. */
    SSG3_BASTION_DMG_MULT: 1.25,
    /** AF3: +intercept range (hex) vs interceptable shots **from** enemy **naval** structure tiles. */
    AF3_NAVY_ORIGIN_RANGE: 2,
    /** On intercept: mark shooter tile; navy strikers prefer that hex briefly. */
    NAVY_ILLUM_MS: 4_000,
    NAVY_ILLUM_TIE_BONUS: 8,
    // --- Port ---
    /** Owned shore-water + open-sea tiles within a friendly Port's radius earn this $/s per Port level slot (see UNIT_STATS.PT). Stacks like Gov gold (highest first, then halving). */
    PORT_GOLD_DIMINISH: true,
    /** L3 Port: friendly navy structures within radius get this damage multiplier (non-stacking across L3 Ports). */
    PORT_L3_NAVY_DAMAGE_MULT: 1.10,
    /** L3 Port: friendly navy structures within radius get this interval multiplier (lower = faster fire; non-stacking). */
    PORT_L3_NAVY_INTERVAL_MULT: 0.92,
    /** Max militia with one Government; +MILITIA_PER_EXTRA_GOV for each additional Gov. */
    MILITIA_BASE_CAP: 5,
    MILITIA_PER_EXTRA_GOV: 2,
    /**
     * Sea trade: owned open-sea tiles (non-shore, depth > 3 from land) earn this flat $/s each.
     * Rewards claiming deep water via navy or Gov influence expansion.
     */
    SEA_TRADE_GOLD_PER_TILE_TICK: 0.12,
};

/**
 * Nudge the axial map radius from the size preset by player count (centered on 4p):
 * crowded FFA on small / large lobbies on large.
 */
export function getEffectiveMapRadius(mapSize, playerCount) {
    const presets = GAME_CONFIG.MAP_RADII;
    const base = presets[mapSize] || presets.medium;
    const p = Math.max(2, Math.min(7, playerCount | 0));
    const nudge = Math.round((p - 4) * 1.0);
    const r = base + nudge;
    return Math.max(presets.small - 1, Math.min(presets.large + 5, r));
}

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

/** Inclusive hex disk: radius R → 1 + 3R(R+1) cells. */
export function hexDiskTileCount(radius) {
    return 1 + 3 * radius * (radius + 1);
}

/**
 * Government $/s by axial distance d (hex) from the Gov, tiered by ring.
 * Calibrated so full-disk *solo* $/s matches the legacy “flat g/tile” model:
 *   G1: N(4)*0.50, G2: N(6)*0.35, G3: N(9)*0.25
 * where N(r)=hexDiskTileCount(r).
 */
export const GOV_GOLD_INNER_D = 4;
// Mid / outer annulus rates derived from: G2 outer annulus, G3 outer annulus
const G2_MID = (127 * 0.35 - 61 * 0.5) / 66;   // 13.95/66
const G3_OUT = (271 * 0.25 - 44.45) / 144;     // 23.3/144
export const GOV_GOLD_RING = { inner: 0.5, mid: G2_MID, outer: G3_OUT };

/**
 * @param {number} structureLevel 0=G1,1=G2,2=G3
 * @param {number} d axial hex distance Gov → income tile
 */
export function govGoldForDistance(structureLevel, d) {
    if (d < 0) return 0;
    if (structureLevel === 0) {
        if (d <= 4) return GOV_GOLD_RING.inner;
        return 0;
    }
    if (structureLevel === 1) {
        if (d <= 4) return GOV_GOLD_RING.inner;
        if (d <= 6) return GOV_GOLD_RING.mid;
        return 0;
    }
    if (structureLevel === 2) {
        if (d <= 4) return GOV_GOLD_RING.inner;
        if (d <= 6) return GOV_GOLD_RING.mid;
        if (d <= 9) return GOV_GOLD_RING.outer;
        return 0;
    }
    return 0;
}

/** Total $/s if this Gov is alone on a full land (or full eligible) sea disk — matches legacy flat model. */
export function totalSoloGovDiskGoldPerSec(structureLevel) {
    if (structureLevel < 0 || structureLevel > 2) return 0;
    const nL = (r0, r1) => hexDiskTileCount(r1) - hexDiskTileCount(r0);
    if (structureLevel === 0) return hexDiskTileCount(4) * 0.5; // 61 * 0.5
    if (structureLevel === 1) return 61 * GOV_GOLD_RING.inner + nL(4, 6) * GOV_GOLD_RING.mid;
    return 61 * GOV_GOLD_RING.inner + 66 * GOV_GOLD_RING.mid + nL(6, 9) * GOV_GOLD_RING.outer;
}

/** 2–3 line HTML for the selection panel / tooltips. */
export function govGoldBandLinesHtml(structureLevel) {
    const inner = `r ≤${GOV_GOLD_INNER_D} · <b>+$${GOV_GOLD_RING.inner}/s</b> per income tile`;
    if (structureLevel === 0) {
        return `<p class="info-perk">Gold from owned land &amp; shore (water within 3 of land) in influence: ${inner}.</p>`;
    }
    if (structureLevel === 1) {
        return `<p class="info-perk">Gold by band: ${inner} · r 5–6 · <b>+$${GOV_GOLD_RING.mid.toFixed(2)}/s</b> · (same full-disk $/s as pre-patch G2)</p>`;
    }
    return `<p class="info-perk">Gold by band: ${inner} · r 5–6 · <b>+$${GOV_GOLD_RING.mid.toFixed(2)}/s</b> · r 7–9 · <b>+$${GOV_GOLD_RING.outer.toFixed(2)}/s</b> · (same full-disk $/s as pre-patch G3)</p>`;
}

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
            // L3 "Iron Dome": deeper magazine + bigger volley per tick (was 3 missiles / cap 9 + RNG bonus).
            { id: "AAS3", hp: 412, range: 9, cost: 405, rechargeInterval: 5303, missilesRecharged: 4, chargeCap: 11, vision: 9 }
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
        // Banded gold by axial distance; full-disk $/s matches legacy (see govGoldForDistance, totalSoloGovDiskGoldPerSec).
        // goldPerTile = old disk-average, for labels only — actual $/s uses concentric bands.
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
    /** Faction Signature: glassier than D, better DPS/$. L3: area jam (weaker than Drone L3). */
    SU: {
        name: "Signature Battery",
        levels: [
            { id: "SU1", hp: 52,  range: 5, damage: 12, cost: 158, interval: 6000, projectiles: 1, interceptable: true, vision: 5 },
            { id: "SU2", hp: 112, range: 6, damage: 14, cost: 208, interval: 5100, projectiles: 2, interceptable: true, vision: 6 },
            { id: "SU3", hp: 178, range: 7, damage: 14, cost: 262, interval: 4900, projectiles: 3, interceptable: true, vision: 7, signatureJam: true }
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
    },
    // --- Water-only. Glassier HP/$; slower cadence than drones; L3: see GAME_CONFIG. ---
    DDG: {
        name: "Destroyer",
        levels: [
            { id: "DDG1", hp: 92,  range: 6,  damage: 45,  cost: 270,  interval: 11_200, missilesPerShot: 1, projectiles: 1, interceptable: true,  vision: 5 },
            { id: "DDG2", hp: 200, range: 7,  damage: 65,  cost: 380,  interval: 7_900,  missilesPerShot: 1, projectiles: 1, interceptable: true,  vision: 7 },
            { id: "DDG3", hp: 338, range: 8,  damage: 84,  cost: 480,  interval: 5_900,  missilesPerShot: 1, projectiles: 1, interceptable: true,  vision: 8, cec: true }
        ]
    },
    AF: {
        name: "Aegis (Sea AA)",
        levels: [
            { id: "AF1",  hp: 86,  range: 3,  cost: 250,  rechargeInterval: 11_600, missilesRecharged: 1, chargeCap: 3,  vision: 4 },
            { id: "AF2",  hp: 198, range: 4,  cost: 355,  rechargeInterval: 8_200,  missilesRecharged: 1, chargeCap: 4,  vision: 5 },
            { id: "AF3",  hp: 345, range: 5,  cost: 455,  rechargeInterval: 6_000,  missilesRecharged: 2, chargeCap: 5,  vision: 6,  illuminator: true }
        ]
    },
    SSG: {
        name: "Cruise Sub",
        levels: [
            { id: "SSG1", hp: 128, range: 5,  damage: 108, cost: 430,  interval: 17_500, missilesPerShot: 1, projectiles: 1, interceptable: true,  projectileSpeed: 3.6, vision: 5 },
            { id: "SSG2", hp: 350, range: 6,  damage: 178, cost: 900,  interval: 12_200, missilesPerShot: 2, projectiles: 1, interceptable: true,  projectileSpeed: 4.2, vision: 7 },
            { id: "SSG3", hp: 900, range: 7,  damage: 430, cost: 1_580, interval: 10_200, missilesPerShot: 2, projectiles: 1, interceptable: true,  projectileSpeed: 4.6, vision: 9, bastion: true }
        ]
    },
    /**
     * Port — coastal land structure. Projects influence (claims water), earns trade gold from owned
     * shore + open-sea tiles in radius, supplies friendly navy. L3 buffs friendly navy in range.
     * Build on land adjacent to water (shore-land only).
     */
    PT: {
        name: "Port",
        levels: [
            { id: "PT1", hp: 220,  radius: 4, cost: 600,  influence: 1100, vision: 6,  seaGoldPerTile: 0.18 },
            { id: "PT2", hp: 580,  radius: 6, cost: 1050, influence: 1700, vision: 9,  seaGoldPerTile: 0.28 },
            { id: "PT3", hp: 1450, radius: 8, cost: 1600, influence: 2400, vision: 12, seaGoldPerTile: 0.38, navyAura: true }
        ]
    },
    /**
     * Bunker — pure HP wall. No attack, no influence, no income. Placed on owned land,
     * soaks damage to anchor chokepoints. Lv3 "Hardened" reduces damage taken to itself by 25%.
     * Cheap-per-HP relative to combat structures because it does nothing offensive.
     */
    BUNK: {
        name: "Bunker",
        levels: [
            { id: "BUNK1", hp: 1200, cost: 300, vision: 3 },
            { id: "BUNK2", hp: 2800, cost: 500, vision: 4 },
            { id: "BUNK3", hp: 6500, cost: 900, vision: 5, hardened: true }
        ]
    },
    /**
     * Recon Outpost — fog breaker. Cheap, fragile, huge vision radius. No attack, no influence.
     * Counter-play to AB3 stealth strikes and ambushes — the player who scouts wins target priority.
     * Lv3 "Aerial Surveillance": +50% extra vision and exposes targets in its vision for the player
     * (used by missile-smart targeting to prefer scouted enemies).
     */
    RC: {
        name: "Recon Outpost",
        levels: [
            { id: "RC1", hp: 70,  cost: 175, vision: 9 },
            { id: "RC2", hp: 140, cost: 275, vision: 12 },
            { id: "RC3", hp: 260, cost: 400, vision: 16, scouting: true }
        ]
    },
    /**
     * Trade Hub — non-combat economic structure. Income scales with your trade network:
     * each tick pays `tradeBase + tradePerGov × otherFriendlyGovs + tradePerPort × friendlyPorts`.
     * Lv3 "Trade Network": also pays +5% gold passive boost to all your other Govs (`tradeGovBonus`).
     * Rewards a wide connected empire rather than a single fortress.
     */
    TH: {
        name: "Trade Hub",
        levels: [
            { id: "TH1", hp: 220, cost: 425, vision: 4, tradeBase: 0.40, tradePerGov: 0.30, tradePerPort: 0.0 },
            { id: "TH2", hp: 520, cost: 700, vision: 5, tradeBase: 0.60, tradePerGov: 0.40, tradePerPort: 0.0 },
            { id: "TH3", hp: 1180, cost: 1100, vision: 6, tradeBase: 0.90, tradePerGov: 0.50, tradePerPort: 0.30, tradeGovBonus: 0.05 }
        ]
    },
    /**
     * EW Jammer — soft-kill defensive structure. Friendly tiles within `range` take reduced damage
     * from interceptable enemy projectiles (rockets, airstrikes, navy, cruise, drones, signature).
     * Distinct from AAS/AF which physically intercepts: EW is a passive damage reduction aura.
     * Lv3 "Spoofing": adds a chance to fully cancel an interceptable projectile (soft-intercept).
     * `ewDmgMult` is per-level; non-stacking (best aura wins).
     */
    EW: {
        name: "EW Jammer",
        levels: [
            { id: "EW1", hp: 200,  cost: 375, range: 4, vision: 5, ewDmgMult: 0.85, ewCancelChance: 0 },
            { id: "EW2", hp: 480,  cost: 625, range: 5, vision: 6, ewDmgMult: 0.78, ewCancelChance: 0 },
            { id: "EW3", hp: 1050, cost: 950, range: 6, vision: 7, ewDmgMult: 0.70, ewCancelChance: 0.15 }
        ]
    },
    /**
     * Carrier Group — naval air-projection. Long-range, expensive, launches multi-projectile
     * air sorties from sea. Built on owned water (NAVY_BUILD_TYPES). Each volley consumes
     * `missilesPerShot` missiles regardless of projectile count, so missile economy matters.
     * Lv3 "Air Wing": each volley fires one extra stealth (non-interceptable) sortie.
     */
    CV: {
        name: "Carrier Group",
        levels: [
            { id: "CV1", hp: 280,  range: 9,  damage: 110, cost: 700,  interval: 12000, missilesPerShot: 1, projectiles: 2, interceptable: true,  projectileSpeed: 4.8, vision: 7 },
            { id: "CV2", hp: 720,  range: 11, damage: 165, cost: 1300, interval: 9000,  missilesPerShot: 1, projectiles: 3, interceptable: true,  projectileSpeed: 5.4, vision: 9 },
            { id: "CV3", hp: 1700, range: 14, damage: 220, cost: 2300, interval: 7000,  missilesPerShot: 2, projectiles: 4, interceptable: true,  projectileSpeed: 6.0, vision: 12, airWing: true }
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
    build_SU:   'F10',
    build_DDG:  'F7',
    build_AF:   'F8',
    build_SSG:  'F9',
    build_PT:   'F6',
    build_BUNK: 'Digit9',
    build_RC:   'Digit0',
    build_TH:   'F2',
    build_EW:   'F3',
    build_CV:   'F4',
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
