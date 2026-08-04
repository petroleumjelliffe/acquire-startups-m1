import type { ReactNode } from 'react';
import { StepEntry } from './StepEntry';

/**
 * The turn so far, oldest first.
 *
 * Also the panel's flex spacer: it takes the remaining height and bottom-aligns
 * its content, which is what pins the zones below it to the bottom of the panel.
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
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 overflow-y-auto px-4 pb-2 pt-3.5">
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
  );
}
