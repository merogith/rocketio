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
            `${FRIEND_SHORT}: "Eclipse, your kit is still crated. You will place a **starter Government** and a **Missile Factory** on our marked hexes — no hand-holding with a pre-built base."`,
            '**Follow the pulsing cyan ring** and the op panel. Wrong tile = no build. After that, it is a real sortie: the **Iron Compact** still has a **Government** up and rockets forward.',
            'Your mandate: **regime change** on their command node. Economy up, then **RL** in range. Without a factory, your launchers go dry.',
        ],
        objectivePrimary: 'TRAINING then **combat** — build where the map shows, then destroy the enemy **Government** (regime change).',
        objectiveHint: 'Factory (key **4**) feeds missiles; launchers (key **2**) spend them. Watch the missile readout.',
        debrief: `${FRIEND_SHORT}: "Node is down. The line cools. Next push is **Bunkerline** — you learn supply the hard way."`,
        defeat: `${FRIEND_SHORT}: "We lost the district command. Re-run the op when you are ready, Eclipse."`,
    },
    {
        id: 2,
        codename: 'BUNKERLINE',
        act: 1,
        tutorialNags: true,
        implemented: false,
        mapSize: 'small',
        mapStyle: 'pangaea',
        playerCount: 2,
        victoryMode: 'regime_change',
        difficulty: 'easy',
        briefingTitle: 'Op. BUNKERLINE — (locked WIP)',
        briefingLines: ['This mission is not available yet.'],
        objectivePrimary: 'Coming in a later update.',
        debrief: '',
        defeat: '',
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
