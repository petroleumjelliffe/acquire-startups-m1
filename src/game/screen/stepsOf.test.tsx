import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { stepsOf } from './stepsOf';
import { createGameSession } from '../../../session/GameSession';
import { buildFixture } from '../../../engine/golden/fixtures';
import { ALL_GOLDEN_GAMES } from '../../../engine/golden';
import { replayGoldenGame } from '../../../engine/golden/replay';

function g(id: string) {
  const game = ALL_GOLDEN_GAMES.find((x) => x.id === id);
  if (!game) throw new Error(`no golden game ${id}`);
  return game;
}

describe('stepsOf — this turn and the one before it', () => {
  it('drops everything below the boundary it is given and keeps everything above', () => {
    const states = replayGoldenGame(g('G1'));
    const state = states[states.length - 1];

    const whole = stepsOf(state, []);
    // The stack really did accumulate: without a floor, a finished game's
    // panel carries every step of it. If this ever stops holding, the test
    // below is comparing nothing against nothing.
    expect(whole.length).toBeGreaterThan(3);

    // A cut taken from the log itself rather than a written-down number, so a
    // change to G1 moves the boundary rather than breaking the test.
    const cut = state.log[Math.floor(state.log.length / 2)].stepId;
    const scoped = stepsOf(state, [], cut);

    expect(scoped.length).toBeLessThan(whole.length);
    expect(scoped.map((e) => e.stepId)).toEqual(
      whole.map((e) => e.stepId).filter((id) => id >= cut),
    );
  });
});

describe('stepsOf', () => {
  it('turns log entries into step stack entries', () => {
    const states = replayGoldenGame(g('G1'));
    const state = states[states.length - 1];
    const steps = stepsOf(state, []);

    expect(steps.length).toBe(state.log.length);
    expect(steps.map((s) => s.stepId)).toEqual(state.log.map((e) => e.stepId));
    expect(steps[0].phase).toBe(state.log[0].phase);
  });

  it('marks only the steps that have a snapshot as undoable', () => {
    const states = replayGoldenGame(g('G1'));
    const state = states[states.length - 1];
    const undoable = [state.log[1].stepId];
    const steps = stepsOf(state, undoable);

    expect(steps.find((s) => s.stepId === state.log[1].stepId)?.undoable).toBe(true);
    expect(steps.find((s) => s.stepId === state.log[0].stepId)?.undoable).toBe(false);
  });

  it('renders a payout step through PayoutLines rather than as a sentence', () => {
    const states = replayGoldenGame(g('G2'));
    const state = states.find((s) => s.log.some((e) => e.payload?.kind === 'payout'));
    if (!state) throw new Error('G2 no longer produces a payout payload');

    const payoutStep = stepsOf(state, []).find((s) => s.phase === 'Merger payout');
    if (!payoutStep) throw new Error('no payout step');

    render(<div>{payoutStep.detail}</div>);
    // PayoutLines labels the role; a plain token list would not.
    expect(screen.getAllByText(/majority|minority/i).length).toBeGreaterThan(0);
  });
});

describe('the turn before yours', () => {
  /**
   * Driven through a real session rather than a hand-picked log index,
   * because the boundary under test is the one the session maintains — a
   * fixture that names a step id would be asserting against a number this
   * code no longer has to agree with.
   */
  it('shows what the previous player did, read-only, above your own steps', () => {
    const session = createGameSession({
      state: buildFixture({
        players: [
          { name: 'Alex', cash: 6000, hand: ['E6'] },
          { name: 'Sam', cash: 6000, hand: ['A1'] },
        ],
        bag: ['I11', 'I12', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'],
      }),
    });

    // Alex plays a whole turn: place, then end it.
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    session.dispatch({ type: 'endTurn', playerId: 'p1' });

    const view = session.getView();
    expect(view.actorId, 'the turn did not change hands').toBe('p2');
    expect(view.previousSegmentStart, 'no previous segment was recorded').toBeDefined();

    const steps = stepsOf(view.state, view.undoableSteps, view.previousSegmentStart);

    // Alex's placement is visible to Sam, and is not Sam's to undo.
    const placement = steps.find((e) => e.phase === 'Placed a tile');
    expect(placement, "the previous player's placement is missing").toBeDefined();
    expect(placement!.undoable).toBe(false);

    // Scoped to the open segment alone, Sam would see nothing of it.
    const openOnly = stepsOf(view.state, view.undoableSteps, view.segmentStart);
    expect(openOnly.some((e) => e.phase === 'Placed a tile')).toBe(false);
  });
});
