// ============================================================================
//  CAMPAIGN — story text is fictional (no real countries). Missions 2+ are WIP.
// ============================================================================

export const FRIEND_SHORT = 'Sentinel Command';
export const ENEMY_FACTION = 'Iron Compact';

export const CAMPAIGN_MISSIONS = [
    {
        id: 1,
        codename: 'COLD SPOOL',
        act: 1,
        tutorialNags: true,
        implemented: true,
        freezeEnemyAi: true,
        mapSize: 'small',
        mapStyle: 'pangaea',
        playerCount: 2,
        victoryMode: 'regime_change',
        victoryParam: null,
        difficulty: 'easy',
        briefingTitle: 'Op. COLD SPOOL — Live-fire tutorial',
        briefingLines: [
            `${FRIEND_SHORT}: "Eclipse — welcome to the line. Your **Government** and **Missile Factory** are already up. You have one job today: **shoot the enemy Government**."`,
            'Watch your **op panel** (top-left). It will tell you exactly which button to press and which **pulsing cyan hex** to click. Wrong tile = no build, just try again.',
            'You will place **two Rocket Launchers** on the forward edge of our territory. They will fire on their own. The Iron Compact node will not last long.',
        ],
        objectivePrimary: 'Your **Rocket Launchers** are in range — hold position. They will cycle until the enemy **Government** is rubble.',
        objectiveHint: 'No more inputs needed. If a launcher dies, press **[2]** and rebuild on any owned tile in range.',
        debrief: `${FRIEND_SHORT}: "Node is down. The line cools. Next push is **Bunkerline** — you learn to take a hit."`,
        defeat: `${FRIEND_SHORT}: "We lost the district command. Re-run the op when you are ready, Eclipse."`,
    },
    {
        id: 2,
        codename: 'BUNKERLINE',
        act: 1,
        tutorialNags: true,
        implemented: true,
        freezeEnemyAi: true,
        mapSize: 'small',
        mapStyle: 'pangaea',
        playerCount: 2,
        victoryMode: 'regime_change',
        victoryParam: null,
        difficulty: 'easy',
        briefingTitle: 'Op. BUNKERLINE — Hold the line, then crack the node',
        briefingLines: [
            `${FRIEND_SHORT}: "Eclipse — the **Iron Compact** parked two **Rocket Launchers** on our doorstep. Missiles are already in the air."`,
            'First job: **survive the salvo**. Place an **Anti-Air System (AAS, key 3)** on the pulsing hex next to your Government — it intercepts incoming rockets.',
            'Then push the perimeter: drop a **Barracks (B, key 5)** on the forward pulsing hex. Barracks are tanky and project influence forward — your launch pad for the counter-punch.',
            'After that, build **Rocket Launchers (key 2)** on any forward tile in range of their **Government** and crack the node.',
        ],
        objectivePrimary: 'COUNTER-ATTACK — build **Rocket Launchers (key 2)** on forward tiles and destroy the enemy **Government**.',
        objectiveHint: 'Tip: 2–3 RLs in range = ~6 volleys to kill an L1 Gov. Keep your Missile Factory alive so they stay fed.',
        debrief: `${FRIEND_SHORT}: "Line held, node down. You learned to take a hit, Eclipse. Next op is **NO-SKY** — coast and salt water."`,
        defeat: `${FRIEND_SHORT}: "The bunker line caved. Re-deploy when you've got your AAS pattern right."`,
    },
    {
        id: 3,
        codename: 'NO-SKY',
        act: 1,
        tutorialNags: true,
        implemented: false,
        mapSize: 'small',
        mapStyle: 'inland_sea',
        playerCount: 2,
        victoryMode: 'regime_change',
        difficulty: 'normal',
        briefingTitle: 'Op. NO-SKY',
        briefingLines: ['(WIP)'],
        objectivePrimary: 'Coming later.',
        debrief: '',
        defeat: '',
    },
    { id: 4, codename: 'OVERMATCH', act: 1, tutorialNags: true, implemented: false, mapSize: 'small', mapStyle: 'pangaea', playerCount: 2, victoryMode: 'regime_change', difficulty: 'normal', briefingTitle: 'WIP', briefingLines: [''], objectivePrimary: '', debrief: '', defeat: '' },
    { id: 5, codename: 'DAGGER', act: 1, tutorialNags: true, implemented: false, mapSize: 'medium', mapStyle: 'pangaea', playerCount: 2, victoryMode: 'regime_change', difficulty: 'normal', briefingTitle: 'WIP', briefingLines: [''], objectivePrimary: '', debrief: '', defeat: '' },
    { id: 6, codename: 'BREACH', act: 2, tutorialNags: false, implemented: false, mapSize: 'small', mapStyle: 'continents', playerCount: 2, victoryMode: 'regime_change', difficulty: 'normal', briefingTitle: 'WIP', briefingLines: [''], objectivePrimary: '', debrief: '', defeat: '' },
    { id: 7, codename: 'KEYSTONE', act: 2, tutorialNags: false, implemented: false, mapSize: 'small', mapStyle: 'pangaea', playerCount: 2, victoryMode: 'regime_change', difficulty: 'normal', briefingTitle: 'WIP', briefingLines: [''], objectivePrimary: '', debrief: '', defeat: '' },
    { id: 8, codename: 'EMPTY BELT', act: 2, tutorialNags: false, implemented: false, mapSize: 'medium', mapStyle: 'pangaea', playerCount: 2, victoryMode: 'regime_change', difficulty: 'hard', briefingTitle: 'WIP', briefingLines: [''], objectivePrimary: '', debrief: '', defeat: '' },
    { id: 9, codename: 'BAIT', act: 2, tutorialNags: false, implemented: false, mapSize: 'medium', mapStyle: 'pangaea', playerCount: 2, victoryMode: 'regime_change', difficulty: 'hard', briefingTitle: 'WIP', briefingLines: [''], objectivePrimary: '', debrief: '', defeat: '' },
    { id: 10, codename: 'LAST REGIME', act: 2, tutorialNags: false, implemented: false, mapSize: 'medium', mapStyle: 'fractal', playerCount: 2, victoryMode: 'regime_change', difficulty: 'very_hard', briefingTitle: 'WIP', briefingLines: [''], objectivePrimary: '', debrief: '', defeat: '' },
];

export function getMissionById(id) {
    return CAMPAIGN_MISSIONS.find(m => m.id === id);
}

export function isMissionImplemented(id) {
    const m = getMissionById(id);
    return !!(m && m.implemented);
}
