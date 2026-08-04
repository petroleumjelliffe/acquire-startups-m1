import type { StartupId } from './gameTypes';

export interface BonusHolding {
  playerId: string;
  playerName: string;
  shares: number;
}

export interface BonusResult {
  playerId: string;
  playerName: string;
  startupId: StartupId;
  shares: number;
  amount: number;
  type: 'majority' | 'minority' | 'both';
}

export function roundBonus(amount: number): number {
  return Math.ceil(amount / 100) * 100;
}

export function computeChainBonuses(
  startupId: StartupId,
  price: number,
  holdings: BonusHolding[]
): BonusResult[] {
  const holders = holdings.filter((h) => h.shares > 0).sort((a, b) => b.shares - a.shares);
  if (holders.length === 0) return [];

  const majorityPot = price * 10;
  const minorityPot = price * 5;
  const make = (h: BonusHolding, amount: number, type: BonusResult['type']): BonusResult => ({
    playerId: h.playerId,
    playerName: h.playerName,
    startupId,
    shares: h.shares,
    amount,
    type,
  });

  // Sole holder takes both bonuses as one combined figure.
  if (holders.length === 1) {
    return [make(holders[0], majorityPot + minorityPot, 'both')];
  }

  const topShares = holders[0].shares;
  const topHolders = holders.filter((h) => h.shares === topShares);

  // Tied majority: the two pots are combined and split between the tied
  // holders; no separate minority bonus is paid.
  if (topHolders.length > 1) {
    const each = roundBonus((majorityPot + minorityPot) / topHolders.length);
    return topHolders.map((h) => make(h, each, 'majority'));
  }

  const runnerUpShares = holders[1].shares;
  const runnersUp = holders.filter((h) => h.shares === runnerUpShares);
  const eachMinority = runnersUp.length > 1 ? roundBonus(minorityPot / runnersUp.length) : minorityPot;

  return [
    make(holders[0], majorityPot, 'majority'),
    ...runnersUp.map((h) => make(h, eachMinority, 'minority')),
  ];
}
