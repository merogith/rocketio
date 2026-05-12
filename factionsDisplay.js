// Home menu / UI copy: banners, leader flavor text. Logic stays in factions.js.
import { FACTIONS, getFaction, getSpecialUnitIcon } from './factions.js';

export const PLACEHOLDER_LEADER_PORTRAIT = 'assets/placeholders/leader.svg';

/**
 * Parallel to FACTIONS order — country flag-ish emoji + header accent gradient
 * tuned to each nation's flag/regional palette while staying readable on the
 * game's dark UI. Each entry is unique per faction.
 */
export const FACTION_BANNERS = [
    // 1. USA — Statue of Liberty, navy blue → crimson
    { flag: '🗽', accent: 'linear-gradient(120deg, #0a1430 0%, #15295a 45%, #c4202e 100%)' },
    // 2. Russia — bear, red over deep blue
    { flag: '🐻', accent: 'linear-gradient(120deg, #14070a 0%, #1f3470 50%, #d62433 100%)' },
    // 3. China — castle/pagoda silhouette, deep red → gold
    { flag: '🏯', accent: 'linear-gradient(120deg, #1a0606 0%, #5b0a0a 50%, #f5c600 100%)' },
    // 4. Japan — torii gate, ink black → hinomaru red
    { flag: '⛩️', accent: 'linear-gradient(120deg, #100a0a 0%, #3a1a1a 50%, #bc002d 100%)' },
    // 5. Türkiye — crescent, dark → flag red
    { flag: '☪️', accent: 'linear-gradient(120deg, #16060a 0%, #4a0a14 50%, #e30a17 100%)' },
    // 6. Iran — crescent moon, green → red
    { flag: '🌙', accent: 'linear-gradient(120deg, #0a160a 0%, #1a3a14 50%, #c8313e 100%)' },
    // 7. Finland — snowflake, dark → flag blue
    { flag: '❄️', accent: 'linear-gradient(120deg, #0a1530 0%, #1a3a78 50%, #5fbef0 100%)' },
    // 8. Indonesia — palm/island, jungle → flag red
    { flag: '🏝️', accent: 'linear-gradient(120deg, #0a160a 0%, #1a3a0a 50%, #d22020 100%)' },
    // 9. Switzerland — alpine mountain, dark → flag red w/ white-cross hint
    { flag: '🏔️', accent: 'linear-gradient(120deg, #100a0a 0%, #2a1a1a 50%, #d52b1e 100%)' },
    // 10. Saudi Arabia — sun, dark → flag green
    { flag: '☀️', accent: 'linear-gradient(120deg, #0a160a 0%, #0a3a14 50%, #00853f 100%)' },
    // 11. Poland — eagle, white → flag red (Polish hussar palette)
    { flag: '🦅', accent: 'linear-gradient(120deg, #14080a 0%, #3a0e10 50%, #dc143c 100%)' },
    // 12. Vietnam — gold star on red field
    { flag: '⭐', accent: 'linear-gradient(120deg, #14080a 0%, #5a0a0a 50%, #ffcd00 100%)' },
    // 13. United Kingdom — royal lion, royal blue → Union flag red
    //    (was ⚓; changed to avoid menu↔map conflict with the Port structure icon)
    { flag: '🦁', accent: 'linear-gradient(120deg, #0a0e1c 0%, #112050 50%, #c8102e 100%)' },
    // 14. Italy — gem, dark → green/gold (Renaissance gold accent)
    { flag: '💎', accent: 'linear-gradient(120deg, #0a140a 0%, #0a3a1a 50%, #d4af37 100%)' },
];

/** Per-archetype description of the L3 bonus (what unlocks at level 3). */
const L3_ARCHETYPE_BLURB = {
    ew:        'Lv3: area jam — enemy structures in range reload 15% slower (weaker than Drone L3).',
    strike:    'Lv3: terminal strike — 25% chance each shot to splash neighboring enemy tiles.',
    artillery: 'Lv3: extra tube — fires +1 projectile per volley (4 instead of 3).',
    antiship:  'Lv3: anti-ship — projectiles deal +30% damage to enemy ships (DDG/AF/SSG).',
    airdef:    'Lv3: air-defense aura — friendly AAS/AF in range reload 8% faster.',
    bastion:   'Lv3: dug-in — built with +40% HP (one-time, on upgrade to Lv3).',
};

/** What the Signature (SU) unit does — shared rules + per-archetype L3 + faction name */
export function getSpecialUnitBlurb(faction) {
    const s = typeof faction === 'object' && faction != null && faction.specialName
        ? faction
        : getFaction(typeof faction === 'number' ? faction : 0);
    const icon = getSpecialUnitIcon(typeof faction === 'number' ? faction : FACTIONS.indexOf(s));
    const archetype = s.sigArchetype || 'ew';
    const l3 = L3_ARCHETYPE_BLURB[archetype] || L3_ARCHETYPE_BLURB.ew;
    return `${s.specialName} ${icon} — build with Sig (F10). Glass cannon chip damage, higher DPS/$ than the Drone line. ${l3}`;
}

