import {
  createGameSession,
  type GameSession,
  type SessionError,
  type SessionView,
} from '../../session/GameSession';
import type { Intent } from '../../engine/intents';
import { DRAWS, toWire, type StateMessage } from '../../session/protocol';
import type { RoomTransport } from './transport';

export interface NetworkSession extends GameSession {
  /** Detaches the transport handlers. Call when the room screen unmounts. */
  dispose(): void;
  /**
   * The transport dropped out from under an outstanding request.
   *
   * `pending` otherwise clears only two ways: the server's own `state` or
   * `rejected` message — and neither arrives once the socket is gone. Without
   * this, a dropped socket mid-request left `pending` latched forever: the
   * panel read "Sending…" for good, socket.io's automatic reconnect gave no
   * signal a session could act on, and once reconnected the server saw an
   * unbound socket and dropped every intent silently. `useRoom` calls this on
   * a connection-status transition away from `open`; it clears `pending` and
   * leaves a message the player can read, and `GameScreen`'s own `connected`
   * prop backs it up by forcing `canAct` false independently, so the panel
   * goes inert even if this were somehow never called.
   */
  connectionLost(): void;
}

export interface NetworkSessionInit {
  transport: RoomTransport;
  /** The seat this device holds. Comes from the socket binding, never a form. */
  playerId: string;
  /** The first state the server sent. A room is never entered blind. */
  initial: StateMessage;
}

function range(from: number, toExclusive: number): number[] {
  const out: number[] = [];
  for (let i = from; i < toExclusive; i++) out.push(i);
  return out;
}

/**
 * A `GameSession` whose authority is elsewhere.
 *
 * It holds a real `GameSession` built from the last state the server sent and
 * replaces it whenever a new one arrives. That reuse is the point: the
 * optimistic path runs the same `applyIntentWithHistory` pass-and-play runs,
 * so there is no second copy of the rules and no second step stack to drift.
 */
export function createNetworkSession(
  { transport, playerId, initial }: NetworkSessionInit,
): NetworkSession {
  let inner = createGameSession({ state: initial.state });
  let segmentStart = initial.segmentStart;
  let rejection: SessionError | null = null;
  let pending = false;
  let view: SessionView | null = null;
  const listeners = new Set<() => void>();

  function invalidate(): void {
    view = null;
    for (const listener of listeners) listener();
  }

  const offState = transport.onState((msg) => {
    inner = createGameSession({ state: msg.state });
    segmentStart = msg.segmentStart;
    pending = false;
    // A `reset` is the rollback half of a rejection the player has just been
    // shown. Clearing the error here would take the explanation away with the
    // state it explains — they arrive as two messages, in that order, and are
    // one event.
    if (msg.reason !== 'reset') rejection = null;
    invalidate();
  });

  const offRejected = transport.onRejected((msg) => {
    rejection = { code: msg.code, message: msg.message };
    pending = false;
    invalidate();
  });

  function buildView(): SessionView {
    const base = inner.getView();
    return {
      ...base,
      // No device is passed, so there is no curtain and nothing to reveal.
      awaitingReveal: false,
      segmentStart,
      pending,
      // Derived, not stored. Gated on being the actor because an optimistic
      // `liquidate` or a merger-triggering `placeTile` can hand the actor to
      // someone else with no bag draw involved — and for the moment before
      // the commit lands, `segmentStart` names a segment this player no
      // longer owns.
      undoableSteps: base.actorId === playerId
        ? range(segmentStart, base.state.nextStepId)
        : [],
      error: rejection ?? base.error,
    };
  }

  return {
    getView() {
      if (view === null) view = buildView();
      return view;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    dispatch(intent: Intent) {
      // One answer is already outstanding; a second intent would race it and
      // come back as a rejection for pressing a button that was still there.
      if (pending) return;

      if (!transport.isOpen()) {
        rejection = { code: 'notConnected', message: 'Not connected. Reconnecting…' };
        invalidate();
        return;
      }

      const wire = toWire(intent);

      if (DRAWS.has(wire.type)) {
        // No bag here to draw from, so there is nothing to predict.
        rejection = null;
        pending = true;
        transport.sendIntent(wire);
        invalidate();
        return;
      }

      rejection = null;
      inner.dispatch(intent);
      // A local refusal is the engine's, on the same visible state the server
      // will judge — so it is an answer, not a guess, and the wire never sees
      // it. If the server disagrees anyway, that disagreement arrives as a
      // rejection and is worth knowing about.
      if (inner.getView().error === null) transport.sendIntent(wire);
      invalidate();
    },

    undoTo(stepId: number) {
      if (pending || !transport.isOpen()) return;
      rejection = null;
      pending = true;
      transport.sendUndo(stepId);
      invalidate();
    },

    reveal() {
      // Nothing to reveal: this device shows one player's own state, always.
    },

    connectionLost() {
      pending = false;
      rejection = { code: 'notConnected', message: 'Disconnected. Reconnecting…' };
      invalidate();
    },

    dispose() {
      offState();
      offRejected();
      listeners.clear();
    },
  };
}
