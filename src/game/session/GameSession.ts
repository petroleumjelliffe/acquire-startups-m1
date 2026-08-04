import type { GameState } from '../../../engine/gameTypes';
import type { Intent, IllegalIntentCode } from '../../../engine/intents';
import { IllegalIntentError } from '../../../engine/intents';
import {
  createSnapshotStore,
  applyIntentWithHistory,
  rewindTo,
  type SnapshotStore,
} from '../../../engine/history';
import { createInitialGame } from '../../../engine/gameInit';
import { getCurrentActor } from '../../../engine/actor';

export interface SessionError {
  code: IllegalIntentCode;
  message: string;
}

export interface SessionView {
  state: GameState;
  /** Whose input is awaited. Task 6 fills this in. */
  actorId: string | null;
  /** The segment just changed hands; the curtain is up. Task 6 fills this in. */
  awaitingReveal: boolean;
  /** Step ids that can be undone right now, oldest first. Task 6 scopes this. */
  undoableSteps: number[];
  /** The last rejected intent, cleared by the next successful one. */
  error: SessionError | null;
}

export interface GameSession {
  getView(): SessionView;
  subscribe(listener: () => void): () => void;
  dispatch(intent: Intent): void;
  undoTo(stepId: number): void;
  reveal(): void;
}

export type SessionInit = { seed: string; names: string[] } | { state: GameState };

/**
 * Owns the game state and the snapshot store, and is the only place that turns
 * an `IllegalIntentError` into something a player can read.
 *
 * Deliberately free of React: this is the seam Phase 3 cuts at, where
 * `dispatch` becomes "send the intent, await the server's broadcast" and the
 * view shape does not change. Keeping it plain also keeps the state machine
 * out of jsdom, which in Phase 1b proved able to pass tests over a visibly
 * broken page.
 */
export function createGameSession(init: SessionInit): GameSession {
  let state: GameState = 'state' in init
    ? structuredClone(init.state)
    : createInitialGame(init.seed, init.names);

  const store: SnapshotStore = createSnapshotStore();
  let error: SessionError | null = null;
  const listeners = new Set<() => void>();

  /**
   * A segment is a run of steps by one actor. Its start is the step id the
   * incoming actor's first intent will be filed under, so any snapshot below
   * it belongs to a closed segment and is not this player's to undo.
   */
  let actorId: string | null = getCurrentActor(state);
  let segmentStart: number = state.nextStepId;
  // The very first segment starts behind the curtain too: whoever is holding
  // the device has to claim seat one before they see anything.
  let awaitingReveal = true;

  // Cached so `getView()` is referentially stable between changes —
  // `useSyncExternalStore` re-renders forever if the snapshot is a fresh
  // object on every call.
  let view: SessionView | null = null;

  function invalidate(): void {
    view = null;
    for (const listener of listeners) listener();
  }

  function buildView(): SessionView {
    return {
      state,
      actorId,
      awaitingReveal,
      undoableSteps: [...store.keys()].filter((k) => k >= segmentStart).sort((a, b) => a - b),
      error,
    };
  }

  /**
   * Closes the segment if the actor changed: curtain up, undo range reset, and
   * every snapshot from the closed segment discarded — including the snapshot
   * of the boundary-crossing intent itself, which belongs to the player who
   * just finished, not to the one arriving.
   */
  function syncSegment(): void {
    const next = getCurrentActor(state);
    if (next === actorId) return;

    actorId = next;
    segmentStart = state.nextStepId;
    awaitingReveal = true;
    for (const key of [...store.keys()]) {
      if (key < segmentStart) store.delete(key);
    }
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

    dispatch(intent) {
      try {
        state = applyIntentWithHistory(store, state, intent);
        error = null;
      } catch (e) {
        if (!(e instanceof IllegalIntentError)) throw e;
        error = { code: e.code, message: e.message };
      }
      syncSegment();
      invalidate();
    },

    undoTo(stepId) {
      state = rewindTo(store, stepId);
      error = null;
      invalidate();
    },

    reveal() {
      awaitingReveal = false;
      invalidate();
    },
  };
}
