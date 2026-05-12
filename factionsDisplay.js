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

/** What the Signature (SU) unit does — shared rules + faction-unique L3 doctrine. */
export function getSpecialUnitBlurb(faction) {
    const s = typeof faction === 'object' && faction != null && faction.specialName
        ? faction
        : getFaction(typeof faction === 'number' ? faction : 0);
    const idx = typeof faction === 'number' ? faction : FACTIONS.indexOf(s);
    const icon = getSpecialUnitIcon(idx);
    const sig = s.signatureL3;
    const sigLine = sig ? `Lv3 "${sig.label}" — ${sig.desc}` : 'Lv3 — area jam in range.';
    return `${s.specialName} ${icon} · built with Sig (F10). Glass cannon: chip damage, but better DPS/$ than the Drone line.\n${sigLine}`;
}

/** 3 short flavor lines per faction, parallel to `leaders[]`. UI lists the
 *  numerical mods separately; these are *vibe* lines, not stat sheets. */
const LEADER_FLAVOR = {
    // 1. USA — Biden, Trump, Obama
    USA: [
        'Bidenomics — broader tax base lifts gold income.',
        'Maximum Pressure — harder hits, slightly thinner skin.',
        'Drone-Era Doctrine — faster fire cycles across the board.',
    ],
    // 2. Russia — Putin, Medvedev, Shoigu
    RUS: [
        'Vertical of Power — starts loaded with extra missiles.',
        'Mobilization Decree — factories surge into overproduction.',
        'General Winter — out-of-supply barely hurts.',
    ],
    // 3. China — Xi, Li, Wang
    CHN: [
        'Centralized Command — unified fire control lands cleaner hits.',
        'State Capitalism — clears the austerity drag on gold.',
        'Belt & Road — supply lines hold across the map.',
    ],
    // 4. Japan — Kishida, Abe, Ishiba
    JPN: [
        'New Capitalism — government revenue runs steadier.',
        'Abenomics & Rearm — punchier volleys behind the shield.',
        'SDF Reform — thicker armor on every structure.',
    ],
    // 5. Türkiye — Erdoğan, Kılıçdaroğlu, Akar
    TUR: [
        'Sultan\'s Push — sharper damage cures the swarm\'s chip-shot problem.',
        'Civic Economy — strong gold for a drone-and-dollars war.',
        'Combined Arms — tighter fire-cycle tempo.',
    ],
    // 6. Iran — Khamenei, Pezeshkian, Salami
    IRN: [
        'Supreme Leader — revolutionary doctrine gives volleys real bite.',
        'Reformist Wing — eases sanctions, unfreezes the economy.',
        'Quds Force — operate anywhere; supply barely matters.',
    ],
    // 7. Finland — Stubb, Marin, Niinistö
    FIN: [
        'NATO Integration — alliance training sharpens every volley.',
        'Social-Democrat Budget — civic spending lifts gold income.',
        'Cold Doctrine — drilled crews cycle faster.',
    ],
    // 8. Indonesia — Prabowo, Jokowi, SBY
    IDN: [
        'Force Buildup — opens with +2 missiles loaded.',
        'Infrastructure Drive — factories scale up output.',
        'Naval Doctrine — finally puts real punch behind the volley.',
    ],
    // 9. Switzerland — Amherd, Cassis, Berset
    SUI: [
        'Defense Reform — clears the bureaucratic sluggishness.',
        'Neutral Diplomacy — out-of-supply becomes a minor issue.',
        'Private Banking — gold piles up faster than anyone\'s.',
    ],
    // 10. Saudi Arabia — Salman, MBS, Faisal
    KSA: [
        'Royal Coordination — measured volleys land harder.',
        'Vision 2030 — reform pivot snaps fire cycles into tempo.',
        'Oil Diplomacy — out-of-supply pain greatly reduced.',
    ],
    // 11. Poland — Duda, Tusk, Morawiecki
    POL: [
        'NATO Anchor — alliance funding lifts gold income.',
        'EU Integration — defense industry rolls missiles in bulk.',
        'Defense Industry — sharper hits on top of the opening salvo.',
    ],
    // 12. Vietnam — Tô Lâm, Phạm Minh Chính, Nguyễn Phú Trọng
    VNM: [
        'Doi Moi Military — modernization tightens every cycle.',
        'Industrial Drive — clears the poverty trap on gold.',
        'People\'s War — ambushes hit with ferocity.',
    ],
    // 13. UK — Starmer, Sunak, Johnson
    GBR: [
        'Treasury First — careful planning lifts gold income.',
        'Defense Spend — Treasury surge loads +2 missiles at start.',
        '"Get It Done" — harder hits, tougher hide.',
    ],
    // 14. Italy — Meloni, Mattarella, Draghi
    ITA: [
        'Assertive Doctrine — Aster batteries put real teeth in shots.',
        'Institutional Stability — factories hum on schedule.',
        '"Whatever It Takes" — Draghi opens the treasury spigot.',
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
