import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useTurnPanel } from './useTurnPanel';
import { createGameSession, type GameSession } from '../session/GameSession';
import type { Intent } from '../../../engine/intents';
import { buildFixture } from '../../../engine/golden/fixtures';

function sessionFor(state = buildFixture({
  players: [{ name: 'Alex', cash: 6000, hand: ['E6', 'H8'] }, { name: 'Sam', cash: 6000, hand: ['A1'] }],
  loners: ['E5'],
  bag: ['I11', 'I12'],
})) {
  return createGameSession({ state });
}

/**
 * Renders both slots the way `Panel` will, so a test can click a control in
 * one slot and assert on the other — which is the whole reason the hook hands
 * back two nodes instead of one.
 */
function Harness({ session, dispatch }: { session: GameSession; dispatch: (i: Intent) => void }) {
  const { active, staging } = useTurnPanel(session.getView(), dispatch);
  return <div><div data-slot="active">{active}</div><div data-slot="staging">{staging}</div></div>;
}

describe('useTurnPanel', () => {
  it('asks seat one to open the game while the stage is draw', () => {
    const session = createGameSession({ seed: 'az-1', names: ['Alex', 'Sam'] });
    const dispatch = vi.fn();
    render(<Harness session={session} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole('button', { name: /draw for turn order/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'startGame', playerId: 'p1' });
  });

  it('prompts for a tile during play', () => {
    render(<Harness session={sessionFor()} dispatch={() => {}} />);
    expect(screen.getByText(/place a tile/i)).toBeInTheDocument();
  });

  it('always renders the staging slot, so the panel cannot resize between stages', () => {
    const { container } = render(<Harness session={sessionFor()} dispatch={() => {}} />);
    const staging = container.querySelector('[data-slot="staging"]')!;
    // Empty at `play`, but present and holding its reservation.
    expect(staging.querySelector('[data-zone="staging"]')).not.toBeNull();
  });

  it('offers the founding brands, priced for the resulting chain', () => {
    const session = sessionFor();
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    const dispatch = vi.fn();
    render(<Harness session={session} dispatch={dispatch} />);

    expect(screen.getByText(/found a brand/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /messla/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'chooseFoundingBrand',
      playerId: 'p1',
      startupId: 'Messla',
    });
  });

  it('sizes the founding groups from the chain that will exist', () => {
    const session = sessionFor();
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    render(<Harness session={session} dispatch={() => {}} />);
    // E6 placed beside the E5 loner: the founded chain will be 2 tiles.
    expect(screen.getByText(/\$200/)).toBeInTheDocument();
  });

  it('surfaces a rejected intent instead of swallowing it', () => {
    const session = sessionFor();
    session.dispatch({ type: 'placeTile', playerId: 'p2', coord: 'A1' });
    render(<Harness session={session} dispatch={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/turn/i);
  });
});
