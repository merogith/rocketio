// ============================================================================
//  FACTIONS — nation perks, 3 leaders each, special unit display name
//  Mods are multiplicative (1 = no change), undertuned. Applied in game.js.
// ============================================================================

const M = (a, b) => (a ?? 1) * (b ?? 1);

/** Human-readable lines for menu / tooltips. @param {object} m nation or leader `mods` @returns {string[]} */
export function describeModsList(m) {
    if (!m) return [];
    const lines = [];
    const g = m.goldMult;
    if (g != null && Math.abs(g - 1) > 1e-4) {
        const pct = (g - 1) * 100;
        lines.push(`Government gold income ~${(pct >= 0 ? '+' : '')}${pct.toFixed(1)}%`);
    }
    const e = m.effMult;
    if (e != null && Math.abs(e - 1) > 1e-4) {
        const pct = (1 - e) * 100;
        lines.push(pct > 0 ? `Structure fire/reload cycles ~${pct.toFixed(1)}% faster` : `Structure fire/reload ~${(-pct).toFixed(1)}% slower`);
    }
    const mf = m.mfMult;
    if (mf != null && Math.abs(mf - 1) > 1e-4) {
        const pct = (mf - 1) * 100;
        lines.push(`Missile factory output ~${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`);
    }
    const d = m.dealtMult;
    if (d != null && Math.abs(d - 1) > 1e-4) {
        const pct = (d - 1) * 100;
        lines.push(`Damage dealt ~${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`);
    }
    const t = m.takenMult;
    if (t != null && Math.abs(t - 1) > 1e-4) {
        const pct = (1 - t) * 100;
        lines.push(pct > 0 ? `Damage taken ~${pct.toFixed(1)}% less` : `Damage taken ~${(-pct).toFixed(1)}% more`);
    }
    const o = m.outSupplyMult;
    if (o != null && o < 1 - 1e-4) {
        lines.push('Slightly more forgiving when your structures are out of supply (logistics).');
    } else if (o != null && o > 1 + 1e-4) {
        lines.push('Harsher slowdown when your structures are out of supply.');
    }
    const sm = m.startMissiles;
    if (sm != null && (sm | 0) > 0) {
        lines.push(`+${sm | 0} starting missile${((sm | 0) > 1) ? 's' : ''} at game start.`);
    }
    return lines;
}

/**
 * @typedef {object} FactionMods
 * @property {number} [goldMult]
 * @property {number} [effMult]        — <1 = slightly faster fire/reload cycle
 * @property {number} [mfMult]
 * @property {number} [dealtMult]     — damage you deal
 * @property {number} [takenMult]     — mult on damage you take (<1 = tougher)
 * @property {number} [outSupplyMult] — scales (SUPPLY_OUT_MULT-1) when out of supply; <1 = more resilient
 * @property {number} [startMissiles] — added at game start
 */

/**
 * @param {number} factionId
 * @param {number} leaderIdx
 * @returns {Required<FactionMods> & { startMissiles: number }}
 */
export function getPlayerMods(factionId, leaderIdx) {
    const f = FACTIONS[((factionId | 0) + FACTIONS.length * 10) % FACTIONS.length] || FACTIONS[0];
    const L = f.leaders[((leaderIdx | 0) + 9) % f.leaders.length] || f.leaders[0];
    const n = f.nation || {};
    const l = L.mods || {};
    return {
        goldMult:    M(n.goldMult, l.goldMult),
        effMult:     M(n.effMult, l.effMult),
        mfMult:      M(n.mfMult, l.mfMult),
        dealtMult:   M(n.dealtMult, l.dealtMult),
        takenMult:   M(n.takenMult, l.takenMult),
        outSupplyMult: M(n.outSupplyMult, l.outSupplyMult),
        startMissiles: (n.startMissiles | 0) + (l.startMissiles | 0),
    };
}

