// ============================================================================
//  SENTINEL TRAINING — two complete operations; fictional story and factions.
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
        objectivePrimary:
            'Your **Rocket Launchers** are in range — hold position. They will cycle until the enemy **Government** is rubble.',
        objectiveHint:
            'No more inputs needed. If a launcher dies, press **[{key:build_RL}]** and rebuild on any owned tile in range.',
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
            'First job: **survive the salvo**. Place an **Anti-Air System (AAS, key {key:build_AAS})** on the pulsing hex next to your Government — it intercepts incoming rockets.',
            'Then push the perimeter: drop a **Barracks (B, key {key:build_B})** on the forward pulsing hex. Barracks are tanky and project influence forward — your launch pad for the counter-punch.',
            'After that, build **Rocket Launchers (key {key:build_RL})** on any forward tile in range of their **Government** and crack the node.',
        ],
        objectivePrimary:
            'COUNTER-ATTACK — build **Rocket Launchers (key {key:build_RL})** on forward tiles and destroy the enemy **Government**.',
        objectiveHint:
            'Tip: 2–3 RLs in range = ~6 volleys to kill an L1 Gov. Keep your Missile Factory alive so they stay fed.',
        debrief: `${FRIEND_SHORT}: "Line held, node down. Training complete, Eclipse. You can now supply an attack, intercept a salvo, and hold a forward line. Your next command is a skirmish of your own."`,
        defeat: `${FRIEND_SHORT}: "The bunker line caved. Re-deploy when you've got your AAS pattern right."`,
    },
];

export function getMissionById(id) {
    return CAMPAIGN_MISSIONS.find((m) => m.id === id);
}

export function isMissionImplemented(id) {
    const m = getMissionById(id);
    return !!(m && m.implemented);
}

/** A completed training arc has a real ending; losing always allows a retry. */
export function getTrainingOutcome(missionId, won) {
    const mission = getMissionById(missionId);
    if (!won)
        return {
            title: 'TRY AGAIN',
            message: mission?.defeat || 'Regroup and try again.',
            action: 'RETRY OPERATION',
            nextMissionId: missionId,
        };
    const nextMission = CAMPAIGN_MISSIONS.find((m) => m.id > missionId && m.implemented);
    return {
        title: nextMission ? 'OPERATION COMPLETE' : 'TRAINING COMPLETE',
        message: mission?.debrief || 'Operation complete.',
        action: nextMission ? `CONTINUE — ${nextMission.codename}` : 'CHOOSE A SKIRMISH',
        nextMissionId: nextMission?.id ?? null,
    };
}
