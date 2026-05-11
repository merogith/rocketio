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
    // 13. United Kingdom — anchor, royal blue → Union flag red
    { flag: '⚓', accent: 'linear-gradient(120deg, #0a0e1c 0%, #112050 50%, #c8102e 100%)' },
    // 14. Italy — gem, dark → green/gold (Renaissance gold accent)
    { flag: '💎', accent: 'linear-gradient(120deg, #0a140a 0%, #0a3a1a 50%, #d4af37 100%)' },
];

/** What the Signature (SU) unit does — shared rules + faction name */
export function getSpecialUnitBlurb(faction) {
    const s = typeof faction === 'object' && faction != null && faction.specialName
        ? faction
        : getFaction(typeof faction === 'number' ? faction : 0);
    const icon = getSpecialUnitIcon(typeof faction === 'number' ? faction : FACTIONS.indexOf(s));
    return `${s.specialName} — build with Sig (F10). Glass cannon chip damage, higher DPS/$ than the Drone line. Lv3: area jam in range (weaker than Drone L3). Distinct ${icon} map icon.`;
}

/** 3 short lines per faction, parallel to `leaders[]` */
const LEADER_FLAVOR = {
    // 1. USA — Biden, Trump, Obama
    USA: [
        'Build-Back-Better economics — a touch more $ from territory.',
        'Maximum pressure — your volleys hit a hair harder.',
        'Drone-era doctrine — structures cycle a hair faster.',
    ],
    // 2. Russia — Putin, Medvedev, Shoigu
    RUS: [
        'Massed fires — a hair more volley impact.',
        'Defense plants on overtime — factory output nudged up.',
        'Cold logistics — out-of-supply pain reduced.',
    ],
    // 3. China — Xi, Li, Wang
    CHN: [
        'Centralized command — a hair more damage dealt.',
        'Belt & road economics — a touch more $ from territory.',
        'Diplomatic supply lanes — softer out-of-supply penalty.',
    ],
    // 4. Japan — Kishida, Abe, Ishiba
    JPN: [
        '"New capitalism" — a touch more $ from territory.',
        'Rearmament push — a hair more volley impact.',
        'Self-defense reform — a hair faster cycles.',
    ],
    // 5. Türkiye — Erdoğan, Kılıçdaroğlu, Akar
    TUR: [
        'Forward doctrine — a hair more damage dealt.',
        'Civic economy — a touch more $ from territory.',
        'Combined arms drill — a hair faster cycles.',
    ],
    // 6. Iran — Khamenei, Pezeshkian, Salami
    IRN: [
        'Revolutionary doctrine — a hair more volley oomph.',
        'Reformist package — a touch more $ from territory.',
        'IRGC asymmetric play — softer out-of-supply penalty.',
    ],
    // 7. Finland — Stubb, Marin, Niinistö
    FIN: [
        'NATO integration — a hair more volley impact.',
        'Social-democrat spending — a touch more $.',
        'Defense modernization — a hair faster cycles.',
    ],
    // 8. Indonesia — Prabowo, Jokowi, SBY
    IDN: [
        'Force buildup — +1 starting missile.',
        'Infrastructure drive — factory output nudged up.',
        'Naval doctrine — a hair more volley impact.',
    ],
    // 9. Switzerland — Amherd, Cassis, Berset
    SUI: [
        'Defense reform — a hair faster cycles.',
        'Neutral diplomacy — softer out-of-supply penalty.',
        'Private banking — a touch more $ from territory.',
    ],
    // 10. Saudi Arabia — Salman, MBS, Faisal
    KSA: [
        'Royal coordination — a hair more damage dealt.',
        'Vision 2030 — a hair more volley impact.',
        'Oil economy — a touch more $ from territory.',
    ],
    // 11. Poland — Duda, Tusk, Morawiecki
    POL: [
        'Alliance posture — a touch more $ from territory.',
        'EU integration — factory output nudged up.',
        'Defense industry — a hair more volley impact.',
    ],
    // 12. Vietnam — Tô Lâm, Phạm Minh Chính, Nguyễn Phú Trọng
    VNM: [
        'Doctrinal modernization — a hair faster cycles.',
        'Industrial drive — a touch more $ from territory.',
        'People\'s war — a hair more volley impact.',
    ],
    // 13. UK — Starmer, Sunak, Johnson
    GBR: [
        'Civilian planning — a hair faster cycles.',
        'Treasury surge — +1 starting missile.',
        'Aggressive posture — a hair less damage taken.',
    ],
    // 14. Italy — Meloni, Mattarella, Draghi
    ITA: [
        'Assertive doctrine — a hair more volley impact.',
        'Institutional stability — factory output nudged up.',
        '"Whatever it takes" — a touch more $ from territory.',
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
