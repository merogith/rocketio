import { UNIT_STATS, COLORS, GAME_CONFIG, DIFFICULTY, DIPLOMACY } from './constants.js';
import { Hex } from './hexGrid.js';
import { SFX } from './sfx.js';

function relKey(a, b) {
    const x = Math.min(a, b), y = Math.max(a, b);
    return `${x}:${y}`;
}

function intervalEff(tile) {
    if (!tile.maxHp) return 1;
    const ratio = tile.hp / tile.maxHp;
    if (ratio < 0.5) return 2;
    if (ratio < 1)   return 1.25;
    return 1;
}

const ATTACK_TYPES = new Set(['RL', 'B', 'D', 'M', 'AB']);

function isInfluencer(structure) {
    if (!structure) return false;
    if (structure.type === 'G') return true;
    if (structure.type === 'B') return true;
    if (structure.type === 'M' && structure.stats?.transformsToGov) return true;
    return false;
}

function visionFor(stats) {
    return stats.vision ?? Math.max(stats.range || 0, stats.radius || 0, GAME_CONFIG.DEFAULT_VISION);
}

export class Game {
    constructor(grid) {
        this.grid = grid;
        this.players = [];
        this.projectiles = [];
        this.particles = [];
        this.events = [];
        this.combatLog = [];
        this.lastTick = 0;
        this.tickRate = GAME_CONFIG.TICK_RATE_MS;
        this.playerCount = 0;
        this.gameTime = 0;
        this.speedMultiplier = 1;
        this.paused = false;

        this.selectedTile = null;
        this.isTargeting = false;
        this.currentTargetSource = null;
        this.mousePos = { x: 0, y: 0 };

        this.winner = null;
        this.defeated = new Set();
        this.humanId = 1;
        this.startTime = 0;

        this.screenShake = 0;
        this.supplyByPlayer = new Map();

        this.victoryConfig = { mode: 'conquest', param: null };
        this.aiDifficulty = 'normal';
        this.lastOwnDamageTile = null;

        this._structuresDirty = true;
        this._aasTiles = [];
        this._govTiles = [];
        this._structureTiles = [];
        this._l3BarracksTiles = [];
        this._govCount = [];

        // --- Diplomacy ---
        this.diplomacyEnabled = true;
        this.relations = {};           // relKey(a,b) -> { a, b, status, formedAt, lastRequestFrom, lastRequestAt, rejectedBy, rejectedAt }
        this.diploCooldowns = {};      // `${fromId}:${toId}` -> gameTime when they can send again
        this.metPlayers = {};          // playerId -> Set<otherId>
        this.coWinners = null;         // array of playerIds on co-victory
        this.diploEvents = [];         // transient events for UI: {kind, a, b, t}
    }

    _rebuildStructureIndex() {
        this._aasTiles.length = 0;
        this._govTiles.length = 0;
        this._structureTiles.length = 0;
        this._l3BarracksTiles.length = 0;
        this._govCount = new Array(this.players.length).fill(0);
        for (const tile of this.grid.tiles.values()) {
            if (!tile.structure) continue;
            this._structureTiles.push(tile);
            if (tile.structure.type === 'AAS') this._aasTiles.push(tile);
            if (tile.structure.type === 'B' && tile.structure.level === 2) this._l3BarracksTiles.push(tile);
            if (tile.structure.type === 'G' && tile.owner) {
                this._govTiles.push(tile);
                this._govCount[tile.owner - 1] = (this._govCount[tile.owner - 1] || 0) + 1;
            }
        }
        this._structuresDirty = false;
    }

    _markStructuresDirty() { this._structuresDirty = true; }

    _ensureIndex() { if (this._structuresDirty) this._rebuildStructureIndex(); }

    /** True if `tile` (structure hex) lies within a friendly Lv3 Barracks influence radius (non-stacking). */
    _inFriendlyL3BarracksCommandAura(tile, ownerId) {
        if (!tile || !ownerId) return false;
        this._ensureIndex();
        for (const bTile of this._l3BarracksTiles) {
            if (bTile.owner !== ownerId) continue;
            const s = bTile.structure;
            const r = s._lockedRadius ?? s.stats.radius ?? 0;
            if (Hex.distance(tile, bTile) <= r) return true;
        }
        return false;
    }

    // Militia cap: MILITIA_BASE_CAP with one Gov; +MILITIA_PER_EXTRA_GOV per additional Gov.
    militiaCap(player) {
        this._ensureIndex();
        const govs = this._govCount[player.id - 1] || 0;
        return GAME_CONFIG.MILITIA_BASE_CAP + Math.max(0, govs - 1) * GAME_CONFIG.MILITIA_PER_EXTRA_GOV;
    }

    start(playerCount = 4, humanName = "COMMANDER", victoryConfig = null) {
        this.playerCount = playerCount;
        this.humanName = humanName;
        this.players = [];
        this.projectiles = [];
        this.particles = [];
        this.events = [];
        this.combatLog = [];
        this.winner = null;
        this.defeated = new Set();
        this.gameTime = 0;
        this.startTime = 0;
        this.speedMultiplier = 1;
        this.paused = false;

        if (victoryConfig) this.victoryConfig = victoryConfig;

        const diff = DIFFICULTY[this.aiDifficulty] || DIFFICULTY.normal;
        this._difficulty = diff;

        this.relations = {};
        this.diploCooldowns = {};
        this.metPlayers = {};
        this.coWinners = null;
        this.diploEvents = [];

        for (let i = 1; i <= playerCount; i++) {
            const isAi = i !== this.humanId;
            const startGold = GAME_CONFIG.STARTING_GOLD + (isAi ? diff.startGoldDelta : 0);
            this.players.push({
                id: i,
                name: i === this.humanId ? humanName : `CPU-${i}`,
                gold: startGold,
                missiles: GAME_CONFIG.STARTING_MISSILES,
                goldRate: 0,
                tileCount: 0,
                units: { M: 0 },
                fogVisible: new Set(),
                fogExplored: new Set(),
                memory: new Map(),
                doctrine: null,
                nextAiAction: 0,
                nextDiploAction: 0,
                portrait: this._buildPortrait(i, i === this.humanId ? humanName : `CPU-${i}`),
                stats: {
                    structuresBuilt: 0,
                    structuresDestroyed: 0,
                    structuresLost: 0,
                    goldEarned: 0,
                    goldSpent: 0,
                    damageDealt: 0,
                    damageTaken: 0,
                    peakTiles: 0,
                    missilesIntercepted: 0,
                },
            });
            this.metPlayers[i] = new Set();
        }

        const spawnPoints = this.grid.findSpawnPoints
            ? this.grid.findSpawnPoints(playerCount)
            : this._fallbackSpawns(playerCount);

        this.players.forEach((p, i) => {
            const sp = spawnPoints[i];
            if (!sp) return;
            let tile = this.grid.getTile(sp.q, sp.r);
            if (!tile || !tile.buildable) {
                tile = this._findNearestBuildable(sp.q, sp.r);
            }
            if (tile) {
                tile.owner = p.id;
                this.buildStructure(tile, 'G', p.id, 0, true);
                const neighbor = new Hex(tile.q, tile.r).getNeighbors()
                    .map(h => this.grid.getTile(h.q, h.r))
                    .find(t => t && t.buildable && !t.structure);
                if (neighbor) {
                    neighbor.owner = p.id;
                    this.buildStructure(neighbor, 'MF', p.id, 0, true);
                }
            }
        });

        this.startTime = this.gameTime;
        this.updateBorders();
        this.recomputeFog();
        this.recomputeSupply();
        this.tick();
    }

