import { UNIT_STATS as US, GAME_CONFIG as GC } from './constants.js';

/** Keep tutorial copy aligned with simulation constants. */
const L1 = {
    MF: US.MF.levels[0],
    RL: US.RL.levels[0],
    AAS: US.AAS.levels[0],
    G: US.G.levels[0],
    B: US.B.levels[0],
    M: US.M.levels[0],
    D: US.D.levels[0],
    AB: US.AB.levels[0],
};

const secStr = (ms) => {
    const s = ms / 1000;
    return (Math.abs(s - Math.round(s)) < 1e-6 ? String(Math.round(s)) : s.toFixed(1)) + 's';
};

const govWarmupSec = GC.GOV_WARMUP_MS / 1000;
const barracksL3Interval = US.B.levels[2].interval;
const demolishPct = Math.round(GC.DEMOLISH_REFUND_MULT * 100);
const upgradeSavePct = Math.round((1 - GC.UPGRADE_COST_MULT) * 100);
const supplySlowPct = Math.round((GC.SUPPLY_OUT_MULT - 1) * 100);
const barracksCmdOut = Math.round((GC.BARRACKS_L3_COMMAND_OUT_MULT - 1) * 100);
const barracksCmdIn = Math.round((1 - GC.BARRACKS_L3_COMMAND_IN_MULT) * 100);
const govL3GoldAuraPct = Math.round((GC.GOV_L3_GOLD_AURA_MULT - 1) * 100);
const rlSplashPct = Math.round(GC.RL_L3_SPLASH_MULT * 100);
const abStealthPct = Math.round(GC.AB_L3_STEALTH_CHANCE * 100);
const droneJamPct = Math.round((GC.DRONE_L3_RECHARGE_DEBUFF_MULT - 1) * 100);
const mfGlobalPct = Math.round((1 - GC.MF_GLOBAL_PRODUCTION_MULT) * 100);
const mfNeighborPct = Math.round((GC.MF_L3_NEIGHBOR_PRODUCTION_MULT - 1) * 100);

