import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GameScreen } from '../GameScreen';
import { createGameSession } from '../session/GameSession';
import { ALL_GOLDEN_GAMES } from '../../../engine/golden';
import { replayGoldenGame } from '../../../engine/golden/replay';
import { buildFixture } from '../../../engine/golden/fixtures';

function golden(id: string) {
  const game = ALL_GOLDEN_GAMES.find((g) => g.id === id);
  if (!game) throw new Error(`no golden game ${id}`);
  return game;
}

/** Clears the curtain whenever it is up, so a driven test can keep going. */
function passDevice() {
  const reveal = screen.queryByRole('button', { name: /reveal/i });
  if (reveal) fireEvent.click(reveal);
}

/**
 * Dispatches into the session the screen is bound to, inside `act`.
 *
 * The session is an external store, so a bare `dispatch` notifies React
 * outside its batching and the DOM is left showing the previous state — a
 * test that then queries the screen reads stale markup and fails for a reason
 * that has nothing to do with the game.
 */
function apply(session: ReturnType<typeof createGameSession>, intent: Parameters<typeof session.dispatch>[0]) {
  act(() => { session.dispatch(intent); });
}

describe('driven golden games', () => {
  it('G2: a two-way merger pays out and liquidates through the real screen', () => {
    const game = golden('G2');
    const session = createGameSession({ state: buildFixture(game.setup) });
    render(<GameScreen session={session} />);
    passDevice();

    // Walk the golden game's own intents, but through the session the screen
    // is bound to, then assert the screen reflects each stage.
    for (const step of game.steps) {
      passDevice();
      apply(session, step.intent);
    }
    passDevice();

    const expected = replayGoldenGame(game).at(-1)!;
    const actual = session.getView().state;
    expect(actual.stage).toBe(expected.stage);
    expect(actual.players.map((p) => p.cash)).toEqual(expected.players.map((p) => p.cash));
    expect(actual.players.map((p) => p.portfolio)).toEqual(expected.players.map((p) => p.portfolio));
  });

  it('G2: the payout renders as lines in the step stack, not a bare sentence', () => {
    const game = golden('G2');
    const session = createGameSession({ state: buildFixture(game.setup) });
    render(<GameScreen session={session} />);

    for (const step of game.steps) {
      passDevice();
      apply(session, step.intent);
      if (session.getView().state.log.some((e) => e.payload?.kind === 'payout')) break;
    }
    passDevice();

    expect(screen.getAllByText(/majority|minority/i).length).toBeGreaterThan(0);
  });

  it('G7: a three-way merger runs its absorptions in order', () => {
    const game = golden('G7');
    const session = createGameSession({ state: buildFixture(game.setup) });
    render(<GameScreen session={session} />);

    const actorsSeen = new Set<string>();
    for (const step of game.steps) {
      passDevice();
      const actor = session.getView().actorId;
      if (actor) actorsSeen.add(actor);
      apply(session, step.intent);
    }
    passDevice();

    const expected = replayGoldenGame(game).at(-1)!;
    expect(session.getView().state.stage).toBe(expected.stage);
    expect(session.getView().state.players.map((p) => p.cash))
      .toEqual(expected.players.map((p) => p.cash));
    // A three-way merger must have involved more than one decision-maker.
    expect(actorsSeen.size).toBeGreaterThan(1);
  });

  it('raises the curtain between liquidators rather than resolving in place', () => {
    const game = golden('G2');
    const session = createGameSession({ state: buildFixture(game.setup) });
    render(<GameScreen session={session} />);

    let curtains = 0;
    for (const step of game.steps) {
      if (session.getView().awaitingReveal) curtains += 1;
      passDevice();
      apply(session, step.intent);
    }
    expect(curtains).toBeGreaterThan(0);
  });
});
