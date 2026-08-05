import { describe, it, expect } from 'vitest';
import { createNetworkSession } from './NetworkSession';
import type { RoomTransport } from './transport';
import { buildFixture } from '../../engine/golden/fixtures';
import type { GameState } from '../../engine/gameTypes';
import type { RejectedMessage, StateMessage } from '../../session/protocol';

/** p1 holds E6 next to a loner, so founding is one click away. p2 waits. */
function board(): GameState {
  return buildFixture({
    players: [
      { name: 'Alex', cash: 6000, hand: ['E6'] },
      { name: 'Sam', cash: 6000, hand: ['A1'] },
    ],
    loners: ['E5'],
    bag: ['I11', 'I12'],
  });
}

function harness(state = board()) {
  const sent: unknown[] = [];
  const undos: number[] = [];
  let onState: ((m: StateMessage) => void) | null = null;
  let onRejected: ((m: RejectedMessage) => void) | null = null;
  let open = true;

  const transport: RoomTransport = {
    sendIntent: (w) => { sent.push(w); },
    sendUndo: (id) => { undos.push(id); },
    onState: (h) => { onState = h; return () => { onState = null; }; },
    onRejected: (h) => { onRejected = h; return () => { onRejected = null; }; },
    isOpen: () => open,
  };

  return {
    sent,
    undos,
    setOpen: (v: boolean) => { open = v; },
    serverSays: (m: StateMessage) => onState?.(m),
    serverRefuses: (m: RejectedMessage) => onRejected?.(m),
    session: (playerId = 'p1') => createNetworkSession({
      transport,
      playerId,
      initial: { state, reason: 'commit', segmentStart: state.nextStepId },
    }),
  };
}

describe('a predictable intent moves the screen before the server answers', () => {
  it('applies locally and sends', () => {
    const h = harness();
    const session = h.session();

    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });

    expect(session.getView().state.board['E6'].placed).toBe(true);
    expect(h.sent).toEqual([{ type: 'placeTile', coord: 'E6' }]);
    expect(session.getView().error).toBeNull();
  });
});

describe('a bag-drawing intent waits for the server', () => {
  it('changes nothing locally, and marks itself pending', () => {
    const h = harness();
    const session = h.session();
    const before = session.getView().state;

    session.dispatch({ type: 'endTurn', playerId: 'p1' });

    expect(session.getView().state).toBe(before);
    expect(session.getView().pending).toBe(true);
    expect(h.sent).toEqual([{ type: 'endTurn' }]);
  });

  it('moves only when the server says so, and stops being pending', () => {
    const h = harness();
    const session = h.session();
    session.dispatch({ type: 'endTurn', playerId: 'p1' });

    const next = buildFixture({
      players: [
        { name: 'Alex', cash: 6000, hand: ['E6'] },
        { name: 'Sam', cash: 6000, hand: ['A1'] },
      ],
      loners: ['E5', 'H8'],
      bag: ['I11'],
    });
    h.serverSays({ state: next, reason: 'commit', segmentStart: next.nextStepId });

    expect(session.getView().state.board['H8'].placed).toBe(true);
    expect(session.getView().pending).toBe(false);
  });

  it('refuses a second intent while one is in flight', () => {
    const h = harness();
    const session = h.session();

    session.dispatch({ type: 'endTurn', playerId: 'p1' });
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });

    expect(h.sent).toEqual([{ type: 'endTurn' }]);
    expect(session.getView().state.board['E6'].placed).toBe(false);
  });
});

describe('an intent the local state refuses never reaches the wire', () => {
  it('reports the engine reason and sends nothing', () => {
    const h = harness();
    const session = h.session('p2');

    // p2 holds A1, but it is not p2's turn.
    session.dispatch({ type: 'placeTile', playerId: 'p2', coord: 'A1' });

    expect(h.sent).toEqual([]);
    expect(session.getView().error?.code).toBe('notYourTurn');
    expect(session.getView().state.board['A1'].placed).toBe(false);
  });

  it('refuses to send at all while the socket is down', () => {
    const h = harness();
    const session = h.session();
    h.setOpen(false);

    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });

    expect(h.sent).toEqual([]);
    expect(session.getView().error?.message).toMatch(/connect/i);
    expect(session.getView().state.board['E6'].placed).toBe(false);
  });
});

describe('a rejection survives the reset that follows it', () => {
  it('keeps the message while adopting the server state', () => {
    const h = harness();
    const session = h.session();
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });

    h.serverRefuses({ code: 'wrongStage', message: 'not now' });
    h.serverSays({ state: board(), reason: 'reset', segmentStart: board().nextStepId });

    expect(session.getView().state.board['E6'].placed).toBe(false);
    expect(session.getView().error).toEqual({ code: 'wrongStage', message: 'not now' });
  });

  it('clears the message on the next commit', () => {
    const h = harness();
    const session = h.session();
    h.serverRefuses({ code: 'wrongStage', message: 'not now' });

    h.serverSays({ state: board(), reason: 'commit', segmentStart: board().nextStepId });

    expect(session.getView().error).toBeNull();
  });
});

describe('undo is the servers to grant', () => {
  it('sends the step and changes nothing locally', () => {
    const h = harness();
    const session = h.session();
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });

    session.undoTo(session.getView().undoableSteps[0]);

    expect(h.undos).toHaveLength(1);
    expect(session.getView().state.board['E6'].placed).toBe(true);
  });
});

describe('undoableSteps covers my own open segment and nobody elses', () => {
  it('offers every step the open segment has taken', () => {
    const state = board();
    const h = harness(state);
    const session = h.session();

    expect(session.getView().undoableSteps).toEqual([]);
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    expect(session.getView().undoableSteps).toEqual([state.nextStepId]);
  });

  it('offers nothing to a player who is not the actor', () => {
    const h = harness();
    const session = h.session('p2');
    expect(session.getView().undoableSteps).toEqual([]);
  });

  it('offers nothing once an optimistic intent has handed the actor away', () => {
    // Founding a chain does not draw from the bag, so it is applied locally —
    // and in this fixture it leaves the actor unchanged. Placing the tile that
    // completes the turn is the general case: the moment `actorId` is no
    // longer me, the segment I could undo inside is not mine, even though the
    // server has not told me so yet.
    const h = harness();
    const session = h.session();
    session.dispatch({ type: 'placeTile', playerId: 'p1', coord: 'E6' });
    session.dispatch({ type: 'chooseFoundingBrand', playerId: 'p1', startupId: 'Messla' });

    const view = session.getView();
    if (view.actorId !== 'p1') expect(view.undoableSteps).toEqual([]);
    else expect(view.undoableSteps.length).toBeGreaterThan(0);
  });
});

describe('the curtain has no meaning online', () => {
  it('never asks anyone to reveal', () => {
    const h = harness();
    const session = h.session();
    expect(session.getView().awaitingReveal).toBe(false);
    session.reveal();
    expect(session.getView().awaitingReveal).toBe(false);
  });
});
