import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { JoinRoomPage } from './JoinRoomPage';
import type { Connection } from '../net/connection';
import type { JoinedMessage, JoinRoomMessage, RejectedMessage } from '../../session/protocol';

function fakeConnection() {
  let joined: ((m: JoinedMessage) => void) | null = null;
  // A Set, not a single slot — matches `RoomPage.test.tsx`'s fake: production
  // is `socket.on`/`socket.off`, and a single overwritten slot would hide a
  // regression in multiple listeners coexisting on the same transport.
  const rejectedHandlers = new Set<(m: RejectedMessage) => void>();
  const joins: JoinRoomMessage[] = [];

  const connection: Connection = {
    transport: {
      sendIntent: () => {},
      sendUndo: () => {},
      onState: () => () => {},
      onRejected: (h) => { rejectedHandlers.add(h); return () => { rejectedHandlers.delete(h); }; },
      isOpen: () => true,
    },
    status: () => 'open',
    subscribe: () => () => {},
    createRoom: () => {},
    joinRoom: (m) => { joins.push(m); },
    beginGame: () => {},
    onJoined: (h) => { joined = h; return () => { joined = null; }; },
    onRoster: () => () => {},
    close: () => {},
  };

  return {
    connection,
    joins,
    sendJoined: (m: JoinedMessage) => act(() => { joined?.(m); }),
    sendRejected: (m: RejectedMessage) => act(() => { for (const h of rejectedHandlers) h(m); }),
  };
}

function renderJoin(connection: Connection) {
  return render(
    <MemoryRouter initialEntries={['/online/join']}>
      <Routes>
        <Route path="/online/join" element={<JoinRoomPage connect={() => connection} />} />
        <Route path="/room/:roomId" element={<div>room page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { localStorage.clear(); });

describe('joining a room', () => {
  it('stores the seat under that room\'s key and lands on the room page', () => {
    const f = fakeConnection();
    renderJoin(f.connection);

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText(/room code/i), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByRole('button', { name: /join room/i }));

    expect(f.joins).toEqual([{ roomId: 'ABC123', name: 'Sam' }]);

    f.sendJoined({ roomId: 'ABC123', playerId: 'p2', token: 'tok' });

    expect(screen.getByText('room page')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('acquire.room.ABC123')!)).toEqual({
      playerId: 'p2', token: 'tok', name: 'Sam',
    });
  });

  it('shows a rejection and leaves the form usable', () => {
    const f = fakeConnection();
    renderJoin(f.connection);

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText(/room code/i), { target: { value: 'WRONG1' } });
    fireEvent.click(screen.getByRole('button', { name: /join room/i }));

    f.sendRejected({ code: 'unknownIntent', message: 'cannot join WRONG1' });

    expect(screen.getByText(/cannot join wrong1/i)).toBeInTheDocument();

    // Not stuck: correcting the code and submitting again actually sends.
    fireEvent.change(screen.getByLabelText(/room code/i), { target: { value: 'ABC123' } });
    fireEvent.click(screen.getByRole('button', { name: /join room/i }));

    expect(f.joins).toEqual([
      { roomId: 'WRONG1', name: 'Sam' },
      { roomId: 'ABC123', name: 'Sam' },
    ]);
  });

  it('sends only one joinRoom when submitted twice before a reply arrives', () => {
    const f = fakeConnection();
    const { container } = renderJoin(f.connection);

    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Sam' } });
    fireEvent.change(screen.getByLabelText(/room code/i), { target: { value: 'ABC123' } });

    // Submit the form directly, twice, rather than clicking the button twice:
    // the button's `disabled` attribute would itself suppress a second click
    // in a real browser, which would prove nothing about the page's own
    // guard. Dispatching `submit` on the form bypasses that and exercises the
    // guard in `JoinForm`'s submit handler on its own merits.
    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(f.joins).toEqual([{ roomId: 'ABC123', name: 'Sam' }]);
  });
});
