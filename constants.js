// INFLUENCE SYSTEM
// Each governance-like structure (Government, Militia-Gov M3, Barracks) projects an
// influence score over its radius. Influence at distance d = base * max(0, 1 - 0.2*d).
// Tile ownership = player with highest summed influence on that tile.
// Tie = contested (neutral, unbuildable by anyone).
// DAMAGE EFFICIENCY
//   HP == 100%  -> 100% speed
//   50% <= HP < 100% -> 80% speed  (interval x 1.25)
//   HP < 50%   -> 50% speed  (interval x 2)

export const UNIT_STATS = {
    RL: {
        name: "Rocket Launcher",
        levels: [
            { id: "RL1", hp: 100, range: 7,  damage: 50, cost: 100, interval: 10000, missilesPerShot: 1 },
            { id: "RL2", hp: 175, range: 10, damage: 50, cost: 200, interval: 5000,  missilesPerShot: 1 },
            { id: "RL3", hp: 300, range: 14, damage: 75, cost: 400, interval: 5000,  missilesPerShot: 2 }
        ]
    },
    AAS: {
        name: "Anti Air System",
        levels: [
            { id: "AAS1", hp: 100, range: 3, cost: 100, rechargeInterval: 10000, missilesRecharged: 1 },
            { id: "AAS2", hp: 175, range: 5, cost: 200, rechargeInterval: 10000, missilesRecharged: 2 },
            { id: "AAS3", hp: 300, range: 7, cost: 400, rechargeInterval: 10000, missilesRecharged: 3 }
        ]
    },
    MF: {
        name: "Missile Factory",
        levels: [
            { id: "MF1", hp: 100, cost: 150, produceInterval: 10000, missilesProduced: 2 },
            { id: "MF2", hp: 175, cost: 300, produceInterval: 10000, missilesProduced: 3 },
            { id: "MF3", hp: 300, cost: 600, produceInterval: 10000, missilesProduced: 5 }
        ]
    },
    G: {
        name: "Government",
        levels: [
            { id: "G1", hp: 300, radius: 3, cost: 200,  goldPerTile: 0.5, influence: 1000 },
            { id: "G2", hp: 500, radius: 5, cost: 500,  goldPerTile: 0.5, influence: 2000 },
            { id: "G3", hp: 900, radius: 8, cost: 1200, goldPerTile: 0.5, influence: 3000 }
        ]
    },
    D: {
        name: "Drone Operator",
        levels: [
            { id: "D1", hp: 50,  range: 1, damage: 50, cost: 100, interval: 10000 },
            { id: "D2", hp: 100, range: 1, damage: 50, cost: 200, interval: 5000  }
        ],
        limit: 3
    },
    M: {
        name: "Militia",
        levels: [
            { id: "M1", hp: 50,  range: 1, damage: 40, cost: 100, interval: 10000 },
            { id: "M2", hp: 100, range: 1, damage: 50, cost: 200, interval: 5000  },
            // M3 transforms into a mini-government: no attack, projects territory influence.
            { id: "M3", hp: 200, radius: 2, cost: 400, goldPerTile: 0.5, transformsToGov: true, influence: 1000 }
        ],
        limit: 3
    },
    AS: {
        name: "Air Strike",
        levels: [
            { id: "AS1", damage: 150, cost: 300, borderRange: 4 },
            { id: "AS2", damage: 200, cost: 500, borderRange: 6 },
            { id: "AS3", damage: 300, cost: 900, borderRange: 8 }
        ]
    },
    B: {
        name: "Barracks",
        // Ground-fire structure: NOT interceptable, no missile cost.
        // Also projects a LIGHT territorial influence (1500 flat, faded 20%/hex over its radius).
        // Auto-rule priority: enemy Militia > Drone > nearest other enemy structure.
        levels: [
            { id: "B1", hp: 200, range: 2, radius: 2, damage: 50, cost: 200, interval: 8000, influence: 1500 },
            { id: "B2", hp: 350, range: 3, radius: 3, damage: 60, cost: 400, interval: 6000, influence: 1500 },
            { id: "B3", hp: 550, range: 4, radius: 4, damage: 80, cost: 800, interval: 4000, influence: 1500 }
        ]
    }
};

export const COLORS = {
    NEUTRAL:   "#2c3e50",
    CONTESTED: "#5d4037", // warm brown-grey for contested tiles
    PLAYER1: "#3498db",
    PLAYER2: "#e74c3c",
    PLAYER3: "#2ecc71",
    PLAYER4: "#f1c40f",
    PLAYER5: "#9b59b6",
    PLAYER6: "#e67e22",
    PLAYER7: "#1abc9c",
    PLAYER8: "#ecf0f1"
};
