export const TUTORIAL_PAGES = [
    /* 1 — QUICK START */
    `
        <h3>QUICK START</h3>
        <div class="tut-hero">Your first 60 seconds decide the game. Follow this order:</div>

        <div class="tut-steps">
            <div class="tut-step">
                <span class="tut-step-num">1</span>
                <div><b>Build a Missile Factory</b> <span class="tut-dim">($230) — press <span class="key-badge">4</span></span><br>You start with one. Build a second immediately — rockets need ammo.</div>
            </div>
            <div class="tut-step">
                <span class="tut-step-num">2</span>
                <div><b>Build Rocket Launchers</b> <span class="tut-dim">($225) — press <span class="key-badge">2</span></span><br>Your main damage dealers. Place 2–3 near your border.</div>
            </div>
            <div class="tut-step">
                <span class="tut-step-num">3</span>
                <div><b>Build an Anti-Air System</b> <span class="tut-dim">($205) — press <span class="key-badge">3</span></span><br>Intercepts enemy missiles. Protect your Government!</div>
            </div>
            <div class="tut-step">
                <span class="tut-step-num">4</span>
                <div><b>Expand with a new Government</b> <span class="tut-dim">($450) — press <span class="key-badge">1</span></span><br>More territory = more gold income. Spread them out.</div>
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
        <div class="unit-card"><div class="uc-icon">🚀</div><div class="uc-info"><div class="uc-name">Rocket Launcher <span class="tut-cost">$225</span></div><div class="uc-desc">Long-range missile. Your bread and butter. Needs ammo from Factories.</div></div></div>
        <div class="unit-card"><div class="uc-icon">🪖</div><div class="uc-info"><div class="uc-name">Barracks <span class="tut-cost">$425</span></div><div class="uc-desc">Short-range ground fire. Can't be intercepted by Anti-Air. Also a supply hub. Lv3 fires every 3s.</div></div></div>
        <div class="unit-card"><div class="uc-icon">🚁</div><div class="uc-info"><div class="uc-name">Drone Operator <span class="tut-cost">$155</span></div><div class="uc-desc">Cheap, fast chip damage. Lv3 fires 3 shots — overwhelms Anti-Air defenses.</div></div></div>
        <div class="unit-card"><div class="uc-icon">✈️</div><div class="uc-info"><div class="uc-name">Air Base <span class="tut-cost">$350</span></div><div class="uc-desc">Heavy strike. High alpha damage but can be intercepted. Lv1 costs only 1 missile.</div></div></div>

        <div class="tut-role-label tut-role-defend">🛡️ DEFENSE</div>
        <div class="unit-card"><div class="uc-icon">🛡️</div><div class="uc-info"><div class="uc-name">Anti-Air System <span class="tut-cost">$205</span></div><div class="uc-desc">Auto-intercepts rockets, air strikes, and drones. Ground fire bypasses it. Always keep one near your Government.</div></div></div>

        <div class="tut-role-label tut-role-econ">💰 ECONOMY & EXPANSION</div>
        <div class="unit-card"><div class="uc-icon">🏛️</div><div class="uc-info"><div class="uc-name">Government <span class="tut-cost">$450</span></div><div class="uc-desc">Claims territory via influence. More territory = more gold. Lose all Govs = you lose.</div></div></div>
        <div class="unit-card"><div class="uc-icon">🏭</div><div class="uc-info"><div class="uc-name">Missile Factory <span class="tut-cost">$230</span></div><div class="uc-desc">Produces ammo for Rockets and Air Bases. No ammo = no missiles fired.</div></div></div>
        <div class="unit-card"><div class="uc-icon">🔫</div><div class="uc-info"><div class="uc-name">Militia <span class="tut-cost">$135</span></div><div class="uc-desc">Place anywhere visible — even on enemy tiles! Lv3 transforms into a mini-Government.</div></div></div>
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
                New Govs need <b>20 seconds to warm up</b> before earning gold. Overlapping Gov areas have diminishing returns — <b>spread them out</b> for maximum income.
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
                Structures outside the influence radius of a friendly Gov or Barracks fire <b>60% slower</b>. Push your supply forward with Barracks or upgraded Militia (Lv3).
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
            <div class="tut-tactic-body">A Lv3 Rocket Launcher outperforms three Lv1s. Upgrades cost 20% less than building fresh. Use <span class="key-badge">Space</span> to quick-upgrade.</div>
        </div>

        <div class="tut-tactic">
            <div class="tut-tactic-title">♻️ Recycle</div>
            <div class="tut-tactic-body">Press <span class="key-badge">X</span> to demolish a structure for 20% of what you spent on it back. Move your defenses as the front line shifts.</div>
        </div>

        <div class="tip-box">
            <b>HP Regen:</b> Structures slowly heal when not damaged for 5 seconds and not on contested tiles.
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