    _buildPortrait(playerId, name) {
        const glyph = DIPLOMACY.PORTRAIT_GLYPHS[(playerId - 1) % DIPLOMACY.PORTRAIT_GLYPHS.length];
        const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
        return { glyph, initial, colorKey: `PLAYER${playerId}` };
    }

    _fallbackSpawns(playerCount) {
        const radius = this.grid.radius;
        const spawns = [];
        for (let i = 0; i < playerCount; i++) {
            const angle = (i / playerCount) * Math.PI * 2 + Math.PI / 6;
            const dist = radius * 0.72;
            let q = Math.round(Math.cos(angle) * dist);
            let r = Math.round(Math.sin(angle) * dist);
            spawns.push({ q, r });
        }
        return spawns;
    }

    _landTileCountForVictory() {
        let n = this.grid.landTileCount || 0;
        if (n > 0) return n;
        for (const t of this.grid.tiles.values()) {
            if (t.buildable) n++;
        }
        return Math.max(1, n);
    }

    _findNearestBuildable(q, r) {
        const maxD = Math.max(60, (this.grid.radius || 20) * 3);
        for (let d = 0; d < maxD; d++) {
            for (let dq = -d; dq <= d; dq++) {
                for (let dr = Math.max(-d, -dq - d); dr <= Math.min(d, -dq + d); dr++) {
                    const tile = this.grid.getTile(q + dq, r + dr);
                    if (tile && tile.buildable && !tile.structure) return tile;
                }
            }
        }
        return null;
    }

