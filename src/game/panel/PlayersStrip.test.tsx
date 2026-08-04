import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayersStrip } from './PlayersStrip';
import { PLAYER_EMOJI } from '../../../engine/startups';

const six = PLAYER_EMOJI.map((emoji, i) => ({
  id: `p${i + 1}`,
  emoji,
  name: ['Ada', 'Blaise', 'Curie', 'Dijkstra', 'Euler', 'Fermat'][i],
  cash: 6000,
  active: i === 0,
}));

describe('PlayersStrip', () => {
  it('renders every seat at a full table', () => {
    render(<PlayersStrip players={six} />);
    for (const p of six) expect(screen.getByText(p.name)).toBeInTheDocument();
  });

  it('outlines the active seat and only that one', () => {
    const { container } = render(<PlayersStrip players={six} />);
    expect(container.querySelectorAll('.border-blue-600')).toHaveLength(1);
  });

  /**
   * A six-seat table has to fit a 320px panel. The cards were `flex-1` *and*
   * `whitespace-nowrap`, so each one's min-content width won and six of them
   * overflowed to 1061px inside a 319px strip — the last four were simply
   * clipped, invisibly, in any game with more than two players. jsdom cannot
   * measure that, so what is asserted here is the structural antidote (cards
   * may shrink, names may truncate); the dimensional proof is
   * `npm run verify:layout`, which now measures the strip's real overflow.
   */
  it('lets seats shrink rather than overflowing the panel', () => {
    const { container } = render(<PlayersStrip players={six} />);
    const cards = [...container.querySelectorAll('[data-seat]')];
    expect(cards).toHaveLength(6);
    for (const card of cards) expect(card.className).toMatch(/min-w-0/);
  });
});
