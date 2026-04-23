import { UNIT_STATS, COLORS, GAME_CONFIG, DIFFICULTY, DIPLOMACY, govGoldForDistance } from './constants.js?v=balance2026';
import { Hex } from './hexGrid.js?v=balance2026';
import { SFX } from './sfx.js?v=balance2026';

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

const ATTACK_TYPES = new Set(['RL', 'B', 'D', 'M', 'AB', 'DDG', 'SSG']);
/** Structures that may be placed on owned water only (see `canBuildNavyOn`). */
const NAVY_BUILD_TYPES = new Set();
['DDG', 'AF', 'SSG'].forEach(t => NAVY_BUILD_TYPES.add(t));

function isInfluencer(structure) {
    if (!structure) return false;
    if (structure.type === 'G') return true;
    if (structure.type === 'B') return true;
    // M3 Militia HQ acts as a mini-influencer (has radius & influence stats)
    if (structure.type === 'M' && structure.stats?.radius) return true;
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
        /** Refcount: enemy projectiles inbound to each human-owned hex (for UI threat rings without scanning all missiles). */
        this._incomingThreatHumanRef = new Map();
        /** Keys in `_incomingThreatHumanRef` with count ≥ 1 — renderer iterates this instead of all projectiles. */
        this.incomingThreatHumanHexKeys = new Set();
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
        this._l3GovTiles = [];
        this._d3JamTiles = [];
        this._govCount = [];

        // --- Diplomacy ---
        this.diplomacyEnabled = true;
        this.relations = {};           // relKey(a,b) -> { a, b, status, formedAt, lastRequestFrom, lastRequestAt, rejectedBy, rejectedAt }
        this.diploCooldowns = {};      // `${fromId}:${toId}` -> gameTime when they can send again
        this.metPlayers = {};          // playerId -> Set<otherId>
        this.coWinners = null;         // array of playerIds on co-victory
        this.diploEvents = [];         // transient events for UI: {kind, a, b, t}

        /** @type {{ missionId: number, mission: object, freezeEnemyAi?: boolean } | null} */
        this.campaign = null;
    }

    _rebuildStructureIndex() {
        this._aasTiles.length = 0;
        this._govTiles.length = 0;
        this._structureTiles.length = 0;
        this._l3BarracksTiles.length = 0;
        this._l3GovTiles.length = 0;
        this._d3JamTiles.length = 0;
        this._govCount = new Array(this.players.length).fill(0);
        for (const tile of this.grid.tiles.values()) {
            if (!tile.structure) continue;
            this._structureTiles.push(tile);
            if (tile.structure.type === 'AAS' || tile.structure.type === 'AF') this._aasTiles.push(tile);
            if (tile.structure.type === 'B' && tile.structure.level === 2) this._l3BarracksTiles.push(tile);
            if (tile.structure.type === 'G' && tile.structure.level === 2 && tile.owner) this._l3GovTiles.push(tile);
            if (tile.structure.type === 'D' && tile.structure.level === 2 && tile.structure.stats?.jamming) this._d3JamTiles.push(tile);
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

    /** Land or near-shore water (≤3 of land) — count toward economy tileCount, earn Gov/M3 gold. */
    _incomeTileEligible(tile) {
        if (!tile) return false;
        if (tile.buildable) return true;
        return !!tile.shoreIncome;
    }

    /** Open sea (no Gov gold) — any non-buildable tile that is not shore-income. */
    _deepSeaTile(tile) {
        return tile && !tile.buildable && !tile.shoreIncome;
    }

    /** True for water hexes (navy will build on these only, not on land). */
    isSeaTile(tile) {
        return !!(tile && !tile.buildable);
    }

    /**
     * Future navy: place on owned water only (influence-claimed), not contested.
     * When you add a sea unit, call `registerNavyBuildType('N')` from game.js and use that type in build.
     */
    canBuildNavyOn(tile, ownerId) {
        if (!this.isSeaTile(tile) || !ownerId) return false;
        if (tile.contested) return false;
        return tile.owner === ownerId;
    }

    _buildGovGoldSources() {
        const out = [];
        for (const tile of this.grid.tiles.values()) {
            if (!tile.owner || tile.contested) continue;
            const s = tile.structure;
            if (!s) continue;
            const isGov = s.type === 'G';
            const isMilitiaHQ = s.type === 'M' && s.stats?.radius && s.stats?.goldPerTile;
            if (!isGov && !isMilitiaHQ) continue;
            if (isGov && tile.govWarmupUntil && this.gameTime < tile.govWarmupUntil) continue;
            const r = s._lockedRadius ?? s.stats.radius;
            if (isGov) {
                out.push({ kind: 'G', tile, owner: tile.owner, radius: r, level: s.level });
            } else {
                out.push({ kind: 'M', tile, owner: tile.owner, radius: r, mGold: s.stats.goldPerTile || 0 });
            }
        }
        return out;
    }

    /** $/s the tile owner would earn from Gov/M3 overlap (includes AI income mult + G3 aura if applicable). */
    previewGoldPerSecOnTile(tile) {
        if (!this._incomeTileEligible(tile) || tile.contested) return 0;
        if (!tile.owner) return 0;
        return this._stackedTileGovIncome(tile, this._buildGovGoldSources());
    }

    _stackedTileGovIncome(tile, sources) {
        if (!tile.owner) return 0;
        if (tile.contested) return 0;
        const isAi = tile.owner !== this.humanId;
        const mult = isAi ? (this._difficulty || DIFFICULTY.normal).goldMult : 1;
        const effs = [];
        for (const g of sources) {
            if (g.owner !== tile.owner) continue;
            const d = Hex.distance(tile, g.tile);
            if (d > g.radius) continue;
            const rate = g.kind === 'M' ? g.mGold : govGoldForDistance(g.level, d);
            if (rate > 0) effs.push(rate);
        }
        if (effs.length === 0) return 0;
        effs.sort((a, b) => b - a);
        let bonus = 0;
        for (let i = 0; i < effs.length; i++) bonus += effs[i] / (2 ** i);
        bonus *= mult;
        if (bonus > 0 && this._inFriendlyG3GoldAura(tile, tile.owner)) {
            bonus *= GAME_CONFIG.GOV_L3_GOLD_AURA_MULT;
        }
        return bonus;
    }

    /** Owned land tile earning gov gold: within a friendly Lv3 Government radius (non-stacking mult in tick). */
    _inFriendlyG3GoldAura(tile, ownerId) {
        if (!tile || !ownerId) return false;
        this._ensureIndex();
        for (const gTile of this._l3GovTiles) {
            if (gTile.owner !== ownerId) continue;
            const s = gTile.structure;
            const r = s._lockedRadius ?? s.stats.radius ?? 0;
            if (Hex.distance(tile, gTile) <= r) return true;
        }
        return false;
    }

    /** Enemy Lv3 Drone in range slows this structure's fire/recharge (RL, AB, B, M, D, AAS). */
    _enemyDroneL3Slows(tile) {
        if (!tile?.structure) return false;
        const t = tile.structure.type;
        if (t !== 'RL' && t !== 'AB' && t !== 'B' && t !== 'M' && t !== 'D' && t !== 'AAS' && t !== 'DDG' && t !== 'SSG' && t !== 'AF') return false;
        const owner = tile.owner;
        if (!owner) return false;
        this._ensureIndex();
        for (const dTile of this._d3JamTiles) {
            if (!dTile.owner || dTile.owner === owner) continue;
            if (this.areAllied(dTile.owner, owner)) continue;
            const r = dTile.structure.stats.range ?? 0;
            if (Hex.distance(tile, dTile) <= r) return true;
        }
        return false;
    }

    /** Non–MF3 factory tile adjacent to a different friendly MF3 gets production mult (used in MF tick). */
    _mfNeighborOfFriendlyMF3(tile) {
        const h = new Hex(tile.q, tile.r);
        for (const n of h.getNeighbors()) {
            const nt = this.grid.getTile(n.q, n.r);
            if (!nt?.structure || nt.structure.type !== 'MF' || nt.owner !== tile.owner) continue;
            if (nt.q === tile.q && nt.r === tile.r) continue;
            if (nt.structure.level === 2) return true;
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
        this._incomingThreatHumanRef.clear();
        this.incomingThreatHumanHexKeys.clear();
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
                /** Owned open-sea hexes (excludes shore — those count in tileCount). */
                seaTileCount: 0,
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
                this.buildStructure(tile, 'G', p.id, GAME_CONFIG.STARTER_GOV_LEVEL, true);
                const neighbor = new Hex(tile.q, tile.r).getNeighbors()
                    .map(h => this.grid.getTile(h.q, h.r))
                    .find(t => t && t.buildable && !t.structure);
                if (neighbor) {
                    neighbor.owner = p.id;
                    this.buildStructure(neighbor, 'MF', p.id, 0, true, true);
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
        const seaCounts = new Array(this.players.length).fill(0);
        const goldRates = new Array(this.players.length).fill(0);

        const govSources = this._buildGovGoldSources();

        for (const tile of this.grid.tiles.values()) {
            if (tile.contested) continue;
            if (!tile.owner) continue;
            const oi = tile.owner - 1;
            if (this._incomeTileEligible(tile)) {
                counts[oi]++;
                const bonus = this._stackedTileGovIncome(tile, govSources);
                if (bonus > 0) {
                    this.players[oi].gold += bonus;
                    this.players[oi].stats.goldEarned += bonus;
                    goldRates[oi] += bonus;
                }
            } else if (this._deepSeaTile(tile)) {
                seaCounts[oi]++;
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
            p.seaTileCount = seaCounts[i];
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

        const btF = this.campaign?.buildTutorial;
        if (btF?.active && btF.prematureFogReveal && Array.isArray(btF.seedHexes) && this.humanId) {
            const human = this.players[this.humanId - 1];
            if (human) {
                const R = typeof btF.revealRadius === 'number' ? btF.revealRadius : 7;
                for (const s of btF.seedHexes) {
                    for (let dq = -R; dq <= R; dq++) {
                        for (let dr = Math.max(-R, -dq - R); dr <= Math.min(R, -dq + R); dr++) {
                            const key = `${s.q + dq},${s.r + dr}`;
                            if (this.grid.tiles.has(key)) {
                                human.fogVisible.add(key);
                                human.fogExplored.add(key);
                            }
                        }
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
        if (this._enemyDroneL3Slows(tile)) mul *= GAME_CONFIG.DRONE_L3_RECHARGE_DEBUFF_MULT;
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
            if (s.type === 'RL' || s.type === 'AB' || s.type === 'DDG' || s.type === 'SSG') continue;

            const stats = s.stats;
            const p = this.players[tile.owner - 1];
            const eff = this.effFor(tile);

            if (s.type === 'MF') {
                if (time - tile.lastAction > stats.produceInterval * eff) {
                    let prodMult = GAME_CONFIG.MF_GLOBAL_PRODUCTION_MULT;
                    if (tile.structure.level !== 2 && this._mfNeighborOfFriendlyMF3(tile)) {
                        prodMult *= GAME_CONFIG.MF_L3_NEIGHBOR_PRODUCTION_MULT;
                    }
                    p.missiles += Math.floor(stats.missilesProduced * prodMult);
                    tile.lastAction = time;
                }
                continue;
            }
            if (s.type === 'AAS' || s.type === 'AF') {
                if (time - tile.lastAction > stats.rechargeInterval * eff) {
                    let add = stats.missilesRecharged;
                    if (s.type === 'AAS' && tile.structure.level === 2 && Math.random() < GAME_CONFIG.AAS_L3_BONUS_RECHARGE_CHANCE) {
                        add += 1;
                    }
                    s.charge = Math.min(stats.chargeCap || 10, (s.charge || 0) + add);
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
            if (s.type !== 'RL' && s.type !== 'AB' && s.type !== 'DDG' && s.type !== 'SSG') continue;
            const stats = s.stats;
            const p = this.players[tile.owner - 1];
            const eff = this.effFor(tile);
            if (time - tile.lastAction <= stats.interval * eff) continue;
            const minMissiles = (s.type === 'AB' && tile.structure.level === 2)
                ? Math.min(GAME_CONFIG.AB_L3_STEALTH_MISSILES, stats.missilesPerShot)
                : stats.missilesPerShot;
            if (p.missiles < minMissiles) continue;
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
            this._autoTargetAllocMap = new Map();
            let order = entries;
            if (this._missileSmartPlayers?.has(pid)) {
                const inc = this._incomingShooterKeysForDefender(pid);
                order = [...entries].sort((a, b) => {
                    const ta = this.resolveTarget(a.tile, a.tile.structure.stats, { missileSmart: true, allocMap: null });
                    const tb = this.resolveTarget(b.tile, b.tile.structure.stats, { missileSmart: true, allocMap: null });
                    const pa = ta ? this.missileTargetPriority(pid, ta, inc, a.tile) : -Infinity;
                    const pb = tb ? this.missileTargetPriority(pid, tb, inc, b.tile) : -Infinity;
                    if (pb !== pa) return pb - pa;
                    if (a.tile.q !== b.tile.q) return a.tile.q - b.tile.q;
                    return a.tile.r - b.tile.r;
                });
            }
            for (const { tile, eff } of order) {
                const stats = tile.structure.stats;
                const s = tile.structure;
                if (time - tile.lastAction <= stats.interval * eff) continue;
                const minM = (s.type === 'AB' && tile.structure.level === 2)
                    ? Math.min(GAME_CONFIG.AB_L3_STEALTH_MISSILES, stats.missilesPerShot)
                    : stats.missilesPerShot;
                if (p.missiles < minM) continue;
                if (s.type === 'RL') {
                    if (this.fireRocket(tile)) tile.lastAction = time;
                } else if (s.type === 'AB') {
                    if (this.fireAirBase(tile)) tile.lastAction = time;
                } else if (s.type === 'DDG') {
                    if (this.fireNavyDDG(tile)) tile.lastAction = time;
                } else if (s.type === 'SSG') {
                    if (this.fireNavySSG(tile)) tile.lastAction = time;
                }
            }
            this._autoTargetAllocMap = null;
        }

        this._missileSmartPlayers = null;
    }

    // ========================================================================
    //  TARGETING — scored: missile-smart stack, distance, struct class, HP spread/finish, peers, layer
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
        if (t === 'DDG') return 'navy';
        if (t === 'SSG') return 'cruise';
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
     * @param {object} [sourceTile] optional launcher — navy-first / land deprioritization
     */
    missileTargetPriority(defenderId, targetTile, incomingShooterKeys, sourceTile) {
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
        } else if (t === 'AAS' || t === 'AF' || t === 'MF') {
            score = 100_000;
        } else if (t === 'G') {
            score = 500_000;
        } else if (t === 'RL' || t === 'AB' || t === 'D' || t === 'B' || (t === 'M' && st?.damage) || t === 'DDG' || t === 'SSG') {
            score = 2_000_000 + dps * 1000;
        } else {
            score = 400_000 + dps;
        }
        if (sourceTile?.structure) {
            const s = sourceTile.structure;
            const stType = s.type;
            const o = sourceTile.owner;
            if ((stType === 'DDG' || stType === 'SSG') && this._enemyNavyOnSeaForOwner(targetTile, o)) {
                score += GAME_CONFIG.NAVY_FIRST_TARGET_BONUS;
            }
            if ((stType === 'RL' || stType === 'AB') && sourceTile.buildable
                && this._enemyNavyOnSeaForOwner(targetTile, o)
                && !this._navyWithinHexesOfMyLand(targetTile, o, GAME_CONFIG.NAVY_COASTAL_LAND_EXCEPT_HEX)) {
                score -= GAME_CONFIG.NAVY_LAND_DEPRIOR_PENALTY;
            }
        }
        return score + (recent ? recentBonus : 0);
    }

    _enemyNavyOnSeaForOwner(targetTile, attackerOwner) {
        if (!targetTile?.structure) return false;
        if (targetTile.buildable) return false;
        if (!NAVY_BUILD_TYPES.has(targetTile.structure.type)) return false;
        if (targetTile.owner == null) return false;
        if (targetTile.owner === attackerOwner || this.areAllied(targetTile.owner, attackerOwner)) return false;
        return true;
    }

    _navyWithinHexesOfMyLand(navyTile, myOwnerId, maxD) {
        for (const t of this.grid.tiles.values()) {
            if (t.owner !== myOwnerId || !t.buildable) continue;
            if (Hex.distance(navyTile, t) <= maxD) return true;
        }
        return false;
    }

    /** 'land' | 'sea' — for future navy: navy types, explicit stats, or water hex. */
    _autoTargetLayerKey(tile) {
        const s = tile?.structure;
        if (s?.stats?.autoTargetLayer === 'sea' || s?.stats?.autoTargetLayer === 'land') {
            return s.stats.autoTargetLayer;
        }
        if (s && NAVY_BUILD_TYPES.has(s.type)) return 'sea';
        if (tile && !tile.buildable) return 'sea';
        return 'land';
    }

    _autoTargetLayerScore(sKey, tKey) {
        const L = GAME_CONFIG.AUTO_TARGET_LAYER || {};
        if (sKey === tKey) return L.SAME_LAYER_BONUS ?? 0;
        if (sKey === 'land' && tKey === 'sea') return L.LAND_TO_SEA_PENALTY ?? 0;
        if (sKey === 'sea' && tKey === 'land') return L.SEA_TO_LAND_PENALTY ?? 0;
        return 0;
    }

    _structWeightForSource(sourceType, targetType) {
        const bySrc = GAME_CONFIG.AUTO_TARGET_STRUCT_WEIGHT_BY_SOURCE;
        if (bySrc && typeof bySrc[sourceType] === 'object' && bySrc[sourceType] != null) {
            const w = bySrc[sourceType][targetType];
            if (typeof w === 'number') return w;
        }
        return GAME_CONFIG.AUTO_TARGET_STRUCT_WEIGHT?.[targetType] ?? 0;
    }

    _countPeersSameTypeToHex(ownerId, srcType, hexKey, allocMap, sourceTile) {
        let n = 0;
        if (allocMap) {
            const v = allocMap.get(`${srcType}:${hexKey}`);
            if (v) n += v;
        }
        for (const t of this._structureTiles) {
            if (t.owner !== ownerId) continue;
            if (!t.structure || t.structure.type !== srcType) continue;
            if (t === sourceTile) continue;
            const tg = t.structure.target;
            if (tg && `${tg.q},${tg.r}` === hexKey) n++;
        }
        return n;
    }

    _autoTargetCandidateScore(source, c, dMin, sourceOwner, missileSmart, inc, allocMap) {
        const cfg = GAME_CONFIG.AUTO_TARGET_SCORE || {};
        const distW = typeof cfg.DIST_PER_HEX === 'number' ? cfg.DIST_PER_HEX : 0;
        const stMult = typeof cfg.STRUCT_MULT === 'number' ? cfg.STRUCT_MULT : 100;
        const finish = typeof cfg.FINISH_LOW_HPRATIO === 'number' ? cfg.FINISH_LOW_HPRATIO : 0;
        const fullSpread = typeof cfg.FULL_HP_SPREAD === 'number' ? cfg.FULL_HP_SPREAD : 0;
        const peerPen = typeof cfg.PEER_SAME_TYPE === 'number' ? cfg.PEER_SAME_TYPE : 0;

        let s = 0;
        if (missileSmart && inc) {
            s += this.missileTargetPriority(sourceOwner, c.tile, inc, source);
        }
        s += (dMin - c.d) * distW;

        const st = source?.structure;
        const srcT = st?.type;
        const tgtT = c.tile.structure?.type;
        if (srcT && tgtT) s += this._structWeightForSource(srcT, tgtT) * stMult;

        const maxHp = c.tile.maxHp || 0;
        const hpR = maxHp > 0 ? c.tile.hp / maxHp : 1;
        s += finish * (1 - Math.min(1, Math.max(0, hpR)));
        if (hpR >= 0.999) s += fullSpread;

        const hKey = `${c.tile.q},${c.tile.r}`;
        if (srcT && peerPen) {
            const peer = this._countPeersSameTypeToHex(
                sourceOwner, srcT, hKey, allocMap, source
            );
            s -= peer * peerPen;
        }
        const sk0 = this._autoTargetLayerKey(source);
        const tk0 = this._autoTargetLayerKey(c.tile);
        const L = GAME_CONFIG.AUTO_TARGET_LAYER || {};
        s += this._autoTargetLayerScore(sk0, tk0);
        if (sk0 === 'land' && tk0 === 'sea' && this._enemyNavyOnSeaForOwner(c.tile, sourceOwner)
            && this._navyWithinHexesOfMyLand(c.tile, sourceOwner, GAME_CONFIG.NAVY_COASTAL_LAND_EXCEPT_HEX)) {
            s -= (L.LAND_TO_SEA_PENALTY ?? 0);
        }
        const sType = st?.type;
        if ((sType === 'DDG' || sType === 'SSG') && (c.tile.navyIlluminatedUntil | 0) > this.gameTime) {
            s += (GAME_CONFIG.NAVY_ILLUM_TIE_BONUS || 0) * stMult;
        }

        return s;
    }

    _pickByAutoTargetScore(source, cands, sourceOwner, missileSmart, inc, allocMap) {
        if (!cands.length) return null;
        const dMin = Math.min(...cands.map(c => c.d));
        let best = cands[0];
        let bestS = this._autoTargetCandidateScore(source, best, dMin, sourceOwner, missileSmart, inc, allocMap);
        for (let i = 1; i < cands.length; i++) {
            const sc = this._autoTargetCandidateScore(source, cands[i], dMin, sourceOwner, missileSmart, inc, allocMap);
            if (sc > bestS) {
                bestS = sc;
                best = cands[i];
            } else if (sc === bestS) {
                const t = cands[i].tile, o = best.tile;
                if (t.q < o.q || (t.q === o.q && t.r < o.r)) best = cands[i];
            }
        }
        return best.tile;
    }

    _resolveTargetWithFlags(tile, stats, opts = {}) {
        const assigned = tile.structure?.target;
        if (assigned) {
            const live = this.grid.getTile(assigned.q, assigned.r);
            if (live) {
                const d = Hex.distance(tile, live);
                if (d <= stats.range && live.owner !== tile.owner && live.structure && !this.areAllied(live.owner, tile.owner)) {
                    return { target: live, fromManual: true };
                }
            }
        }
        return {
            target: this.autoTarget(tile, stats.range, opts),
            fromManual: false,
        };
    }

    resolveTarget(tile, stats, opts = {}) {
        return this._resolveTargetWithFlags(tile, stats, opts).target;
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
        const allocMap = opts.allocMap ?? null;
        const sourceOwner = source.owner;

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
            return this._pickByAutoTargetScore(source, preferred, sourceOwner, missileSmart, inc, allocMap);
        }

        const allowFallback =
            !GAME_CONFIG.AUTO_TARGET_USE_PENDING_DAMAGE || GAME_CONFIG.AUTO_TARGET_FALLBACK_WHEN_ALL_SATURATED;
        if (allowFallback) {
            return this._pickByAutoTargetScore(source, candidates, sourceOwner, missileSmart, inc, allocMap);
        }

        if (!pending) {
            return this._pickByAutoTargetScore(source, candidates, sourceOwner, missileSmart, inc, allocMap);
        }
        const dMin = Math.min(...candidates.map(c => c.d));
        const scored = candidates.map(c => {
            const k = `${c.tile.q},${c.tile.r}`;
            return {
                c,
                p: pending.get(k) || 0,
                s: this._autoTargetCandidateScore(source, c, dMin, sourceOwner, missileSmart, inc, allocMap),
            };
        });
        scored.sort((a, b) => {
            if (a.p !== b.p) return a.p - b.p;
            if (a.s !== b.s) return b.s - a.s;
            if (a.c.tile.q !== b.c.tile.q) return a.c.tile.q - b.c.tile.q;
            return a.c.tile.r - b.c.tile.r;
        });
        return scored[0].c.tile;
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
        const { target, fromManual } = this._resolveTargetWithFlags(tile, stats, {
            missileSmart: true,
            allocMap: this._autoTargetAllocMap,
        });
        if (!target) return false;

        p.missiles -= stats.missilesPerShot;
        tile.structure.lastFiredAt = this.gameTime;
        if (this._autoTargetAllocMap && !fromManual) {
            const k = `${tile.structure.type}:${target.q},${target.r}`;
            this._autoTargetAllocMap.set(k, (this._autoTargetAllocMap.get(k) || 0) + 1);
        }
        const count = stats.projectiles || 1;
        const splash = stats.splash && tile.structure.level === 2
            && Math.random() < GAME_CONFIG.RL_L3_SPLASH_CHANCE;
        for (let i = 0; i < count; i++) {
            this.spawnProjectile(tile, target, {
                type: 'rocket',
                damage: stats.damage,
                speed: 3.0,
                interceptable: stats.interceptable !== false,
                trail: true,
                splash
            });
        }
        this.spawnMuzzleFlash(tile, target, { color: '#ff9130', size: 2, count: 5 });
        this._fireSfx(tile, 'launch_rocket');
        return true;
    }

    fireAirBase(tile) {
        const p = this.players[tile.owner - 1];
        const stats = tile.structure.stats;
        const { target, fromManual } = this._resolveTargetWithFlags(tile, stats, {
            missileSmart: true,
            allocMap: this._autoTargetAllocMap,
        });
        if (!target) return false;

        const isAb3 = tile.structure.type === 'AB' && tile.structure.level === 2;
        const stealth = isAb3 && Math.random() < GAME_CONFIG.AB_L3_STEALTH_CHANCE;
        const missilesCost = stealth ? GAME_CONFIG.AB_L3_STEALTH_MISSILES : stats.missilesPerShot;
        if (p.missiles < missilesCost) return false;

        p.missiles -= missilesCost;
        tile.structure.lastFiredAt = this.gameTime;
        if (this._autoTargetAllocMap && !fromManual) {
            const k = `${tile.structure.type}:${target.q},${target.r}`;
            this._autoTargetAllocMap.set(k, (this._autoTargetAllocMap.get(k) || 0) + 1);
        }
        const count = stats.projectiles || 1;
        for (let i = 0; i < count; i++) {
            this.spawnProjectile(tile, target, {
                type: 'airstrike',
                damage: stats.damage,
                speed: stats.projectileSpeed || 4.5,
                interceptable: stealth ? false : (stats.interceptable !== false),
                trail: true
            });
        }
        this.spawnMuzzleFlash(tile, target, { color: '#e8f3ff', size: 1.5, count: 4 });
        this._fireSfx(tile, 'launch_airstrike');
        return true;
    }

    _otherFriendlyNavyInRangeExcl(fromTile, maxD, ownerId) {
        let n = 0;
        this._ensureIndex();
        for (const t of this._structureTiles) {
            if (t.owner !== ownerId) continue;
            if (t === fromTile) continue;
            if (!t.structure || !NAVY_BUILD_TYPES.has(t.structure.type)) continue;
            if (Hex.distance(fromTile, t) <= maxD) n++;
        }
        return n;
    }

    fireNavyDDG(tile) {
        const p = this.players[tile.owner - 1];
        const s = tile.structure;
        const stats = s.stats;
        const { target, fromManual } = this._resolveTargetWithFlags(tile, stats, {
            missileSmart: true,
            allocMap: this._autoTargetAllocMap,
        });
        if (!target) return false;
        if (p.missiles < stats.missilesPerShot) return false;
        let dmg = stats.damage;
        if (s.type === 'DDG' && tile.structure.level === 2 && stats.cec
            && this._enemyNavyOnSeaForOwner(target, tile.owner)
            && this._otherFriendlyNavyInRangeExcl(tile, 3, tile.owner) > 0) {
            dmg *= GAME_CONFIG.DDG3_CEC_DMG_MULT;
        }
        p.missiles -= stats.missilesPerShot;
        s.lastFiredAt = this.gameTime;
        if (this._autoTargetAllocMap && !fromManual) {
            const k = `${s.type}:${target.q},${target.r}`;
            this._autoTargetAllocMap.set(k, (this._autoTargetAllocMap.get(k) || 0) + 1);
        }
        for (let i = 0; i < (stats.projectiles || 1); i++) {
            this.spawnProjectile(tile, target, {
                type: 'navy',
                damage: dmg,
                speed: 2.9,
                interceptable: stats.interceptable !== false,
                trail: true,
            });
        }
        this.spawnMuzzleFlash(tile, target, { color: '#4aa8c8', size: 1.6, count: 4 });
        this._fireSfx(tile, 'launch_rocket');
        return true;
    }

    fireNavySSG(tile) {
        const p = this.players[tile.owner - 1];
        const s = tile.structure;
        const stats = s.stats;
        const { target, fromManual } = this._resolveTargetWithFlags(tile, stats, {
            missileSmart: true,
            allocMap: this._autoTargetAllocMap,
        });
        if (!target) return false;
        if (p.missiles < stats.missilesPerShot) return false;
        let dmg = stats.damage;
        if (s.type === 'SSG' && tile.structure.level === 2 && stats.bastion
            && this._enemyNavyOnSeaForOwner(target, tile.owner)
            && this._otherFriendlyNavyInRangeExcl(tile, 1, tile.owner) > 0) {
            dmg *= GAME_CONFIG.SSG3_BASTION_DMG_MULT;
        }
        p.missiles -= stats.missilesPerShot;
        s.lastFiredAt = this.gameTime;
        if (this._autoTargetAllocMap && !fromManual) {
            const k = `${s.type}:${target.q},${target.r}`;
            this._autoTargetAllocMap.set(k, (this._autoTargetAllocMap.get(k) || 0) + 1);
        }
        for (let i = 0; i < (stats.projectiles || 1); i++) {
            this.spawnProjectile(tile, target, {
                type: 'cruise',
                damage: dmg,
                speed: stats.projectileSpeed || 4.2,
                interceptable: stats.interceptable !== false,
                trail: true
            });
        }
        this.spawnMuzzleFlash(tile, target, { color: '#7aa0c0', size: 1.2, count: 3 });
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
            splash: !!opts.splash,
            trail: opts.trail,
            trailPts: [],
            color: COLORS[`PLAYER${atkOwner}`]
        });
        this._addIncomingHumanThreat(this.projectiles[this.projectiles.length - 1]);
    }

    _addIncomingHumanThreat(p) {
        if (p.owner === this.humanId) return;
        const tile = this.grid.getTile(p.targetQR.q, p.targetQR.r);
        if (!tile || tile.owner !== this.humanId) return;
        const k = `${p.targetQR.q},${p.targetQR.r}`;
        const n = (this._incomingThreatHumanRef.get(k) || 0) + 1;
        this._incomingThreatHumanRef.set(k, n);
        if (n === 1) this.incomingThreatHumanHexKeys.add(k);
        p._threatTrackedHuman = true;
    }

    _removeIncomingHumanThreat(p) {
        if (!p._threatTrackedHuman) return;
        const k = `${p.targetQR.q},${p.targetQR.r}`;
        const n = (this._incomingThreatHumanRef.get(k) || 0) - 1;
        if (n <= 0) {
            this._incomingThreatHumanRef.delete(k);
            this.incomingThreatHumanHexKeys.delete(k);
        } else {
            this._incomingThreatHumanRef.set(k, n);
        }
    }

    updateProjectiles() {
        const heavy = this.projectiles.length > 90;
        const trailCap = heavy ? 8 : 18;
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 5) {
                this._removeIncomingHumanThreat(p);
                this.impact(p);
                this.projectiles.splice(i, 1);
            } else {
                if (p.trail) {
                    p.trailPts.push({ x: p.x, y: p.y });
                    if (p.trailPts.length > trailCap) p.trailPts.shift();
                }
                p._prevX = p.x;
                p._prevY = p.y;
                p.x += (dx / dist) * p.speed;
                p.y += (dy / dist) * p.speed;

                if (p.interceptable && this.checkInterception(p)) {
                    this._removeIncomingHumanThreat(p);
                    this.spawnBurst(p.x, p.y, "#00e5ff", heavy ? 4 : 8);
                    SFX.play('intercept');
                    this.logEvent(p.owner, null, 'intercepted', `${p.type} intercepted`);
                    this.projectiles.splice(i, 1);
                }
            }
        }
    }

    checkInterception(proj) {
        if (proj.interceptable === false) return false;
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

                let range = tile.structure.stats.range;
                if (tile.structure.type === 'AF' && tile.structure.level === 2 && proj.fromQR) {
                    const fTile = this.grid.getTile(proj.fromQR.q, proj.fromQR.r);
                    if (fTile?.structure && !fTile.buildable && NAVY_BUILD_TYPES.has(fTile.structure.type)) {
                        range += GAME_CONFIG.AF3_NAVY_ORIGIN_RANGE;
                    }
                }
                if (Hex.distance(hex, tile) <= range) eligible.push(tile);
            }
            if (eligible.length === 0) continue;

            let best = eligible[0];
            let bestD = Hex.distance(best, hex);
            for (let i = 1; i < eligible.length; i++) {
                const t = eligible[i];
                const d = Hex.distance(t, hex);
                if (d < bestD) {
                    best = t;
                    bestD = d;
                } else if (d === bestD) {
                    if (t.q < best.q || (t.q === best.q && t.r < best.r)) {
                        best = t;
                    }
                }
            }
            if (proj.fromQR) {
                const srcShot = this.grid.getTile(proj.fromQR.q, proj.fromQR.r);
                if (srcShot) {
                    srcShot.navyIlluminatedUntil = this.gameTime + (GAME_CONFIG.NAVY_ILLUM_MS || 3000);
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
            navy:      { burst: 16, color: '#5aa0c0', shake: 3, sfx: 'impact_big'   },
            cruise:    { burst: 20, color: '#8aa0b8', shake: 4, sfx: 'impact_big'   },
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

        if (proj.splash && proj.type === 'rocket') {
            const origin = new Hex(proj.targetQR.q, proj.targetQR.r);
            let splashBase = proj.damage * GAME_CONFIG.RL_L3_SPLASH_MULT;
            for (const n of origin.getNeighbors()) {
                const nt = this.grid.getTile(n.q, n.r);
                if (!nt?.structure || !nt.owner) continue;
                if (this.areAllied(nt.owner, proj.owner)) continue;
                let sdmg = splashBase;
                if (this._inFriendlyL3BarracksCommandAura(nt, nt.owner)) {
                    sdmg *= GAME_CONFIG.BARRACKS_L3_COMMAND_IN_MULT;
                }
                nt.hp -= sdmg;
                nt.lastDamageTime = this.gameTime;
                const atk = this.players[proj.owner - 1];
                const def = this.players[nt.owner - 1];
                if (atk) atk.stats.damageDealt += sdmg;
                if (def) def.stats.damageTaken += sdmg;
                if (nt.owner === this.humanId && proj.owner !== this.humanId) {
                    this.pushEvent({ kind: 'hit', tile: { q: nt.q, r: nt.r }, t: this.gameTime });
                    this.lastOwnDamageTile = { q: nt.q, r: nt.r };
                }
                const sn = UNIT_STATS[nt.structure.type]?.name || nt.structure.type;
                this.logEvent(proj.owner, nt.owner, 'hit', `rocket splash ${sn} (-${Math.round(sdmg * 10) / 10} HP)`);
                if (nt.hp <= 0) this.destroyStructure(nt, proj.owner);
            }
        }
    }

    // ========================================================================
    //  PARTICLES
    // ========================================================================
    spawnBurst(x, y, color, n = 10) {
        if (this.projectiles.length > 85) n = Math.min(n, 7);
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
    buildStructure(tile, type, ownerId, levelIdx = 0, free = false, isStarterMf = false) {
        const p = this.players[ownerId - 1];
        if (!p) return false;
        if (tile.contested) return false;
        if (!tile.buildable) {
            if (!NAVY_BUILD_TYPES.has(type)) return false;
            if (!this.canBuildNavyOn(tile, ownerId)) return false;
        }

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
            type === 'AAS' || type === 'AF' ? (stats.rechargeInterval  || 12000) :
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

        if (type === 'MF' && isStarterMf) {
            tile.lastAction = this.gameTime - structInterval - 1;
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
            if (p && t === 'M') {
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
            type === 'AAS' || type === 'AF' ? (newStats.rechargeInterval || 12000) :
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

        const bt = this.campaign?.buildTutorial;
        if (bt?.active && Array.isArray(bt.seedHexes)) {
            for (const s of bt.seedHexes) {
                const t = this.grid.getTile(s.q, s.r);
                if (t && !t.structure) {
                    t.owner = s.ownerId;
                    t.contested = false;
                }
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

export function registerNavyBuildType(structureType) {
    NAVY_BUILD_TYPES.add(structureType);
}
