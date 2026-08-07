import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ConnectionStrip } from './ConnectionStrip';

afterEach(() => { vi.useRealTimers(); });

describe('the connection strip', () => {
  it('says nothing at all while the socket is open', () => {
    render(<ConnectionStrip status="open" />);
    expect(screen.queryByTestId('connection-strip')).toBeNull();
  });

  it('starts with the short form', () => {
    render(<ConnectionStrip status="connecting" />);
    expect(screen.getByTestId('connection-strip')).toHaveTextContent('Connecting…');
  });

  it('explains the wait once it has gone on a while', () => {
    vi.useFakeTimers();
    render(<ConnectionStrip status="connecting" />);

    act(() => { vi.advanceTimersByTime(3000); });

    // A 30-second wake and a two-second blip look identical for the first
    // few seconds. After that they should not.
    expect(screen.getByTestId('connection-strip'))
      .toHaveTextContent('Waking the server — this can take up to 30 seconds');
  });

  it('drops back to the short form when the connection recovers and drops again', () => {
    vi.useFakeTimers();
    const { rerender } = render(<ConnectionStrip status="connecting" />);
    act(() => { vi.advanceTimersByTime(3000); });

    rerender(<ConnectionStrip status="open" />);
    rerender(<ConnectionStrip status="closed" />);

    // A fresh drop is a fresh two-second blip until proven otherwise —
    // latching "waking" from a previous outage would claim a 30-second wait
    // that is not happening.
    expect(screen.getByTestId('connection-strip')).toHaveTextContent('Disconnected — reconnecting…');
  });
});
