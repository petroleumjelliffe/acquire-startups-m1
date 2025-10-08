export type Row = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";
export const ROWS: Row[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
export const COLS = Array.from({ length: 12 }, (_, i) => i + 1);
export type Coord = `${Row}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`;
export function coord(r: Row, c: number): Coord {
  return `${r}${c}` as Coord;
}
export function generateAllCoords(): Coord[] {
  const list: Coord[] = [] as any;
  for (const r of ROWS) for (const c of COLS) list.push(coord(r, c));
  return list;
}
export function compareTiles(a: Coord, b: Coord) {
  const rA = a.charCodeAt(0),
    rB = b.charCodeAt(0);
  return rA === rB ? Number(a.slice(1)) - Number(b.slice(1)) : rA - rB;
}
export function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++)
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return h >>> 0;
}
export function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffleSeeded<T>(arr: T[], seed: string) {
  const out = arr.slice();
  const rand = mulberry32(hashCode(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

//returns array of adjacent coordinates (up to 4)
export function getAdjacentCoords(c: Coord): Coord[] {
  const r = c.charAt(0) as Row;
  const cNum = Number(c.slice(1));
  const adj: Coord[] = [];
  if (r > "A")
    adj.push(coord(String.fromCharCode(r.charCodeAt(0) - 1) as Row, cNum));
  if (r < "I")
    adj.push(coord(String.fromCharCode(r.charCodeAt(0) + 1) as Row, cNum));
  if (cNum > 1) adj.push(coord(r, cNum - 1));
  if (cNum < 12) adj.push(coord(r, cNum + 1));
  return adj;
}
//returns all contiguous placed tiles starting from 'start'
export function getContiguousTiles(
  board: Record<Coord, { placed: boolean }>,
  start: Coord,
  visited = new Set<Coord>()
): Coord[] {
  if (visited.has(start)) return [];
  visited.add(start);
  const result = [start];
  for (const adj of getAdjacentCoords(start)) {
    if (board[adj]?.placed && !visited.has(adj)) {
      result.push(...getContiguousTiles(board, adj, visited));
    }
  }
  return result;
}

//get list of all unique adjacent startups to a coord
export function getAdjacentStartups(
  board: Record<Coord, { placed: boolean; startupId?: string }>,
  startups: Record<string, Coord[]>,
  coord: Coord
): string[] {
  const adjacent = getAdjacentCoords(coord);
  const found = new Set<string>();
  for (const adj of adjacent) {
    const cell = board[adj];
    if (cell?.placed && cell.startupId) found.add(cell.startupId);
  }
  return Array.from(found);
}

//returns all tiles belonging to a startup
export function getStartupTiles(
  startups: Record<string, Coord[]>,
  startupId: string
): Coord[] {
  return startups[startupId] || [];
}

//get unique start ups and/or unclaimed status from array of coords
export function getStartupsFromTiles(
  board: Record<Coord, { placed: boolean; startupId?: string }>,
  tiles: Coord[]
): (string | "unclaimed")[] {
  const found = new Set<string | "unclaimed">();
  for (const t of tiles) {
    const cell = board[t];
    if (cell?.placed) {
      if (cell.startupId) found.add(cell.startupId);
      else found.add("unclaimed");
    }
  }
  return Array.from(found);
}

//loop through given tiles and update their startup assignment
export function assignTilesToStartup(
  state: {
    board: Record<Coord, { placed: boolean; startupId?: string }>;
    startups: Record<string, Coord[]>;
  },
  startupId: string,
  tiles: Coord[]
) {
  if (!state.startups[startupId]) {
    state.startups[startupId] = [];
  }
  for (const t of tiles) {
    const cell = state.board[t];
    if (cell.placed && !cell.startupId) {
      cell.startupId = startupId;
      state.startups[startupId].push(t);
    }
  }
}

export function chooseStartup(state: { startups: Record<string, Coord[]> }) {
  //choose first available startup id
  const allIds = [
    "Gobble",
    "Pear",
    "Mike Rowe Soft",
    "Ünter",
    "ZuckFace",
    "Messla",
    "Cat, I Farted",
  ];
  for (const id of allIds) {
    if (!state.startups[id]) {
      return id;
    }
  }
  return null; //no available ids
}
