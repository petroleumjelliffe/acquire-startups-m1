import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevealOverlay } from './RevealOverlay';

describe('RevealOverlay', () => {
  it('names the player who is about to take the device', () => {
    render(<RevealOverlay playerName="Alex" onReveal={() => {}} />);
    expect(screen.getByText('Pass to Alex')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /I'm Alex/ })).toBeInTheDocument();
  });

  it('clears on the reveal button', () => {
    const onReveal = vi.fn();
    render(<RevealOverlay playerName="Alex" onReveal={onReveal} />);
    fireEvent.click(screen.getByRole('button', { name: /Reveal/ }));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  // The scrim is the whole point: it covers the board so the next player does
  // not see the previous player's hand on a shared device.
  it('covers its container with an opaque scrim', () => {
    const { container } = render(<RevealOverlay playerName="Alex" onReveal={() => {}} />);
    const scrim = container.firstElementChild!;
    expect(scrim.className).toMatch(/absolute/);
    expect(scrim.className).toMatch(/inset-0/);
  });

  it('shows the player emoji when there is one', () => {
    render(<RevealOverlay playerName="Alex" emoji="🦊" onReveal={() => {}} />);
    expect(screen.getByText('🦊')).toBeInTheDocument();
  });
});
