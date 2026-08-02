import type { GoldenGame } from './types';

/**
 * G1: the baseline turn — place, found, buy, end turn, and the next player
 * is up.
 */
const G1: GoldenGame = {
  id: 'G1',
  title: 'baseline turn cycle — place, found, buy, end turn',
  setup: {
    players: [
      { name: 'Alex', cash: 6000, hand: ['E6', 'H8'] },
      { name: 'Sam',  cash: 6000, hand: ['A1'] },
    ],
    loners: ['E5'],
    bag: ['I11', 'I12'],
  },
  steps: [
    {
      name: 'Alex places E6 beside the lone tile, which opens the founding choice',
      intent: { type: 'placeTile', playerId: 'p1', coord: 'E6' },
      then: {
        stage: 'foundStartup',
        hand: { p1: ['H8'] },
        boardOwner: { E6: null },
        // gameLogic's founding branch logs the placement itself before the
        // founding choice is made — see task-11-report.md for why this was
        // an engine fix, not a golden-game adjustment.
        logPhases: ['Placed a tile'],
      },
    },
    {
      name: 'Alex founds Messla and takes the founder share',
      intent: { type: 'chooseFoundingBrand', playerId: 'p1', startupId: 'Messla' },
      then: {
        stage: 'buy',
        founded: { Messla: true },
        chainSize: { Messla: 2 },
        boardOwner: { E5: 'Messla', E6: 'Messla' },
        shares: { p1: { Messla: 1 } },
        availableShares: { Messla: 24 },
        // `foundStartup` logs twice under the same phase: `grantFoundingShare`
        // logs the free-share grant first, then the founding itself — see
        // task-11-report.md.
        logPhases: ['Founded a brand', 'Founded a brand'],
      },
    },
    {
      name: 'Alex buys two more Messla at $200 each',
      intent: { type: 'buyShares', playerId: 'p1', picks: ['Messla', 'Messla'] },
      then: {
        stage: 'buy',
        cash: { p1: 6000 - 400 },
        shares: { p1: { Messla: 3 } },
        availableShares: { Messla: 22 },
        logPhases: ['Bought shares'],
      },
    },
    {
      name: 'a fourth share this turn is refused',
      intent: { type: 'buyShares', playerId: 'p1', picks: ['Messla', 'Messla'] },
      expectError: 'tooManyPicks',
    },
    {
      name: 'Sam cannot act while it is Alex’s turn',
      intent: { type: 'endTurn', playerId: 'p2' },
      expectError: 'notYourTurn',
    },
    {
      name: 'Alex ends the turn, refills to two tiles, and Sam is up',
      intent: { type: 'endTurn', playerId: 'p1' },
      then: {
        stage: 'play',
        currentPlayer: 'p2',
        hand: { p1: ['H8', 'I11', 'I12'] },
        logPhases: ['Drew tiles', 'Ended turn'],
      },
    },
    {
      name: 'Sam places an isolated tile and goes straight to buying',
      intent: { type: 'placeTile', playerId: 'p2', coord: 'A1' },
      then: { stage: 'buy', boardOwner: { A1: null }, logPhases: ['Placed a tile'] },
    },
  ],
  final: { stage: 'buy', currentPlayer: 'p2' },
};

/**
 * G12: the degenerate turn — nothing playable, nothing to draw, so the turn
 * simply passes.
 */
const G12: GoldenGame = {
  id: 'G12',
  title: 'bag exhaustion and no legal tile — the turn passes',
  setup: {
    players: [
      { name: 'Alex', cash: 6000, hand: ['C1'] },
      { name: 'Sam',  cash: 6000, hand: ['H8'] },
    ],
    chains: [
      { id: 'Messla',   coords: ['B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','B11'] },
      { id: 'ZuckFace', coords: ['D1','D2','D3','D4','D5','D6','D7','D8','D9','D10','D11'] },
    ],
    bag: [],
  },
  steps: [
    {
      name: 'C1 would merge two safe chains, so it cannot be placed',
      intent: { type: 'placeTile', playerId: 'p1', coord: 'C1' },
      expectError: 'illegalPlacement',
    },
    {
      name: 'the bag is empty, so trading it in leaves the hand a tile short',
      intent: { type: 'tradeInDeadTiles', playerId: 'p1', coords: ['C1'] },
      then: { stage: 'play', hand: { p1: [] }, logPhases: ['Traded a tile'] },
    },
    {
      name: 'with nothing playable the turn simply passes',
      intent: { type: 'endTurn', playerId: 'p1' },
      then: { stage: 'play', currentPlayer: 'p2', hand: { p1: [] } },
    },
  ],
  final: { currentPlayer: 'p2', chainSize: { Messla: 11, ZuckFace: 11 } },
};

export const TURN_GAMES: GoldenGame[] = [G1, G12];
