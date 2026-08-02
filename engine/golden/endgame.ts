import type { GoldenGame } from './types';
import type { Coord, Row } from '../gameHelpers';

const row = (letter: Row, n: number): Coord[] =>
  Array.from({ length: n }, (_, i) => `${letter}${i + 1}` as Coord);

const G8: GoldenGame = {
  id: 'G8',
  title: 'safe chains cannot merge, and the tile between them is dead',
  setup: {
    players: [
      { name: 'Alex', cash: 4200, hand: ['C6', 'G6'], shares: { Messla: 4, ZuckFace: 2 } },
      { name: 'Sam',  cash: 5800 },
    ],
    chains: [
      { id: 'Messla',   coords: row('B', 11) },
      { id: 'ZuckFace', coords: row('D', 11) },
    ],
    bag: ['I12'],
  },
  steps: [
    {
      name: 'C6 sits between two safe chains and is refused',
      intent: { type: 'placeTile', playerId: 'p1', coord: 'C6' },
      expectError: 'illegalPlacement',
    },
    {
      name: 'trading it in draws a replacement and the turn continues',
      intent: { type: 'tradeInDeadTiles', playerId: 'p1', coords: ['C6'] },
      then: { stage: 'play', hand: { p1: ['G6', 'I12'] }, logPhases: ['Traded a tile'] },
    },
    {
      name: 'the turn really does continue — G6 is still placeable',
      intent: { type: 'placeTile', playerId: 'p1', coord: 'G6' },
      then: { stage: 'buy', boardOwner: { G6: null } },
    },
  ],
  final: { chainSize: { Messla: 11, ZuckFace: 11 } },
};

// Gobble is tier 2 (AVAILABLE_STARTUPS in engine/startups.ts). At size 41,
// getSharePriceAtSize walks SIZE_THRESHOLDS = [2,3,4,5,6,11,21,31,41] and lands
// on the last band (index 8): TIER0_PRICES[8] = 1000, plus tier * 100 = 200,
// giving a share price of $1200 — NOT the brief's $1000. (Task 6's ledger hit
// this exact trap: "fixture prices recomputed from engine: Gobble $1200 (doc
// said 1000)".) Re-derived from computeChainBonuses (engine/bonuses.ts):
// holders sorted by shares desc are Alex(6), Sam(3), Jordan(1). Alex is the
// sole top holder → majorityPot = price * 10 = $12,000. Sam is the sole
// runner-up → minorityPot = price * 5 = $6,000. Jordan holds neither the top
// nor the runner-up share count, so gets no bonus.
//   p1 (Alex):   cash 8600  + stock 6 * 1200 = 7200  + majority 12000 = 27800
//   p2 (Sam):    cash 12000 + stock 3 * 1200 = 3600  + minority 6000  = 21600
//   p3 (Jordan): cash 3100  + stock 1 * 1200 = 1200  + none           = 4300
const G9: GoldenGame = {
  id: 'G9',
  title: 'end by 41 tiles, declared',
  setup: {
    players: [
      { name: 'Alex',   cash: 8600, hand: ['D5'], shares: { Gobble: 6 } },
      { name: 'Sam',    cash: 12000, shares: { Gobble: 3 } },
      { name: 'Jordan', cash: 3100,  shares: { Gobble: 1 } },
    ],
    // rows A, B, C full (12 each) + D1..D4 = 40; D5 makes 41
    chains: [{ id: 'Gobble', coords: [...row('A', 12), ...row('B', 12), ...row('C', 12), ...row('D', 4)] }],
  },
  steps: [
    {
      name: 'Alex places the 41st tile',
      intent: { type: 'placeTile', playerId: 'p1', coord: 'D5' },
      then: { stage: 'buy', chainSize: { Gobble: 41 } },
    },
    {
      name: 'Alex declares the end',
      intent: { type: 'declareEnd', playerId: 'p1' },
      then: { stage: 'end', logPhases: ['Game over'] },
    },
  ],
  final: {
    stage: 'end',
    finalScoreTotals: {
      p1: 8600 + 6 * 1200 + 12000,  // cash + stock (6 × $1200) + majority bonus
      p2: 12000 + 3 * 1200 + 6000,  // cash + stock (3 × $1200) + minority bonus
      p3: 3100 + 1 * 1200,          // cash + stock (1 × $1200), no bonus
    },
  },
};

const G10: GoldenGame = {
  id: 'G10',
  title: 'end because every founded chain is safe, declared',
  setup: {
    players: [
      { name: 'Alex', cash: 1000, hand: ['H8'], shares: { Messla: 5 } },
      { name: 'Sam',  cash: 2000, shares: { ZuckFace: 4 } },
    ],
    chains: [
      { id: 'Messla',   coords: row('B', 12) },
      { id: 'ZuckFace', coords: row('D', 11) },
    ],
    stage: 'buy',
  },
  steps: [
    {
      name: 'the end is available with both chains safe',
      intent: { type: 'declareEnd', playerId: 'p1' },
      then: { stage: 'end', logPhases: ['Game over'] },
    },
  ],
};

const G11: GoldenGame = {
  id: 'G11',
  title: 'end condition met but declined — play continues',
  setup: {
    players: [
      { name: 'Alex', cash: 1000, hand: ['H8'], shares: { Messla: 5 } },
      { name: 'Sam',  cash: 2000, hand: ['H10'] },
    ],
    chains: [
      { id: 'Messla',   coords: row('B', 12) },
      { id: 'ZuckFace', coords: row('D', 11) },
    ],
    stage: 'buy',
    bag: ['I12'],
  },
  steps: [
    {
      name: 'Alex declines and simply ends the turn instead',
      intent: { type: 'endTurn', playerId: 'p1' },
      then: { stage: 'play', currentPlayer: 'p2' },
    },
    {
      name: 'Sam takes a normal turn — the game is still running',
      intent: { type: 'placeTile', playerId: 'p2', coord: 'H10' },
      then: { stage: 'buy', currentPlayer: 'p2', boardOwner: { H10: null } },
    },
    {
      name: 'Sam can still declare the end later',
      intent: { type: 'declareEnd', playerId: 'p2' },
      then: { stage: 'end' },
    },
  ],
};

export const ENDGAME_GAMES: GoldenGame[] = [G8, G9, G10, G11];
