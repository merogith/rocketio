// ============================================================================
//  NATIONS — real countries, real leaders, real signature weapon systems.
//  Each nation has a clear identity (artillery, drones, supply, navy, oil…)
//  expressed as multiplicative mods. Magnitudes are big enough to FEEL (3–8%
//  on most axes, ±0.10 on supply, +1–3 starting missiles) but every strong
//  nation also pays a price somewhere, so no single pick should dominate the
//  ladder. Leaders amplify, pivot, or counterbalance their nation.
//
//  Power-checked: each (nation+best leader) combination sits in a ~15–22 pt
//  band on the rough mental model below — close enough that no roster slot
//  is dead, far enough that picks feel meaningfully different.
//      goldMult:   1% ≈ 1.0pt
//      effMult:    1% faster ≈ 1.5pt
//      mfMult:     1% ≈ 0.7pt
//      dealtMult:  1% ≈ 1.5pt
//      takenMult:  1% tougher ≈ 1.5pt
//      outSupplyMult: 0.10 reduction ≈ 1.0pt (situational)
//      startMissiles: +1 ≈ 3.0pt (front-loaded)
// ============================================================================

const M = (a, b) => (a ?? 1) * (b ?? 1);

/** Human-readable lines for menu / tooltips. @param {object} m nation or leader `mods` @returns {string[]} */
export function describeModsList(m) {
    if (!m) return [];
    const lines = [];
    const g = m.goldMult;
    if (g != null && Math.abs(g - 1) > 1e-4) {
        const pct = (g - 1) * 100;
        lines.push(`Government gold income ${(pct >= 0 ? '+' : '')}${pct.toFixed(1)}%`);
    }
    const e = m.effMult;
    if (e != null && Math.abs(e - 1) > 1e-4) {
        const pct = (1 - e) * 100;
        lines.push(pct > 0 ? `Structure fire/reload cycles ${pct.toFixed(1)}% faster` : `Structure fire/reload ${(-pct).toFixed(1)}% slower`);
    }
    const mf = m.mfMult;
    if (mf != null && Math.abs(mf - 1) > 1e-4) {
        const pct = (mf - 1) * 100;
        lines.push(`Missile factory output ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`);
    }
    const d = m.dealtMult;
    if (d != null && Math.abs(d - 1) > 1e-4) {
        const pct = (d - 1) * 100;
        lines.push(`Damage dealt ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`);
    }
    const t = m.takenMult;
    if (t != null && Math.abs(t - 1) > 1e-4) {
        const pct = (1 - t) * 100;
        lines.push(pct > 0 ? `Damage taken ${pct.toFixed(1)}% less` : `Damage taken ${(-pct).toFixed(1)}% more`);
    }
    const o = m.outSupplyMult;
    if (o != null && Math.abs(o - 1) > 1e-4) {
        const pct = (1 - o) * 100;
        lines.push(pct > 0 ? `Out-of-supply slowdown ${pct.toFixed(0)}% softened` : `Out-of-supply slowdown ${(-pct).toFixed(0)}% harsher`);
    }
    const sm = m.startMissiles;
    if (sm != null && (sm | 0) !== 0) {
        const n = sm | 0;
        lines.push(`${n > 0 ? '+' : ''}${n} starting missile${Math.abs(n) > 1 ? 's' : ''} at game start.`);
    }
    return lines;
}

