import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { StepEntry } from './StepEntry';
import { prefersReducedMotion, riseFrom } from './stepMotion';

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
  }, [entries]);

  return (
    <div className="flex flex-1 flex-col justify-end overflow-y-auto px-4 pb-2 pt-3.5">
      <div ref={listRef} data-step-list className="flex flex-col gap-3">
        {entries.map((e) => (
          <StepEntry
            key={e.stepId}
            phase={e.phase}
            detail={e.detail}
            stepId={e.stepId}
            onUndo={e.undoable ? onUndo : undefined}
          />
        ))}
      </div>
    </div>
  );
}
