import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { GameScreen } from './GameScreen';
import { createGameSession } from '../../session/GameSession';
import type { GameSession, SessionView } from '../../session/GameSession';
import { buildFixture } from '../../engine/golden/fixtures';
import { ALL_GOLDEN_GAMES } from '../../engine/golden';
import { replayGoldenGame } from '../../engine/golden/replay';

function playable() {
  return buildFixture({
    players: [
      { name: 'Alex', cash: 6000, hand: ['E6', 'H8'] },
      { name: 'Sam', cash: 6000, hand: ['A1'] },
    ],
    loners: ['E5'],
    bag: ['I11', 'I12'],
  });
}

describe('GameScreen', () => {
  it('covers the whole surface with the curtain until the actor claims it', () => {
    render(<GameScreen session={createGameSession({ state: playable() })} />);

    expect(screen.getByText(/pass to/i)).toBeInTheDocument();
    const curtain = within(screen.getByTestId('game-surface')).getByTestId('curtain');
    expect(curtain.className).toMatch(/inset-0/);
  });

  it('shows the board and panel once revealed', () => {
    const { container } = render(<GameScreen session={createGameSession({ state: playable() })} />);
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }));

    expect(container.querySelector('[data-board="grid"]')).not.toBeNull();
    expect(screen.getByText(/place a tile/i)).toBeInTheDocument();
  });

  it('renders all five panel slots at every stage, so the panel cannot resize', () => {
    const session = createGameSession({ state: playable() });
    const { container } = render(<GameScreen session={session} />);
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }));

    const slotsAtPlay = [...container.querySelectorAll('[data-slot]')]
      .map((el) => el.getAttribute('data-slot'));
    expect(slotsAtPlay).toEqual(['stepstack', 'active', 'staging', 'hand', 'players']);

    fireEvent.click(screen.getByTitle('E6'));
    const slotsAtFound = [...container.querySelectorAll('[data-slot]')]
      .map((el) => el.getAttribute('data-slot'));
    expect(slotsAtFound).toEqual(slotsAtPlay);
  });

  it('plays a whole turn and raises the curtain for the next player', () => {
    render(<GameScreen session={createGameSession({ state: playable() })} />);
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }));

    fireEvent.click(screen.getByTitle('E6'));
    fireEvent.click(screen.getByRole('button', { name: /^messla$/i }));
    // One button ends the buy step: "Skip" with nothing staged.
    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));

    expect(screen.getByText(/pass to sam/i)).toBeInTheDocument();
  });

  it('undoes a placement from the step stack', () => {
    render(<GameScreen session={createGameSession({ state: playable() })} />);
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }));

    fireEvent.click(screen.getByTitle('E6'));
    expect(screen.getByText(/found a brand/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(screen.getByText(/place a tile/i)).toBeInTheDocument();
  });
});

describe('changing your mind about a tile', () => {
  /**
   * Scoped to the grid: once a tile is placed the step stack renders its
   * coordinate as a log token, with a `title` of its own, so an unscoped
   * `getByTitle` matches the board cell and the log entry both.
   */
  function onBoard(coord: string) {
    const grid = screen.getByTestId('game-surface').querySelector('[data-board="grid"]')!;
    return within(grid as HTMLElement).getByTitle(coord);
  }

  function placedE6() {
    render(<GameScreen session={createGameSession({ state: playable() })} />);
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }));
    fireEvent.click(screen.getByTitle('E6'));
    // E6 sits next to the loner E5, so placing it asks which brand to found —
    // the stage has moved on, which is what used to make a second click an
    // error rather than a correction.
    expect(screen.getByText(/found a brand/i)).toBeInTheDocument();
  }

  it('switches to the new tile without an undo first', () => {
    placedE6();

    fireEvent.click(onBoard('H8'));

    // H8 is played, E6 is back in hand, and nothing was refused.
    expect(onBoard('H8')).not.toHaveAttribute('data-tile-state', 'hand');
    expect(onBoard('E6')).toHaveAttribute('data-tile-state', 'hand');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refuses once the placement has been built on', () => {
    placedE6();
    // Founding the brand settles the placement: undo is the way back now.
    fireEvent.click(screen.getByRole('button', { name: /^messla$/i }));

    fireEvent.click(onBoard('H8'));

    expect(onBoard('E6')).not.toHaveAttribute('data-tile-state', 'hand');
    expect(onBoard('H8')).toHaveAttribute('data-tile-state', 'hand');
  });
});

