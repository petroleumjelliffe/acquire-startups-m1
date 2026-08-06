/**
 * The step stack's arrival motion, as a decision separate from the DOM that
 * performs it.
 *
 * It lives apart because jsdom reports every height as zero, so a test that
 * drove the real effect would measure a delta of 0, take the do-nothing branch,
 * and pass whatever the rule said. The rule is testable; the pixels are not.
 * The pixels are checked on a real page by `npm run verify:layout`.
 *
 * ## Why an inversion rather than a CSS transition
 *
 * The stack is bottom-aligned, so adding an entry moves every older entry up by
 * exactly the new entry's height — before the browser paints. There is no
 * "before" state left to transition from. So the list is put *back*: translated
 * down by the height that was just added, with no transition, and then released
 * to zero. The older entries slide up from where they were, and the new one
 * rises out from behind the staging zone below, which is opaque and paints over
 * the stack's overflow. One transform, one motion, because it is one list.
 */

/**
 * How long the list takes to settle.
 *
 * 280ms is the arrival duration the rest of the surface already uses
 * (`step-up` in `src/styles/index.css`); the stack shares it rather than
 * inventing a second sense of "arriving".
 */
export const STEP_RISE_MS = 280;

/** The same curve as `step-up`: quick to leave, soft to land. */
export const STEP_RISE_EASE = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

export interface RiseFrom {
  /** The distance the list starts below its resting place, in pixels. */
  offset: number;
  duration: number;
  ease: string;
}

/**
 * Where the list should start, given how much taller it just became.
 *
 * `null` means do not animate at all, and there are three ways to earn it:
 *
 *  - **reduced motion**, which this project treats as a hard rule rather than a
 *    softening — the step is simply present;
 *  - **nothing was added** (`delta <= 0`), which covers the first render, a
 *    re-render that changed no heights, and every removal — removals are the
 *    exit motion's business, not this one's;
 *  - **the stack shrank into view**, same case as above.
 *
 * A batch arrives as one motion, not one per entry: several steps can land
 * together — a merger writes the placement, the merge and the payout in one
 * commit, and online a whole turn arrives in a single message. `delta` is
 * whatever the list grew by, so a batch simply rises further.
 */
export function riseFrom(delta: number, reducedMotion: boolean): RiseFrom | null {
  if (reducedMotion) return null;
  if (!Number.isFinite(delta) || delta <= 0) return null;
  return { offset: delta, duration: STEP_RISE_MS, ease: STEP_RISE_EASE };
}

/**
 * Whether this device has asked for less motion.
 *
 * Guarded because `matchMedia` does not exist in jsdom, where every test in
 * `src/` runs — an unguarded call throws before any assertion is reached.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
