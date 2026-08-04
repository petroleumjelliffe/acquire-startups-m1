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
}

export interface StepStackProps {
  entries: StepStackEntry[];
  onUndo?: (stepId: number) => void;
}

export function StepStack({ entries, onUndo }: StepStackProps) {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 overflow-y-auto px-4 pb-2 pt-3.5">
      {entries.map((e) => (
        <StepEntry key={e.stepId} phase={e.phase} detail={e.detail} stepId={e.stepId} onUndo={onUndo} />
      ))}
    </div>
  );
}
