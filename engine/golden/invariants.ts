import type { GameState } from '../gameTypes';

const TOTAL_TILES = 108;

/**
 * Structural truths that must hold after every intent, in every game, forever.
 * Returns one message per violation; an empty array means the state is sound.
 *
 * These are deliberately not rules assertions — nothing here knows what a merger
 * is. They are conservation and sanity properties, the kind that example-based
 * tests systematically miss because each example only visits states its author
 * already imagined.
 */
export function checkInvariants(state: GameState): string[] {
  const problems: string[] = [];

  const placed = Object.values(state.board).filter((c) => c.placed).length;
  const inHands = state.players.reduce((n, p) => n + p.hand.length, 0);
  const total = placed + inHands + state.bag.length + state.discarded.length;
  if (total !== TOTAL_TILES) {
    problems.push(
      `tile conservation: placed ${placed} + hands ${inHands} + bag ${state.bag.length} ` +
        `+ discarded ${state.discarded.length} = ${total}, expected ${TOTAL_TILES}`,
    );
  }

  for (const [id, startup] of Object.entries(state.startups)) {
    const held = state.players.reduce((n, p) => n + (p.portfolio[id] ?? 0), 0);
    if (held + startup.availableShares !== startup.totalShares) {
      problems.push(
        `share conservation ${id}: held ${held} + available ${startup.availableShares} ` +
          `= ${held + startup.availableShares}, expected ${startup.totalShares}`,
      );
    }
    if (startup.availableShares < 0) problems.push(`${id} has negative available shares`);
  }

  for (const p of state.players) {
    if (p.cash < 0) problems.push(`${p.name} has negative cash: ${p.cash}`);
    for (const [id, qty] of Object.entries(p.portfolio)) {
      if (qty < 0) problems.push(`${p.name} holds negative ${id}: ${qty}`);
    }
  }

  return problems;
}
