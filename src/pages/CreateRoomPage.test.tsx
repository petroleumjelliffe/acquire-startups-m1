import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CreateRoomPage } from './CreateRoomPage';
import type { Connection } from '../net/connection';
import type { JoinedMessage } from '../../session/protocol';

function fakeConnection() {
  let joined: ((m: JoinedMessage) => void) | null = null;
  const created: string[] = [];

  const connection: Connection = {
    transport: {
      sendIntent: () => {}, sendUndo: () => {},
      onState: () => () => {}, onRejected: () => () => {}, isOpen: () => true,
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

  return { connection, created, sendJoined: (m: JoinedMessage) => act(() => { joined?.(m); }) };
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
});
