import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RoomPage } from './RoomPage';
import type { Connection, ConnectionStatus } from '../net/connection';
import type { JoinedMessage, RejectedMessage, RosterMessage, StateMessage } from '../../session/protocol';
import { buildFixture } from '../../engine/golden/fixtures';
import { loadIdentity } from '../net/identity';

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
  const statusListeners = new Set<() => void>();
  const joins: unknown[] = [];
  const begins: number[] = [];
  let status: ConnectionStatus = 'open';

  const connection: Connection = {
    transport: {
      sendIntent: () => {},
      sendUndo: () => {},
      onState: (h) => { stateHandlers.add(h); return () => { stateHandlers.delete(h); }; },
      onRejected: (h) => { rejectedHandlers.add(h); return () => { rejectedHandlers.delete(h); }; },
      // Tied to the same `status` a real socket's `connected` flag tracks,
      // so driving `setStatus` below exercises `NetworkSession`'s own
      // `!transport.isOpen()` guard the same way a real drop would.
      isOpen: () => status === 'open',
    },
    status: () => status,
    subscribe: (l) => { statusListeners.add(l); return () => { statusListeners.delete(l); }; },
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
    setStatus: (next: ConnectionStatus) => act(() => {
      status = next;
      for (const l of statusListeners) l();
    }),
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
    expect(screen.getByTestId('turn-toast')).toHaveTextContent(/alex/i);
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
    expect(screen.getByTitle('A1')).toHaveAttribute('data-tile-state', 'hand');

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
    expect(screen.getByTitle('A1')).not.toHaveAttribute('data-tile-state', 'hand');
    // B2 is the new hand tile.
    expect(screen.getByTitle('B2')).toHaveAttribute('data-tile-state', 'hand');
  });
});

/**
 * Sam (p2) is the actor, at `buy` — where `useTurnPanel` always renders its
 * one commit button, so there is no board placement to walk through first
 * (placing a tile next to a lone tile founds a chain and changes stage, which
 * is not what these tests are about). With nothing staged that button reads
 * "Skip", and pressing it ends the turn: a bag-drawing intent, which is the
 * pending path these tests need.
 */
function midGameState() {
  return buildFixture({
    players: [
      { name: 'Alex', cash: 6000, hand: [] },
      { name: 'Sam', cash: 6000, hand: [] },
    ],
    stage: 'buy',
    currentPlayerIndex: 1,
    bag: ['I11', 'I12'],
  });
}

describe('a dropped connection', () => {
  it('clears a stuck "Sending…" and goes inert, even mid-turn', () => {
    const f = fakeConnection();
    renderRoom(f.connection);
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: /join/i }));
    f.sendJoined({ roomId: 'ABC123', playerId: 'p2', token: 'tok' });

    const state = midGameState();
    f.sendState({ state, reason: 'commit', segmentStart: state.nextStepId });

    // It is Sam's own turn. Skipping the buy ends it, and ending a turn is a
    // bag-drawing intent: it goes on the wire and the session marks itself
    // pending until the server answers.
    fireEvent.click(screen.getByRole('button', { name: /^end turn$/i }));
    expect(screen.getByText(/sending/i)).toBeInTheDocument();

    f.setStatus('closed');

    // Not stuck on "Sending…" forever, and a readable message replaces it —
    // the belt (`connectionLost`, the panel's own alert) and the suspenders
    // (`connected` forcing `canAct` false, `ConnectionStrip`'s own pill) both
    // land. Two distinct roles, not `getByText`, because both messages
    // contain "disconnect" and a bare text query would match twice.
    expect(screen.queryByText(/sending/i)).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/disconnect/i);
    // By test id, not by role: the turn toast is also a live region, and
    // since it now announces your *own* turn as well there are two on screen
    // whenever it is your move.
    expect(screen.getByTestId('connection-strip')).toHaveTextContent(/disconnect/i);
  });

  it('resends the stored-identity join once the socket comes back', () => {
    const f = fakeConnection();
    renderRoom(f.connection);
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: /join/i }));
    f.sendJoined({ roomId: 'ABC123', playerId: 'p2', token: 'tok' });

    const state = midGameState();
    f.sendState({ state, reason: 'commit', segmentStart: state.nextStepId });
    expect(f.joins).toEqual([{ roomId: 'ABC123', name: 'Sam' }]);

    f.setStatus('closed');
    f.setStatus('open');

    // The join latch that stopped a second `joinRoom` from ever being sent
    // has to reset on the drop, or this rejoin — the thing that actually
    // rebinds the socket server-side — never happens.
    expect(f.joins).toEqual([
      { roomId: 'ABC123', name: 'Sam' },
      { roomId: 'ABC123', name: 'Sam', playerId: 'p2', token: 'tok' },
    ]);
  });
});

describe('a stale identity, refused', () => {
  it('is cleared, so a later visit gets a clean join instead of repeating the same refusal', () => {
    localStorage.setItem(
      'acquire.room.ABC123',
      JSON.stringify({ playerId: 'p9', token: 'stale', name: 'Ghost' }),
    );
    const f = fakeConnection();
    renderRoom(f.connection);

    expect(f.joins).toEqual([{ roomId: 'ABC123', name: 'Ghost', playerId: 'p9', token: 'stale' }]);

    f.sendRejected({ code: 'unknownIntent', message: 'cannot join ABC123' });

    expect(loadIdentity('ABC123')).toBeNull();
  });

  it('leaves a valid identity alone when the refusal is an ordinary in-lobby one', () => {
    // The same rejection event fires for "only the host may begin" once
    // we're already seated — that must not be mistaken for a refused rejoin
    // and clear a perfectly good identity out from under the player.
    const f = seated('Sam', false);
    f.sendRejected({ code: 'notYourTurn', message: 'only the host may begin the game' });

    expect(loadIdentity('ABC123')).toEqual({ playerId: 'p2', token: 'tok', name: 'Sam' });
  });
});