export const TUTORIAL_PAGES = [
    /* 1 — QUICK START */
    `
        <h3>QUICK START</h3>
        <div class="tut-hero">Your first 60 seconds decide the game. Follow this order:</div>

        <div class="tut-steps">
            <div class="tut-step">
                <span class="tut-step-num">1</span>
                <div><b>Build a Missile Factory</b> <span class="tut-dim">($${L1.MF.cost}) — press <span class="key-badge">4</span></span><br>You start with one. Build a second immediately — rockets need ammo.</div>
            </div>
            <div class="tut-step">
                <span class="tut-step-num">2</span>
                <div><b>Build Rocket Launchers</b> <span class="tut-dim">($${L1.RL.cost}) — press <span class="key-badge">2</span></span><br>Your main damage dealers. Place 2–3 near your border.</div>
            </div>
            <div class="tut-step">
                <span class="tut-step-num">3</span>
                <div><b>Build an Anti-Air System</b> <span class="tut-dim">($${L1.AAS.cost}) — press <span class="key-badge">3</span></span><br>Intercepts enemy missiles. Protect your Government!</div>
            </div>
            <div class="tut-step">
                <span class="tut-step-num">4</span>
                <div><b>Expand with a new Government</b> <span class="tut-dim">($${L1.G.cost}) — press <span class="key-badge">1</span></span><br>More territory = more gold income. Spread them out.</div>
            </div>
        </div>

        <div class="tut-controls">
            <div class="tut-ctrl"><span class="key-badge">WASD</span> Pan camera</div>
            <div class="tut-ctrl"><span class="key-badge">Scroll</span> Zoom</div>
            <div class="tut-ctrl"><span class="key-badge">1–8</span> Quick build</div>
            <div class="tut-ctrl"><span class="key-badge">Space</span> Upgrade</div>
            <div class="tut-ctrl"><span class="key-badge">X</span> Demolish</div>
            <div class="tut-ctrl"><span class="key-badge">ESC</span> Menu</div>
        </div>
    `,

    /* 2 — YOUR UNITS */
    `
        <h3>YOUR UNITS</h3>

        <div class="tut-role-label tut-role-attack">⚔️ ATTACK</div>
        <div class="unit-card"><div class="uc-icon">🚀</div><div class="uc-info"><div class="uc-name">Rocket Launcher <span class="tut-cost">$${L1.RL.cost}</span></div><div class="uc-desc">Long-range missile (${L1.RL.damage} dmg / ${secStr(L1.RL.interval)}). Needs ammo from Factories. Lv3: 2 missiles per shot; ${rlSplashPct}% splash to adjacent enemy structures.</div></div></div>
        <div class="unit-card"><div class="uc-icon">🪖</div><div class="uc-info"><div class="uc-name">Barracks <span class="tut-cost">$${L1.B.cost}</span></div><div class="uc-desc">Short-range ground fire (${L1.B.damage} dmg). Can't be intercepted by Anti-Air. Supply hub. Lv3 fires every ${secStr(barracksL3Interval)}; command aura +${barracksCmdOut}% ally damage & −${barracksCmdIn}% incoming in influence (non-stacking).</div></div></div>
        <div class="unit-card"><div class="uc-icon">🚁</div><div class="uc-info"><div class="uc-name">Drone Operator <span class="tut-cost">$${L1.D.cost}</span></div><div class="uc-desc">Cheap chip damage. Lv3 fires ${US.D.levels[2].projectiles} shots per volley — jamming slows enemy military &amp; AA recharge in range by ${droneJamPct}%.</div></div></div>
        <div class="unit-card"><div class="uc-icon">✈️</div><div class="uc-info"><div class="uc-name">Air Base <span class="tut-cost">$${L1.AB.cost}</span></div><div class="uc-desc">Heavy strike (${L1.AB.damage} dmg Lv1). Interceptable. Lv1 uses ${L1.AB.missilesPerShot} missile per sortie. Lv3: ${abStealthPct}% stealth strike (2 missiles, cannot be intercepted).</div></div></div>

        <div class="tut-role-label tut-role-defend">🛡️ DEFENSE</div>
        <div class="unit-card"><div class="uc-icon">🛡️</div><div class="uc-info"><div class="uc-name">Anti-Air System <span class="tut-cost">$${L1.AAS.cost}</span></div><div class="uc-desc">Auto-intercepts rockets, air strikes, and drones. Ground fire bypasses it. Always keep one near your Government.</div></div></div>

        <div class="tut-role-label tut-role-econ">💰 ECONOMY & EXPANSION</div>
        <div class="unit-card"><div class="uc-icon">🏛️</div><div class="uc-info"><div class="uc-name">Government <span class="tut-cost">$${L1.G.cost}</span></div><div class="uc-desc">Claims territory via influence. Gold/tile +${US.G.levels[0].goldPerTile} / +${US.G.levels[1].goldPerTile} / +${US.G.levels[2].goldPerTile}/s (Lv1–3). Lv3 aura: +${govL3GoldAuraPct}% gold on tiles it covers (non-stacking). Lose all Govs = you lose.</div></div></div>
        <div class="unit-card"><div class="uc-icon">🏭</div><div class="uc-info"><div class="uc-name">Missile Factory <span class="tut-cost">$${L1.MF.cost}</span></div><div class="uc-desc">Produces ammo (${mfGlobalPct}% less than baseline per cycle). Lv3 boosts adjacent friendly factories by +${mfNeighborPct}% (not itself, range 1).</div></div></div>
        <div class="unit-card"><div class="uc-icon">🔫</div><div class="uc-info"><div class="uc-name">Militia <span class="tut-cost">$${L1.M.cost}</span></div><div class="uc-desc">Place on visible tiles you own or neutral land. Lv3 <b>${US.M.levels[2].displayName || 'Partisan Regiment'}</b> — same firepower as Lv2, tougher.</div></div></div>
    `,

    /* 3 — ECONOMY */
    `
        <h3>ECONOMY & TERRITORY</h3>

        <div class="tut-concept">
            <div class="tut-concept-icon">💰</div>
            <div>
                <b>Gold = Territory</b><br>
                Every tile you own generates gold per second. More tiles = bigger budget. Governments claim tiles through <b>influence</b> — upgrade them or build more to expand.
            </div>
        </div>

        <div class="tut-concept">
            <div class="tut-concept-icon">🏛️</div>
            <div>
                <b>Government Rules</b><br>
                New Govs need <b>${govWarmupSec} seconds to warm up</b> before earning gold. Overlapping Gov areas have diminishing returns — <b>spread them out</b> for maximum income.
            </div>
        </div>

        <div class="tut-concept">
            <div class="tut-concept-icon">⚡</div>
            <div>
                <b>Contested Tiles</b><br>
                When two players have nearly equal influence on a tile, it becomes <b>contested</b>. Structures on contested tiles are <b>paralyzed</b> — they can't fire, produce, or regenerate.
            </div>
        </div>

        <div class="tut-concept">
            <div class="tut-concept-icon">📡</div>
            <div>
                <b>Supply Lines</b><br>
                <b>Territory ≠ supply:</b> you can own a tile on the map but still be out of supply if no friendly <b>Government</b> or <b>Barracks</b> influence covers it. Structures outside that aura fire <b>${supplySlowPct}% slower</b>. Push supply forward with forward bases.
            </div>
        </div>

        <div class="tip-box">
            <b>Best Practice:</b> Build Governments in a spread-out chain to cover maximum area. Place Factories and Launchers within their supply zone.
        </div>
    `,

    /* 4 — COMBAT */
    `
        <h3>COMBAT BEST PRACTICES</h3>

        <div class="tut-tactic">
            <div class="tut-tactic-title">🎯 Assign Targets</div>
            <div class="tut-tactic-body">Drag from any attacker to an enemy tile to lock their fire. Without a target, they auto-fire on the nearest enemy.</div>
        </div>

        <div class="tut-tactic">
            <div class="tut-tactic-title">🚁 Drone Saturation (Key Tactic)</div>
            <div class="tut-tactic-body">Enemy Anti-Air has limited charges. Stack 3–4 Drones aimed at one target to <b>drain their defense</b>, then follow up with Rockets or Air Bases for the kill.</div>
        </div>

        <div class="tut-tactic">
            <div class="tut-tactic-title">🛡️ Always Defend Your Government</div>
            <div class="tut-tactic-body">Keep at least one AAS near every Government. If your Gov falls, you lose territory and income fast.</div>
        </div>

        <div class="tut-tactic">
            <div class="tut-tactic-title">⬆️ Upgrade > Spam</div>
            <div class="tut-tactic-body">Higher tiers beat spammed Lv1s. Upgrades save <b>${upgradeSavePct}%</b> vs buying that tier at list price. Use <span class="key-badge">Space</span> to quick-upgrade.</div>
        </div>

        <div class="tut-tactic">
            <div class="tut-tactic-title">♻️ Recycle</div>
            <div class="tut-tactic-body">Press <span class="key-badge">X</span> to demolish a structure for <b>${demolishPct}%</b> of what you spent on it back. Move your defenses as the front line shifts.</div>
        </div>

        <div class="tip-box">
            <b>HP Regen:</b> Structures slowly heal when not damaged for ${GC.REGEN_COOLDOWN_MS / 1000} seconds and not on contested tiles.
        </div>
    `,

    /* 5 — ADVANCED & VICTORY */
    `
        <h3>ADVANCED & VICTORY</h3>

        <div class="tut-concept">
            <div class="tut-concept-icon">🌫️</div>
            <div>
                <b>Fog of War</b><br>
                You only see tiles within the vision range of your structures. Previously seen tiles show from memory — they may be outdated. Push vision forward with Drones and Barracks.
            </div>
        </div>

        <div class="tut-concept">
            <div class="tut-concept-icon">🤖</div>
            <div>
                <b>AI Doctrines</b><br>
                Each CPU player follows a doctrine: <b>Aggressor</b> (rushes you), <b>Turtle</b> (walls up), <b>Bomber</b> (air strikes), <b>Economist</b> (expands fast). Scout and adapt!
            </div>
        </div>

        <div class="tut-victory-grid">
            <div class="tut-victory-card">
                <div class="tut-vc-name">Conquest</div>
                <div class="tut-vc-desc">Eliminate every enemy</div>
            </div>
            <div class="tut-victory-card">
                <div class="tut-vc-name">Domination</div>
                <div class="tut-vc-desc">Hold X% of all land tiles</div>
            </div>
            <div class="tut-victory-card">
                <div class="tut-vc-name">Regime Change</div>
                <div class="tut-vc-desc">Topple all enemy Govs</div>
            </div>
            <div class="tut-victory-card">
                <div class="tut-vc-name">Blitz</div>
                <div class="tut-vc-desc">Destroy N enemy structures</div>
            </div>
            <div class="tut-victory-card">
                <div class="tut-vc-name">Last Stand</div>
                <div class="tut-vc-desc">Survive solo vs all AI</div>
            </div>
        </div>

        <div class="tut-shortcut-grid">
            <div class="tut-sc"><span class="key-badge">H</span> Center on your Gov</div>
            <div class="tut-sc"><span class="key-badge">J</span> Jump to last hit</div>
            <div class="tut-sc"><span class="key-badge">P</span> Pause / Resume</div>
            <div class="tut-sc"><span class="key-badge">L</span> Toggle combat log</div>
            <div class="tut-sc"><span class="key-badge">Q</span> Select all of type</div>
            <div class="tut-sc"><span class="key-badge">Ctrl+Click</span> Multi-select</div>
        </div>

        <div class="tip-box">Good luck, Commander. All keybinds can be remapped in Settings.</div>
    `,
];
