import type { Coord, GameState, Stage, StartupId } from '../gameTypes';
import type { Intent, IllegalIntentCode } from '../intents';

export interface FixtureSpec {
  players: { name: string; cash?: number; hand?: Coord[]; shares?: Record<string, number> }[];
  chains?: { id: StartupId; coords: Coord[] }[];
  loners?: Coord[];
  bag?: Coord[];
  stage?: Stage;
  currentPlayerIndex?: number;
}

export interface StateAssertion {
  stage?: Stage;
  currentPlayer?: string;
  cash?: Record<string, number>;
  shares?: Record<string, Record<string, number>>;
  chainSize?: Record<string, number>;
  founded?: Record<string, boolean>;
  availableShares?: Record<string, number>;
  hand?: Record<string, Coord[]>;
  boardOwner?: Record<string, StartupId | null>;
  /** phases of the log entries this step appended, in order */
  logPhases?: string[];
  /** playerId → stock + bonus + cash, from finalScore() */
  finalScoreTotals?: Record<string, number>;
}

export interface GoldenStep {
  name: string;
  intent: Intent;
  /** when set, the step must be REJECTED with this code and the state must not change */
  expectError?: IllegalIntentCode;
  then?: StateAssertion;
}

export interface GoldenGame {
  id: string;
  title: string;
  setup: FixtureSpec;
  steps: GoldenStep[];
  final?: StateAssertion;
}

export type { GameState };
