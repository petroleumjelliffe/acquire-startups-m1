import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useTurnPanel } from './useTurnPanel';
import { createGameSession, type GameSession } from '../session/GameSession';
import type { Intent } from '../../../engine/intents';
import { buildFixture } from '../../../engine/golden/fixtures';
import { ALL_GOLDEN_GAMES } from '../../../engine/golden';
import { replayGoldenGame } from '../../../engine/golden/replay';
import type { GameState } from '../../../engine/gameTypes';

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

describe('useTurnPanel — buying', () => {
  function atBuy() {
    const session = sessionFor();
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    session.dispatch({ type: 'chooseFoundingBrand', playerId: 'p1', startupId: 'Messla' });
    return session;
  }

  it('stages picks locally without dispatching', () => {
    const dispatch = vi.fn();
    render(<Harness session={atBuy()} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole('button', { name: /buy one messla/i }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('shows the staged basket and its cost in the staging slot', () => {
    const { container } = render(<Harness session={atBuy()} dispatch={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /buy one messla/i }));

    const staging = container.querySelector('[data-slot="staging"]')!;
    expect(staging.textContent).toMatch(/200/);
  });

  it('sends the whole basket as one intent on confirm', () => {
    const dispatch = vi.fn();
    render(<Harness session={atBuy()} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole('button', { name: /buy one messla/i }));
    fireEvent.click(screen.getByRole('button', { name: /buy one messla/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm purchase/i }));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'buyShares',
      playerId: 'p1',
      picks: ['Messla', 'Messla'],
    });
  });

  it('stops at three shares a turn', () => {
    render(<Harness session={atBuy()} dispatch={() => {}} />);
    const buy = screen.getByRole('button', { name: /buy one messla/i });
    fireEvent.click(buy);
    fireEvent.click(buy);
    fireEvent.click(buy);
    expect(buy).toBeDisabled();
  });

  it('ends the turn without buying', () => {
    const dispatch = vi.fn();
    render(<Harness session={atBuy()} dispatch={dispatch} />);
    fireEvent.click(screen.getByRole('button', { name: /end turn/i }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'endTurn', playerId: 'p1' });
  });
});

describe('useTurnPanel — mergers', () => {
  function stateWhere(predicate: (s: GameState) => boolean, id?: string): GameState {
    const games = id ? ALL_GOLDEN_GAMES.filter((g) => g.id === id) : ALL_GOLDEN_GAMES;
    for (const game of games) {
      const found = replayGoldenGame(game).find(predicate);
      if (found) return found;
    }
    throw new Error('no golden game reaches that state');
  }

  it('renders the liquidation queue and the acting shareholder', () => {
    const session = createGameSession({ state: stateWhere((s) => s.stage === 'mergerLiquidation') });
    render(<Harness session={session} dispatch={() => {}} />);

    expect(screen.getByText(/liquidate/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sell one share/i })).toBeInTheDocument();
  });

  it('accumulates a sale locally, then dispatches one liquidate intent', () => {
    const state = stateWhere((s) => s.stage === 'mergerLiquidation');
    const session = createGameSession({ state });
    const view = session.getView();
    const dispatch = vi.fn();
    render(<Harness session={session} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole('button', { name: /sell one share/i }));
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    const call = dispatch.mock.calls[0][0];

    expect(call.type).toBe('liquidate');
    expect(call.playerId).toBe(view.actorId);
    expect(call.sell).toBe(1);

    const ctx = view.state.mergerContext!;
    const absorbedId = ctx.absorbedIds[ctx.currentLiquidationIndex];
    const held = view.state.players.find((p) => p.id === view.actorId)!.portfolio[absorbedId] ?? 0;
    expect(call.sell + call.trade + call.keep).toBe(held);
  });

  it('offers a survivor choice when two chains tie', () => {
    const tied = stateWhere((s) => s.stage === 'chooseSurvivor');
    const session = createGameSession({ state: tied });
    const dispatch = vi.fn();
    render(<Harness session={session} dispatch={dispatch} />);

    expect(screen.getByText(/which chain survives/i)).toBeInTheDocument();
    const choice = tied.pendingTiedStartups![0];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${choice}$`, 'i') }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chooseSurvivor', startupId: choice }),
    );
  });
});
