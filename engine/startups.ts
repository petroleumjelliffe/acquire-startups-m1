import type { GameState, StartupId } from './gameTypes';
import { getStartupSize } from './gameHelpers';

export const SAFE_SIZE = 11;
export const END_SIZE = 41;
export const SIZE_THRESHOLDS: readonly number[] = [2, 3, 4, 5, 6, 11, 21, 31, 41];
export const PLAYER_EMOJI: readonly string[] = ['🦊', '🐢', '🦁', '🐙', '🦉', '🐝'];

export interface StartupConfig { id: StartupId; tier: 0 | 1 | 2; ticker: string }

export const AVAILABLE_STARTUPS: readonly StartupConfig[] = [
  { id: 'Gobble',        tier: 2, ticker: '$G'  },
  { id: 'Scrapple',      tier: 2, ticker: '$S'  },
  { id: 'PaperfulPost',  tier: 0, ticker: '$PP' },
  { id: 'CamCrooned',    tier: 1, ticker: '$C'  },
  { id: 'Messla',        tier: 0, ticker: '$M'  },
  { id: 'ZuckFace',      tier: 1, ticker: '$Z'  },
  { id: 'WrecksonMobil', tier: 1, ticker: '$W'  },
];

/** Base prices at each entry in SIZE_THRESHOLDS, for tier 0. Tier n adds n × 100. */
const TIER0_PRICES: readonly number[] = [200, 300, 400, 500, 600, 700, 800, 900, 1000];

export function getSharePriceAtSize(tier: 0 | 1 | 2, size: number): number {
  if (size < SIZE_THRESHOLDS[0]) return 0;
  let band = 0;
  for (let i = 0; i < SIZE_THRESHOLDS.length; i++) {
    if (size >= SIZE_THRESHOLDS[i]) band = i;
  }
  return TIER0_PRICES[band] + tier * 100;
}

export function getNextSharePrice(state: GameState, startupId: StartupId): number | null {
  const startup = state.startups[startupId];
  if (!startup) return null;
  const size = getStartupSize(state, startupId);
  const now = getSharePriceAtSize(startup.tier, size);
  const then = getSharePriceAtSize(startup.tier, size + 1);
  return then > now ? then : null;
}
