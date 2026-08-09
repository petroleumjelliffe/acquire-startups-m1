import { describe, it, expect } from 'vitest';
import { AVAILABLE_STARTUPS } from '../../engine/startups';
import { BRAND_CLASSES, tickerFor } from './tokens';

describe('brand tokens', () => {
  it('covers every startup the engine ships, plus Cash', () => {
    for (const s of AVAILABLE_STARTUPS) {
      expect(BRAND_CLASSES[s.id], `no brand classes for ${s.id}`).toBeDefined();
    }
    expect(BRAND_CLASSES.Cash).toBeDefined();
    expect(Object.keys(BRAND_CLASSES)).toHaveLength(AVAILABLE_STARTUPS.length + 1);
  });

  // Tailwind's JIT only emits classes it can see as literal strings in source.
  it('uses only complete literal class names — no interpolation survivors', () => {
    for (const [id, classes] of Object.entries(BRAND_CLASSES)) {
      for (const [slot, value] of Object.entries(classes)) {
        expect(value, `${id}.${slot}`).not.toMatch(/\$\{|undefined/);
        // `grad` is ours, not Tailwind's — it has its own shape, checked below.
        if (slot === 'grad') continue;
        expect(value, `${id}.${slot}`).toMatch(/^[a-z-]+-(50|100|500|700)$/);
      }
    }
  });

  // The aqua reskin's gradient stops live in src/styles/aqua.css, one class per
  // brand, so the paint reaches components through this same map rather than a
  // second lookup table that could drift from it.
  it('every brand carries its aqua gradient class, literally', () => {
    for (const [key, classes] of Object.entries(BRAND_CLASSES)) {
      expect(classes.grad, key).toBe(`aqua-brand-${key}`);
    }
  });

  it('reads tickers from the engine rather than redeclaring them', () => {
    expect(tickerFor('Gobble')).toBe('$G');
    expect(tickerFor('PaperfulPost')).toBe('$PP');
    expect(tickerFor('Cash')).toBe('$$');
  });
});
