// ============================================================================
//  FACTION-UNIQUE UNITS — 14 nations × 5 categories = 70 unit types.
//  Each faction gets one extra unit per category (Economy / Defense / Offense /
//  Ground / Navy) in addition to the generic G/MF/TH/PT, AAS/EW/BUNK/RC,
//  RL/AB/ICBM, B/M/D, CV/DDG/AF/SSG roster.
//
//  Unit IDs: <CODE>_<CAT>  e.g. USA_ECO, RUS_NAV.
//  CODE matches `FACTIONS[i].code` in factions.js.
//  CAT in { ECO, DEF, OFF, GND, NAV }.
//
//  Most mechanics reuse existing engine primitives (hp, range, damage,
//  interval, projectiles, splash, interceptable, vision, radius, influence,
//  ewDmgMult). New mechanic flags are added on the level object and handled
//  inline in game.js — see “NEW MECHANIC FLAGS” comment block in game.js.
//
//  L2/L3 HP follows the same rule as the generics: each upgrade adds
//  round(upgradeGold * 1.1 * (L1.hp / L1.cost)).
// ============================================================================

/** Categories — controls which build group the button appears under and what placement rules apply. */
export const FU_CATEGORY = { ECO: 'eco', DEF: 'def', OFF: 'off', GND: 'gnd', NAV: 'nav' };

