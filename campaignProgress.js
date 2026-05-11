// ============================================================================
//  Same-PC campaign progress (localStorage)
// ============================================================================

import { CAMPAIGN_MISSIONS } from './campaignData.js?v=naval2027';

const STORAGE_KEY = 'rocketio_campaign_v1';
const MAX_ID = 10;

/**
 * @returns {{ v: number, beaten: boolean[] }}
 */
function defaultState() {
    const beaten = new Array(MAX_ID + 1).fill(false);
    return { v: 1, beaten };
}

/**
 * @returns {{ v: number, beaten: boolean[] }}
 */
export function loadCampaignProgress() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultState();
        const o = JSON.parse(raw);
        if (!o || o.v !== 1 || !Array.isArray(o.beaten)) return defaultState();
        const beaten = new Array(MAX_ID + 1).fill(false);
        for (let i = 1; i <= MAX_ID; i++) {
            beaten[i] = !!o.beaten[i];
        }
        return { v: 1, beaten };
    } catch {
        return defaultState();
    }
}

function saveCampaignProgress(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* private mode / quota */ }
}

/**
 * Longest prefix 1..k all beaten (k may be 0).
 */
export function getClearedPrefixLength(beaten) {
    let k = 0;
    for (let i = 1; i <= MAX_ID; i++) {
        if (beaten[i]) k = i;
        else break;
    }
    return k;
}

/**
 * May start mission m: next in line, or any already cleared (replay).
 */
export function canStartMission(m, beaten) {
    if (m < 1 || m > MAX_ID) return false;
    const prefix = getClearedPrefixLength(beaten);
    if (m <= prefix + 1) return true;
    if (beaten[m]) return true;
    return false;
}

/**
 * Call on victory. Idempotent.
 * @param {number} missionId
 */
export function markMissionBeaten(missionId) {
    const state = loadCampaignProgress();
    if (missionId < 1 || missionId > MAX_ID) return state;
    if (!state.beaten[missionId]) {
        state.beaten[missionId] = true;
        saveCampaignProgress(state);
    }
    return state;
}

export function clearCampaignProgress() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch { /* */ }
}

export function getAllMissionMetas() {
    return CAMPAIGN_MISSIONS.map(m => ({
        id: m.id,
        codename: m.codename,
        act: m.act,
        implemented: m.implemented,
    }));
}
