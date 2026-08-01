import { describe, it, expect } from 'vitest';
import { tok, pushLog, renderLogText } from './log';
import { createTestGameState } from './testHelpers';

describe('log', () => {
  it('assigns incrementing stepIds', () => {
    const state = createTestGameState();
    const a = pushLog(state, 'Placed a tile', [tok.tile('A1')], 'p1');
    const b = pushLog(state, 'Bought shares', [tok.stack('Gobble', 2)], 'p1');
    expect(a.stepId).toBe(1);
    expect(b.stepId).toBe(2);
    expect(state.nextStepId).toBe(3);
    expect(state.log).toHaveLength(2);
  });

  it('records phase, detail tokens and player', () => {
    const state = createTestGameState();
    pushLog(state, 'Founded a brand', [tok.brand('Messla'), tok.text(' at '), tok.tile('C6')], 'p2');
    expect(state.log[0]).toEqual({
      stepId: 1,
      phase: 'Founded a brand',
      playerId: 'p2',
      detail: [
        { kind: 'brand', startupId: 'Messla' },
        { kind: 'text', text: ' at ' },
        { kind: 'tile', coord: 'C6' },
      ],
    });
  });

  it('renders a plain-text fallback for every token kind', () => {
    const state = createTestGameState();
    const e = pushLog(state, 'Merger payout', [
      tok.text('Alex takes '), tok.cash(3000, true),
      tok.text(' for '), tok.stack('Gobble', 6),
      tok.text(' in '), tok.brand('Gobble'), tok.text(' at '), tok.tile('D5'),
    ]);
    expect(renderLogText(e)).toBe('Alex takes +$3,000 for 6× Gobble in Gobble at D5');
  });
});
