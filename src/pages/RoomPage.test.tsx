import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RoomPage } from './RoomPage';
import type { Connection } from '../net/connection';
import type { JoinedMessage, RosterMessage, StateMessage } from '../../session/protocol';
import { buildFixture } from '../../engine/golden/fixtures';

function fakeConnection() {
  let joined: ((m: JoinedMessage) => void) | null = null;
  let roster: ((m: RosterMessage) => void) | null = null;
  let state: ((m: StateMessage) => void) | null = null;
  const joins: unknown[] = [];
  const begins: number[] = [];

  const connection: Connection = {
    transport: {
      sendIntent: () => {},
      sendUndo: () => {},
      onState: (h) => { state = h; return () => { state = null; }; },
      onRejected: () => () => {},
      isOpen: () => true,
    },
    status: () => 'open',
    subscribe: () => () => {},
    createRoom: () => {},
    joinRoom: (m) => { joins.push(m); },
    beginGame: () => { begins.push(1); },
    onJoined: (h) => { joined = h; return () => { joined = null; }; },
    onRoster: (h) => { roster = h; return () => { roster = null; }; },
    close: () => {},
  };

  return {
    connection,
    joins,
    begins,
    sendJoined: (m: JoinedMessage) => act(() => { joined?.(m); }),
    sendRoster: (m: RosterMessage) => act(() => { roster?.(m); }),
    sendState: (m: StateMessage) => act(() => { state?.(m); }),
  };
}

function renderRoom(connection: Connection) {
  return render(
    <MemoryRouter initialEntries={['/room/ABC123']}>
      <Routes>
        <Route path="/room/:roomId" element={<RoomPage connect={() => connection} />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { localStorage.clear(); });

describe('arriving at a room without a seat', () => {
  it('asks for a name rather than joining as nobody', () => {
    const f = fakeConnection();
    renderRoom(f.connection);

    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
    expect(f.joins).toEqual([]);
  });

  it('joins with the name given', () => {
    const f = fakeConnection();
    renderRoom(f.connection);

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: /join/i }));

    expect(f.joins).toEqual([{ roomId: 'ABC123', name: 'Sam' }]);
  });
});

describe('a refresh rejoins the same seat', () => {
  it('presents the stored token instead of taking a new seat', () => {
    localStorage.setItem(
      'acquire.room.ABC123',
      JSON.stringify({ playerId: 'p2', token: 'tok', name: 'Sam' }),
    );
    const f = fakeConnection();
    renderRoom(f.connection);

    expect(f.joins).toEqual([{ roomId: 'ABC123', name: 'Sam', playerId: 'p2', token: 'tok' }]);
  });
});

describe('the lobby', () => {
  function seated(isHost: boolean) {
    const f = fakeConnection();
    renderRoom(f.connection);
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('button', { name: /join/i }));
    f.sendJoined({ roomId: 'ABC123', playerId: isHost ? 'p1' : 'p2', token: 'tok' });
    f.sendRoster({
      roomId: 'ABC123',
      lifecycle: 'lobby',
      players: [
        { id: 'p1', name: 'Alex', isHost: true, connected: true },
        { id: 'p2', name: 'Sam', isHost: false, connected: true },
      ],
    });
    return f;
  }

  it('shows the code to read out and everyone in it', () => {
    seated(true);
    expect(screen.getByTestId('room-code')).toHaveTextContent('ABC123');
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
  });

  it('lets the host start', () => {
    const f = seated(true);
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    expect(f.begins).toHaveLength(1);
  });

  it('offers nobody else a start button', () => {
    seated(false);
    expect(screen.queryByRole('button', { name: /start game/i })).toBeNull();
    expect(screen.getByText(/waiting for the host/i)).toBeInTheDocument();
  });
});

describe('the first state message starts the game', () => {
  it('swaps the lobby for the board, seen from my own seat', () => {
    const f = fakeConnection();
    renderRoom(f.connection);
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: /join/i }));
    f.sendJoined({ roomId: 'ABC123', playerId: 'p2', token: 'tok' });

    const state = buildFixture({
      players: [
        { name: 'Alex', cash: 6000, hand: ['E6'] },
        { name: 'Sam', cash: 6000, hand: ['A1'] },
      ],
      loners: ['E5'],
      bag: ['I11', 'I12'],
    });
    f.sendState({ state, reason: 'commit', segmentStart: state.nextStepId });

    expect(screen.getByTestId('game-surface')).toBeInTheDocument();
    // p2's own tile, and no curtain over it.
    expect(screen.getByTitle('A1')).toBeInTheDocument();
    expect(screen.queryByText(/pass to/i)).toBeNull();
    expect(screen.getByText(/waiting for alex/i)).toBeInTheDocument();
  });
});
