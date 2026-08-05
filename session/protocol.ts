import type { GameState } from '../engine/gameTypes';
import type { Intent, IllegalIntentCode } from '../engine/intents';

/**
 * `Omit` does not distribute over a union: `Omit<Intent, 'playerId'>` collapses
 * nine members into one object carrying only their common keys, and
 * `placeTile`'s `coord` disappears. This preserves the union, so a
 * `WireIntent` narrows on `type` exactly as an `Intent` does.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * An intent as it travels: no `playerId`.
 *
 * The server fills that in from the socket binding, which makes claiming to be
 * another player unrepresentable rather than merely rejected — and that is what
 * makes projection a boundary rather than a decoration.
 *
 * Derived from `Intent` rather than restated, so a new engine intent cannot
 * silently fail to reach the wire.
 */
export type WireIntent = DistributiveOmit<Intent, 'playerId'>;

/**
 * Narrows an arbitrary wire payload to `WireIntent` before it ever reaches
 * `room.dispatch`.
 *
 * A missing or wholly malformed payload is not the hazard: `{...undefined}`
 * is `{}`, and the engine's own `applyIntent` default branch rejects an
 * object with no recognised `type`. The hazard is a payload with a *valid*
 * `type` and a malformed field — `{ type: 'buyShares' }` with no `picks`,
 * or `{ type: 'tradeInDeadTiles', coords: 5 }` — because every variant's
 * handler in `engine/intents.ts` dereferences that field (`.length`, a
 * `for...of`, a spread into `Set`) before any validation runs. That throws
 * synchronously inside a socket.io listener, which socket.io does not catch,
 * which takes the whole process down for every room on it, not just the
 * sender's. This function is what stands between an arbitrary payload and
 * that dereference: array fields must actually be arrays, numeric fields
 * actually numbers, string fields actually strings, before `withPlayer`
 * ever hands the result to the engine as a trusted `Intent`.
 *
 * Field-level only — it does not check that `coord` names a real board
 * square or `startupId` a real startup. Those stay the engine's job
 * (`tileNotInHand`, `brandUnavailable`, …), which already rejects them
 * cleanly; nothing downstream dereferences an unvalidated *value*, only an
 * unvalidated *shape*.
 */
export function isWireIntent(wire: unknown): wire is WireIntent {
  if (typeof wire !== 'object' || wire === null) return false;
  const w = wire as Record<string, unknown>;

  switch (w.type) {
    case 'startGame':
    case 'declareEnd':
    case 'endTurn':
      return true;
    case 'placeTile':
      return typeof w.coord === 'string';
    case 'chooseFoundingBrand':
    case 'chooseSurvivor':
      return typeof w.startupId === 'string';
    case 'liquidate':
      return (
        typeof w.startupId === 'string' &&
        typeof w.sell === 'number' &&
        typeof w.trade === 'number' &&
        typeof w.keep === 'number'
      );
    case 'buyShares':
      return Array.isArray(w.picks) && w.picks.every((p) => typeof p === 'string');
    case 'tradeInDeadTiles':
      return Array.isArray(w.coords) && w.coords.every((c) => typeof c === 'string');
    default:
      return false;
  }
}

/**
 * Everything the engine can refuse, plus the one refusal the engine knows
 * nothing about. Undo is not an intent — it never reaches `applyIntent` — so
 * `IllegalIntentCode` has no word for "that step belongs to a segment you no
 * longer own". Adding one here keeps `engine/` untouched.
 */
export type RejectionCode = IllegalIntentCode | 'undoOutOfSegment';

/**
 * Why a state arrived. `commit` went to the whole table; `correction` and
 * `reset` went to one player. Tests assert on this: "a non-actor never
 * receives a correction" is the draft-privacy guarantee, stated directly.
 */
export type StateReason = 'commit' | 'correction' | 'reset';

export interface StateMessage {
  /** Projected for this recipient: no seed, no bag, no other player's hand. */
  state: GameState;
  reason: StateReason;
  segmentStart: number;
}

export interface RejectedMessage {
  code: RejectionCode;
  message: string;
}

export interface JoinedMessage {
  roomId: string;
  playerId: string;
  /** Presented on rejoin. Issued once, at first join, and never re-issued. */
  token: string;
}

export interface RosterMessage {
  roomId: string;
  lifecycle: 'lobby' | 'playing' | 'over';
  players: { id: string; name: string; isHost: boolean; connected: boolean }[];
}

export interface CreateRoomMessage { name: string }
export interface JoinRoomMessage { roomId: string; name: string; playerId?: string; token?: string }
export interface UndoMessage { stepId: number }

export const CLIENT_EVENTS = {
  createRoom: 'createRoom',
  joinRoom: 'joinRoom',
  beginGame: 'beginGame',
  intent: 'intent',
  undo: 'undo',
} as const;

export const SERVER_EVENTS = {
  state: 'state',
  rejected: 'rejected',
  roster: 'roster',
  joined: 'joined',
} as const;
