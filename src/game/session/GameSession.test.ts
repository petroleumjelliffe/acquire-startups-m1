import { describe, it, expect, vi } from 'vitest';
import { createGameSession } from './GameSession';
import { buildFixture } from '../../../engine/golden/fixtures';

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