/**
 * @typedef {object} FactionMods
 * @property {number} [goldMult]
 * @property {number} [effMult]        — <1 = faster fire/reload cycle, >1 = slower
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
    return p ? getSpecialUnitName(p.factionId) : 'Signature';
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

    // 1. USA — Joint Targeting Cell
    //    Identity: networked precision; balanced shooter with no glaring hole.
    //    Real signature: M142 HIMARS — guided rocket artillery.
    { id: 'USA', code: 'USA', name: 'United States', specialName: 'HIMARS Battery', specialIcon: '🚀',
      nation: { effMult: 0.96, dealtMult: 1.03 },
      leaders: [
        { name: 'Joe Biden',     mods: { goldMult: 1.06 } },                       // Bidenomics
        { name: 'Donald Trump',  mods: { dealtMult: 1.05, takenMult: 1.02 } },     // Maximum Pressure — hits harder, takes a bit more
        { name: 'Barack Obama',  mods: { effMult: 0.95 } },                        // Drone-Era Doctrine
      ] },

    // 2. Russia — Iskander Brigade
    //    Identity: heavy fires, deep mag, cold-hardened — but slow tempo.
    //    Real signature: 9K720 Iskander short-range ballistic missile.
    { id: 'RUS', code: 'RUS', name: 'Russian Federation', specialName: 'Iskander Brigade', specialIcon: '⚙️',
      nation: { dealtMult: 1.07, takenMult: 0.94, effMult: 1.03 },                 // hits hard, takes hits, but slow
      leaders: [
        { name: 'Vladimir Putin',   mods: { startMissiles: 2 } },                  // Vertical of Power — opens loaded
        { name: 'Dmitry Medvedev',  mods: { mfMult: 1.10 } },                      // Mobilization Decree
        { name: 'Sergei Shoigu',    mods: { outSupplyMult: 0.70 } },               // General Winter — supply hardly hurts
      ] },

    // 3. China — Rocket Force
    //    Identity: industrial juggernaut; mass-producing missiles on austerity.
    //    Real signature: DF-26 "carrier killer" intermediate-range ballistic missile.
    { id: 'CHN', code: 'CHN', name: 'People’s Republic of China', specialName: 'DF-26 Brigade', specialIcon: '🐉',
      nation: { mfMult: 1.12, effMult: 0.97, goldMult: 0.96 },                     // factory monster, austerity ethic
      leaders: [
        { name: 'Xi Jinping',  mods: { dealtMult: 1.05 } },                        // Centralized Command
        { name: 'Li Qiang',    mods: { goldMult: 1.07 } },                         // State Capitalism — clears the austerity
        { name: 'Wang Yi',     mods: { outSupplyMult: 0.75 } },                    // Belt & Road logistics
      ] },

    // 4. Japan — Self-Defense Force
    //    Identity: defensive, high-quality, lower throughput.
    //    Real signature: Type 12 Surface-to-Ship Missile (extended-range).
    { id: 'JPN', code: 'JPN', name: 'Japan', specialName: 'Type 12 SSM', specialIcon: '🌊',
      nation: { takenMult: 0.93, effMult: 0.97, mfMult: 0.94 },                    // tough + fast cycle, but lean magazine
      leaders: [
        { name: 'Fumio Kishida',  mods: { goldMult: 1.05 } },                      // New Capitalism
        { name: 'Shinzo Abe',     mods: { dealtMult: 1.05 } },                     // Abenomics & Rearm
        { name: 'Shigeru Ishiba', mods: { takenMult: 0.96 } },                     // SDF Reform — turtle even harder
      ] },

    // 5. Türkiye — Bayraktar Wing
    //    Identity: cheap drone volume; fast cycles, chip damage, factory-rich.
    //    Real signature: Bayraktar TB2/Akıncı UCAV wing.
    { id: 'TUR', code: 'TUR', name: 'Türkiye', specialName: 'Bayraktar Wing', specialIcon: '🛸',
      nation: { mfMult: 1.08, effMult: 0.95, dealtMult: 0.97 },                    // swarm, not punch
      leaders: [
        { name: 'Recep Tayyip Erdoğan', mods: { dealtMult: 1.05 } },               // Sultan's Push — fixes the chip damage
        { name: 'Kemal Kılıçdaroğlu',   mods: { goldMult: 1.06 } },                // Civic Economy
        { name: 'Hulusi Akar',                  mods: { effMult: 0.95 } },                 // Combined Arms — even faster
      ] },

    // 6. Iran — IRGC Doctrine
    //    Identity: loaded from turn one, sanctions-hard, but starved economy.
    //    Real signature: Shahed-136 loitering munition.
    { id: 'IRN', code: 'IRN', name: 'Islamic Republic of Iran', specialName: 'Shahed Swarm', specialIcon: '🦂',
      nation: { startMissiles: 3, takenMult: 0.95, goldMult: 0.95 },               // opens loaded; sanctions bite gold
      leaders: [
        { name: 'Ali Khamenei',      mods: { dealtMult: 1.06 } },                  // Supreme Leader
        { name: 'Masoud Pezeshkian', mods: { goldMult: 1.06 } },                   // Reformist — eases the embargo
        { name: 'Hossein Salami',    mods: { outSupplyMult: 0.65 } },              // Quds Force — operate anywhere
      ] },

    // 7. Finland — Sisu Total Defense
    //    Identity: late-game supply god; quiet economy and lean factories.
    //    Real signature: K9 "Moukari" 155mm SPH (Finnish nickname for K9 Thunder).
    { id: 'FIN', code: 'FIN', name: 'Finland', specialName: 'K9 Moukari', specialIcon: '🔨',
      nation: { outSupplyMult: 0.55, takenMult: 0.95, mfMult: 0.95 },              // best supply mod in the game
      leaders: [
        { name: 'Alexander Stubb', mods: { dealtMult: 1.05 } },                    // NATO Integration
        { name: 'Sanna Marin',     mods: { goldMult: 1.06 } },                     // Social-Democrat budget
        { name: 'Sauli Niinistö', mods: { effMult: 0.95 } },                       // Cold Doctrine
      ] },

    // 8. Indonesia — Garuda Doctrine
    //    Identity: archipelago economy; gold-driven, tempo-light.
    //    Real signature: Yakhont (P-800 Onyx) coastal anti-ship missile.
    { id: 'IDN', code: 'IDN', name: 'Indonesia', specialName: 'Yakhont Coastal', specialIcon: '🐅',
      nation: { goldMult: 1.07, effMult: 0.95, dealtMult: 0.97 },                  // rich + fast, but chip damage
      leaders: [
        { name: 'Prabowo Subianto',          mods: { startMissiles: 2 } },         // Force Buildup
        { name: 'Joko Widodo',               mods: { mfMult: 1.10 } },             // Infrastructure
        { name: 'Susilo Bambang Yudhoyono',  mods: { dealtMult: 1.05 } },          // Naval Doctrine — fixes chip damage
      ] },

    // 9. Switzerland — Réduit Doctrine
    //    Identity: alpine fortress and bank vault; turtle hard, but sluggish.
    //    Real signature: the "Réduit" — WWII National Redoubt fortress system.
    { id: 'SUI', code: 'SUI', name: 'Swiss Confederation', specialName: 'Réduit Bastion', specialIcon: '🛡️',
      nation: { takenMult: 0.92, goldMult: 1.04, effMult: 1.03 },                  // tough + rich, but slow
      leaders: [
        { name: 'Viola Amherd',  mods: { effMult: 0.95 } },                        // Defense Reform — clears the sluggishness
        { name: 'Ignazio Cassis', mods: { outSupplyMult: 0.65 } },                 // Neutral Diplomacy
        { name: 'Alain Berset',   mods: { goldMult: 1.05 } },                      // Private Banking
      ] },

    // 10. Saudi Arabia — Royal Saqr
    //     Identity: petrodollar arsenal; rich and deep, but bureaucratic.
    //     Real signature: Saqr ("Falcon") family of Royal Saudi strike systems.
    { id: 'KSA', code: 'KSA', name: 'Saudi Arabia', specialName: 'Saqr Battery', specialIcon: '🏜️',
      nation: { goldMult: 1.08, mfMult: 1.08, effMult: 1.02 },                     // wealthy & well-stocked, slow
      leaders: [
        { name: 'King Salman',           mods: { dealtMult: 1.05 } },              // Royal Coordination
        { name: 'Mohammed bin Salman',   mods: { effMult: 0.96 } },                // Vision 2030 — sharp reform pivot
        { name: 'Faisal bin Farhan',     mods: { outSupplyMult: 0.75 } },          // Oil Diplomacy
      ] },

    // 11. Poland — Hussars Reborn
    //     Identity: aggressive opening, NATO frontline, glassy.
    //     Real signature: AHS Krab 155mm self-propelled howitzer.
    { id: 'POL', code: 'POL', name: 'Poland', specialName: 'Krab Battery', specialIcon: '🦀',
      nation: { startMissiles: 2, dealtMult: 1.04, takenMult: 1.03 },              // opens with charge; glass cannon
      leaders: [
        { name: 'Andrzej Duda',        mods: { goldMult: 1.06 } },                 // NATO Anchor
        { name: 'Donald Tusk',         mods: { mfMult: 1.08 } },                   // EU Integration
        { name: 'Mateusz Morawiecki',  mods: { dealtMult: 1.05 } },                // Defense Industry
      ] },

    // 12. Vietnam — People's War
    //     Identity: trench-and-tunnel; tough and supply-hardened, poor economy.
    //     Real signature: K-300P Bastion-P mobile coastal defense system.
    { id: 'VNM', code: 'VNM', name: 'Vietnam', specialName: 'Bastion-P', specialIcon: '🌿',
      nation: { takenMult: 0.93, outSupplyMult: 0.65, goldMult: 0.95 },            // attrition specialist
      leaders: [
        { name: 'Tô Lâm',           mods: { effMult: 0.95 } },                     // Doi Moi Military
        { name: 'Phạm Minh Chính',  mods: { goldMult: 1.06 } },                    // Industrial Drive — clears poverty
        { name: 'Nguyễn Phú Trọng', mods: { dealtMult: 1.05 } },                   // People's War — ambushes hit hard
      ] },

    // 13. United Kingdom — Royal Strike
    //     Identity: expeditionary, lean and lethal, well-funded.
    //     Real signature: Storm Shadow / SCALP-EG cruise missile.
    { id: 'GBR', code: 'GBR', name: 'United Kingdom', specialName: 'Storm Shadow', specialIcon: '⚡',
      nation: { goldMult: 1.04, mfMult: 1.04, effMult: 0.97 },                     // small bonuses everywhere
      leaders: [
        { name: 'Keir Starmer',   mods: { goldMult: 1.04 } },                      // Treasury First
        { name: 'Rishi Sunak',    mods: { startMissiles: 2 } },                    // Defense Spend
        { name: 'Boris Johnson',  mods: { dealtMult: 1.05, takenMult: 0.97 } },    // "Get It Done" — punchy
      ] },

    // 14. Italy — Renaissance Concord
    //     Identity: wealth-driven economy, air-defense specialist, low damage output.
    //     Real signature: Aster 30 surface-to-air missile (Eurosam, Italian-French).
    { id: 'ITA', code: 'ITA', name: 'Italy', specialName: 'Aster Battery', specialIcon: '✨',
      nation: { goldMult: 1.06, takenMult: 0.95, dealtMult: 0.97 },                // rich and durable; punches light
      leaders: [
        { name: 'Giorgia Meloni',     mods: { dealtMult: 1.05 } },                 // Assertive Doctrine
        { name: 'Sergio Mattarella',  mods: { mfMult: 1.06 } },                    // Institutional Stability
        { name: 'Mario Draghi',       mods: { goldMult: 1.05 } },                  // "Whatever It Takes"
      ] },
];

export const DEFAULT_FACTION_ID = 0;