/** Faction unit definitions. Keyed by unit type id (e.g. "USA_ECO"). */
export const FACTION_UNIT_STATS = {

    // ─── USA ──────────────────────────────────────────────────────────────
    USA_ECO: { name: 'Wall Street Exchange', icon: '💹', factionCode: 'USA', category: 'eco',
        levels: [
            { id: 'USA_ECO1', hp: 260, cost: 900,  vision: 5, treasuryGoldPctPerSec: 0.0035, treasuryGoldCap: 1.2, killRefundPct: 0.04, killRefundRange: 10 },
            { id: 'USA_ECO2', hp: 640, cost: 1450, vision: 6, treasuryGoldPctPerSec: 0.0045, treasuryGoldCap: 1.7, killRefundPct: 0.06, killRefundRange: 11 },
            { id: 'USA_ECO3', hp: 1450,cost: 2300, vision: 7, treasuryGoldPctPerSec: 0.005,  treasuryGoldCap: 2.2, killRefundPct: 0.08, killRefundRange: 12, l3Perk: '+0.5%/s of treasury (cap 2.2 g/s) and 8% kill-refund within 12 tiles.' }
        ] },
    USA_DEF: { name: 'Patriot Targeting Cell', icon: '📡', factionCode: 'USA', category: 'def',
        levels: [
            { id: 'USA_DEF1', hp: 90,  cost: 250, vision: 8,  aasAuraRange: 6,  aasAuraRangeBonus: 1, aasAuraCapBonus: 1 },
            { id: 'USA_DEF2', hp: 200, cost: 400, vision: 9,  aasAuraRange: 8,  aasAuraRangeBonus: 2, aasAuraCapBonus: 2 },
            { id: 'USA_DEF3', hp: 360, cost: 600, vision: 10, aasAuraRange: 10, aasAuraRangeBonus: 2, aasAuraCapBonus: 1, ignoreEwOnCuedAas: true }
        ] },
    USA_OFF: { name: 'Joint Targeting Cell', icon: '🎯', factionCode: 'USA', category: 'off',
        levels: [
            { id: 'USA_OFF1', hp: 140, cost: 275,  vision: 11, range: 10, interval: 4000, damage: 0, projectiles: 0, surveillanceRangeBonus: 0.25, surveillanceDmgBonus: 0.10 },
            { id: 'USA_OFF2', hp: 360, cost: 600,  vision: 13, range: 12, interval: 4000, damage: 0, projectiles: 0, surveillanceRangeBonus: 0.40, surveillanceDmgBonus: 0.20 },
            { id: 'USA_OFF3', hp: 820, cost: 1100, vision: 15, range: 14, interval: 4000, damage: 0, projectiles: 0, surveillanceRangeBonus: 0.60, surveillanceDmgBonus: 0.35, firstSalvoCrit: 1.5 }
        ] },
    USA_GND: { name: 'Stryker BCT', icon: '🛻', factionCode: 'USA', category: 'gnd',
        levels: [
            { id: 'USA_GND1', hp: 90,  cost: 300, vision: 7, range: 7, interval: 5000, damage: 0, projectiles: 0, paintAura: { rangeBonus: 0.35, dmgBonus: 0.20, radius: 6 } },
            { id: 'USA_GND2', hp: 180, cost: 480, vision: 8, range: 8, interval: 4400, damage: 0, projectiles: 0, paintAura: { rangeBonus: 0.45, dmgBonus: 0.25, radius: 7 } },
            { id: 'USA_GND3', hp: 320, cost: 760, vision: 9, range: 9, interval: 3600, damage: 0, projectiles: 0, paintAura: { rangeBonus: 0.55, dmgBonus: 0.30, radius: 8 } }
        ] },
    USA_NAV: { name: 'Zumwalt Railgun DDG', icon: '🚢', factionCode: 'USA', category: 'nav',
        levels: [
            { id: 'USA_NAV1', hp: 95,  cost: 320, range: 7,  damage: 70,  interval: 10000, projectiles: 1, vision: 7,  interceptable: false },
            { id: 'USA_NAV2', hp: 210, cost: 470, range: 8,  damage: 100, interval: 8000,  projectiles: 1, vision: 8,  interceptable: false },
            { id: 'USA_NAV3', hp: 360, cost: 640, range: 10, damage: 140, interval: 6500,  projectiles: 1, vision: 10, interceptable: false }
        ] },

    // ─── RUSSIA ───────────────────────────────────────────────────────────
    RUS_ECO: { name: 'Iskander Bunker Depot', icon: '🏚️', factionCode: 'RUS', category: 'eco',
        levels: [
            { id: 'RUS_ECO1', hp: 420,  cost: 700,  vision: 5, mfRateBoost: 0.20, mfRateBoostRadius: 1 },
            { id: 'RUS_ECO2', hp: 950,  cost: 1100, vision: 6, mfRateBoost: 0.28, mfRateBoostRadius: 1 },
            { id: 'RUS_ECO3', hp: 2200, cost: 1700, vision: 7, mfRateBoost: 0.35, mfRateBoostRadius: 1 }
        ] },
    RUS_DEF: { name: 'S-400 Triumf Belt', icon: '🛰️', factionCode: 'RUS', category: 'def',
        levels: [
            { id: 'RUS_DEF1', hp: 180, cost: 400, rechargeInterval: 30000, missilesRecharged: 1, chargeCap: 1, range: 10, vision: 10, longRangeSam: true },
            { id: 'RUS_DEF2', hp: 380, cost: 650, rechargeInterval: 28000, missilesRecharged: 1, chargeCap: 1, range: 13, vision: 12, longRangeSam: true },
            { id: 'RUS_DEF3', hp: 700, cost: 950, rechargeInterval: 22500, missilesRecharged: 1, chargeCap: 2, range: 16, vision: 14, longRangeSam: true }
        ] },
    RUS_OFF: { name: 'Solntsepyok Battery', icon: '🔥', factionCode: 'RUS', category: 'off',
        levels: [
            { id: 'RUS_OFF1', hp: 120, cost: 300,  range: 4, damage: 60,  pctHpDmg: 0.08, interval: 14000, projectiles: 1, splash: true, splashRadius: 1, vision: 4 },
            { id: 'RUS_OFF2', hp: 280, cost: 700,  range: 5, damage: 90,  pctHpDmg: 0.14, interval: 11000, projectiles: 1, splash: true, splashRadius: 1, vision: 5 },
            { id: 'RUS_OFF3', hp: 640, cost: 1300, range: 6, damage: 140, pctHpDmg: 0.22, interval: 8500,  projectiles: 1, splash: true, splashRadius: 2, vision: 6, pctHpDmgCap: 600 }
        ] },
    RUS_GND: { name: 'Iskander Strike Brigade', icon: '💥', factionCode: 'RUS', category: 'gnd',
        levels: [
            { id: 'RUS_GND1', hp: 70,  cost: 380,  range: 8,  damage: 95,  interval: 14000, projectiles: 1, splash: true, splashRadius: 1, vision: 7,  interceptable: true },
            { id: 'RUS_GND2', hp: 140, cost: 620,  range: 10, damage: 160, interval: 13000, projectiles: 1, splash: true, splashRadius: 1, vision: 9,  interceptable: true },
            { id: 'RUS_GND3', hp: 260, cost: 1300, range: 12, damage: 240, interval: 12000, projectiles: 1, splash: true, splashRadius: 1, vision: 11, interceptable: true }
        ] },
    RUS_NAV: { name: 'Gorshkov Zircon Frigate', icon: '🛥️', factionCode: 'RUS', category: 'nav',
        levels: [
            { id: 'RUS_NAV1', hp: 90,  cost: 500, range: 9,  damage: 160, interval: 22000, projectiles: 1, vision: 9 },
            { id: 'RUS_NAV2', hp: 195, cost: 800, range: 10, damage: 240, interval: 18000, projectiles: 1, vision: 10 },
            { id: 'RUS_NAV3', hp: 330, cost: 1300, range: 12, damage: 340, interval: 14000, projectiles: 1, vision: 12, interceptable: false }
        ] },

    // ─── CHINA ────────────────────────────────────────────────────────────
    CHN_ECO: { name: 'Five-Year Plan Combine', icon: '🏗️', factionCode: 'CHN', category: 'eco',
        levels: [
            { id: 'CHN_ECO1', hp: 230,  cost: 500,  vision: 5, mfCostDiscount: 0.04, mfCostDiscountRadius: 4 },
            { id: 'CHN_ECO2', hp: 560,  cost: 800,  vision: 6, mfCostDiscount: 0.07, mfCostDiscountRadius: 5 },
            { id: 'CHN_ECO3', hp: 1280, cost: 1250, vision: 7, mfCostDiscount: 0.11, mfCostDiscountRadius: 6 }
        ] },
    CHN_DEF: { name: 'HQ-9 Magazine Park', icon: '🎯', factionCode: 'CHN', category: 'def',
        levels: [
            { id: 'CHN_DEF1', hp: 220, cost: 300, vision: 5, launcherRofBoost: 0.25, launcherRofRadius: 1, range: 6 },
            { id: 'CHN_DEF2', hp: 460, cost: 475, vision: 6, launcherRofBoost: 0.35, launcherRofRadius: 1, range: 7 },
            { id: 'CHN_DEF3', hp: 880, cost: 700, vision: 7, launcherRofBoost: 0.50, launcherRofRadius: 1, range: 8 }
        ] },
    CHN_OFF: { name: 'DF-17 Glide Pad', icon: '🛸', factionCode: 'CHN', category: 'off',
        levels: [
            { id: 'CHN_OFF1', hp: 160, cost: 400,  range: 11, damage: 220, interval: 38000, projectiles: 1, vision: 9,  interceptable: false, chargeUpMs: 22000 },
            { id: 'CHN_OFF2', hp: 380, cost: 850,  range: 14, damage: 380, interval: 28000, projectiles: 1, vision: 11, interceptable: false, chargeUpMs: 18000 },
            { id: 'CHN_OFF3', hp: 760, cost: 1400, range: 17, damage: 560, interval: 20000, projectiles: 1, vision: 14, interceptable: false, chargeUpMs: 16000 }
        ] },
    CHN_GND: { name: 'PCL-181 Rocket Battery', icon: '💢', factionCode: 'CHN', category: 'gnd',
        levels: [
            { id: 'CHN_GND1', hp: 110, cost: 280,  range: 5, damage: 18, interval: 8000, projectiles: 3, vision: 5, autoSpread: true },
            { id: 'CHN_GND2', hp: 230, cost: 460,  range: 6, damage: 22, interval: 6500, projectiles: 5, vision: 6, autoSpread: true },
            { id: 'CHN_GND3', hp: 460, cost: 1100, range: 7, damage: 28, interval: 5200, projectiles: 6, vision: 7, autoSpread: true }
        ] },
    CHN_NAV: { name: 'Type 055 Renhai', icon: '⚓', factionCode: 'CHN', category: 'nav',
        levels: [
            { id: 'CHN_NAV1', hp: 100, cost: 480, range: 8,  damage: 22, interval: 16000, projectiles: 4, vision: 8 },
            { id: 'CHN_NAV2', hp: 220, cost: 760, range: 9,  damage: 30, interval: 13000, projectiles: 6, vision: 9 },
            { id: 'CHN_NAV3', hp: 370, cost: 1100, range: 11, damage: 40, interval: 11000, projectiles: 8, vision: 11 }
        ] },

    // ─── JAPAN ────────────────────────────────────────────────────────────
    JPN_ECO: { name: 'JSDF Logistics Hub', icon: '🚚', factionCode: 'JPN', category: 'eco',
        levels: [
            { id: 'JPN_ECO1', hp: 300,  cost: 650,  vision: 5, repairAura: 4,  repairAuraRange: 4, goldPerTile: 0.0, flatGoldPerSec: 0.4 },
            { id: 'JPN_ECO2', hp: 720,  cost: 1050, vision: 6, repairAura: 8,  repairAuraRange: 4, flatGoldPerSec: 0.7 },
            { id: 'JPN_ECO3', hp: 1700, cost: 1600, vision: 7, repairAura: 14, repairAuraRange: 4, flatGoldPerSec: 1.0, drAura: 0.90, drAuraRange: 2 }
        ] },
    JPN_DEF: { name: 'Chu-SAM Lean Battery', icon: '🛡️', factionCode: 'JPN', category: 'def',
        levels: [
            { id: 'JPN_DEF1', hp: 130, cost: 225, range: 3, rechargeInterval: 9000, missilesRecharged: 3, chargeCap: 3, vision: 4 },
            { id: 'JPN_DEF2', hp: 290, cost: 350, range: 4, rechargeInterval: 7500, missilesRecharged: 3, chargeCap: 3, vision: 5 },
            { id: 'JPN_DEF3', hp: 520, cost: 500, range: 5, rechargeInterval: 5500, missilesRecharged: 4, chargeCap: 4, vision: 6 }
        ] },
    JPN_OFF: { name: 'Type 12 Coastal SSM', icon: '🌊', factionCode: 'JPN', category: 'off',
        levels: [
            { id: 'JPN_OFF1', hp: 100, cost: 225, range: 8,  damage: 70,  interval: 12000, projectiles: 2, vision: 8,  interceptable: true },
            { id: 'JPN_OFF2', hp: 230, cost: 475, range: 11, damage: 110, interval: 9000,  projectiles: 2, vision: 11, interceptable: true },
            { id: 'JPN_OFF3', hp: 520, cost: 900, range: 14, damage: 165, interval: 7000,  projectiles: 2, vision: 14, interceptable: true, homeTerritoryBonus: { extraProj: 1 } }
        ] },
    JPN_GND: { name: 'Mountain Garrison', icon: '🗻', factionCode: 'JPN', category: 'gnd',
        levels: [
            { id: 'JPN_GND1', hp: 180, cost: 260, range: 4, damage: 40, interval: 6000, projectiles: 1, vision: 4, dugInBonus: { hp: 0.5, range: 1 }, dugInMinFriendlyAdj: 2 },
            { id: 'JPN_GND2', hp: 410, cost: 420, range: 5, damage: 55, interval: 5000, projectiles: 1, vision: 5, dugInBonus: { hp: 0.5, range: 1 }, dugInMinFriendlyAdj: 2 },
            { id: 'JPN_GND3', hp: 920, cost: 820, range: 6, damage: 75, interval: 4000, projectiles: 1, vision: 6, dugInBonus: { hp: 0.5, range: 1 }, dugInMinFriendlyAdj: 2 }
        ] },
    JPN_NAV: { name: 'Mogami Stealth FFM', icon: '🌫️', factionCode: 'JPN', category: 'nav',
        levels: [
            { id: 'JPN_NAV1', hp: 88,  cost: 290, range: 6, damage: 50, interval: 10000, projectiles: 1, vision: 6, lowProfile: true, lowProfileRevealRange: 2 },
            { id: 'JPN_NAV2', hp: 195, cost: 410, range: 7, damage: 72, interval: 8000,  projectiles: 1, vision: 7, lowProfile: true, lowProfileRevealRange: 2 },
            { id: 'JPN_NAV3', hp: 325, cost: 560, range: 8, damage: 95, interval: 6000,  projectiles: 1, vision: 8, lowProfile: true, lowProfileRevealRange: 2, stealthIntervalBonus: 0.25 }
        ] },

    // ─── TÜRKIYE ──────────────────────────────────────────────────────────
    TUR_ECO: { name: 'Bayraktar Drone Yard', icon: '🛩️', factionCode: 'TUR', category: 'eco',
        levels: [
            { id: 'TUR_ECO1', hp: 180, cost: 400, vision: 8,  flatGoldPerSec: 0.45 },
            { id: 'TUR_ECO2', hp: 380, cost: 600, vision: 10, flatGoldPerSec: 0.85 },
            { id: 'TUR_ECO3', hp: 760, cost: 850, vision: 13, flatGoldPerSec: 1.30 }
        ] },
    TUR_DEF: { name: 'KORAL EW Spoofer', icon: '📡', factionCode: 'TUR', category: 'def',
        levels: [
            { id: 'TUR_DEF1', hp: 160, cost: 350, vision: 5, range: 5, koralSpoof: 0.20 },
            { id: 'TUR_DEF2', hp: 340, cost: 550, vision: 6, range: 6, koralSpoof: 0.30 },
            { id: 'TUR_DEF3', hp: 620, cost: 800, vision: 7, range: 8, koralSpoof: 0.40 }
        ] },
    TUR_OFF: { name: 'Bayraktar Swarm Hangar', icon: '🪰', factionCode: 'TUR', category: 'off',
        levels: [
            { id: 'TUR_OFF1', hp: 130, cost: 350,  range: 9,  damage: 18, interval: 22000, projectiles: 4, vision: 9 },
            { id: 'TUR_OFF2', hp: 300, cost: 800,  range: 12, damage: 28, interval: 20000, projectiles: 6, vision: 12 },
            { id: 'TUR_OFF3', hp: 700, cost: 1400, range: 15, damage: 45, interval: 18000, projectiles: 9, vision: 15 }
        ] },
    TUR_GND: { name: 'Bayraktar Spotter Team', icon: '👁️', factionCode: 'TUR', category: 'gnd',
        levels: [
            { id: 'TUR_GND1', hp: 80,  cost: 220, range: 6, damage: 25, interval: 7000, projectiles: 1, vision: 9, splash: true, splashRadius: 1 },
            { id: 'TUR_GND2', hp: 165, cost: 360, range: 7, damage: 35, interval: 5800, projectiles: 1, vision: 11, splash: true, splashRadius: 1 },
            { id: 'TUR_GND3', hp: 330, cost: 820, range: 8, damage: 50, interval: 4800, projectiles: 1, vision: 13, splash: true, splashRadius: 1 }
        ] },
    TUR_NAV: { name: 'TCG Anadolu Drone Carrier', icon: '🛬', factionCode: 'TUR', category: 'nav',
        levels: [
            { id: 'TUR_NAV1', hp: 150, cost: 480,  range: 10, damage: 65,  interval: 14000, projectiles: 2, vision: 10 },
            { id: 'TUR_NAV2', hp: 360, cost: 820,  range: 12, damage: 95,  interval: 11000, projectiles: 3, vision: 12 },
            { id: 'TUR_NAV3', hp: 780, cost: 1400, range: 15, damage: 130, interval: 9000,  projectiles: 4, vision: 15, stealthExtraProj: 1 }
        ] },

    // ─── IRAN ─────────────────────────────────────────────────────────────
    IRN_ECO: { name: 'Sanctions Bazaar', icon: '🛍️', factionCode: 'IRN', category: 'eco',
        levels: [
            { id: 'IRN_ECO1', hp: 200,  cost: 600,  vision: 5, goldLumpOnBuild: 250, flatGoldPerSec: 0.15 },
            { id: 'IRN_ECO2', hp: 460,  cost: 950,  vision: 6, goldLumpOnBuild: 450, flatGoldPerSec: 0.15 },
            { id: 'IRN_ECO3', hp: 1050, cost: 1450, vision: 7, goldLumpOnBuild: 700, flatGoldPerSec: 0.15, martyrMissileMs: 20000 }
        ] },
    IRN_DEF: { name: 'Bavar-373 Sanctum', icon: '🪐', factionCode: 'IRN', category: 'def',
        levels: [
            { id: 'IRN_DEF1', hp: 105, cost: 205, range: 5, rechargeInterval: 9999999, missilesRecharged: 0, chargeCap: 4, vision: 5, lifetimeShots: 4 },
            { id: 'IRN_DEF2', hp: 240, cost: 305, range: 7, rechargeInterval: 9999999, missilesRecharged: 0, chargeCap: 6, vision: 7, lifetimeShots: 6 },
            { id: 'IRN_DEF3', hp: 430, cost: 405, range: 9, rechargeInterval: 9999999, missilesRecharged: 0, chargeCap: 8, vision: 9, lifetimeShots: 8 }
        ] },
    IRN_OFF: { name: 'Fateh Salvo Silo', icon: '🚀', factionCode: 'IRN', category: 'off',
        levels: [
            { id: 'IRN_OFF1', hp: 110, cost: 325,  range: 7,  damage: 70,  interval: 45000, projectiles: 2, vision: 7,  preStock: 2 },
            { id: 'IRN_OFF2', hp: 260, cost: 700,  range: 10, damage: 105, interval: 45000, projectiles: 3, vision: 10, preStock: 3 },
            { id: 'IRN_OFF3', hp: 580, cost: 1200, range: 13, damage: 140, interval: 45000, projectiles: 3, vision: 13, preStock: 3 }
        ] },
    IRN_GND: { name: 'Basij Mobilization', icon: '🏴', factionCode: 'IRN', category: 'gnd',
        levels: [
            { id: 'IRN_GND1', hp: 95,  cost: 200, range: 3, damage: 12, interval: 9000, projectiles: 2, vision: 4, interceptable: false },
            { id: 'IRN_GND2', hp: 200, cost: 320, range: 4, damage: 16, interval: 7000, projectiles: 3, vision: 5, interceptable: false },
            { id: 'IRN_GND3', hp: 380, cost: 700, range: 5, damage: 22, interval: 5000, projectiles: 4, vision: 6, interceptable: false }
        ] },
    IRN_NAV: { name: 'Houdong Swarm Flotilla', icon: '⛵', factionCode: 'IRN', category: 'nav',
        levels: [
            { id: 'IRN_NAV1', hp: 100, cost: 240, range: 4, damage: 22, interval: 7000, projectiles: 2, vision: 4 },
            { id: 'IRN_NAV2', hp: 200, cost: 400, range: 5, damage: 28, interval: 5500, projectiles: 3, vision: 5 },
            { id: 'IRN_NAV3', hp: 320, cost: 580, range: 6, damage: 34, interval: 4000, projectiles: 4, vision: 6 }
        ] },

    // ─── FINLAND ──────────────────────────────────────────────────────────
    FIN_ECO: { name: 'Sisu Reserve Depot', icon: '🪵', factionCode: 'FIN', category: 'eco',
        levels: [
            { id: 'FIN_ECO1', hp: 350,  cost: 550,  vision: 5, timeScaledGoldBase: 0.2, timeScaledGoldPerMin: 0.01, timeScaledGoldCap: 1.6 },
            { id: 'FIN_ECO2', hp: 820,  cost: 900,  vision: 6, timeScaledGoldBase: 0.2, timeScaledGoldPerMin: 0.01, timeScaledGoldCap: 2.0 },
            { id: 'FIN_ECO3', hp: 1900, cost: 1400, vision: 7, timeScaledGoldBase: 0.2, timeScaledGoldPerMin: 0.01, timeScaledGoldCap: 2.5 }
        ] },
    FIN_DEF: { name: 'NASAMS Sisu Bastion', icon: '🛡️', factionCode: 'FIN', category: 'def',
        levels: [
            { id: 'FIN_DEF1', hp: 110, cost: 275, range: 4, rechargeInterval: 10000, missilesRecharged: 1, chargeCap: 4, vision: 5, timeScaleHpRange: { hpPerMin: 0.025, rangePerMin: 0.025, cap: 0.30 } },
            { id: 'FIN_DEF2', hp: 250, cost: 425, range: 6, rechargeInterval: 8000,  missilesRecharged: 2, chargeCap: 6, vision: 7, timeScaleHpRange: { hpPerMin: 0.025, rangePerMin: 0.025, cap: 0.30 } },
            { id: 'FIN_DEF3', hp: 460, cost: 625, range: 8, rechargeInterval: 6000,  missilesRecharged: 3, chargeCap: 8, vision: 9, timeScaleHpRange: { hpPerMin: 0.025, rangePerMin: 0.025, cap: 0.30 } }
        ] },
    FIN_OFF: { name: 'JASSM Logistics Depot', icon: '🛫', factionCode: 'FIN', category: 'off',
        levels: [
            { id: 'FIN_OFF1', hp: 150, cost: 250,  range: 8,  damage: 60,  interval: 9000, projectiles: 1, vision: 8,  buildingScaleDmg: 0.02, buildingScaleCap: 0.60 },
            { id: 'FIN_OFF2', hp: 340, cost: 550,  range: 11, damage: 95,  interval: 7000, projectiles: 1, vision: 11, buildingScaleDmg: 0.02, buildingScaleCap: 0.60 },
            { id: 'FIN_OFF3', hp: 720, cost: 1000, range: 14, damage: 140, interval: 5500, projectiles: 1, vision: 14, buildingScaleDmg: 0.02, buildingScaleCap: 0.60 }
        ] },
    FIN_GND: { name: 'Jäger Ski Patrol', icon: '🎿', factionCode: 'FIN', category: 'gnd',
        levels: [
            { id: 'FIN_GND1', hp: 70,  cost: 240, range: 3, damage: 50, interval: 6500, projectiles: 1, vision: 4, ambushDmgBonus: 0.25, ambushCooldownMs: 6000 },
            { id: 'FIN_GND2', hp: 150, cost: 400, range: 4, damage: 70, interval: 5400, projectiles: 1, vision: 5, ambushDmgBonus: 0.25, ambushCooldownMs: 6000 },
            { id: 'FIN_GND3', hp: 290, cost: 900, range: 5, damage: 95, interval: 4400, projectiles: 1, vision: 6, ambushDmgBonus: 0.25, ambushCooldownMs: 6000 }
        ] },
    FIN_NAV: { name: 'Hamina Mine-Layer', icon: '💣', factionCode: 'FIN', category: 'nav',
        levels: [
            { id: 'FIN_NAV1', hp: 80,  cost: 260, range: 2, damage: 80,  interval: 8000, projectiles: 1, vision: 5, interceptable: false, splash: true, splashRadius: 1 },
            { id: 'FIN_NAV2', hp: 175, cost: 360, range: 2, damage: 120, interval: 6500, projectiles: 1, vision: 6, interceptable: false, splash: true, splashRadius: 1 },
            { id: 'FIN_NAV3', hp: 300, cost: 470, range: 2, damage: 160, interval: 5000, projectiles: 1, vision: 7, interceptable: false, splash: true, splashRadius: 1 }
        ] },

    // ─── INDONESIA ────────────────────────────────────────────────────────
    IDN_ECO: { name: 'Garuda Spice Wharf', icon: '🏝️', factionCode: 'IDN', category: 'eco',
        levels: [
            { id: 'IDN_ECO1', hp: 240,  cost: 600,  vision: 5, seaTileGoldRate: 0.05, seaTileGoldRadius: 7, seaTileGoldCap: 1.6 },
            { id: 'IDN_ECO2', hp: 580,  cost: 1000, vision: 6, seaTileGoldRate: 0.08, seaTileGoldRadius: 7, seaTileGoldCap: 2.0 },
            { id: 'IDN_ECO3', hp: 1350, cost: 1500, vision: 7, seaTileGoldRate: 0.12, seaTileGoldRadius: 7, seaTileGoldCap: 2.4 }
        ] },
    IDN_DEF: { name: 'Garuda Island Fort', icon: '🏝️', factionCode: 'IDN', category: 'def',
        levels: [
            { id: 'IDN_DEF1', hp: 200, cost: 300, vision: 4, regenSelf: 1.0 },
            { id: 'IDN_DEF2', hp: 450, cost: 475, vision: 5, regenSelf: 1.6 },
            { id: 'IDN_DEF3', hp: 900, cost: 700, vision: 6, regenSelf: 2.4, repairAura: 3, repairAuraRange: 1 }
        ] },
    IDN_OFF: { name: 'KCR Missile Cutter Dock', icon: '🐉', factionCode: 'IDN', category: 'off',
        levels: [
            { id: 'IDN_OFF1', hp: 120, cost: 375,  range: 10, damage: 130, interval: 14000, projectiles: 1, vision: 9,  pierceTargets: 2 },
            { id: 'IDN_OFF2', hp: 280, cost: 800,  range: 13, damage: 200, interval: 11000, projectiles: 1, vision: 12, pierceTargets: 3 },
            { id: 'IDN_OFF3', hp: 620, cost: 1350, range: 17, damage: 290, interval: 8000,  projectiles: 1, vision: 16, pierceTargets: 3 }
        ] },
    IDN_GND: { name: 'KOSTRAD Strategic Reserve', icon: '🪂', factionCode: 'IDN', category: 'gnd',
        levels: [
            { id: 'IDN_GND1', hp: 100, cost: 250, range: 4, damage: 30, interval: 7000, projectiles: 2, vision: 4 },
            { id: 'IDN_GND2', hp: 210, cost: 430, range: 5, damage: 45, interval: 5800, projectiles: 2, vision: 5 },
            { id: 'IDN_GND3', hp: 420, cost: 970, range: 6, damage: 65, interval: 4600, projectiles: 3, vision: 6 }
        ] },
    IDN_NAV: { name: 'KCR-60 Archipelago Boat', icon: '🛶', factionCode: 'IDN', category: 'nav',
        levels: [
            { id: 'IDN_NAV1', hp: 84,  cost: 250, range: 5, damage: 48, interval: 11000, projectiles: 1, vision: 5, landAdjRangeBonus: 1 },
            { id: 'IDN_NAV2', hp: 190, cost: 345, range: 6, damage: 68, interval: 8000,  projectiles: 1, vision: 6, landAdjRangeBonus: 1 },
            { id: 'IDN_NAV3', hp: 325, cost: 445, range: 7, damage: 88, interval: 6000,  projectiles: 1, vision: 7, landAdjRangeBonus: 1 }
        ] },

    // ─── SWITZERLAND ──────────────────────────────────────────────────────
    SUI_ECO: { name: 'Alpine Vault', icon: '🏦', factionCode: 'SUI', category: 'eco',
        levels: [
            { id: 'SUI_ECO1', hp: 600,  cost: 800,  vision: 5, flatGoldPerSec: 0.6, vaultCap: 400 },
            { id: 'SUI_ECO2', hp: 1450, cost: 1300, vision: 6, flatGoldPerSec: 1.0, vaultCap: 800 },
            { id: 'SUI_ECO3', hp: 2500, cost: 2000, vision: 7, flatGoldPerSec: 1.6, vaultCap: 1500 }
        ] },
    SUI_DEF: { name: 'Réduit Alpine Bastion', icon: '⛰️', factionCode: 'SUI', category: 'def',
        levels: [
            { id: 'SUI_DEF1', hp: 300,  cost: 400, vision: 4, range: 3, drAura: 0.85, drAuraRange: 2 },
            { id: 'SUI_DEF2', hp: 700,  cost: 600, vision: 5, range: 3, drAura: 0.80, drAuraRange: 3 },
            { id: 'SUI_DEF3', hp: 1500, cost: 850, vision: 6, range: 3, drAura: 0.70, drAuraRange: 3 }
        ] },
    SUI_OFF: { name: 'Réduit Casemate', icon: '🪨', factionCode: 'SUI', category: 'off',
        levels: [
            { id: 'SUI_OFF1', hp: 250,  cost: 400,  range: 8,  damage: 75,  interval: 11000, projectiles: 1, vision: 8,  splashResist: 0.40 },
            { id: 'SUI_OFF2', hp: 600,  cost: 850,  range: 11, damage: 115, interval: 8500,  projectiles: 1, vision: 11, splashResist: 0.40 },
            { id: 'SUI_OFF3', hp: 1250, cost: 1300, range: 14, damage: 170, interval: 6500,  projectiles: 1, vision: 14, splashResist: 0.40 }
        ] },
    SUI_GND: { name: 'Festung Garrison', icon: '🏰', factionCode: 'SUI', category: 'gnd',
        levels: [
            { id: 'SUI_GND1', hp: 160, cost: 290,  range: 4, damage: 35, interval: 7400, projectiles: 1, vision: 4 },
            { id: 'SUI_GND2', hp: 360, cost: 470,  range: 5, damage: 50, interval: 6000, projectiles: 1, vision: 5 },
            { id: 'SUI_GND3', hp: 780, cost: 1050, range: 6, damage: 70, interval: 5000, projectiles: 1, vision: 6 }
        ] },
    SUI_NAV: { name: 'Patrouilleboot 16', icon: '🛟', factionCode: 'SUI', category: 'nav',
        levels: [
            { id: 'SUI_NAV1', hp: 60,  cost: 180, range: 4, damage: 40, interval: 9000, projectiles: 1, vision: 6 },
            { id: 'SUI_NAV2', hp: 130, cost: 240, range: 5, damage: 55, interval: 7000, projectiles: 1, vision: 7 },
            { id: 'SUI_NAV3', hp: 210, cost: 300, range: 6, damage: 75, interval: 5000, projectiles: 1, vision: 8, lakePatrolRegen: 0.8 }
        ] },

    // ─── SAUDI ARABIA ─────────────────────────────────────────────────────
    KSA_ECO: { name: 'Aramco Derrick', icon: '🛢️', factionCode: 'KSA', category: 'eco',
        levels: [
            { id: 'KSA_ECO1', hp: 280,  cost: 900,  vision: 5, flatGoldPerSec: 0.8 },
            { id: 'KSA_ECO2', hp: 700,  cost: 1500, vision: 6, flatGoldPerSec: 1.4 },
            { id: 'KSA_ECO3', hp: 1600, cost: 2200, vision: 7, flatGoldPerSec: 2.2 }
        ] },
    KSA_DEF: { name: 'THAAD GBAD Tier', icon: '🛰️', factionCode: 'KSA', category: 'def',
        levels: [
            { id: 'KSA_DEF1', hp: 150, cost: 425, range: 6,  rechargeInterval: 15000, missilesRecharged: 1, chargeCap: 2, vision: 6,  ballisticOnly: true },
            { id: 'KSA_DEF2', hp: 320, cost: 675, range: 9,  rechargeInterval: 13000, missilesRecharged: 1, chargeCap: 2, vision: 9,  ballisticOnly: true },
            { id: 'KSA_DEF3', hp: 580, cost: 925, range: 12, rechargeInterval: 11000, missilesRecharged: 1, chargeCap: 2, vision: 12, ballisticOnly: true, interceptsIcbm: true }
        ] },
    KSA_OFF: { name: 'GBU-39 SDB Rack', icon: '💣', factionCode: 'KSA', category: 'off',
        levels: [
            { id: 'KSA_OFF1', hp: 130, cost: 350,  range: 9,  damage: 35, interval: 16000, projectiles: 4, vision: 9,  vsFortMult: 2.5 },
            { id: 'KSA_OFF2', hp: 300, cost: 775,  range: 12, damage: 55, interval: 12000, projectiles: 6, vision: 12, vsFortMult: 2.7 },
            { id: 'KSA_OFF3', hp: 680, cost: 1400, range: 15, damage: 80, interval: 9000,  projectiles: 8, vision: 15, vsFortMult: 3.0 }
        ] },
    KSA_GND: { name: 'Royal Guard Armored Bde', icon: '👑', factionCode: 'KSA', category: 'gnd',
        levels: [
            { id: 'KSA_GND1', hp: 200, cost: 380,  range: 5, damage: 55, interval: 6000, projectiles: 1, vision: 6, goldPerShot: 8,  treasuryDmgPer500: 1, treasuryDmgCap: 20 },
            { id: 'KSA_GND2', hp: 450, cost: 600,  range: 6, damage: 75, interval: 5000, projectiles: 1, vision: 7, goldPerShot: 10, treasuryDmgPer500: 1, treasuryDmgCap: 25 },
            { id: 'KSA_GND3', hp: 950, cost: 1250, range: 7, damage: 100,interval: 4000, projectiles: 1, vision: 8, goldPerShot: 6,  treasuryDmgPer500: 1, treasuryDmgCap: 30 }
        ] },
    KSA_NAV: { name: 'Al-Riyadh Tanker Raider', icon: '🛢️', factionCode: 'KSA', category: 'nav',
        levels: [
            { id: 'KSA_NAV1', hp: 90,  cost: 300, range: 6, damage: 50, interval: 11000, projectiles: 1, vision: 6, killRefundPct: 0.10 },
            { id: 'KSA_NAV2', hp: 200, cost: 430, range: 7, damage: 72, interval: 8000,  projectiles: 1, vision: 7, killRefundPct: 0.12 },
            { id: 'KSA_NAV3', hp: 340, cost: 580, range: 8, damage: 92, interval: 6000,  projectiles: 1, vision: 8, killRefundPct: 0.15 }
        ] },

    // ─── POLAND ───────────────────────────────────────────────────────────
    POL_ECO: { name: 'Husaria Marshalling Yard', icon: '🛤️', factionCode: 'POL', category: 'eco',
        levels: [
            { id: 'POL_ECO1', hp: 180, cost: 500,  vision: 5, flatGoldPerSec: 0.25, killBonusGold: 5,  killBonusRange: 14 },
            { id: 'POL_ECO2', hp: 400, cost: 800,  vision: 6, flatGoldPerSec: 0.25, killBonusGold: 8,  killBonusRange: 14 },
            { id: 'POL_ECO3', hp: 880, cost: 1200, vision: 7, flatGoldPerSec: 0.25, killBonusGold: 12, killBonusRange: 14 }
        ] },
    POL_DEF: { name: 'PILICA Narew Picket', icon: '🛡️', factionCode: 'POL', category: 'def',
        levels: [
            { id: 'POL_DEF1', hp: 60,  cost: 230, range: 4, rechargeInterval: 7000, missilesRecharged: 2, chargeCap: 5, vision: 4 },
            { id: 'POL_DEF2', hp: 130, cost: 360, range: 5, rechargeInterval: 5500, missilesRecharged: 2, chargeCap: 6, vision: 5 },
            { id: 'POL_DEF3', hp: 240, cost: 520, range: 7, rechargeInterval: 4200, missilesRecharged: 3, chargeCap: 7, vision: 7, deathInterceptors: 3 }
        ] },
    POL_OFF: { name: 'HOMAR-K MLRS', icon: '🦞', factionCode: 'POL', category: 'off',
        levels: [
            { id: 'POL_OFF1', hp: 140, cost: 350,  range: 10, damage: 50, interval: 18000, projectiles: 3, vision: 10, splash: true, splashRadius: 1 },
            { id: 'POL_OFF2', hp: 320, cost: 775,  range: 13, damage: 70, interval: 14000, projectiles: 5, vision: 13, splash: true, splashRadius: 1 },
            { id: 'POL_OFF3', hp: 700, cost: 1350, range: 16, damage: 95, interval: 10000, projectiles: 7, vision: 16, splash: true, splashRadius: 1 }
        ] },
    POL_GND: { name: 'Winged Hussar Charge', icon: '⚔️', factionCode: 'POL', category: 'gnd',
        levels: [
            { id: 'POL_GND1', hp: 130, cost: 320, range: 6, damage: 110, interval: 18000, projectiles: 1, vision: 6, splash: true, splashRadius: 1, chargeUpMs: 6000 },
            { id: 'POL_GND2', hp: 280, cost: 520, range: 7, damage: 160, interval: 16000, projectiles: 1, vision: 7, splash: true, splashRadius: 1, chargeUpMs: 6000 },
            { id: 'POL_GND3', hp: 560, cost: 1150, range: 8, damage: 200, interval: 14000, projectiles: 1, vision: 8, splash: true, splashRadius: 2, chargeUpMs: 6000 }
        ] },
    POL_NAV: { name: 'NSM Coastal Battery', icon: '⛵', factionCode: 'POL', category: 'nav',
        coastalLandBuildable: true,
        levels: [
            { id: 'POL_NAV1', hp: 95,  cost: 310, range: 8,  damage: 80,  interval: 13000, projectiles: 1, vision: 8 },
            { id: 'POL_NAV2', hp: 210, cost: 450, range: 10, damage: 118, interval: 10000, projectiles: 1, vision: 10 },
            { id: 'POL_NAV3', hp: 360, cost: 610, range: 12, damage: 158, interval: 8000,  projectiles: 1, vision: 12, afPierceChance: 0.5 }
        ] },

    // ─── VIETNAM ──────────────────────────────────────────────────────────
    VNM_ECO: { name: 'Củ Chi Tunnel Node', icon: '🕳️', factionCode: 'VNM', category: 'eco',
        levels: [
            { id: 'VNM_ECO1', hp: 260,  cost: 450,  vision: 4, flatGoldPerSec: 0.5, repairAura: 2, repairAuraRange: 1 },
            { id: 'VNM_ECO2', hp: 600,  cost: 750,  vision: 5, flatGoldPerSec: 0.8, repairAura: 2, repairAuraRange: 1 },
            { id: 'VNM_ECO3', hp: 1400, cost: 1150, vision: 6, flatGoldPerSec: 1.2, repairAura: 2, repairAuraRange: 1, lowProfile: true, lowProfileRevealRange: 4 }
        ] },
    VNM_DEF: { name: 'Pechora Tunnel Trap', icon: '🪤', factionCode: 'VNM', category: 'def',
        levels: [
            { id: 'VNM_DEF1', hp: 140, cost: 220, range: 5, rechargeInterval: 9000, missilesRecharged: 1, chargeCap: 3, vision: 5, lowProfile: true, lowProfileRevealRange: 1 },
            { id: 'VNM_DEF2', hp: 300, cost: 340, range: 7, rechargeInterval: 7000, missilesRecharged: 2, chargeCap: 4, vision: 7, lowProfile: true, lowProfileRevealRange: 1 },
            { id: 'VNM_DEF3', hp: 540, cost: 480, range: 9, rechargeInterval: 5500, missilesRecharged: 2, chargeCap: 5, vision: 9, lowProfile: true, lowProfileRevealRange: 1 }
        ] },
    VNM_OFF: { name: 'Tunnel Launch Silo', icon: '🕳️', factionCode: 'VNM', category: 'off',
        levels: [
            { id: 'VNM_OFF1', hp: 105, cost: 325,  range: 8,  damage: 95,  interval: 13000, projectiles: 1, vision: 8,  lowProfile: true, lowProfileRevealRange: 1 },
            { id: 'VNM_OFF2', hp: 240, cost: 725,  range: 11, damage: 145, interval: 10000, projectiles: 1, vision: 11, lowProfile: true, lowProfileRevealRange: 1 },
            { id: 'VNM_OFF3', hp: 540, cost: 1250, range: 14, damage: 215, interval: 7500,  projectiles: 1, vision: 14, lowProfile: true, lowProfileRevealRange: 1, firstShotBonusPct: 1.0 }
        ] },
    VNM_GND: { name: 'Tunnel Sapper Cell', icon: '⛏️', factionCode: 'VNM', category: 'gnd',
        levels: [
            { id: 'VNM_GND1', hp: 50,  cost: 210, range: 5, damage: 40, interval: 7200, projectiles: 1, vision: 4, lowProfile: true, lowProfileRevealRange: 2 },
            { id: 'VNM_GND2', hp: 110, cost: 350, range: 6, damage: 60, interval: 6000, projectiles: 1, vision: 5, lowProfile: true, lowProfileRevealRange: 2 },
            { id: 'VNM_GND3', hp: 230, cost: 800, range: 7, damage: 85, interval: 5000, projectiles: 1, vision: 6, lowProfile: true, lowProfileRevealRange: 2 }
        ] },
    VNM_NAV: { name: 'Kilo Ambush Sub', icon: '🐋', factionCode: 'VNM', category: 'nav',
        levels: [
            { id: 'VNM_NAV1', hp: 110, cost: 380,  range: 5, damage: 95,  interval: 18000, projectiles: 1, vision: 5, lowProfile: true, lowProfileRevealRange: 1 },
            { id: 'VNM_NAV2', hp: 250, cost: 680,  range: 6, damage: 145, interval: 14000, projectiles: 1, vision: 6, lowProfile: true, lowProfileRevealRange: 1 },
            { id: 'VNM_NAV3', hp: 580, cost: 1180, range: 7, damage: 220, interval: 11000, projectiles: 1, vision: 7, lowProfile: true, lowProfileRevealRange: 1, vengeanceDmgBonus: 0.7 }
        ] },

    // ─── UK ───────────────────────────────────────────────────────────────
    GBR_ECO: { name: 'Royal Treasury & PJHQ', icon: '👑', factionCode: 'GBR', category: 'eco',
        levels: [
            { id: 'GBR_ECO1', hp: 250,  cost: 700,  vision: 6, flatGoldPerSec: 0.6, flagshipBuff: { hp: 0.20, output: 0.15 } },
            { id: 'GBR_ECO2', hp: 600,  cost: 1100, vision: 7, flatGoldPerSec: 1.0, flagshipBuff: { hp: 0.22, output: 0.17 } },
            { id: 'GBR_ECO3', hp: 1380, cost: 1700, vision: 8, flatGoldPerSec: 1.5, flagshipBuff: { hp: 0.25, output: 0.20 } }
        ] },
    GBR_DEF: { name: 'Sky Sabre Expeditionary', icon: '🛡️', factionCode: 'GBR', category: 'def',
        levels: [
            { id: 'GBR_DEF1', hp: 120, cost: 285, range: 5, rechargeInterval: 9000, missilesRecharged: 1, chargeCap: 4, vision: 6 },
            { id: 'GBR_DEF2', hp: 270, cost: 440, range: 7, rechargeInterval: 7000, missilesRecharged: 2, chargeCap: 5, vision: 8 },
            { id: 'GBR_DEF3', hp: 490, cost: 650, range: 9, rechargeInterval: 5500, missilesRecharged: 2, chargeCap: 6, vision: 10 }
        ] },
    GBR_OFF: { name: 'Tempest Strike Wing', icon: '⚡', factionCode: 'GBR', category: 'off',
        levels: [
            { id: 'GBR_OFF1', hp: 145, cost: 400,  range: 10, damage: 32, interval: 20000, projectiles: 6,  vision: 10 },
            { id: 'GBR_OFF2', hp: 340, cost: 825,  range: 13, damage: 44, interval: 15000, projectiles: 9,  vision: 13 },
            { id: 'GBR_OFF3', hp: 760, cost: 1400, range: 16, damage: 58, interval: 11000, projectiles: 12, vision: 16 }
        ] },
    GBR_GND: { name: 'SAS Raid Team', icon: '🥷', factionCode: 'GBR', category: 'gnd',
        levels: [
            { id: 'GBR_GND1', hp: 90,  cost: 270,  range: 5, damage: 45, interval: 6800, projectiles: 1, vision: 7, openingStrike: 60 },
            { id: 'GBR_GND2', hp: 190, cost: 440,  range: 6, damage: 65, interval: 5600, projectiles: 1, vision: 8, openingStrike: 90 },
            { id: 'GBR_GND3', hp: 380, cost: 1000, range: 7, damage: 90, interval: 4600, projectiles: 1, vision: 9, openingStrike: 120 }
        ] },
    GBR_NAV: { name: 'Astute Hunter-Killer', icon: '🐬', factionCode: 'GBR', category: 'nav',
        levels: [
            { id: 'GBR_NAV1', hp: 115, cost: 420,  range: 6, damage: 90,  interval: 14000, projectiles: 1, vision: 6, vsSubMult: 2.0, interceptable: false },
            { id: 'GBR_NAV2', hp: 270, cost: 780,  range: 7, damage: 135, interval: 11000, projectiles: 1, vision: 7, vsSubMult: 2.0, interceptable: false },
            { id: 'GBR_NAV3', hp: 650, cost: 1340, range: 8, damage: 200, interval: 9000,  projectiles: 1, vision: 8, vsSubMult: 2.0, interceptable: false }
        ] },

    // ─── ITALY ────────────────────────────────────────────────────────────
    ITA_ECO: { name: 'Concordia Belltower', icon: '🔔', factionCode: 'ITA', category: 'eco',
        levels: [
            { id: 'ITA_ECO1', hp: 300,  cost: 750,  vision: 6, range: 6, rechargeInterval: 8000, missilesRecharged: 1, chargeCap: 2, flatGoldPerSec: 0.3 },
            { id: 'ITA_ECO2', hp: 700,  cost: 1200, vision: 7, range: 6, rechargeInterval: 6000, missilesRecharged: 1, chargeCap: 3, flatGoldPerSec: 0.5 },
            { id: 'ITA_ECO3', hp: 1600, cost: 1850, vision: 8, range: 9, rechargeInterval: 4000, missilesRecharged: 2, chargeCap: 4, flatGoldPerSec: 0.8, interceptRefundGold: 5 }
        ] },
    ITA_DEF: { name: 'SAMP/T Aster Concord', icon: '✨', factionCode: 'ITA', category: 'def',
        levels: [
            { id: 'ITA_DEF1', hp: 170, cost: 375, range: 5, rechargeInterval: 9000, missilesRecharged: 1, chargeCap: 4, vision: 6, reflectIntercept: 0.25, reflectDmgMult: 0.40 },
            { id: 'ITA_DEF2', hp: 360, cost: 575, range: 7, rechargeInterval: 7000, missilesRecharged: 2, chargeCap: 5, vision: 8, reflectIntercept: 0.35, reflectDmgMult: 0.50 },
            { id: 'ITA_DEF3', hp: 660, cost: 825, range: 9, rechargeInterval: 5500, missilesRecharged: 2, chargeCap: 6, vision: 10, reflectIntercept: 0.50, reflectDmgMult: 0.75 }
        ] },
    ITA_OFF: { name: 'Vulcano Naval Rack', icon: '🌋', factionCode: 'ITA', category: 'off',
        levels: [
            { id: 'ITA_OFF1', hp: 125, cost: 325, range: 8,  damage: 70,  interval: 6000, projectiles: 1, vision: 8 },
            { id: 'ITA_OFF2', hp: 290, cost: 600, range: 11, damage: 105, interval: 5000, projectiles: 1, vision: 11 },
            { id: 'ITA_OFF3', hp: 640, cost: 1100, range: 14, damage: 145, interval: 4000, projectiles: 1, vision: 14 }
        ] },
    ITA_GND: { name: 'Bersaglieri Concord', icon: '🎺', factionCode: 'ITA', category: 'gnd',
        levels: [
            { id: 'ITA_GND1', hp: 90,  cost: 230, range: 4, damage: 30, interval: 6600, projectiles: 1, vision: 4, adjacencyDmg: 0.12, adjacencyHp: 0.08, adjacencyMax: 5 },
            { id: 'ITA_GND2', hp: 200, cost: 390, range: 5, damage: 45, interval: 5600, projectiles: 1, vision: 5, adjacencyDmg: 0.12, adjacencyHp: 0.08, adjacencyMax: 5 },
            { id: 'ITA_GND3', hp: 400, cost: 880, range: 6, damage: 65, interval: 4600, projectiles: 1, vision: 6, adjacencyDmg: 0.12, adjacencyHp: 0.08, adjacencyMax: 5, adjAllyHaste: 0.10 }
        ] },
    ITA_NAV: { name: 'FREMM Multi-Role', icon: '⚓', factionCode: 'ITA', category: 'nav',
        levels: [
            { id: 'ITA_NAV1', hp: 100, cost: 330, range: 6, damage: 55,  interval: 11000, projectiles: 1, vision: 6 },
            { id: 'ITA_NAV2', hp: 220, cost: 490, range: 7, damage: 80,  interval: 8500,  projectiles: 1, vision: 7 },
            { id: 'ITA_NAV3', hp: 375, cost: 680, range: 9, damage: 108, interval: 6000,  projectiles: 1, vision: 9 }
        ] },
};

