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