/** 3 short flavor lines per faction, parallel to `leaders[]`. UI lists the
 *  numerical mods separately; these are *vibe* lines, not stat sheets. */
const LEADER_FLAVOR = {
    // 1. USA — Biden, Trump, Obama
    USA: [
        'Bidenomics — broad tax base widens your gold pipeline.',
        'Maximum Pressure — volleys land harder, but the response invites blowback.',
        'Drone-Era Doctrine — your shooters cycle visibly faster.',
    ],
    // 2. Russia — Putin, Medvedev, Shoigu
    RUS: [
        'Vertical of Power — opens the game with extra missiles in the tube.',
        'Mobilization Decree — factories surge into overproduction.',
        'General Winter — out-of-supply penalties barely sting.',
    ],
    // 3. China — Xi, Li, Wang
    CHN: [
        'Centralized Command — volleys land cleaner under unified fire control.',
        'State Capitalism — clears the austerity drag and then some.',
        'Belt & Road — softens out-of-supply slowdowns across the map.',
    ],
    // 4. Japan — Kishida, Abe, Ishiba
    JPN: [
        '"New Capitalism" — government rings pay out more reliably.',
        'Abenomics & Rearm — punchier volleys to back up the shield.',
        'SDF Reform — even thicker armor on every structure.',
    ],
    // 5. Türkiye — Erdoğan, Kılıçdaroğlu, Akar
    TUR: [
        '"Sultan\'s Push" — sharper damage cancels the swarm\'s chip-shot weakness.',
        'Civic Economy — strong gold for a war of drones and dollars.',
        'Combined Arms — cycle times tighten even further.',
    ],
    // 6. Iran — Khamenei, Pezeshkian, Salami
    IRN: [
        'Supreme Leader — revolutionary doctrine gives volleys real bite.',
        'Reformist Wing — eases the embargo and unfreezes your economy.',
        'Quds Force — out-of-supply is barely a problem; raid anywhere.',
    ],
    // 7. Finland — Stubb, Marin, Niinistö
    FIN: [
        'NATO Integration — sharper volleys for the new alliance era.',
        'Social-Democrat Budget — civic spending lifts gold income.',
        'Cold Doctrine — drilled crews cycle perceptibly faster.',
    ],
    // 8. Indonesia — Prabowo, Jokowi, SBY
    IDN: [
        'Force Buildup — opens the game with +2 missiles on the rack.',
        'Infrastructure Drive — factories pump out a markedly bigger stream.',
        'Naval Doctrine — fixes the chip-damage problem with real punch.',
    ],
    // 9. Switzerland — Amherd, Cassis, Berset
    SUI: [
        'Defense Reform — clears the bureaucratic sluggishness completely.',
        'Neutral Diplomacy — out-of-supply turns into a minor inconvenience.',
        'Private Banking — gold piles up faster than anyone else\'s.',
    ],
    // 10. Saudi Arabia — Salman, MBS, Faisal
    KSA: [
        'Royal Coordination — measured fires for measured damage.',
        'Vision 2030 — sharp pivot, cycles snap into a real tempo.',
        'Oil Diplomacy — out-of-supply pain greatly reduced.',
    ],
    // 11. Poland — Duda, Tusk, Morawiecki
    POL: [
        'NATO Anchor — alliance dollars boost your gold income.',
        'EU Integration — defense industry rolls out missiles in bulk.',
        'Defense Industry — sharper volleys on top of the opening salvo.',
    ],
    // 12. Vietnam — Tô Lâm, Phạm Minh Chính, Nguyễn Phú Trọng
    VNM: [
        'Doi Moi Military — modernization speeds up every cycle.',
        'Industrial Drive — clears the poverty trap and lifts gold income.',
        'People\'s War — ambushes hit with real ferocity.',
    ],
    // 13. UK — Starmer, Sunak, Johnson
    GBR: [
        'Treasury First — civilian planning lifts gold income further.',
        'Defense Spend — Treasury surge loads +2 missiles at start.',
        '"Get It Done" — harder hits and a tougher hide.',
    ],
    // 14. Italy — Meloni, Mattarella, Draghi
    ITA: [
        'Assertive Doctrine — Aster batteries put real teeth in your shots.',
        'Institutional Stability — factories hum on uninterrupted schedules.',
        '"Whatever It Takes" — Draghi opens the spigot on your treasury.',
    ],
};

/**
 * @param {number} factionIdx
 * @param {number} leaderIdx
 */
export function getLeaderPerkText(factionIdx, leaderIdx) {
    const f = FACTIONS[((factionIdx | 0) + 900) % FACTIONS.length] || FACTIONS[0];
    const a = LEADER_FLAVOR[f.id] || ['Leader bonus active.', 'Stacks with nation.', 'Undertuned.'];
    return a[((leaderIdx | 0) + 9) % 3] || a[0];
}