describe('GameScreen at the turn-order draw', () => {
  /** A fresh game: hands are dealt, but the draw has not happened. */
  function atDraw() {
    return createGameSession({ seed: 'draw-1', names: ['Alex', 'Sam'] });
  }

  /**
   * The draw is a gate in front of the game, not seat one's turn. Seat one
   * presses the button on behalf of the table, so none of their private state
   * may be on screen: not their tiles on the board, not their shares in the
   * hand zone. Showing them made the draw read as "Player 1's turn has begun",
   * which is why handing play to whoever won it looked like a skipped turn.
   */
  it('puts nobody hand on the board before the draw', () => {
    const { container } = render(<GameScreen session={atDraw()} />);
    expect(container.querySelector('[data-board="grid"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-board="grid"] button')).toHaveLength(0);
  });

  it('names no player in the hand zone before the draw', () => {
    render(<GameScreen session={atDraw()} />);
    expect(screen.queryByText(/'s hand/i)).toBeNull();
  });

  it('shows no shares or balance for anyone before the draw', () => {
    const { container } = render(<GameScreen session={atDraw()} />);
    const hand = container.querySelector('[data-slot="hand"]')!;
    expect(hand.textContent).not.toMatch(/\$6,000/);
  });

  it('goes straight to the draw with no curtain in the way', () => {
    render(<GameScreen session={atDraw()} />);
    expect(screen.queryByText(/pass to/i)).toBeNull();
    expect(screen.getByRole('button', { name: /draw for turn order/i })).toBeInTheDocument();
  });

  it('hands to the winner behind the curtain once the draw is done', () => {
    render(<GameScreen session={atDraw()} />);
    fireEvent.click(screen.getByRole('button', { name: /draw for turn order/i }));
    expect(screen.getByText(/pass to/i)).toBeInTheDocument();
  });
});

it('marks nobody as the active seat before the draw', () => {
  // Highlighting seat one in the roster is the same conflation in miniature:
  // they press the button, but no turn has begun and no seat is "up" yet.
  const { container } = render(
    <GameScreen session={createGameSession({ seed: 'draw-2', names: ['Alex', 'Sam'] })} />,
  );
  expect(container.querySelectorAll('[data-seat] .border-blue-600')).toHaveLength(0);
  expect(container.querySelectorAll('[data-seat].border-blue-600')).toHaveLength(0);
});

describe('GameScreen at the end of a game', () => {
  function ended() {
    const g9 = ALL_GOLDEN_GAMES.find((g) => g.id === 'G9')!;
    const state = replayGoldenGame(g9).at(-1)!;
    if (state.stage !== 'end') throw new Error('G9 no longer ends');
    return createGameSession({ state });
  }

  it('covers the whole surface with the scoreboard', () => {
    render(<GameScreen session={ended()} />);
    const overlay = screen.getByTestId('final-overlay');
    expect(overlay.className).toMatch(/inset-0/);
  });

  it('shows the totals the engine reports', () => {
    const { container } = render(<GameScreen session={ended()} />);
    // G9's declared totals, derived — not written down anywhere in src/.
    // Scoped to the Total row: the winner's figure also headlines
    // `FinalScoring`'s banner ("X wins with $Y"), so a plain `getByText`
    // matches twice for whichever total is highest.
    const totals = [...container.querySelectorAll('[data-fs-row="total"]')].map(
      (el) => el.textContent,
    );
    expect(totals).toContain('$27,800');
    expect(totals).toContain('$21,600');
    expect(totals).toContain('$4,300');
  });

  it('says why the game ended', () => {
    render(<GameScreen session={ended()} />);
    // Scoped to the overlay: the step stack already logs a "Game over" entry
    // with the same reason text (from the `declareEnd` step in G9's history),
    // so an unscoped query matches both it and the overlay's banner.
    const overlay = screen.getByTestId('final-overlay');
    expect(within(overlay).getByText(/reached 41 tiles/i)).toBeInTheDocument();
  });

  it('offers a new game and a way out when the page supplies them', () => {
    const onNewGame = vi.fn();
    const onExit = vi.fn();
    render(<GameScreen session={ended()} onNewGame={onNewGame} onExit={onExit} />);

    fireEvent.click(screen.getByRole('button', { name: /new game/i }));
    expect(onNewGame).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /back to menu/i }));
    expect(onExit).toHaveBeenCalled();
  });

  it('keeps the end-game actions inside the scoreboard card', () => {
    // Regression: these buttons used to render as a sibling of `FinalScoring`
    // rather than through its `actions` slot. `FinalScoring`'s root is
    // `absolute inset-0`, which contributes no flow height — a sibling's
    // `mt-6` was measured from the scrim's top edge, not the card's bottom,
    // so the row landed on top of the winner banner (worst at 768px). An
    // unscoped `getByRole` (the test above) cannot tell the two layouts
    // apart, because the buttons are "present in the document" either way —
    // it has to be scoped to the card itself.
    const { container } = render(
      <GameScreen session={ended()} onNewGame={() => {}} onExit={() => {}} />,
    );
    const card = container.querySelector('[data-testid="final-overlay"] .rounded-2xl');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByRole('button', { name: /new game/i })).toBeInTheDocument();
    expect(within(card as HTMLElement).getByRole('button', { name: /back to menu/i })).toBeInTheDocument();
  });

  it('omits the buttons the page did not supply', () => {
    render(<GameScreen session={ended()} />);
    expect(screen.queryByRole('button', { name: /new game/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /back to menu/i })).toBeNull();
  });

  it('shows no overlay while the game is still running', () => {
    render(<GameScreen session={createGameSession({ state: playable() })} />);
    expect(screen.queryByTestId('final-overlay')).toBeNull();
  });
});