/**
 * Per-faction list of unit IDs in build-panel category order.
 * Indexed by FACTIONS[i].code in factions.js.
 * Each entry has 5 unit IDs corresponding to {eco, def, off, gnd, nav}.
 */
export const FACTION_UNITS_BY_CODE = {
    USA: { eco: 'USA_ECO', def: 'USA_DEF', off: 'USA_OFF', gnd: 'USA_GND', nav: 'USA_NAV' },
    RUS: { eco: 'RUS_ECO', def: 'RUS_DEF', off: 'RUS_OFF', gnd: 'RUS_GND', nav: 'RUS_NAV' },
    CHN: { eco: 'CHN_ECO', def: 'CHN_DEF', off: 'CHN_OFF', gnd: 'CHN_GND', nav: 'CHN_NAV' },
    JPN: { eco: 'JPN_ECO', def: 'JPN_DEF', off: 'JPN_OFF', gnd: 'JPN_GND', nav: 'JPN_NAV' },
    TUR: { eco: 'TUR_ECO', def: 'TUR_DEF', off: 'TUR_OFF', gnd: 'TUR_GND', nav: 'TUR_NAV' },
    IRN: { eco: 'IRN_ECO', def: 'IRN_DEF', off: 'IRN_OFF', gnd: 'IRN_GND', nav: 'IRN_NAV' },
    FIN: { eco: 'FIN_ECO', def: 'FIN_DEF', off: 'FIN_OFF', gnd: 'FIN_GND', nav: 'FIN_NAV' },
    IDN: { eco: 'IDN_ECO', def: 'IDN_DEF', off: 'IDN_OFF', gnd: 'IDN_GND', nav: 'IDN_NAV' },
    SUI: { eco: 'SUI_ECO', def: 'SUI_DEF', off: 'SUI_OFF', gnd: 'SUI_GND', nav: 'SUI_NAV' },
    KSA: { eco: 'KSA_ECO', def: 'KSA_DEF', off: 'KSA_OFF', gnd: 'KSA_GND', nav: 'KSA_NAV' },
    POL: { eco: 'POL_ECO', def: 'POL_DEF', off: 'POL_OFF', gnd: 'POL_GND', nav: 'POL_NAV' },
    VNM: { eco: 'VNM_ECO', def: 'VNM_DEF', off: 'VNM_OFF', gnd: 'VNM_GND', nav: 'VNM_NAV' },
    GBR: { eco: 'GBR_ECO', def: 'GBR_DEF', off: 'GBR_OFF', gnd: 'GBR_GND', nav: 'GBR_NAV' },
    ITA: { eco: 'ITA_ECO', def: 'ITA_DEF', off: 'ITA_OFF', gnd: 'ITA_GND', nav: 'ITA_NAV' },
};

/** Returns true if `typeId` is a faction-unique unit. */
export function isFactionUnit(typeId) {
    return Object.prototype.hasOwnProperty.call(FACTION_UNIT_STATS, typeId);
}

/** Returns 'eco'|'def'|'off'|'gnd'|'nav' for a faction-unit type id, or null. */
export function factionUnitCategory(typeId) {
    return FACTION_UNIT_STATS[typeId]?.category || null;
}

/** Returns the per-category unit-id map for a given faction code, or null. */
export function getFactionUnitMap(code) {
    return FACTION_UNITS_BY_CODE[code] || null;
}
