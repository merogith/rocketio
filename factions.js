// ============================================================================
//  NATIONS — real countries, real leaders, real signature weapon systems.
//  Mods are multiplicative (1 = no change) and undertuned. Applied in game.js.
//  Each nation has a clear flavor (artillery, drones, navy, supply, economy…)
//  but the absolute swing stays in the same ±0.5–1.0% range as before, so no
//  pick should feel oppressive in PvP.
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
 *   specialIcon: string,
 *   nation: FactionMods,
 *   leaders: Array<{ name: string, mods: FactionMods }>
 * }>} */
export const FACTIONS = [
    // 1. USA — networked precision; satellites guide volleys, drone-era doctrine.
    //    Real signature: M142 HIMARS — guided rocket artillery, NATO workhorse.
    { id: 'USA', code: 'USA', name: 'United States', specialName: 'HIMARS', specialIcon: '🚀',
      nation: { effMult: 0.998, dealtMult: 1.003 },
      leaders: [
        { name: 'Joe Biden',     mods: { goldMult: 1.005 } },
        { name: 'Donald Trump',  mods: { dealtMult: 1.007 } },
        { name: 'Barack Obama',  mods: { effMult: 0.9985 } },
      ] },

    // 2. Russia — massed fires, deep mag, cold-weather doctrine.
    //    Real signature: 9K720 Iskander short-range ballistic missile.
    { id: 'RUS', code: 'RUS', name: 'Russian Federation', specialName: 'Iskander', specialIcon: '⚙️',
      nation: { dealtMult: 1.008, takenMult: 0.994 },
      leaders: [
        { name: 'Vladimir Putin',   mods: { dealtMult: 1.005 } },
        { name: 'Dmitry Medvedev',  mods: { mfMult: 1.006 } },
        { name: 'Sergei Shoigu',    mods: { outSupplyMult: 0.95 } },
      ] },

    // 3. China — state-coordinated war industry, missile-heavy.
    //    Real signature: DF-26 "carrier killer" intermediate-range ballistic missile.
    { id: 'CHN', code: 'CHN', name: 'People’s Republic of China', specialName: 'DF-26', specialIcon: '🐉',
      nation: { effMult: 0.997, mfMult: 1.008 },
      leaders: [
        { name: 'Xi Jinping',  mods: { dealtMult: 1.006 } },
        { name: 'Li Qiang',    mods: { goldMult: 1.005 } },
        { name: 'Wang Yi',     mods: { outSupplyMult: 0.97 } },
      ] },

    // 4. Japan — anti-access doctrine, hardened C4ISR, anti-ship strike.
    //    Real signature: Type 12 Surface-to-Ship Missile (extended-range variant).
    { id: 'JPN', code: 'JPN', name: 'Japan', specialName: 'Type 12 SSM', specialIcon: '🌊',
      nation: { effMult: 0.9985, takenMult: 0.994 },
      leaders: [
        { name: 'Fumio Kishida',  mods: { goldMult: 1.005 } },
        { name: 'Shinzo Abe',     mods: { dealtMult: 1.006 } },
        { name: 'Shigeru Ishiba', mods: { effMult: 0.9985 } },
      ] },

    // 5. Türkiye — drone-industrial complex on a continental crossroads.
    //    Real signature: Bayraktar TB2/Akıncı wing — combat-proven UCAVs.
    { id: 'TUR', code: 'TUR', name: 'Türkiye', specialName: 'Bayraktar Wing', specialIcon: '🛸',
      nation: { goldMult: 1.005, mfMult: 1.008 },
      leaders: [
        { name: 'Recep Tayyip Erdoğan', mods: { dealtMult: 1.006 } },
        { name: 'Kemal Kılıçdaroğlu', mods: { goldMult: 1.005 } },
        { name: 'Hulusi Akar',                mods: { effMult: 0.999 } },
      ] },

    // 6. Iran — asymmetric, sanctions-hard, loitering munitions.
    //    Real signature: Shahed-136 loitering drone (used at scale in real wars).
    { id: 'IRN', code: 'IRN', name: 'Islamic Republic of Iran', specialName: 'Shahed Swarm', specialIcon: '🦂',
      nation: { takenMult: 0.992, mfMult: 1.005 },
      leaders: [
        { name: 'Ali Khamenei',      mods: { dealtMult: 1.006 } },
        { name: 'Masoud Pezeshkian', mods: { goldMult: 1.005 } },
        { name: 'Hossein Salami',    mods: { outSupplyMult: 0.96 } },
      ] },

    // 7. Finland — forest-belt total defense; "sisu" grit, deep cold-weather logistics.
    //    Real signature: K9 "Moukari" 155mm SPH (Finnish nickname for the K9 Thunder).
    { id: 'FIN', code: 'FIN', name: 'Finland', specialName: 'K9 Moukari', specialIcon: '🔨',
      nation: { effMult: 0.999, outSupplyMult: 0.95 },
      leaders: [
        { name: 'Alexander Stubb', mods: { dealtMult: 1.005 } },
        { name: 'Sanna Marin',     mods: { goldMult: 1.004 } },
        { name: 'Sauli Niinistö', mods: { effMult: 0.999 } },
      ] },

    // 8. Indonesia — archipelago power; littoral, anti-ship, garuda doctrine.
    //    Real signature: Yakhont (P-800 Onyx) coastal anti-ship missile.
    { id: 'IDN', code: 'IDN', name: 'Indonesia', specialName: 'Yakhont', specialIcon: '🐅',
      nation: { effMult: 0.998, goldMult: 1.006 },
      leaders: [
        { name: 'Prabowo Subianto',          mods: { startMissiles: 1 } },
        { name: 'Joko Widodo',               mods: { mfMult: 1.006 } },
        { name: 'Susilo Bambang Yudhoyono',  mods: { dealtMult: 1.005 } },
      ] },

    // 9. Switzerland — neutral fortress; alpine redoubt + private banking.
    //    Real signature: the "Réduit" — the WWII-era National Redoubt fortress doctrine.
    { id: 'SUI', code: 'SUI', name: 'Swiss Confederation', specialName: 'Réduit Cell', specialIcon: '🛡️',
      nation: { takenMult: 0.992, goldMult: 1.005 },
      leaders: [
        { name: 'Viola Amherd',  mods: { effMult: 0.9995 } },
        { name: 'Ignazio Cassis', mods: { outSupplyMult: 0.95 } },
        { name: 'Alain Berset',   mods: { goldMult: 1.003 } },
      ] },

    // 10. Saudi Arabia — petro-funded missile arsenal, desert depth.
    //     Real signature: the Saqr ("Falcon") family of Royal Saudi strike systems.
    { id: 'KSA', code: 'KSA', name: 'Saudi Arabia', specialName: 'Saqr Battery', specialIcon: '🏜️',
      nation: { effMult: 0.999, mfMult: 1.008 },
      leaders: [
        { name: 'King Salman',           mods: { dealtMult: 1.005 } },
        { name: 'Mohammed bin Salman',   mods: { dealtMult: 1.006 } },
        { name: 'Faisal bin Farhan',     mods: { goldMult: 1.005 } },
      ] },

    // 11. Poland — NATO frontline, eagle banner, modern artillery surge.
    //     Real signature: AHS Krab 155mm self-propelled howitzer (Polish-built).
    { id: 'POL', code: 'POL', name: 'Poland', specialName: 'Krab Battery', specialIcon: '🦀',
      nation: { startMissiles: 1, effMult: 0.999 },
      leaders: [
        { name: 'Andrzej Duda',        mods: { goldMult: 1.006 } },
        { name: 'Donald Tusk',         mods: { mfMult: 1.006 } },
        { name: 'Mateusz Morawiecki',  mods: { dealtMult: 1.005 } },
      ] },

    // 12. Vietnam — people's-war doctrine, deep cover, anti-access coast.
    //     Real signature: K-300P Bastion-P mobile coastal defense system.
    { id: 'VNM', code: 'VNM', name: 'Vietnam', specialName: 'Bastion-P', specialIcon: '🌿',
      nation: { takenMult: 0.99, outSupplyMult: 0.94 },
      leaders: [
        { name: 'Tô Lâm',           mods: { effMult: 0.999 } },
        { name: 'Phạm Minh Chính',  mods: { goldMult: 1.004 } },
        { name: 'Nguyễn Phú Trọng', mods: { dealtMult: 1.005 } },
      ] },

    // 13. United Kingdom — naval/expeditionary, intelligence, long-range strike.
    //     Real signature: Storm Shadow / SCALP-EG air-launched cruise missile.
    { id: 'GBR', code: 'GBR', name: 'United Kingdom', specialName: 'Storm Shadow', specialIcon: '⚡',
      nation: { goldMult: 1.005, mfMult: 1.006 },
      leaders: [
        { name: 'Keir Starmer',   mods: { effMult: 0.999 } },
        { name: 'Rishi Sunak',    mods: { startMissiles: 1 } },
        { name: 'Boris Johnson',  mods: { takenMult: 0.996 } },
      ] },

    // 14. Italy — composite armor, Renaissance gold, air-defense pedigree.
    //     Real signature: Aster 30 surface-to-air missile (Eurosam, Italian-French).
    { id: 'ITA', code: 'ITA', name: 'Italy', specialName: 'Aster Battery', specialIcon: '✨',
      nation: { goldMult: 1.008, effMult: 0.9995 },
      leaders: [
        { name: 'Giorgia Meloni',     mods: { dealtMult: 1.006 } },
        { name: 'Sergio Mattarella',  mods: { mfMult: 1.005 } },
        { name: 'Mario Draghi',       mods: { goldMult: 1.004 } },
      ] },
];

export const DEFAULT_FACTION_ID = 0;
