import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { GameScreen } from './GameScreen';
import { createGameSession } from './session/GameSession';
import { buildFixture } from '../../engine/golden/fixtures';

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
    fireEvent.click(screen.getByRole('button', { name: /end turn/i }));

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
