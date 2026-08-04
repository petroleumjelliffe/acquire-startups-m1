import { describe, it, expect, vi } from 'vitest';
import { createGameSession } from './GameSession';
import { buildFixture } from '../../../engine/golden/fixtures';
import { ALL_GOLDEN_GAMES } from '../../../engine/golden';
import { replayGoldenGame } from '../../../engine/golden/replay';

function playableGame() {
  return buildFixture({
    players: [
      { name: 'Alex', cash: 6000, hand: ['E6', 'H8'] },
      { name: 'Sam', cash: 6000, hand: ['A1'] },
    ],
    loners: ['E5'],
    bag: ['I11', 'I12'],
  });
}

describe('createGameSession', () => {
  it('builds from a seed and player names', () => {
    const session = createGameSession({ seed: 'sess-1', names: ['Alex', 'Sam'] });
    expect(session.getView().state.stage).toBe('draw');
    expect(session.getView().state.players.map((p) => p.name)).toEqual(['Alex', 'Sam']);
  });

  it('builds from an existing state, which is how golden fixtures are driven', () => {
    const session = createGameSession({ state: playableGame() });
    expect(session.getView().state.stage).toBe('play');
  });

  it('applies a legal intent and advances the state', () => {
    const session = createGameSession({ state: playableGame() });
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    expect(session.getView().state.stage).toBe('foundStartup');
  });

  it('notifies subscribers on dispatch', () => {
    const session = createGameSession({ state: playableGame() });
    const listener = vi.fn();
    session.subscribe(listener);
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    expect(listener).toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const session = createGameSession({ state: playableGame() });
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    unsubscribe();
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('captures an illegal intent as an error rather than throwing', () => {
    const session = createGameSession({ state: playableGame() });
    expect(() =>
      session.dispatch({ type: 'placeTile', playerId: 'p2', coord: 'A1' }),
    ).not.toThrow();
    expect(session.getView().error?.code).toBe('notYourTurn');
  });

  it('leaves state untouched when an intent is rejected', () => {
    const session = createGameSession({ state: playableGame() });
    const before = session.getView().state;
    session.dispatch({ type: 'placeTile', playerId: 'p2', coord: 'A1' });
    expect(session.getView().state.stage).toBe(before.stage);
    expect(session.getView().state.nextStepId).toBe(before.nextStepId);
  });

  it('clears a previous error on the next successful dispatch', () => {
    const session = createGameSession({ state: playableGame() });
    session.dispatch({ type: 'placeTile', playerId: 'p2', coord: 'A1' });
    expect(session.getView().error).not.toBeNull();
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    expect(session.getView().error).toBeNull();
  });

  it('undoes back to the state before a step', () => {
    const session = createGameSession({ state: playableGame() });
    const stepId = session.getView().state.nextStepId;
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    expect(session.getView().state.stage).toBe('foundStartup');

    session.undoTo(stepId);
    expect(session.getView().state.stage).toBe('play');
    expect(session.getView().state.players[0].hand).toContain('E6');
  });

  it('returns a new view object per change so useSyncExternalStore sees it', () => {
    const session = createGameSession({ state: playableGame() });
    const first = session.getView();
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    expect(session.getView()).not.toBe(first);
  });

  it('returns the identical view object when nothing has changed', () => {
    const session = createGameSession({ state: playableGame() });
    expect(session.getView()).toBe(session.getView());
  });
});

describe('segments', () => {
  it('reports the active player as the actor', () => {
    const session = createGameSession({ state: playableGame() });
    expect(session.getView().actorId).toBe('p1');
  });

  it('raises the curtain when the actor changes and lowers it on reveal', () => {
    const session = createGameSession({ state: playableGame() });
    session.reveal(); // p1 claims the device; every session opens behind the curtain
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    session.dispatch({ type: 'chooseFoundingBrand', playerId: 'p1', startupId: 'Messla' });
    expect(session.getView().awaitingReveal).toBe(false);

    session.dispatch({ type: 'endTurn', playerId: 'p1' });
    expect(session.getView().actorId).toBe('p2');
    expect(session.getView().awaitingReveal).toBe(true);

    session.reveal();
    expect(session.getView().awaitingReveal).toBe(false);
  });

  /**
   * The turn-order draw is a gate in front of the whole game, not seat one's
   * turn. Nobody's hand is on screen during it, so there is nothing to hide
   * and no reason to make someone claim the device before it — the curtain
   * that matters comes *after* the draw, when the winner's hand is about to
   * appear.
   */
  it('opens the draw without a curtain, because nothing private is on screen yet', () => {
    const session = createGameSession({ seed: 'sess-2', names: ['Alex', 'Sam'] });
    expect(session.getView().state.stage).toBe('draw');
    expect(session.getView().awaitingReveal).toBe(false);
    expect(session.getView().actorId).toBe('p1');
  });

  it('still opens behind the curtain when resumed mid-game', () => {
    const session = createGameSession({ state: playableGame() });
    expect(session.getView().awaitingReveal).toBe(true);
  });

  it('offers no undo across a turn boundary', () => {
    const session = createGameSession({ state: playableGame() });
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    session.dispatch({ type: 'chooseFoundingBrand', playerId: 'p1', startupId: 'Messla' });
    expect(session.getView().undoableSteps.length).toBe(2);

    session.dispatch({ type: 'endTurn', playerId: 'p1' });
    expect(session.getView().undoableSteps).toEqual([]);
  });

  it('accumulates undo points within one segment', () => {
    const session = createGameSession({ state: playableGame() });
    const first = session.getView().state.nextStepId;
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    expect(session.getView().undoableSteps).toEqual([first]);

    const second = session.getView().state.nextStepId;
    session.dispatch({ type: 'chooseFoundingBrand', playerId: 'p1', startupId: 'Messla' });
    expect(session.getView().undoableSteps).toEqual([first, second]);
  });

  it('offers one undo point per intent, not per log entry', () => {
    // Founding pushes two log entries under one intent (the founder share, then
    // the founding itself), so step ids outrun snapshots. Only the intent is
    // undoable.
    const session = createGameSession({ state: playableGame() });
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    const beforeFound = session.getView().state.nextStepId;
    session.dispatch({ type: 'chooseFoundingBrand', playerId: 'p1', startupId: 'Messla' });

    expect(session.getView().state.nextStepId).toBeGreaterThan(beforeFound + 1);
    expect(session.getView().undoableSteps).toContain(beforeFound);
    expect(session.getView().undoableSteps).not.toContain(beforeFound + 1);
  });

  it('leaves the curtain down after undoing within a segment', () => {
    const session = createGameSession({ state: playableGame() });
    session.reveal(); // p1 claims the device; every session opens behind the curtain
    const stepId = session.getView().state.nextStepId;
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    session.undoTo(stepId);
    expect(session.getView().awaitingReveal).toBe(false);
    expect(session.getView().actorId).toBe('p1');
  });
});

describe('liquidation segments', () => {
  it('hands the device between shareholders during a merger', () => {
    const g2 = ALL_GOLDEN_GAMES.find((g) => g.id === 'G2')!;
    const states = replayGoldenGame(g2);
    const liquidating = states.find((s) => s.stage === 'mergerLiquidation');
    if (!liquidating) throw new Error('G2 no longer reaches mergerLiquidation');

    const session = createGameSession({ state: liquidating });
    const first = session.getView().actorId;
    expect(first).not.toBeNull();
    expect(session.getView().state.mergerContext?.shareholderQueue).toContain(first);
  });
});

describe('the turn-order draw is a gate, not a turn', () => {
  /** An opening where the authored bag decides who wins the draw. */
  function drawGame(bag: string[]) {
    return buildFixture({
      players: [{ name: 'Alex', hand: ['H8'] }, { name: 'Sam', hand: ['C4'] }],
      bag: bag as never,
      stage: 'draw',
    });
  }

  it('raises the curtain after the draw even when seat one wins it', () => {
    // p1 draws E5, p2 draws B4 — the highest coordinate wins, so seat one
    // takes the turn and the actor id never changes. The curtain must rise
    // anyway: whoever pressed the button did it for the table, and the
    // winner's hand has not been seen by anyone yet.
    const session = createGameSession({ state: drawGame(['E5', 'B4']) });
    expect(session.getView().awaitingReveal).toBe(false);

    session.dispatch({ type: 'startGame', playerId: 'p1' });

    expect(session.getView().state.turnIndex).toBe(0);
    expect(session.getView().actorId).toBe('p1');
    expect(session.getView().awaitingReveal).toBe(true);
  });

  it('raises the curtain after the draw when another seat wins it', () => {
    // p1 draws B4, p2 draws E5 — the higher tile takes the turn.
    const session = createGameSession({ state: drawGame(['B4', 'E5']) });
    session.dispatch({ type: 'startGame', playerId: 'p1' });

    expect(session.getView().state.turnIndex).toBe(1);
    expect(session.getView().actorId).toBe('p2');
    expect(session.getView().awaitingReveal).toBe(true);
  });

  it('leaves nothing of the draw undoable once play has begun', () => {
    const session = createGameSession({ state: drawGame(['E5', 'B4']) });
    session.dispatch({ type: 'startGame', playerId: 'p1' });
    expect(session.getView().undoableSteps).toEqual([]);
  });
});

describe('ending the game', () => {
  function atDeclarableBuy() {
    const g9 = ALL_GOLDEN_GAMES.find((g) => g.id === 'G9')!;
    const state = replayGoldenGame(g9).find((s) => s.stage === 'buy');
    if (!state) throw new Error('G9 no longer passes through buy');
    return state;
  }

  it('has no actor once the game is over', () => {
    const session = createGameSession({ state: atDeclarableBuy() });
    session.dispatch({ type: 'declareEnd', playerId: 'p1' });

    expect(session.getView().state.stage).toBe('end');
    expect(session.getView().actorId).toBeNull();
  });

  /**
   * Ending the game is a handoff like any other: the actor goes from the
   * declaring player to nobody, so the segment closes and its snapshots are
   * pruned. The end is final, and the step stack offers no undo control past
   * it — this is the segment model working, not a gap in it.
   */
  it('is final — no undo is offered once the game is over', () => {
    const session = createGameSession({ state: atDeclarableBuy() });
    session.dispatch({ type: 'declareEnd', playerId: 'p1' });

    expect(session.getView().state.stage).toBe('end');
    expect(session.getView().undoableSteps).toEqual([]);
  });
});
