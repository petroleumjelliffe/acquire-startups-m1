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

  it('starts a game and lands on the turn-order draw, not a modal', () => {
    render(<MemoryRouter><PassAndPlayPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(screen.getByTestId('game-surface')).toBeInTheDocument();
    // The draw is a gate in front of the game: no curtain, because nobody's
    // hand is on screen yet for a curtain to protect.
    expect(screen.getByRole('button', { name: /draw for turn order/i })).toBeInTheDocument();
    expect(screen.queryByText(/pass to/i)).toBeNull();
  });

  it('reaches the first turn without wedging at the draw stage', () => {
    render(<MemoryRouter><PassAndPlayPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    fireEvent.click(screen.getByRole('button', { name: /draw for turn order/i }));

    // The draw always hands off, whoever won it: seat one pressed the button
    // for the table, so the winner's hand still has to be revealed to them.
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));

    expect(screen.getByText(/place a tile/i)).toBeInTheDocument();
  });
});
