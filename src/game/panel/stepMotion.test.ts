import { describe, it, expect, afterEach } from 'vitest';
import { riseFrom, prefersReducedMotion, leavingIds, STEP_RISE_MS } from './stepMotion';

describe('riseFrom', () => {
  it('starts the list below its resting place by exactly what was added', () => {
    expect(riseFrom(64, false)).toEqual({
      offset: 64,
      duration: STEP_RISE_MS,
      ease: expect.any(String),
    });
  });

  it('rises further for a batch, rather than once per entry', () => {
    // A merger commits the placement, the merge and the payout together, and
    // online a whole turn arrives in one message. One motion, one distance.
    const one = riseFrom(64, false)!;
    const three = riseFrom(192, false)!;
    expect(three.offset).toBe(3 * one.offset);
    expect(three.duration).toBe(one.duration);
  });

  it('does nothing under reduced motion', () => {
    expect(riseFrom(64, true)).toBeNull();
  });

  it('does nothing when the list did not grow', () => {
    // The first render, a re-render that moved nothing, and every removal —
    // removals belong to the exit motion, not this one.
    expect(riseFrom(0, false)).toBeNull();
    expect(riseFrom(-64, false)).toBeNull();
    expect(riseFrom(Number.NaN, false)).toBeNull();
  });
});

describe('leavingIds', () => {
  it('names the steps that are going', () => {
    expect(leavingIds([1, 2, 3], [1, 2])).toEqual([3]);
  });

  it('reports nothing when the same steps are rebuilt', () => {
    // `stepsOf` returns a fresh array on every render. Comparing arrays — or
    // lengths, or indices — would call every commit a removal.
    expect(leavingIds([1, 2, 3], [1, 2, 3])).toEqual([]);
  });

  it('reports an arrival as no removal at all', () => {
    expect(leavingIds([1, 2], [1, 2, 3])).toEqual([]);
  });

  it('takes a whole rewind together, not one step at a time', () => {
    // Undoing into a merger drops several rows at once, and they go as one.
    expect(leavingIds([1, 2, 3, 4], [1])).toEqual([2, 3, 4]);
  });

  it('counts a swap as one out and one in', () => {
    // Switching a placed tile: step 2 goes, step 3 arrives.
    expect(leavingIds([1, 2], [1, 3])).toEqual([2]);
  });
});

describe('prefersReducedMotion', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('is false where matchMedia does not exist, rather than throwing', () => {
    // jsdom has no matchMedia, and an unguarded call throws before any
    // assertion in any test that renders the stack is reached.
    expect(prefersReducedMotion()).toBe(false);
  });

  it('reports what the device asked for', () => {
    const queries: string[] = [];
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => {
        queries.push(q);
        return { matches: true };
      },
    });

    expect(prefersReducedMotion()).toBe(true);
    expect(queries).toEqual(['(prefers-reduced-motion: reduce)']);
  });
});
