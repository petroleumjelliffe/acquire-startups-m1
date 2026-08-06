import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { stepsOf } from './stepsOf';
import { ALL_GOLDEN_GAMES } from '../../../engine/golden';
import { replayGoldenGame } from '../../../engine/golden/replay';

function g(id: string) {
  const game = ALL_GOLDEN_GAMES.find((x) => x.id === id);
  if (!game) throw new Error(`no golden game ${id}`);
  return game;
}

describe('stepsOf — this turn, not the whole game', () => {
  it('drops every step below the open segment and keeps every step above it', () => {
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