export function getFaction(factionId) {
    return FACTIONS[((factionId | 0) + FACTIONS.length * 10) % FACTIONS.length] || FACTIONS[0];
}

export function getSpecialUnitName(factionId) {
    return getFaction(factionId).specialName;
}

export function getSpecialUnitIcon(factionId) {
    return getFaction(factionId).specialIcon || '🎯';
}

/** @param {{ players: Array<{ factionId?: number }> }} game */
export function getSpecialUnitLabelForPlayer(game, ownerId) {
    const p = game?.players?.[ownerId - 1];
    const name = p ? getSpecialUnitName(p.factionId) : 'Signature';
    return `${name} Battery`;
}

/** @type {Array<{
 *   id: string,
 *   name: string,
 *   code: string,
 *   specialName: string,
 *   nation: FactionMods,
 *   leaders: Array<{ name: string, mods: FactionMods }>
 * }>} */
export const FACTIONS = [
    { id: 'FAR', code: 'FAR', name: 'Federated Atlas', specialName: 'Orbital Cue',    specialIcon: '🛰️',
      nation: { goldMult: 1.01, effMult: 0.998 },
      leaders: [
        { name: 'Idris Veylen',   mods: { effMult: 0.9995 } },
        { name: 'Corin Aldred',   mods: { goldMult: 1.005 } },
        { name: 'Harrow, Chart',  mods: { dealtMult: 1.006 } },
      ] },
    { id: 'IPC', code: 'IPC', name: 'Iron Pact', specialName: 'Burrow Breacher',       specialIcon: '⛏️',
      nation: { dealtMult: 1.008, takenMult: 0.992 },
      leaders: [
        { name: 'Soren Drazek',   mods: { effMult: 0.999 } },
        { name: 'Yeva Morrin',    mods: { mfMult: 1.006 } },
        { name: 'Terek Ulun',     mods: { outSupplyMult: 0.97 } },
      ] },
    { id: 'CMD', code: 'CMD', name: 'Celestial Meridian', specialName: 'Ghost Relay',  specialIcon: '👁️',
      nation: { effMult: 0.997, dealtMult: 1.005 },
      leaders: [
        { name: 'Mira Sollenne',  mods: { takenMult: 0.995 } },
        { name: 'Fen Kawa',       mods: { goldMult: 1.004 } },
        { name: 'Aike Renmaru',   mods: { mfMult: 1.005 } },
      ] },
    { id: 'ESP', code: 'ESP', name: 'Eastern Sentry', specialName: 'Sky-Lock',         specialIcon: '🔒',
      nation: { effMult: 0.9985, takenMult: 0.994 },
      leaders: [
        { name: 'Han Taelor',     mods: { dealtMult: 1.006 } },
        { name: 'Sora Ishi',      mods: { goldMult: 1.003 } },
        { name: 'Kael Vosh',      mods: { outSupplyMult: 0.96 } },
      ] },
    { id: 'ABC', code: 'ABC', name: 'Anatolian Bridge', specialName: 'Akvavit Skimmer', specialIcon: '⛵',
      nation: { goldMult: 1.006, mfMult: 1.01 },
      leaders: [
        { name: 'Selim Koren',    mods: { effMult: 0.999 } },
        { name: 'Ayla Teresh',    mods: { startMissiles: 1 } },
        { name: 'Oruk Nav',       mods: { dealtMult: 1.005 } },
      ] },
    { id: 'ZSL', code: 'ZSL', name: 'Zagros Saffron', specialName: 'Loiter Cutter',    specialIcon: '🦂',
      nation: { takenMult: 0.991, effMult: 0.999 },
      leaders: [
        { name: 'Darius Parviz',  mods: { dealtMult: 1.007 } },
        { name: 'Mira Sarshar',   mods: { goldMult: 1.005 } },
        { name: 'Cyr-esh',        mods: { mfMult: 1.004 } },
      ] },
    { id: 'PBU', code: 'PBU', name: 'Polar Bastion', specialName: 'Glacis Hammer',     specialIcon: '🧊',
      nation: { effMult: 0.999, outSupplyMult: 0.95 },
      leaders: [
        { name: 'Brina Volhard',  mods: { dealtMult: 1.006 } },
        { name: 'Torval Ennis',   mods: { takenMult: 0.996 } },
        { name: 'Ivo Renn',       mods: { goldMult: 1.003 } },
      ] },
    { id: 'SRC', code: 'SRC', name: 'Southern Reach', specialName: 'Mangrove Team',    specialIcon: '🌿',
      nation: { effMult: 0.998, goldMult: 1.006 },
      leaders: [
        { name: 'Cael Marros',    mods: { startMissiles: 1 } },
        { name: 'Tessa Varn',     mods: { mfMult: 1.006 } },
        { name: 'Rana',           mods: { dealtMult: 1.005 } },
      ] },
    { id: 'HHD', code: 'HHD', name: 'Helvetic Highland', specialName: 'Sensor Alphorn', specialIcon: '📻',
      nation: { takenMult: 0.992, goldMult: 1.005 },
      leaders: [
        { name: 'Maren Hythe',    mods: { effMult: 0.9995 } },
        { name: 'Sigrid Alvar',   mods: { outSupplyMult: 0.95 } },
        { name: 'Linus Hart',     mods: { goldMult: 1.003 } },
      ] },
    { id: 'CDA', code: 'CDA', name: 'Crimson Dunes', specialName: 'Scorpion Overwatch', specialIcon: '🔱',
      nation: { effMult: 0.999, mfMult: 1.008 },
      leaders: [
        { name: 'Zarin Faro',     mods: { dealtMult: 1.006 } },
        { name: 'Nema Caro',      mods: { goldMult: 1.005 } },
        { name: 'Halim the Calm', mods: { takenMult: 0.995 } },
      ] },
    { id: 'ASC', code: 'ASC', name: 'Amber Shield', specialName: 'Sky-Bridge',          specialIcon: '🦅',
      nation: { startMissiles: 1, effMult: 0.999 },
      leaders: [
        { name: 'Rhea Constance', mods: { goldMult: 1.006 } },
        { name: 'Ilan Morrow',    mods: { mfMult: 1.006 } },
        { name: 'Syl Vey',        mods: { dealtMult: 1.004 } },
      ] },
    { id: 'VPL', code: 'VPL', name: 'Verdant Pillar', specialName: 'Root Line',         specialIcon: '🌱',
      nation: { takenMult: 0.99, outSupplyMult: 0.94 },
      leaders: [
        { name: 'Cato Mirel',     mods: { effMult: 0.999 } },
        { name: 'Emil Yarden',    mods: { goldMult: 1.004 } },
        { name: 'Tova Ren',       mods: { dealtMult: 1.005 } },
      ] },
    { id: 'BVC', code: 'BVC', name: 'Boreal Vanguard', specialName: 'Black-Tide',       specialIcon: '🐺',
      nation: { goldMult: 1.005, mfMult: 1.006 },
      leaders: [
        { name: 'Kira Manes',     mods: { effMult: 0.999 } },
        { name: 'Rurik Sol',      mods: { startMissiles: 1 } },
        { name: 'Senni Talo',     mods: { takenMult: 0.996 } },
      ] },
    { id: 'ACH', code: 'ACH', name: 'Auric Concord', specialName: 'Auric Condotieri',   specialIcon: '⚔️',
      nation: { goldMult: 1.008, effMult: 0.9995 },
      leaders: [
        { name: 'Vesper Anka',    mods: { dealtMult: 1.006 } },
        { name: 'Lucan Frei',     mods: { mfMult: 1.005 } },
        { name: 'Idris Varn',     mods: { goldMult: 1.004 } },
      ] },
];

export const DEFAULT_FACTION_ID = 0;