    // ========================================================================
    //  UPDATE / TICK
    // ========================================================================
    update(time) {
        if (this.paused) return;

        const realDt = time - (this._lastRealTime || time);
        this._lastRealTime = time;
        const gameDt = realDt * this.speedMultiplier;
        this.gameTime += gameDt;

        let tickBudget = GAME_CONFIG.MAX_TICKS_CATCHUP_PER_FRAME ?? 120;
        while (tickBudget-- > 0 && !this.winner) {
            if (this.gameTime - this.lastTick < this.tickRate) break;
            this.tick();
            this.lastTick += this.tickRate;
        }

        this.updateProjectiles();
        if (!this.winner) this.updateStructures();
        this.updateParticles();
        this.pruneEvents();

        if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - 0.6);
    }

    tick() {
        const counts = new Array(this.players.length).fill(0);
        const goldRates = new Array(this.players.length).fill(0);

        const govSources = [];
        for (const tile of this.grid.tiles.values()) {
            if (!tile.owner || tile.contested) continue;
            const s = tile.structure;
            if (!s) continue;
            const isGov = s.type === 'G';
            const isMilitiaGov = s.type === 'M' && s.stats?.transformsToGov;
            if (!isGov && !isMilitiaGov) continue;
            if (isGov && tile.govWarmupUntil && this.gameTime < tile.govWarmupUntil) continue;
            const stats = s.stats;
            const effectiveRadius = s._lockedRadius ?? stats.radius;
            govSources.push({
                tile,
                owner: tile.owner,
                radius: effectiveRadius,
                goldPerTile: stats.goldPerTile || 0,
            });
        }

        const diff = this._difficulty || DIFFICULTY.normal;
        for (const tile of this.grid.tiles.values()) {
            if (!tile.buildable) continue;
            if (tile.contested) continue;
            if (tile.owner) {
                counts[tile.owner - 1]++;
                const ownerIdx = tile.owner - 1;
                const isAi = tile.owner !== this.humanId;
                const mult = isAi ? diff.goldMult : 1;

                const govEffects = [];
                for (const gov of govSources) {
                    if (gov.owner !== tile.owner) continue;
                    const d = Hex.distance(tile, gov.tile);
                    if (d <= gov.radius && gov.goldPerTile > 0) {
                        govEffects.push(gov.goldPerTile);
                    }
                }
                if (govEffects.length > 0) {
                    govEffects.sort((a, b) => b - a);
                    let bonus = 0;
                    for (let i = 0; i < govEffects.length; i++) {
                        bonus += govEffects[i] / (2 ** i);
                    }
                    bonus *= mult;
                    this.players[ownerIdx].gold += bonus;
                    this.players[ownerIdx].stats.goldEarned += bonus;
                    goldRates[ownerIdx] += bonus;
                }
            }
        }

        // HP regen
        const now = this.gameTime;
        for (const tile of this.grid.tiles.values()) {
            if (!tile.structure || !tile.owner || tile.contested) continue;
            if (tile.hp >= tile.maxHp) continue;
            if (now - (tile.lastDamageTime || 0) < GAME_CONFIG.REGEN_COOLDOWN_MS) continue;
            tile.hp = Math.min(tile.maxHp, tile.hp + tile.maxHp * GAME_CONFIG.HP_REGEN_RATE);
        }

        this.players.forEach((p, i) => {
            p.tileCount = counts[i];
            p.goldRate = goldRates[i];
            if (counts[i] > p.stats.peakTiles) p.stats.peakTiles = counts[i];
        });

        this.recomputeFog();
        this.recomputeSupply();
        this.checkVictory();
    }

    // ========================================================================
    //  SUPPLY
    // ========================================================================
    recomputeSupply() {
        const byPlayer = new Map();
        for (const tile of this.grid.tiles.values()) {
            if (!isInfluencer(tile.structure) || !tile.owner) continue;
            const radius = tile.structure._lockedRadius ?? tile.structure.stats.radius ?? 0;
            let set = byPlayer.get(tile.owner);
            if (!set) { set = new Set(); byPlayer.set(tile.owner, set); }
            for (let dq = -radius; dq <= radius; dq++) {
                for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
                    const key = `${tile.q + dq},${tile.r + dr}`;
                    if (this.grid.tiles.has(key)) set.add(key);
                }
            }
        }
        this.supplyByPlayer = byPlayer;
    }

    // ========================================================================
    //  FOG OF WAR
    // ========================================================================
    recomputeFog() {
        for (const p of this.players) p.fogVisible = new Set();

        for (const tile of this.grid.tiles.values()) {
            if (!tile.structure || !tile.owner) continue;
            const player = this.players[tile.owner - 1];
            if (!player) continue;
            const vr = visionFor(tile.structure.stats);
            for (let dq = -vr; dq <= vr; dq++) {
                for (let dr = Math.max(-vr, -dq - vr); dr <= Math.min(vr, -dq + vr); dr++) {
                    const key = `${tile.q + dq},${tile.r + dr}`;
                    if (this.grid.tiles.has(key)) {
                        player.fogVisible.add(key);
                        player.fogExplored.add(key);
                    }
                }
            }
        }

        for (const p of this.players) {
            for (const key of p.fogVisible) {
                const tile = this.grid.tiles.get(key);
                if (!tile) continue;
                p.memory.set(key, {
                    owner: tile.owner,
                    contested: tile.contested,
                    type: tile.structure?.type || null,
                    level: tile.structure?.level ?? null,
                    hp: tile.hp,
                    maxHp: tile.maxHp,
                });
                if (tile.owner && tile.owner !== p.id) {
                    this._markMet(p.id, tile.owner);
                }
            }
        }
    }

    // ========================================================================
    //  DIPLOMACY
    // ========================================================================
    _markMet(a, b) {
        if (a === b) return;
        if (!this.metPlayers[a]) this.metPlayers[a] = new Set();
        if (!this.metPlayers[b]) this.metPlayers[b] = new Set();
        this.metPlayers[a].add(b);
        this.metPlayers[b].add(a);
    }

    haveMet(a, b) {
        if (a === b) return false;
        return !!(this.metPlayers[a]?.has(b));
    }

    getRelation(a, b) {
        if (a === b) return null;
        return this.relations[relKey(a, b)] || null;
    }

    areAllied(a, b) {
        if (!this.diplomacyEnabled) return false;
        if (a === b) return false;
        if (a == null || b == null) return false;
        const rel = this.relations[relKey(a, b)];
        return !!(rel && rel.status === 'peace');
    }

    maxPeacesAllowed() {
        return DIPLOMACY.maxPeacesFor(this.playerCount);
    }

    peaceCountFor(playerId) {
        let n = 0;
        for (const rel of Object.values(this.relations)) {
            if (rel.status !== 'peace') continue;
            if (rel.a === playerId || rel.b === playerId) n++;
        }
        return n;
    }

    remainingCooldown(fromId, toId) {
        const t = this.diploCooldowns[`${fromId}:${toId}`] || 0;
        return Math.max(0, t - this.gameTime);
    }

    canPropose(fromId, toId) {
        if (!this.diplomacyEnabled) return { ok: false, reason: 'diplomacy disabled' };
        if (fromId === toId) return { ok: false, reason: 'self' };
        if (this.defeated.has(fromId) || this.defeated.has(toId)) return { ok: false, reason: 'defeated' };
        if (!this.haveMet(fromId, toId)) return { ok: false, reason: 'not met' };
        const rel = this.getRelation(fromId, toId);
        if (rel && rel.status === 'peace') return { ok: false, reason: 'already allied' };
        if (rel && rel.status === 'pending') return { ok: false, reason: 'pending' };
        if (this.remainingCooldown(fromId, toId) > 0) return { ok: false, reason: 'cooldown' };
        const cap = this.maxPeacesAllowed();
        if (cap <= 0) return { ok: false, reason: 'cap zero' };
        if (this.peaceCountFor(fromId) >= cap) return { ok: false, reason: 'you at cap' };
        if (this.peaceCountFor(toId) >= cap) return { ok: false, reason: 'target at cap' };
        return { ok: true };
    }

    proposePeace(fromId, toId) {
        const chk = this.canPropose(fromId, toId);
        if (!chk.ok) return false;
        const key = relKey(fromId, toId);
        this.relations[key] = {
            a: Math.min(fromId, toId),
            b: Math.max(fromId, toId),
            status: 'pending',
            formedAt: 0,
            lastRequestFrom: fromId,
            lastRequestAt: this.gameTime,
            rejectedBy: null,
            rejectedAt: 0,
        };
        this.diploCooldowns[`${fromId}:${toId}`] = this.gameTime + DIPLOMACY.REQUEST_COOLDOWN_MS;
        this.diploEvents.push({ kind: 'propose', from: fromId, to: toId, t: this.gameTime });
        const fromName = this.players[fromId - 1]?.name || `P${fromId}`;
        const toName = this.players[toId - 1]?.name || `P${toId}`;
        this.logEvent(fromId, toId, 'diplomacy', `${fromName} proposes peace to ${toName}`);
        return true;
    }

    acceptPeace(byId, otherId) {
        const key = relKey(byId, otherId);
        const rel = this.relations[key];
        if (!rel || rel.status !== 'pending') return false;
        if (rel.lastRequestFrom === byId) return false; // must be the recipient
        // cap recheck
        const cap = this.maxPeacesAllowed();
        if (cap <= 0) return false;
        if (this.peaceCountFor(byId) >= cap) return false;
        if (this.peaceCountFor(otherId) >= cap) return false;

        rel.status = 'peace';
        rel.formedAt = this.gameTime;
        rel.rejectedBy = null;
        rel.rejectedAt = 0;
        this.clearCrossTargets(byId, otherId);
        this.diploEvents.push({ kind: 'accept', from: byId, to: otherId, t: this.gameTime });
        const aName = this.players[byId - 1]?.name || `P${byId}`;
        const bName = this.players[otherId - 1]?.name || `P${otherId}`;
        this.logEvent(byId, otherId, 'diplomacy', `Peace formed: ${aName} \u2194 ${bName}`);
        return true;
    }

    rejectPeace(byId, otherId) {
        const key = relKey(byId, otherId);
        const rel = this.relations[key];
        if (!rel || rel.status !== 'pending') return false;
        if (rel.lastRequestFrom === byId) return false;
        rel.status = 'none';
        rel.rejectedBy = byId;
        rel.rejectedAt = this.gameTime;
        // Rejecter can re-request instantly (no cooldown). Original sender's cooldown stands.
        this.diploEvents.push({ kind: 'reject', from: byId, to: otherId, t: this.gameTime });
        const aName = this.players[byId - 1]?.name || `P${byId}`;
        const bName = this.players[otherId - 1]?.name || `P${otherId}`;
        this.logEvent(byId, otherId, 'diplomacy', `${aName} rejects peace with ${bName}`);
        return true;
    }

    canForfeit(a, b) {
        const rel = this.getRelation(a, b);
        if (!rel || rel.status !== 'peace') return false;
        return (this.gameTime - rel.formedAt) >= DIPLOMACY.PEACE_LOCK_MS;
    }

    forfeitPeace(byId, otherId) {
        const rel = this.getRelation(byId, otherId);
        if (!rel || rel.status !== 'peace') return false;
        if (!this.canForfeit(byId, otherId)) return false;
        rel.status = 'none';
        rel.formedAt = 0;
        this.diploCooldowns[`${byId}:${otherId}`] = this.gameTime + DIPLOMACY.REQUEST_COOLDOWN_MS;
        this.diploCooldowns[`${otherId}:${byId}`] = this.gameTime + DIPLOMACY.REQUEST_COOLDOWN_MS;
        this.diploEvents.push({ kind: 'forfeit', from: byId, to: otherId, t: this.gameTime });
        const aName = this.players[byId - 1]?.name || `P${byId}`;
        const bName = this.players[otherId - 1]?.name || `P${otherId}`;
        this.logEvent(byId, otherId, 'diplomacy', `${aName} breaks peace with ${bName}`);
        return true;
    }

    clearCrossTargets(a, b) {
        for (const tile of this.grid.tiles.values()) {
            if (!tile.structure || !tile.structure.target) continue;
            if (tile.owner !== a && tile.owner !== b) continue;
            const tgt = tile.structure.target;
            const live = this.grid.getTile(tgt.q, tgt.r);
            if (!live) continue;
            if ((tile.owner === a && live.owner === b) || (tile.owner === b && live.owner === a)) {
                tile.structure.target = null;
            }
        }
    }

    // Called when diplomacy is toggled off mid-game or when playerCount changes rules
    resetAllRelations() {
        this.relations = {};
        this.diploCooldowns = {};
        this.diploEvents.push({ kind: 'reset', t: this.gameTime });
    }

    setDiplomacyEnabled(enabled) {
        this.diplomacyEnabled = !!enabled;
        if (!this.diplomacyEnabled) this.resetAllRelations();
    }

    isVisibleTo(tile, playerId) {
        return this.players[playerId - 1]?.fogVisible.has(`${tile.q},${tile.r}`);
    }
    isExploredBy(tile, playerId) {
        return this.players[playerId - 1]?.fogExplored.has(`${tile.q},${tile.r}`);
    }

    isInSupply(tile, ownerId) {
        const set = this.supplyByPlayer.get(ownerId);
        return !!set && set.has(`${tile.q},${tile.r}`);
    }

    effFor(tile) {
        let mul = intervalEff(tile);
        if (!this.isInSupply(tile, tile.owner)) mul *= GAME_CONFIG.SUPPLY_OUT_MULT;
        return mul;
    }

    // ========================================================================
    //  STRUCTURE TICK LOGIC
    // ========================================================================
    updateStructures() {
        const time = this.gameTime;
        this._missileSmartPlayers = GAME_CONFIG.MISSILE_SMART_PRIORITY ? new Set() : null;

        for (const tile of this.grid.tiles.values()) {
            if (!tile.structure) continue;
            if (tile.contested) continue;

            const s = tile.structure;
            if (s.type === 'RL' || s.type === 'AB') continue;

            const stats = s.stats;
            const p = this.players[tile.owner - 1];
            const eff = this.effFor(tile);

            if (s.type === 'MF') {
                if (time - tile.lastAction > stats.produceInterval * eff) {
                    p.missiles += stats.missilesProduced;
                    tile.lastAction = time;
                }
                continue;
            }
            if (s.type === 'AAS') {
                if (time - tile.lastAction > stats.rechargeInterval * eff) {
                    s.charge = Math.min(stats.chargeCap || 10, (s.charge || 0) + stats.missilesRecharged);
                    tile.lastAction = time;
                }
                continue;
            }
            if (s.type === 'B') {
                if (time - tile.lastAction > stats.interval * eff) {
                    if (this.fireGround(tile, 'ground')) tile.lastAction = time;
                }
                continue;
            }
            if (s.type === 'D') {
                if (time - tile.lastAction > stats.interval * eff) {
                    this.fireDrone(tile);
                    tile.lastAction = time;
                }
                continue;
            }
            if (s.type === 'M' && stats.damage) {
                if (time - tile.lastAction > stats.interval * eff) {
                    if (this.fireGround(tile, 'militia')) tile.lastAction = time;
                }
                continue;
            }
        }

        const missileReadyByPlayer = new Map();
        for (const tile of this.grid.tiles.values()) {
            if (!tile.structure) continue;
            if (tile.contested) continue;
            const s = tile.structure;
            if (s.type !== 'RL' && s.type !== 'AB') continue;
            const stats = s.stats;
            const p = this.players[tile.owner - 1];
            const eff = this.effFor(tile);
            if (time - tile.lastAction <= stats.interval * eff) continue;
            if (p.missiles < stats.missilesPerShot) continue;
            const pid = tile.owner;
            if (!missileReadyByPlayer.has(pid)) missileReadyByPlayer.set(pid, []);
            missileReadyByPlayer.get(pid).push({ tile, eff });
        }

        if (this._missileSmartPlayers) {
            for (const [pid, entries] of missileReadyByPlayer) {
                const p = this.players[pid - 1];
                const demand = entries.reduce((sum, e) => sum + e.tile.structure.stats.missilesPerShot, 0);
                if (GAME_CONFIG.MISSILE_SMART_STARVED_ONLY && p.missiles >= demand) continue;
                this._missileSmartPlayers.add(pid);
            }
        }

        for (const [pid, entries] of missileReadyByPlayer) {
            const p = this.players[pid - 1];
            let order = entries;
            if (this._missileSmartPlayers?.has(pid)) {
                const inc = this._incomingShooterKeysForDefender(pid);
                order = [...entries].sort((a, b) => {
                    const ta = this.resolveTarget(a.tile, a.tile.structure.stats, { missileSmart: true });
                    const tb = this.resolveTarget(b.tile, b.tile.structure.stats, { missileSmart: true });
                    const pa = ta ? this.missileTargetPriority(pid, ta, inc) : -Infinity;
                    const pb = tb ? this.missileTargetPriority(pid, tb, inc) : -Infinity;
                    if (pb !== pa) return pb - pa;
                    if (a.tile.q !== b.tile.q) return a.tile.q - b.tile.q;
                    return a.tile.r - b.tile.r;
                });
            }
            for (const { tile, eff } of order) {
                const stats = tile.structure.stats;
                const s = tile.structure;
                if (time - tile.lastAction <= stats.interval * eff) continue;
                if (p.missiles < stats.missilesPerShot) continue;
                if (s.type === 'RL') {
                    if (this.fireRocket(tile)) tile.lastAction = time;
                } else if (this.fireAirBase(tile)) {
                    tile.lastAction = time;
                }
            }
        }

        this._missileSmartPlayers = null;
    }

    // ========================================================================
    //  TARGETING — distance-first; within tie band: struct weight -> lowest HP -> (q,r)
    // ========================================================================
    /** Weighted in-flight damage to enemy structures from projectiles fired by ownerId and allies. */
    _pendingDamageToEnemyStructures(ownerId) {
        const mult = GAME_CONFIG.AUTO_TARGET_INTERCEPT_PENDING_MULT;
        const maxDist = GAME_CONFIG.AUTO_TARGET_PENDING_ETA_MAX_DIST_PX ?? 0;
        const map = new Map();
        for (const p of this.projectiles) {
            if (p.owner !== ownerId && !this.areAllied(p.owner, ownerId)) continue;
            const tile = this.grid.getTile(p.targetQR.q, p.targetQR.r);
            if (!tile?.structure) continue;
            if (tile.owner === ownerId || this.areAllied(tile.owner, ownerId)) continue;
            let base = p.interceptable ? p.damage * mult : p.damage;
            if (maxDist > 0) {
                const dx = p.targetX - p.x;
                const dy = p.targetY - p.y;
                const dist = Math.hypot(dx, dy);
                const etaW = Math.max(0, 1 - Math.min(1, dist / maxDist));
                base *= etaW;
            }
            const k = `${tile.q},${tile.r}`;
            map.set(k, (map.get(k) || 0) + base);
        }
        return map;
    }

    /** Projectile `type` string used for AUTO_TARGET_MAX_INBOUND_BY_PROJECTILE_TYPE, or null if inbound cap does not apply. */
    _inboundProjectileTypeForSource(source) {
        const s = source?.structure;
        if (!s) return null;
        const t = s.type;
        if (t === 'RL') return 'rocket';
        if (t === 'AB') return 'airstrike';
        if (t === 'D') return 'drone';
        if (t === 'B') return 'ground';
        if (t === 'M' && s.stats?.damage) return 'militia';
        return null;
    }

    /** In-flight projectile count per enemy target hex for one projectile type (owner + allies). */
    _inboundProjectileCountByTarget(ownerId, projectileType) {
        const map = new Map();
        if (!projectileType) return map;
        for (const p of this.projectiles) {
            if (p.owner !== ownerId && !this.areAllied(p.owner, ownerId)) continue;
            if (p.type !== projectileType) continue;
            const k = `${p.targetQR.q},${p.targetQR.r}`;
            map.set(k, (map.get(k) || 0) + 1);
        }
        return map;
    }

    /** Enemy structure hex keys with interceptable shots in flight toward defender's structures. */
    _incomingShooterKeysForDefender(defenderId) {
        const set = new Set();
        for (const p of this.projectiles) {
            if (!p.interceptable || !p.fromQR) continue;
            if (p.owner === defenderId || this.areAllied(p.owner, defenderId)) continue;
            const tgt = this.grid.getTile(p.targetQR.q, p.targetQR.r);
            if (!tgt?.structure) continue;
            if (tgt.owner !== defenderId && !this.areAllied(tgt.owner, defenderId)) continue;
            set.add(`${p.fromQR.q},${p.fromQR.r}`);
        }
        return set;
    }

    _structureDps(stats) {
        if (!stats) return 0;
        const dmg = stats.damage || 0;
        const iv = stats.interval || stats.produceInterval || stats.rechargeInterval || 1000;
        return dmg / Math.max(0.001, iv / 1000);
    }

    /**
     * Higher = more urgent target for missile auto-fire (active shooter > DPS > Gov > AAS/MF).
     */
    missileTargetPriority(defenderId, targetTile, incomingShooterKeys) {
        const key = `${targetTile.q},${targetTile.r}`;
        const st = targetTile.structure?.stats;
        const dps = this._structureDps(st);
        const t = targetTile.structure?.type;
        const recentMs = GAME_CONFIG.MISSILE_RECENT_FIRE_MS ?? 0;
        const recentBonus = GAME_CONFIG.MISSILE_RECENT_FIRE_PRIORITY_BONUS ?? 0;
        const firedAt = targetTile.structure?.lastFiredAt;
        const recent =
            recentMs > 0 &&
            recentBonus > 0 &&
            typeof firedAt === 'number' &&
            firedAt > 0 &&
            this.gameTime - firedAt <= recentMs;
        let score;
        if (incomingShooterKeys.has(key)) {
            score = 3_000_000 + dps;
        } else if (t === 'AAS' || t === 'MF') {
            score = 100_000;
        } else if (t === 'G') {
            score = 500_000;
        } else if (t === 'RL' || t === 'AB' || t === 'D' || t === 'B' || (t === 'M' && st?.damage)) {
            score = 2_000_000 + dps * 1000;
        } else {
            score = 400_000 + dps;
        }
        return score + (recent ? recentBonus : 0);
    }

    resolveTarget(tile, stats, opts = {}) {
        const assigned = tile.structure.target;
        if (assigned) {
            const live = this.grid.getTile(assigned.q, assigned.r);
            if (live) {
                const d = Hex.distance(tile, live);
                if (d <= stats.range && live.owner !== tile.owner && live.structure && !this.areAllied(live.owner, tile.owner)) {
                    return live;
                }
            }
        }
        return this.autoTarget(tile, stats.range, opts);
    }

    /** Tie-break for auto-target: missile-smart layer, then distance band + struct weight + HP + (q,r). */
    _compareAutoTargetTieBreak(a, b, dMin, sourceOwner, missileSmart, inc) {
        if (missileSmart && inc) {
            const pa = this.missileTargetPriority(sourceOwner, a.tile, inc);
            const pb = this.missileTargetPriority(sourceOwner, b.tile, inc);
            if (pb !== pa) return pb - pa;
        }
        const tieBand = GAME_CONFIG.AUTO_TARGET_DISTANCE_TIE_HEXES ?? 0;
        const weights = GAME_CONFIG.AUTO_TARGET_STRUCT_WEIGHT || {};
        const wOf = (c) => weights[c.tile.structure?.type] ?? 0;
        const aNear = a.d <= dMin + tieBand;
        const bNear = b.d <= dMin + tieBand;
        if (aNear !== bNear) return aNear ? -1 : 1;
        if (!aNear) {
            if (a.d !== b.d) return a.d - b.d;
        } else {
            const wa = wOf(a), wb = wOf(b);
            if (wb !== wa) return wb - wa;
            if (a.hp !== b.hp) return a.hp - b.hp;
        }
        if (a.tile.q !== b.tile.q) return a.tile.q - b.tile.q;
        return a.tile.r - b.tile.r;
    }

    _sortAutoTargetCandidates(arr, sourceOwner, missileSmart, inc) {
        if (arr.length <= 1) return;
        const dMin = Math.min(...arr.map(c => c.d));
        arr.sort((a, b) => this._compareAutoTargetTieBreak(a, b, dMin, sourceOwner, missileSmart, inc));
    }

    autoTarget(source, range, opts = {}) {
        this._ensureIndex();
        const candidates = [];
        for (const tile of this._structureTiles) {
            if (!tile.owner || tile.owner === source.owner) continue;
            if (this.areAllied(tile.owner, source.owner)) continue;
            const d = Hex.distance(source, tile);
            if (d > range) continue;
            candidates.push({ tile, d, hp: tile.hp });
        }
        if (!candidates.length) return null;

        const missileSmart = !!opts.missileSmart && this._missileSmartPlayers?.has(source.owner);
        const inc = missileSmart ? this._incomingShooterKeysForDefender(source.owner) : null;

        const inboundType = this._inboundProjectileTypeForSource(source);
        const caps = GAME_CONFIG.AUTO_TARGET_MAX_INBOUND_BY_PROJECTILE_TYPE || {};
        const inboundCap = inboundType ? (caps[inboundType] ?? 0) : 0;
        const inboundByHex = inboundCap > 0 ? this._inboundProjectileCountByTarget(source.owner, inboundType) : null;

        const isInboundBlocked = (c) => {
            if (!inboundByHex) return false;
            const k = `${c.tile.q},${c.tile.r}`;
            return (inboundByHex.get(k) || 0) >= inboundCap;
        };

        const buffer = GAME_CONFIG.AUTO_TARGET_OVERKILL_BUFFER_HP;
        const pending = GAME_CONFIG.AUTO_TARGET_USE_PENDING_DAMAGE
            ? this._pendingDamageToEnemyStructures(source.owner)
            : null;

        const isSaturated = (c) => {
            const key = `${c.tile.q},${c.tile.r}`;
            const pend = pending.get(key) || 0;
            const thresh = Math.max(0, c.tile.hp - buffer);
            return pend >= thresh;
        };

        const blockedByPending = (c) => !!GAME_CONFIG.AUTO_TARGET_USE_PENDING_DAMAGE && isSaturated(c);
        const preferred = candidates.filter(c => !isInboundBlocked(c) && !blockedByPending(c));

        if (preferred.length) {
            this._sortAutoTargetCandidates(preferred, source.owner, missileSmart, inc);
            return preferred[0].tile;
        }

        const allowFallback =
            !GAME_CONFIG.AUTO_TARGET_USE_PENDING_DAMAGE || GAME_CONFIG.AUTO_TARGET_FALLBACK_WHEN_ALL_SATURATED;
        if (allowFallback) {
            this._sortAutoTargetCandidates(candidates, source.owner, missileSmart, inc);
            return candidates[0].tile;
        }

        const dMin = Math.min(...candidates.map(c => c.d));
        candidates.sort((a, b) => {
            const ka = `${a.tile.q},${a.tile.r}`;
            const kb = `${b.tile.q},${b.tile.r}`;
            const pa = pending.get(ka) || 0;
            const pb = pending.get(kb) || 0;
            if (pa !== pb) return pa - pb;
            return this._compareAutoTargetTieBreak(a, b, dMin, source.owner, missileSmart, inc);
        });
        return candidates[0].tile;
    }

    // ========================================================================
    //  FIRE FX HELPER — muzzle flash + SFX, only when visible to human
    // ========================================================================
    _humanSees(tile) {
        const h = this.players[this.humanId - 1];
        return !!h && h.fogVisible.has(`${tile.q},${tile.r}`);
    }

    // Spawn a short burst at tile biased toward target. Cheap; ignores if
    // tile isn't visible (avoids flashes under fog).
    spawnMuzzleFlash(tile, target, { color = '#ffcf80', size = 1, count = 3 } = {}) {
        if (!this._humanSees(tile)) return;
        const from = this.grid.hexToPixel(tile.q, tile.r);
        const to = this.grid.hexToPixel(target.q, target.r);
        const dx = to.x - from.x, dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len, ny = dy / len;
        for (let i = 0; i < count; i++) {
            if (this.particles.length >= GAME_CONFIG.MAX_PARTICLES) this.particles.shift();
            const spread = (Math.random() - 0.5) * 0.9;
            const s = 1.8 + Math.random() * 2.0;
            this.particles.push({
                x: from.x + nx * 8, y: from.y + ny * 8,
                vx: (nx * Math.cos(spread) - ny * Math.sin(spread)) * s,
                vy: (nx * Math.sin(spread) + ny * Math.cos(spread)) * s,
                life: 10 + Math.random() * 8,
                age: 0,
                color,
                size,
            });
        }
    }

    // Play SFX only if the firing tile is within human's vision, so the
    // player doesn't hear stuff happening under fog.
    _fireSfx(tile, presetName) {
        if (this._humanSees(tile)) SFX.play(presetName);
    }

    // ========================================================================
    //  FIRING
    // ========================================================================
    fireRocket(tile) {
        const p = this.players[tile.owner - 1];
        const stats = tile.structure.stats;
        const target = this.resolveTarget(tile, stats, { missileSmart: true });
        if (!target) return false;

        p.missiles -= stats.missilesPerShot;
        tile.structure.lastFiredAt = this.gameTime;
        const count = stats.projectiles || 1;
        for (let i = 0; i < count; i++) {
            this.spawnProjectile(tile, target, {
                type: 'rocket',
                damage: stats.damage,
                speed: 3.0,
                interceptable: stats.interceptable !== false,
                trail: true
            });
        }
        this.spawnMuzzleFlash(tile, target, { color: '#ff9130', size: 2, count: 5 });
        this._fireSfx(tile, 'launch_rocket');
        return true;
    }

    fireAirBase(tile) {
        const p = this.players[tile.owner - 1];
        const stats = tile.structure.stats;
        const target = this.resolveTarget(tile, stats, { missileSmart: true });
        if (!target) return false;

        p.missiles -= stats.missilesPerShot;
        tile.structure.lastFiredAt = this.gameTime;
        const count = stats.projectiles || 1;
        for (let i = 0; i < count; i++) {
            this.spawnProjectile(tile, target, {
                type: 'airstrike',
                damage: stats.damage,
                speed: stats.projectileSpeed || 4.5,
                interceptable: stats.interceptable !== false,
                trail: true
            });
        }
        this.spawnMuzzleFlash(tile, target, { color: '#e8f3ff', size: 1.5, count: 4 });
        this._fireSfx(tile, 'launch_airstrike');
        return true;
    }

    fireGround(tile, projType) {
        const stats = tile.structure.stats;
        const target = this.resolveTarget(tile, stats);
        if (!target) return false;

        tile.structure.lastFiredAt = this.gameTime;
        const count = stats.projectiles || 1;
        for (let i = 0; i < count; i++) {
            this.spawnProjectile(tile, target, {
                type: projType || 'ground',
                damage: stats.damage,
                speed: 3.5,
                interceptable: !!stats.interceptable,
                trail: false
            });
        }
        if (projType === 'militia') {
            // Militia is intentionally cheap — no muzzle flash, quiet SFX.
            this._fireSfx(tile, 'launch_militia');
        } else {
            // Barracks: yellow-white muzzle flash + sharp crack.
            this.spawnMuzzleFlash(tile, target, { color: '#fff0a8', size: 1, count: 4 });
            this._fireSfx(tile, 'launch_barracks');
        }
        return true;
    }

    fireDrone(tile) {
        const stats = tile.structure.stats;
        const target = this.resolveTarget(tile, stats);
        if (!target) return false;

        tile.structure.lastFiredAt = this.gameTime;
        const count = stats.projectiles || 1;
        for (let i = 0; i < count; i++) {
            this.spawnProjectile(tile, target, {
                type: 'drone',
                damage: stats.damage,
                speed: 3.5,
                interceptable: stats.interceptable !== false,
                trail: true
            });
        }
        this.spawnMuzzleFlash(tile, target, { color: '#78c8ff', size: 0.8, count: 3 });
        this._fireSfx(tile, 'launch_drone');
        return true;
    }

    // ========================================================================
    //  PROJECTILES
    // ========================================================================
    spawnProjectile(fromTile, toTile, opts) {
        const startPos = this.grid.hexToPixel(fromTile.q, fromTile.r);
        const endPos   = this.grid.hexToPixel(toTile.q,   toTile.r);
        const atkOwner = opts.owner ?? fromTile.owner;
        let dmg = opts.damage ?? 0;
        if (fromTile?.structure && this._inFriendlyL3BarracksCommandAura(fromTile, atkOwner)) {
            dmg *= GAME_CONFIG.BARRACKS_L3_COMMAND_OUT_MULT;
        }
        this.projectiles.push({
            type: opts.type,
            owner: atkOwner,
            fromQR: { q: fromTile.q, r: fromTile.r },
            x: startPos.x,
            y: startPos.y,
            targetX: endPos.x,
            targetY: endPos.y,
            targetQR: { q: toTile.q, r: toTile.r },
            damage: dmg,
            speed: opts.speed,
            interceptable: opts.interceptable,
            trail: opts.trail,
            trailPts: [],
            color: COLORS[`PLAYER${atkOwner}`]
        });
    }

    updateProjectiles() {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 5) {
                this.impact(p);
                this.projectiles.splice(i, 1);
            } else {
                if (p.trail) {
                    p.trailPts.push({ x: p.x, y: p.y });
                    if (p.trailPts.length > 18) p.trailPts.shift();
                }
                p._prevX = p.x;
                p._prevY = p.y;
                p.x += (dx / dist) * p.speed;
                p.y += (dy / dist) * p.speed;

                if (p.interceptable && this.checkInterception(p)) {
                    this.spawnBurst(p.x, p.y, "#00e5ff", 8);
                    SFX.play('intercept');
                    this.logEvent(p.owner, null, 'intercepted', `${p.type} intercepted`);
                    this.projectiles.splice(i, 1);
                }
            }
        }
    }

    checkInterception(proj) {
        this._ensureIndex();
        if (this._aasTiles.length === 0) return false;

        const prevX = proj._prevX ?? proj.x;
        const prevY = proj._prevY ?? proj.y;
        const dx = proj.x - prevX;
        const dy = proj.y - prevY;
        const moveDist = Math.sqrt(dx * dx + dy * dy);

        const steps = Math.max(1, Math.ceil(moveDist / (this.grid.hexSize * 0.5)));

        for (let s = 0; s <= steps; s++) {
            const t = steps === 0 ? 1 : s / steps;
            const sx = prevX + dx * t;
            const sy = prevY + dy * t;
            const hex = this.grid.pixelToHex(sx, sy);

            const eligible = [];
            for (const tile of this._aasTiles) {
                if (!tile.owner || tile.owner === proj.owner) continue;
                if (this.areAllied(tile.owner, proj.owner)) continue;
                if (tile.contested) continue;
                if ((tile.structure.charge || 0) <= 0) continue;

                const range = tile.structure.stats.range;
                if (Hex.distance(hex, tile) <= range) eligible.push(tile);
            }
            if (eligible.length === 0) continue;

            let best = eligible[0];
            let bestD = Hex.distance(best, hex);
            for (let i = 1; i < eligible.length; i++) {
                const tile = eligible[i];
                const d = Hex.distance(tile, hex);
                if (d < bestD) {
                    best = tile;
                    bestD = d;
                } else if (d === bestD) {
                    if (tile.q < best.q || (tile.q === best.q && tile.r < best.r)) {
                        best = tile;
                    }
                }
            }
            best.structure.charge--;
            const interceptor = best.owner ? this.players[best.owner - 1] : null;
            if (interceptor?.stats) interceptor.stats.missilesIntercepted++;
            return true;
        }
        return false;
    }

    impact(proj) {
        const tile = this.grid.getTile(proj.targetQR.q, proj.targetQR.r);

        // Tier the visual/audio weight of the impact by projectile type.
        const IMPACT_TIER = {
            rocket:    { burst: 18, color: '#ffb060', shake: 4, sfx: 'impact_big'   },
            airstrike: { burst: 22, color: '#ffe9c0', shake: 5, sfx: 'impact_big'   },
            drone:     { burst: 7,  color: '#78c8ff', shake: 1, sfx: 'impact_small' },
            ground:    { burst: 5,  color: '#fff0a0', shake: 1, sfx: 'impact_small' },
            militia:   { burst: 4,  color: '#ffe680', shake: 0, sfx: 'impact_small' },
        };
        const tier = IMPACT_TIER[proj.type] || IMPACT_TIER.ground;
        this.spawnBurst(proj.targetX, proj.targetY, tier.color, tier.burst);
        this.screenShake = Math.min(10, this.screenShake + tier.shake);
        if (tile && this._humanSees(tile)) SFX.play(tier.sfx);

        if (tile && tile.structure && this.areAllied(tile.owner, proj.owner)) {
            return;
        }

        if (tile && tile.structure) {
            let dmg = proj.damage;
            if (this._inFriendlyL3BarracksCommandAura(tile, tile.owner)) {
                dmg *= GAME_CONFIG.BARRACKS_L3_COMMAND_IN_MULT;
            }
            tile.hp -= dmg;
            tile.lastDamageTime = this.gameTime;

            const attacker = this.players[proj.owner - 1];
            const defender = this.players[tile.owner - 1];
            if (attacker) attacker.stats.damageDealt += dmg;
            if (defender) defender.stats.damageTaken += dmg;

            if (tile.owner === this.humanId && proj.owner !== this.humanId) {
                this.pushEvent({ kind: 'hit', tile: { q: tile.q, r: tile.r }, t: this.gameTime });
                this.lastOwnDamageTile = { q: tile.q, r: tile.r };
            }

            const structName = UNIT_STATS[tile.structure.type]?.name || tile.structure.type;
            this.logEvent(proj.owner, tile.owner, 'hit', `${proj.type} hit ${structName} (-${Math.round(dmg * 10) / 10} HP)`);

            if (tile.hp <= 0) this.destroyStructure(tile, proj.owner);
        }
    }

    // ========================================================================
    //  PARTICLES
    // ========================================================================
    spawnBurst(x, y, color, n = 10) {
        for (let i = 0; i < n; i++) {
            if (this.particles.length >= GAME_CONFIG.MAX_PARTICLES) {
                this.particles.shift();
            }
            const a = Math.random() * Math.PI * 2;
            const sp = 0.8 + Math.random() * 2.4;
            this.particles.push({
                x, y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp,
                life: 25 + Math.random() * 20,
                age: 0,
                color
            });
        }
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vx *= 0.94; p.vy *= 0.94;
            p.age++;
            if (p.age >= p.life) this.particles.splice(i, 1);
        }
    }

    pushEvent(ev) {
        this.events.push(ev);
        if (this.events.length > 40) this.events.shift();
    }
    pruneEvents() {
        this.events = this.events.filter(e => this.gameTime - e.t < 3500);
    }

    // ========================================================================
    //  COMBAT LOG (persistent, separate from transient events)
    // ========================================================================
    logEvent(attackerId, defenderId, kind, message) {
        const entry = {
            t: this.gameTime,
            attackerId,
            defenderId,
            kind,
            message,
        };
        this.combatLog.push(entry);
        if (this.combatLog.length > 200) this.combatLog.shift();
    }

    // ========================================================================
    //  BUILD / DESTROY / DEMOLISH
    // ========================================================================
    buildStructure(tile, type, ownerId, levelIdx = 0, free = false) {
        const p = this.players[ownerId - 1];
        if (!p) return false;
        if (tile.contested) return false;
        if (!tile.buildable) return false;

        const def = UNIT_STATS[type];
        const stats = Array.isArray(def?.levels) ? def.levels[levelIdx] : def;
        if (!stats) return false;
        if (tile.structure) return false;

        const isOwn     = tile.owner === ownerId;
        const isNeutral = tile.owner == null;

        if (type === 'M') {
            if (!this.isVisibleTo(tile, ownerId)) return false;
            if (!isOwn && !isNeutral) return false;
        } else {
            if (!isOwn) return false;
        }
        if (!free && p.gold < stats.cost) return false;
        if (type === 'M') {
            const cap = this.militiaCap(p);
            if (p.units.M >= cap) return false;
        }

        if (!free) {
            p.gold -= stats.cost;
            p.stats.goldSpent += stats.cost;
        }
        // AAS starts with 0 charge — it needs BUILD_COOLDOWNS.AAS ms before its first recharge.
        tile.structure = { type, level: levelIdx, stats, charge: 0, target: null, lastFiredAt: 0 };
        tile.owner = ownerId;
        tile.hp = stats.hp || 100;
        tile.maxHp = tile.hp;

        // Apply initial build cooldown: offset lastAction so the first action fires at T + cooldown.
        const buildCooldown = GAME_CONFIG.BUILD_COOLDOWNS[type] ?? 0;
        const structInterval =
            type === 'MF'  ? (stats.produceInterval  || 10000) :
            type === 'AAS' ? (stats.rechargeInterval  || 12000) :
                             (stats.interval          || 10000);
        tile.lastAction = this.gameTime + (buildCooldown - structInterval);

        // Store cooldown window so the renderer can draw a "warming up" arc.
        if (buildCooldown > 0) {
            tile.buildCooldownStart = this.gameTime;
            tile.buildCooldownUntil = this.gameTime + buildCooldown;
        } else {
            tile.buildCooldownStart = 0;
            tile.buildCooldownUntil = 0;
        }

        tile.lastDamageTime = 0;
        tile.contested = false;

        if (type === 'G' && !free) {
            tile.govWarmupUntil = this.gameTime + GAME_CONFIG.GOV_WARMUP_MS;
        }

        if (type === 'M') p.units.M++;

        p.stats.structuresBuilt++;
        this.logEvent(ownerId, null, 'build', `Built ${def.name}`);
        this._markStructuresDirty();
        this.updateBorders();
        return true;
    }

    destroyStructure(tile, attackerId = null, isDemolish = false) {
        if (tile.structure) {
            const p = this.players[tile.owner - 1];
            const t = tile.structure.type;
            if (p && t === 'M' && !tile.structure._wasMilitiaGov) {
                p.units.M = Math.max(0, p.units.M - 1);
            }

            if (p && !isDemolish) p.stats.structuresLost++;
            if (attackerId && attackerId !== tile.owner) {
                const attacker = this.players[attackerId - 1];
                if (attacker) attacker.stats.structuresDestroyed++;
            }

            const structName = UNIT_STATS[t]?.name || t;
            this.logEvent(attackerId, tile.owner, 'kill', `${structName} destroyed`);

            if (tile.owner === this.humanId) {
                this.lastOwnDamageTile = { q: tile.q, r: tile.r };
            }

            tile.structure = null;
            tile.hp = 0;
            tile.maxHp = 0;

            if (this.selectedTile === tile) this.selectedTile = null;
            this._markStructuresDirty();
        }
        this.updateBorders();
    }

    demolishStructure(tile, ownerId) {
        if (!tile.structure || tile.owner !== ownerId) return false;
        const type = tile.structure.type;
        const def = UNIT_STATS[type];
        if (!def) return false;

        let totalCost = def.levels[0]?.cost || 0;
        for (let i = 1; i <= tile.structure.level; i++) {
            totalCost += Math.floor((def.levels[i]?.cost || 0) * GAME_CONFIG.UPGRADE_COST_MULT);
        }
        const refund = Math.floor(totalCost * GAME_CONFIG.DEMOLISH_REFUND_MULT);
        const p = this.players[ownerId - 1];
        if (p) {
            p.gold += refund;
            p.stats.goldEarned += refund;
        }

        this.logEvent(ownerId, null, 'demolish', `Demolished ${def.name} (+$${refund})`);
        this.destroyStructure(tile, ownerId, true);
        return refund;
    }

    upgradeStructure(tile) {
        if (!tile.structure) return false;
        const type = tile.structure.type;
        const def = UNIT_STATS[type];
        const nextLevel = def?.levels?.[tile.structure.level + 1];
        if (!nextLevel) return false;

        const upgradeCost = Math.floor(nextLevel.cost * GAME_CONFIG.UPGRADE_COST_MULT);
        const p = this.players[tile.owner - 1];
        if (!p || p.gold < upgradeCost) return false;

        p.gold -= upgradeCost;
        p.stats.goldSpent += upgradeCost;

        const prevMaxHp = tile.maxHp;
        const prevHp = tile.hp;
        const prevLevelStats = def.levels[tile.structure.level];

        tile.structure.level++;
        tile.structure.stats = { ...nextLevel };

        const newMaxHp = nextLevel.hp || prevMaxHp;
        tile.maxHp = newMaxHp;
        const hpGain = Math.max(0, newMaxHp - prevMaxHp);
        tile.hp = Math.min(newMaxHp, (prevHp ?? 0) + hpGain);

        const newStats = tile.structure.stats;
        const newInterval =
            type === 'MF'  ? (newStats.produceInterval  || 10000) :
            type === 'AAS' ? (newStats.rechargeInterval || 12000) :
                             (newStats.interval ?? prevLevelStats?.interval ?? 10000);
        if (tile.buildCooldownUntil && this.gameTime < tile.buildCooldownUntil) {
            const remaining = tile.buildCooldownUntil - this.gameTime;
            const newRemaining = Math.max(0, remaining - 1000);
            if (newRemaining > 0) {
                tile.buildCooldownUntil = this.gameTime + newRemaining;
                tile.lastAction = this.gameTime + (newRemaining - newInterval);
            } else {
                tile.buildCooldownStart = 0;
                tile.buildCooldownUntil = 0;
                tile.lastAction = this.gameTime - newInterval;
            }
        }

        if (tile.structure.type === 'M' && nextLevel.transformsToGov) {
            tile.structure.target = null;
            if (p) p.units.M = Math.max(0, p.units.M - 1);
            tile.structure._wasMilitiaGov = true;
        }

        this.logEvent(tile.owner, null, 'upgrade', `Upgraded ${def.name} to Lv${tile.structure.level + 1}`);
        this._markStructuresDirty();
        this.updateBorders();
        return true;
    }

    upgradeAll(ownerId) {
        const candidates = [];
        for (const tile of this.grid.tiles.values()) {
            if (tile.owner !== ownerId || !tile.structure) continue;
            const def = UNIT_STATS[tile.structure.type];
            const next = def?.levels?.[tile.structure.level + 1];
            if (!next) continue;
            const cost = Math.floor(next.cost * GAME_CONFIG.UPGRADE_COST_MULT);
            candidates.push({ tile, cost });
        }
        candidates.sort((a, b) => a.cost - b.cost);

        let upgraded = 0;
        for (const { tile } of candidates) {
            if (this.upgradeStructure(tile)) upgraded++;
        }
        return upgraded;
    }

    setAssignedTarget(tile, targetTile) {
        if (!tile?.structure || !ATTACK_TYPES.has(tile.structure.type)) return false;
        const stats = tile.structure.stats;
        if (!stats.damage || !stats.range) return false;
        if (targetTile && this.areAllied(tile.owner, targetTile.owner)) return false;
        tile.structure.target = targetTile ? { q: targetTile.q, r: targetTile.r } : null;
        return true;
    }
    clearAssignedTarget(tile) {
        if (tile?.structure) tile.structure.target = null;
    }

    // ========================================================================
    //  TERRITORY — additive influence with 1/(radius+1) falloff
    // ========================================================================
    updateBorders() {
        const sources = [];
        for (const tile of this.grid.tiles.values()) {
            if (!isInfluencer(tile.structure)) continue;
            const stats = tile.structure.stats;
            const effectiveRadius = tile.structure._lockedRadius ?? stats.radius ?? 0;
            sources.push({
                tile,
                owner: tile.owner,
                influence: stats.influence || 0,
                radius: effectiveRadius
            });
        }

        for (const tile of this.grid.tiles.values()) {
            if (!tile.buildable) continue;
            if (tile.structure) {
                // Structures can sit on contested tiles — evaluate them too
            }

            let best = null, bestScore = 0, secondScore = 0;
            const scoresByPlayer = {};
            for (const src of sources) {
                const d = Hex.distance(tile, src.tile);
                if (d > src.radius) continue;
                const falloff = Math.max(0, 1 - d / (src.radius + 1));
                if (falloff <= 0) continue;
                scoresByPlayer[src.owner] = (scoresByPlayer[src.owner] || 0) + src.influence * falloff;
            }

            const entries = Object.entries(scoresByPlayer);
            for (const [pidStr, score] of entries) {
                const pid = +pidStr;
                if (score > bestScore) {
                    secondScore = bestScore;
                    best = pid;
                    bestScore = score;
                } else if (score > secondScore) {
                    secondScore = score;
                }
            }

            const epsilon = GAME_CONFIG.CONTESTED_EPSILON;
            const isTied = entries.length >= 2 && bestScore > 0 &&
                           (bestScore - secondScore) / bestScore < epsilon;

            if (bestScore <= 0) {
                tile.owner = tile.structure ? tile.owner : null;
                tile.contested = false;
            } else if (isTied) {
                tile.owner = tile.structure ? tile.owner : null;
                tile.contested = true;
            } else {
                if (!tile.structure) {
                    tile.owner = best;
                }
                tile.contested = false;
            }
        }
    }

    // ========================================================================
    //  VICTORY
    // ========================================================================
    checkVictory() {
        const mode = this.victoryConfig.mode;
        this._ensureIndex();

        for (const p of this.players) {
            if (this.defeated.has(p.id)) continue;
            const hasGov = (this._govCount[p.id - 1] || 0) > 0;
            if (!hasGov && p.tileCount === 0) this.defeated.add(p.id);
        }

        const alive = this.players.filter(p => !this.defeated.has(p.id));
        if (alive.length === 1) {
            this.winner = alive[0].id;
            return;
        }

        if (alive.length >= 2 && this._allSurvivorsAllied(alive)) {
            this.coWinners = alive.map(p => p.id).sort((a, b) => a - b);
            this.winner = this.coWinners[0];
            return;
        }

        if (mode === 'conquest') {
            return;
        }

        if (mode === 'domination') {
            const pct = this.victoryConfig.param || 0.60;
            const landCount = this._landTileCountForVictory();
            for (const p of this.players) {
                if (this.defeated.has(p.id)) continue;
                if (p.tileCount / landCount >= pct) {
                    this.winner = p.id;
                    return;
                }
            }
        }

        if (mode === 'regime_change') {
            for (const p of this.players) {
                if (this.defeated.has(p.id)) continue;
                const allRivalsNoGov = this.players
                    .filter(r => r.id !== p.id && !this.defeated.has(r.id))
                    .every(r => (this._govCount[r.id - 1] || 0) === 0);
                if (allRivalsNoGov) {
                    this.winner = p.id;
                    return;
                }
            }
        }

        if (mode === 'blitz') {
            const threshold = this.victoryConfig.param || 25;
            for (const p of this.players) {
                if (this.defeated.has(p.id)) continue;
                if (p.stats.structuresDestroyed >= threshold) {
                    this.winner = p.id;
                    return;
                }
            }
        }

        if (mode === 'last_stand') {
            const targetMs = (this.victoryConfig.param || 10) * 60 * 1000;
            if (this.gameTime - this.startTime >= targetMs) {
                if (!this.defeated.has(this.humanId)) {
                    const hasGov = (this._govCount[this.humanId - 1] || 0) > 0;
                    if (hasGov) {
                        this.winner = this.humanId;
                        return;
                    }
                }
            }
        }
    }

    _allSurvivorsAllied(alive) {
        if (!this.diplomacyEnabled) return false;
        if (alive.length < 2) return false;
        for (let i = 0; i < alive.length; i++) {
            for (let j = i + 1; j < alive.length; j++) {
                if (!this.areAllied(alive[i].id, alive[j].id)) return false;
            }
        }
        return true;
    }
}
