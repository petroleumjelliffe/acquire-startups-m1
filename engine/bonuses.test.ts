import { describe, it, expect } from 'vitest';
import { computeChainBonuses, roundBonus } from './bonuses';

const h = (playerId: string, shares: number) => ({ playerId, playerName: playerId.toUpperCase(), shares });

describe('computeChainBonuses', () => {
  it('pays a clear majority and a clear minority', () => {
    const out = computeChainBonuses('Gobble', 1000, [h('p1', 6), h('p2', 3), h('p3', 1)]);
    expect(out).toEqual([
      { playerId: 'p1', playerName: 'P1', startupId: 'Gobble', shares: 6, amount: 10000, type: 'majority' },
      { playerId: 'p2', playerName: 'P2', startupId: 'Gobble', shares: 3, amount: 5000, type: 'minority' },
    ]);
  });

  // BUG #1 — currently each tied holder gets the FULL minority bonus
  it('splits a tied minority bonus between the tied holders', () => {
    const out = computeChainBonuses('Messla', 600, [h('p2', 7), h('p1', 4), h('p3', 4)]);
    expect(out).toEqual([
      { playerId: 'p2', playerName: 'P2', startupId: 'Messla', shares: 7, amount: 6000, type: 'majority' },
      { playerId: 'p1', playerName: 'P1', startupId: 'Messla', shares: 4, amount: 1500, type: 'minority' },
      { playerId: 'p3', playerName: 'P3', startupId: 'Messla', shares: 4, amount: 1500, type: 'minority' },
    ]);
  });

  // BUG #2 — currently a sole holder gets the majority bonus only
  it('pays a sole holder majority and minority combined', () => {
    const out = computeChainBonuses('ZuckFace', 400, [h('p3', 3)]);
    expect(out).toEqual([
      { playerId: 'p3', playerName: 'P3', startupId: 'ZuckFace', shares: 3, amount: 6000, type: 'both' },
    ]);
  });

  it('splits a tied majority across majority + minority, rounded up to $100', () => {
    // (300×10 + 300×5) / 2 = 2250 → 2300 each
    const out = computeChainBonuses('CamCrooned', 300, [h('p1', 5), h('p2', 5)]);
    expect(out.map((b) => [b.playerId, b.amount, b.type])).toEqual([
      ['p1', 2300, 'majority'],
      ['p2', 2300, 'majority'],
    ]);
  });

  it('pays nobody for a chain with no shareholders', () => {
    expect(computeChainBonuses('Scrapple', 500, [])).toEqual([]);
    expect(computeChainBonuses('Scrapple', 500, [h('p1', 0)])).toEqual([]);
  });

  it('rounds up to the nearest hundred', () => {
    expect(roundBonus(2250)).toBe(2300);
    expect(roundBonus(1500)).toBe(1500);
    expect(roundBonus(1)).toBe(100);
  });
});
