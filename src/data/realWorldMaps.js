/**
 * Hand-authored hex maps based on real-world coastlines.
 *
 * Each template is an array of strings. '#' = land, anything else = water.
 * Rows are parsed as axial-r (centered around 0); within a row, cols are
 * axial-q (also centered). Because hexes are pointy-top, odd rows render
 * shifted half a hex right from even rows — author shapes with that in mind.
 */

export const REAL_WORLD_MAPS = {
    mediterranean: {
        id: 'mediterranean',
        name: 'Mediterranean',
        desc: 'Inland sea ringed by Europe, Anatolia & North Africa',
        rows: [
            '.......##########............',
            '.....##############..........',
            '....#######.#######.....##...',
            '...######....######....####..',
            '..#######....######...######.',
            '.######......#####...########',
            '######.......####....########',
            '######.....#####.....########',
            '######....######....######...',
            '.#####...######...########...',
            '..####...####....##########..',
            '...####.##....############...',
            '....######..##############...',
            '.....######################..',
            '.......####################..',
        ],
    },
    british_isles: {
        id: 'british_isles',
        name: 'British Isles',
        desc: 'Britain & Ireland separated by the Irish Sea',
        rows: [
            '......##.......',
            '.....####......',
            '.##..######....',
            '####..######...',
            '####..######...',
            '####..#####....',
            '.##...#####....',
            '......#####....',
            '.....######....',
            '.....######....',
            '.....######....',
            '......####.....',
            '......####.....',
            '.......##......',
        ],
    },
    japan: {
        id: 'japan',
        name: 'Japan',
        desc: 'Diagonal archipelago in the Pacific',
        rows: [
            '.....................',
            '....................#',
            '...................##',
            '..................###',
            '..................###',
            '.................###.',
            '................###..',
            '...............###...',
            '.............####....',
            '............####.....',
            '...........####......',
            '..........####.......',
            '.........####........',
            '........####.........',
            '.......####..........',
            '......####...........',
            '.....####............',
            '....###..............',
            '..####...............',
            '..####...............',
            '..##.................',
        ],
    },
    caribbean: {
        id: 'caribbean',
        name: 'Caribbean',
        desc: 'Island chain between two continental coasts',
        rows: [
            '#############............',
            '##############...........',
            '#####....##......##..#...',
            '####.....###....###.##...',
            '####...................#.',
            '###...................###',
            '###....................##',
            '###.....................#',
            '##.......................',
            '##.......................',
            '###.....................#',
            '####...................##',
            '########..............###',
        ],
    },
};

/** Parse an ASCII template into a Set of "q,r" land-hex keys (centered on origin). */
export function parseTemplate(rows) {
    const H = rows.length;
    const W = rows.reduce((m, s) => Math.max(m, s.length), 0);
    const rMid = Math.floor(H / 2);
    const cMid = Math.floor(W / 2);
    const land = new Set();
    let maxAxis = 0;
    for (let i = 0; i < H; i++) {
        const row = rows[i];
        const r = i - rMid;
        for (let j = 0; j < row.length; j++) {
            if (row[j] !== '#') continue;
            const q = j - cMid - Math.floor(r / 2);
            land.add(`${q},${r}`);
            const a = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
            if (a > maxAxis) maxAxis = a;
        }
    }
    return { land, naturalRadius: maxAxis + 2 };
}

export function isRealWorldMap(id) {
    return !!REAL_WORLD_MAPS[id];
}

export function getRealWorldMap(id) {
    return REAL_WORLD_MAPS[id] || null;
}
