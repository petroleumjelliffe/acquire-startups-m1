import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PassAndPlayPage } from './PassAndPlayPage';

describe('PassAndPlayPage', () => {
  it('opens on the new roster setup, not the comma-separated field', () => {
    render(<MemoryRouter><PassAndPlayPage /></MemoryRouter>);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByPlaceholderText(/comma/i)).toBeNull();
  });

  it('starts a game and lands on the curtain, not a modal', () => {
    render(<MemoryRouter><PassAndPlayPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(screen.getByTestId('game-surface')).toBeInTheDocument();
    expect(screen.getByText(/pass to/i)).toBeInTheDocument();
  });

  it('reaches the first turn without wedging at the draw stage', () => {
    render(<MemoryRouter><PassAndPlayPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }));

    fireEvent.click(screen.getByRole('button', { name: /draw for turn order/i }));

    // The seed is random per mount, so whether seat one wins the turn-order
    // draw is too — and the curtain only rises when the actor changes. Claim
    // it when it is there; either way the first turn must be reachable.
    const handoff = screen.queryByRole('button', { name: /reveal/i });
    if (handoff) fireEvent.click(handoff);

    expect(screen.getByText(/place a tile/i)).toBeInTheDocument();
  });
});
