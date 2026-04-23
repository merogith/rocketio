// Home menu / UI copy: banners, leader flavor text. Logic stays in factions.js.
import { FACTIONS, getFaction, getSpecialUnitIcon } from './factions.js';

export const PLACEHOLDER_LEADER_PORTRAIT = 'assets/placeholders/leader.svg';

/**
 * Parallel to FACTIONS order — faction flag emoji + header accent gradient.
 * Each flag is unique per faction and used in menus, selection screens, and tooltips.
 */
export const FACTION_BANNERS = [
    // FAR — Federated Atlas: blue orbital ring
    { flag: '🌐', accent: 'linear-gradient(120deg, #0d1524 0%, #1a4a6a 45%, #00a8cc 100%)' },
    // IPC — Iron Pact: industrial gear
    { flag: '⚙️', accent: 'linear-gradient(120deg, #1a0a0a 0%, #3d2020 50%, #c44 100%)' },
    // CMD — Celestial Meridian: comet / stellar
    { flag: '☄️', accent: 'linear-gradient(120deg, #0a0f12 0%, #1a3038 50%, #f4c430 100%)' },
    // ESP — Eastern Sentry: rising sun
    { flag: '🌅', accent: 'linear-gradient(120deg, #0a1218 0%, #1e3a4a 50%, #4af 100%)' },
    // ABC — Anatolian Bridge: bridge / crossroads
    { flag: '🌉', accent: 'linear-gradient(120deg, #121a12 0%, #2a3a1a 50%, #c90 100%)' },
    // ZSL — Zagros Saffron: grain / harvest
    { flag: '🌾', accent: 'linear-gradient(120deg, #120a0a 0%, #2a1a0a 50%, #a63 100%)' },
    // PBU — Polar Bastion: snowflake / tundra
    { flag: '❄️', accent: 'linear-gradient(120deg, #0a1020 0%, #1a2a4a 50%, #7cf 100%)' },
    // SRC — Southern Reach: tropical / mangrove
    { flag: '🌴', accent: 'linear-gradient(120deg, #0a160a 0%, #0a2a0a 50%, #0c6 100%)' },
    // HHD — Helvetic Highland: mountain peak
    { flag: '⛰️', accent: 'linear-gradient(120deg, #0c0c10 0%, #1a1a28 50%, #8af 100%)' },
    // CDA — Crimson Dunes: desert sun
    { flag: '☀️', accent: 'linear-gradient(120deg, #1a1208 0%, #2a1a0a 50%, #e90 100%)' },
    // ASC — Amber Shield: eagle / guardian
    { flag: '🦅', accent: 'linear-gradient(120deg, #0a1018 0%, #1a2840 50%, #f8c000 100%)' },
    // VPL — Verdant Pillar: evergreen tree
    { flag: '🌲', accent: 'linear-gradient(120deg, #0a100a 0%, #0a1a0a 50%, #0a6 100%)' },
    // BVC — Boreal Vanguard: anchor / navy
    { flag: '⚓', accent: 'linear-gradient(120deg, #080c14 0%, #152030 50%, #6ac 100%)' },
    // ACH — Auric Concord: gold diamond / wealth
    { flag: '💎', accent: 'linear-gradient(120deg, #0c0a14 0%, #1a1530 50%, #d4af37 100%)' },
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
    FAR:  ['Tighten cycle times — your structures respond a hair faster.', 'Stabilize logistics income — a touch more $ from territory.', 'Aggressive marksmanship — a hair more damage dealt.'],
    IPC:  ['Mechanized tempo — calmer, steadier volley rhythm.', 'Deep magazines — factory output nudged up.', 'Harsh ground — you endure being out of supply a bit better.'],
    CMD:  ['Eclipse tempo — a hair faster when systems stay cool.', 'Measured economy — a tick more from controlled land.', 'War industry — better missile factory output.'],
    ESP:  ['AAD doctrine — a hair faster C2 cycles for shooters.', 'Silicon focus — a touch more $ from your economy web.', 'Hard shell — a hair less damage taken.'],
    ABC:  ['Bridgehead rhythm — a hair faster when pushing.', 'Ayla’s plan — +1 starting missile; extra factory output.', 'Blue-water strike — a hair more volley impact.'],
    ZSL:  ['Mountain patience — you take a hit better.', 'Highland punisher — your shots hit a bit harder.', 'Embargo play — a hair more from income & factories.'],
    PBU:  ['Tundra cadence — structures cycle a little faster in the grind.', 'Winter line — a hair less damage taken in scrums.', 'Forestry $ — a tick more government income.'],
    SRC:  ['Amphib timing — a hair better combat tempo.', 'Opening stock — +1 starting missile; factories hum faster.', 'Raid mindset — a hair more volley impact.'],
    HHD:  ['Alpine C4 — a hair less damage taken; neutral zones hurt less in supply sim.', 'Banks & buffers — a touch more from gold.', 'Drill & discipline — a hair more volley oomph.'],
    CDA:  ['Heat doctrine — a hair more factory & cycle stability.', 'Oil-state tempo — a hair more from income.', 'Calm under fire — a tick less damage taken.'],
    ASC:  ['First lift — a hair faster cycles for ready shooters.', 'Gold anchor — a touch more from territory.', 'Combined arms — a hair more from factories & volleys.'],
    VPL:  ['Trench will — a hair more forgiving when out of supply.', 'People’s $ — a touch more from government rings.', 'Edge shots — a hair more damage when lines hold.'],
    BVC:  ['Silent run — a hair more economic & factory throughput.', 'Extra tube — +1 starting missile; faster cycles in fleet war.', 'Ice discipline — a hair better damage taken profile.'],
    ACH:  ['Auric contract — a hair more $ & a hair more volley power.', 'Composite doctrine — a hair better factory & timing.', 'Golded strikes — a hair more from income & shots.'],
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
