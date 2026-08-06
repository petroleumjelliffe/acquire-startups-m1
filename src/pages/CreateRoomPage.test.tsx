import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CreateRoomPage } from './CreateRoomPage';
import type { Connection } from '../net/connection';
import type { JoinedMessage, RejectedMessage } from '../../session/protocol';

function fakeConnection() {
  let joined: ((m: JoinedMessage) => void) | null = null;
  // A Set, not a single slot — matches `JoinRoomPage.test.tsx`'s fake:
  // production is `socket.on`/`socket.off`, and a single overwritten slot
  // would hide a regression in multiple listeners coexisting on the same
  // transport.
  const rejectedHandlers = new Set<(m: RejectedMessage) => void>();
  const created: string[] = [];

  const connection: Connection = {
    transport: {
      sendIntent: () => {}, sendUndo: () => {},
      onState: () => () => {},
      onRejected: (h) => { rejectedHandlers.add(h); return () => { rejectedHandlers.delete(h); }; },
      isOpen: () => true,
    },
    status: () => 'open',
    subscribe: () => () => {},
    createRoom: (name) => { created.push(name); },
    joinRoom: () => {},
    beginGame: () => {},
    onJoined: (h) => { joined = h; return () => { joined = null; }; },
    onRoster: () => () => {},
    close: () => {},
  };

  return {
    connection,
    created,
    sendJoined: (m: JoinedMessage) => act(() => { joined?.(m); }),
    sendRejected: (m: RejectedMessage) => act(() => { for (const h of rejectedHandlers) h(m); }),
  };
}

beforeEach(() => { localStorage.clear(); });

describe('creating a room', () => {
  it('asks the server for one, then lands in it', () => {
    const f = fakeConnection();
    render(
      <MemoryRouter initialEntries={['/online/create']}>
        <Routes>
          <Route path="/online/create" element={<CreateRoomPage connect={() => f.connection} />} />
          <Route path="/room/:roomId" element={<div>room page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('button', { name: /create room/i }));
    expect(f.created).toEqual(['Alex']);

    f.sendJoined({ roomId: 'ABC123', playerId: 'p1', token: 'tok' });

    expect(screen.getByText('room page')).toBeInTheDocument();
    // Creating a room stores the seat the server issued, under that room's
    // key, so the room screen it lands on rejoins rather than taking a new
    // seat.
    expect(JSON.parse(localStorage.getItem('acquire.room.ABC123')!)).toEqual({
      playerId: 'p1', token: 'tok', name: 'Alex',
    });
  });

  it('recovers from a rejection instead of hanging on "Creating…" forever', () => {
    const f = fakeConnection();
    render(
      <MemoryRouter initialEntries={['/online/create']}>
        <Routes>
          <Route path="/online/create" element={<CreateRoomPage connect={() => f.connection} />} />
          <Route path="/room/:roomId" element={<div>room page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('button', { name: /create room/i }));
    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();

    f.sendRejected({ code: 'unknownIntent', message: 'createRoom requires a name' });

    // Not stuck: the button is live again and reads its idle label.
    const button = screen.getByRole('button', { name: /create room/i });
    expect(button).not.toBeDisabled();
    expect(screen.getByText(/createRoom requires a name/i)).toBeInTheDocument();

    fireEvent.click(button);
    expect(f.created).toEqual(['Alex', 'Alex']);
  });
});