/**
 * A session whose view is fixed. Used only to put the screen into states a
 * local `GameSession` cannot produce — `pending` is set by the networked
 * session, which does not exist in this test's world.
 */
function frozen(view: SessionView): GameSession {
  return {
    getView: () => view,
    subscribe: () => () => {},
    dispatch: () => {},
    undoTo: () => {},
    undoThen: () => {},
    reveal: () => {},
  };
}

describe('GameScreen with a viewer who is not the actor', () => {
  // `playable()` seats Alex (p1, holding E6 and H8) and Sam (p2, holding A1),
  // with the turn on Alex. Sam is therefore the viewer who must wait.
  function watching() {
    return <GameScreen session={createGameSession({ state: playable() })} viewerId="p2" />;
  }

  it('raises no curtain — there is no device to pass', () => {
    render(watching());
    expect(screen.queryByText(/pass to/i)).toBeNull();
    expect(screen.queryByTestId('curtain')).toBeNull();
  });

  it('shows me my own hand while someone else acts', () => {
    render(watching());
    // Every board coordinate renders a labelled cell regardless of occupancy
    // — `queryByTitle` alone can't tell "not shown" from "shown as an inert
    // empty square" (both carry `title={coord}`). A hand tile is the one
    // rendered as a clickable `<button>`; an untouched square is a `<span>`.
    // `data-tile-state`, not the tag: a hand tile with nothing to do is
    // deliberately no longer a `<button>`, so the tag can no longer tell
    // "mine" from "not mine". The state can, and is what the badge means.
    expect(screen.getByTitle('A1')).toHaveAttribute('data-tile-state', 'hand');
    expect(screen.getByTitle('E6')).not.toHaveAttribute('data-tile-state', 'hand');
    expect(screen.getByTitle('H8')).not.toHaveAttribute('data-tile-state', 'hand');
  });

  it('says whose turn it is where you cannot miss it, and offers nothing', () => {
    render(watching());

    // The toast carries this, not the panel. It used to be one line of grey
    // inside the active zone, and the first by-hand session reported not being
    // able to tell whose turn it was at all.
    const toast = screen.getByTestId('turn-toast');
    expect(toast).toHaveTextContent(/alex/i);
    expect(screen.queryByRole('button', { name: /end turn/i })).toBeNull();
  });

  it('keeps showing me my own step rather than replacing it', () => {
    render(watching());
    // The panel still says what stage the game is in — the step is not taken
    // away from you just because the move is not yours.
    const active = screen.getByTestId('game-surface').querySelector('[data-slot="active"]')!;
    expect(active.textContent).toMatch(/place a tile/i);
  });

  it('ignores a click on my own tile when it is not my turn', () => {
    render(watching());
    fireEvent.click(screen.getByTitle('A1'));
    // Still someone else's turn, and A1 is still mine to play later.
    expect(screen.getByTestId('turn-toast')).toHaveTextContent(/alex/i);
    expect(screen.getByTitle('A1')).toBeInTheDocument();
  });

  it('announces your own turn differently from someone else waiting', () => {
    // Someone else up is a standing fact and persists; your turn arriving is
    // an event that announces itself and goes.
    render(<GameScreen session={createGameSession({ state: playable() })} viewerId="p1" />);
    expect(screen.getByTestId('turn-toast')).toHaveAttribute('data-turn', 'mine');
    expect(screen.getByTestId('turn-toast')).toHaveTextContent(/your turn/i);
  });

  it('takes the your-turn announcement away again, but not the other one', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <GameScreen session={createGameSession({ state: playable() })} viewerId="p1" />,
      );
      act(() => { vi.advanceTimersByTime(5000); });
      expect(screen.queryByTestId('turn-toast'), 'the announcement never left').toBeNull();
      unmount();

      // The watcher's form is a standing fact, so time does not remove it.
      render(<GameScreen session={createGameSession({ state: playable() })} viewerId="p2" />);
      act(() => { vi.advanceTimersByTime(5000); });
      expect(screen.getByTestId('turn-toast')).toHaveAttribute('data-turn', 'theirs');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows no toast at all in pass-and-play', () => {
    // The curtain already announces the handoff, at full-screen size.
    render(<GameScreen session={createGameSession({ state: playable() })} />);
    expect(screen.queryByTestId('turn-toast')).toBeNull();
  });

  it('keeps all five panel slots, so waiting does not resize the panel', () => {
    const { container } = render(watching());
    const slots = [...container.querySelectorAll('[data-slot]')].map((el) => el.getAttribute('data-slot'));
    expect(slots).toEqual(['stepstack', 'active', 'staging', 'hand', 'players']);
  });

  it('goes inert while a bag-drawing intent is in flight', () => {
    const session = createGameSession({ state: playable() });
    session.reveal();
    const view = { ...session.getView(), pending: true };
    render(<GameScreen session={frozen(view)} viewerId="p1" />);

    // p1 *is* the actor, but the answer has to come from the server.
    expect(screen.getByText(/sending/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /end turn/i })).toBeNull();
  });
});
