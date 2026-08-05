import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RoomPage } from './RoomPage';
import type { Connection } from '../net/connection';
import type { JoinedMessage, RejectedMessage, RosterMessage, StateMessage } from '../../session/protocol';
import { buildFixture } from '../../engine/golden/fixtures';

function fakeConnection() {
  let joined: ((m: JoinedMessage) => void) | null = null;
  let roster: ((m: RosterMessage) => void) | null = null;
  // Sets, not a single slot: production is `socket.on`/`socket.off`, and both
  // `useRoom` and `createNetworkSession` register their own `state` and
  // `rejected` listeners on the same transport. A single overwritten slot
  // would silently collapse two real listeners into one and hide any
  // regression in that coexistence.
  const stateHandlers = new Set<(m: StateMessage) => void>();
  const rejectedHandlers = new Set<(m: RejectedMessage) => void>();
  const joins: unknown[] = [];
  const begins: number[] = [];

  const connection: Connection = {
    transport: {
      sendIntent: () => {},
      sendUndo: () => {},
      onState: (h) => { stateHandlers.add(h); return () => { stateHandlers.delete(h); }; },
      onRejected: (h) => { rejectedHandlers.add(h); return () => { rejectedHandlers.delete(h); }; },
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
    sendState: (m: StateMessage) => act(() => { for (const h of stateHandlers) h(m); }),
    sendRejected: (m: RejectedMessage) => act(() => { for (const h of rejectedHandlers) h(m); }),
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

/** Joins as `name`, gets seated, and lands in the lobby with a second player already in it. */
function seated(name: string, isHost: boolean) {
  const f = fakeConnection();
  renderRoom(f.connection);
  fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: name } });
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
  it('shows the code to read out and everyone in it', () => {
    seated('Alex', true);
    expect(screen.getByTestId('room-code')).toHaveTextContent('ABC123');
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
  });

  it('lets the host start', () => {
    const f = seated('Alex', true);
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    expect(f.begins).toHaveLength(1);
  });

  it('offers nobody else a start button', () => {
    seated('Alex', false);
    expect(screen.queryByRole('button', { name: /start game/i })).toBeNull();
    expect(screen.getByText(/waiting for the host/i)).toBeInTheDocument();
  });
});

describe('a refusal that arrives after being seated', () => {
  it('shows inside the lobby rather than bouncing back to the join form', () => {
    const f = seated('Sam', false);

    // What the server actually sends a non-host who presses "start" — this
    // is the exact scenario `useRoom`'s phase ordering exists for.
    f.sendRejected({ code: 'notYourTurn', message: 'only the host may begin the game' });

    // Still in the lobby: the room code and the roster are still on screen.
    expect(screen.getByTestId('room-code')).toHaveTextContent('ABC123');
    expect(screen.getByText('Alex')).toBeInTheDocument();
    // The refusal is shown as a note, not swapped in for the lobby.
    expect(screen.getByText(/only the host may begin/i)).toBeInTheDocument();
    // Not bounced back to a join form.
    expect(screen.queryByLabelText(/your name/i)).toBeNull();
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

  it('keeps updating the board after the session is built, not just for the first message', () => {
    const f = fakeConnection();
    renderRoom(f.connection);
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: /join/i }));
    f.sendJoined({ roomId: 'ABC123', playerId: 'p2', token: 'tok' });

    const opening = buildFixture({
      players: [
        { name: 'Alex', cash: 6000, hand: ['E6'] },
        { name: 'Sam', cash: 6000, hand: ['A1'] },
      ],
      loners: ['E5'],
      bag: ['I11', 'I12'],
    });
    f.sendState({ state: opening, reason: 'commit', segmentStart: opening.nextStepId });

    // A1 starts out in Sam's hand — a clickable tile.
    expect(screen.getByTitle('A1').tagName).toBe('BUTTON');

    // A second state — the kind a real commit sends after a move — with A1
    // now placed on the board and a new tile, B2, drawn into the hand. This
    // only reaches the screen if `createNetworkSession`'s own `onState`
    // listener is still registered once `useRoom`'s has done its one job
    // (building the session) and become a no-op.
    const afterMove = buildFixture({
      players: [
        { name: 'Alex', cash: 6000, hand: ['E6'] },
        { name: 'Sam', cash: 6000, hand: ['B2'] },
      ],
      loners: ['E5', 'A1'],
      bag: ['I11'],
    });
    f.sendState({ state: afterMove, reason: 'commit', segmentStart: afterMove.nextStepId });

    // A1 is now a settled board tile, not a hand button.
    expect(screen.getByTitle('A1').tagName).toBe('SPAN');
    // B2 is the new hand tile.
    expect(screen.getByTitle('B2').tagName).toBe('BUTTON');
  });
});
