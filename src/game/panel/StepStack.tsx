import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { StepEntry } from './StepEntry';
import { leavingIds, prefersReducedMotion, riseFrom, STEP_EXIT_MS, STEP_RISE_EASE } from './stepMotion';

/**
 * The turn so far, oldest first.
 *
 * Also the panel's flex spacer: it takes the remaining height and bottom-aligns
 * its content, which is what pins the zones below it to the bottom of the panel.
 *
 * That bottom alignment is also why the arrival animation lives here rather
 * than on the entries. Adding an entry moves every older one up before the
 * browser paints, so there is no "before" left for a per-entry transition to
 * start from — what the eye needs is the whole list sliding up together while
 * the new step rises out from behind the staging zone. See `stepMotion.ts`.
 */
export interface StepStackEntry {
  stepId: number;
  phase: string;
  detail: ReactNode;
  /**
   * Who did it — a name, or `You`. Absent where there is nobody to name, which
   * is the catalog and any entry the engine files without a player.
   */
  actor?: string;
  /**
   * Whether this step can be rewound to. Snapshots are filed per *intent*, and
   * one intent can push several log entries — a merger writes the placement,
   * the merge and the payout under one action. Offering undo on an entry with
   * no snapshot would throw out of `rewindTo`, so the caller says which are
   * real undo points.
   */
  undoable?: boolean;
}

export interface StepStackProps {
  entries: StepStackEntry[];
  onUndo?: (stepId: number) => void;
}

export function StepStack({ entries, onUndo }: StepStackProps) {
  const listRef = useRef<HTMLDivElement>(null);
  /**
   * The list's height at the last paint. Not derived from `entries.length`:
   * entries are not a uniform height — a merger payout is a table — so the
   * distance to travel has to be measured, never counted.
   */
  const lastHeight = useRef(0);

  /**
   * What is on screen, which lags the prop while steps are leaving.
   *
   * A step being replaced — switching a placed tile — is two motions in
   * sequence, not one crossfade: the old step drops out of view, and only then
   * does its replacement rise. Rendering the incoming entries straight away
   * would leave nothing to animate out.
   */
  const [shown, setShown] = useState(entries);
  /** The freshest entries, read when the exit finishes rather than when it began. */
  const incoming = useRef(entries);
  incoming.current = entries;
  /**
   * The exit already running, if any, identified by what it is animating
   * towards. `entries` is a fresh array on every parent render, so without
   * this an unrelated re-render mid-exit would clear the timer and start the
   * same exit again from wherever it had got to — a stutter, and a step that
   * takes longer to leave the more often the panel happens to re-render.
   */
  const exitingTo = useRef<string | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancelled on unmount only. This effect re-runs on every parent render —
  // `entries` is a new array each time — so clearing the timer from its own
  // cleanup would cancel an exit already under way and, because the guard
  // above skips restarting it, leave the list translated down for good.
  useEffect(() => () => {
    if (exitTimer.current !== null) clearTimeout(exitTimer.current);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    const nextIds = entries.map((e) => e.stepId);
    const going = leavingIds(shown.map((e) => e.stepId), nextIds);

    if (going.length === 0 || !list || prefersReducedMotion()) {
      // Nothing leaving — or nothing to watch it leave. Straight through, and
      // the arrival effect below does whatever the height change asks for.
      exitingTo.current = null;
      if (shown !== entries) setShown(entries);
      return;
    }

    const key = nextIds.join(',');
    if (exitingTo.current === key) return;
    exitingTo.current = key;

    // Every leaving row is at the bottom (undo removes a suffix), so dropping
    // the whole list by their combined height sends them below the container's
    // edge and lands the survivors exactly where the shorter list will put
    // them. No jump when the rows are finally dropped.
    const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0;
    const drop = going.reduce((total, id) => {
      const row = list.querySelector(`[data-step-id="${id}"]`);
      return total + (row instanceof HTMLElement ? row.offsetHeight + gap : 0);
    }, 0);
    const surviving = list.offsetHeight - drop;

    list.style.transition = `transform ${STEP_EXIT_MS}ms ${STEP_RISE_EASE}`;
    list.style.transform = `translateY(${drop}px)`;

    exitTimer.current = setTimeout(() => {
      // The arrival effect measures growth from here, so what rises is exactly
      // what arrived — not the net change, which for a one-for-one swap is
      // zero and would animate nothing at all.
      lastHeight.current = surviving;
      list.style.transition = 'none';
      list.style.transform = 'translateY(0)';
      exitingTo.current = null;
      exitTimer.current = null;
      setShown(incoming.current);
    }, STEP_EXIT_MS);
  }, [entries, shown]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const height = list.offsetHeight;
    const grew = height - lastHeight.current;
    lastHeight.current = height;

    const rise = riseFrom(grew, prefersReducedMotion());
    if (!rise) return;

    // Put the list back where it was, with no transition, so the older entries
    // are at their old positions and the new one is below the container's
    // bottom edge — clipped by the stack's own overflow, behind the staging
    // zone. Reading `offsetHeight` in between is the flush that stops the
    // browser collapsing the two styles into one paint, which would show
    // nothing at all.
    list.style.transition = 'none';
    list.style.transform = `translateY(${rise.offset}px)`;
    void list.offsetHeight;
    list.style.transition = `transform ${rise.duration}ms ${rise.ease}`;
    list.style.transform = 'translateY(0)';
  }, [shown]);

  return (
    <div className="flex flex-1 flex-col justify-end overflow-y-auto px-4 pb-2 pt-3.5">
      <div ref={listRef} data-step-list className="flex flex-col gap-3">
        {shown.map((e) => (
          <StepEntry
            key={e.stepId}
            phase={e.phase}
            actor={e.actor}
            detail={e.detail}
            stepId={e.stepId}
            onUndo={e.undoable ? onUndo : undefined}
          />
        ))}
      </div>
    </div>
  );
}
