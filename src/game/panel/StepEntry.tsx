import type { ReactNode } from 'react';

/**
 * One completed step of a turn.
 *
 * Each entry is a rewind point, and `stepId` is its identity — the same id
 * Plan 1a's `rewindTo(store, stepId)` takes. The undo affordance renders only
 * when `onUndo` is supplied, so the read-only appearance is the same component
 * with one prop dropped.
 *
 * Nothing here dispatches: `onUndo` is called with the `stepId` and that is all.
 */
export interface StepEntryProps {
  phase: string;
  detail: ReactNode;
  stepId?: number;
  onUndo?: (stepId: number) => void;
}

export function StepEntry({ phase, detail, stepId, onUndo }: StepEntryProps) {
  const undoable = onUndo != null && stepId != null;

  return (
    <div className="flex flex-col gap-[3px]">
      <div className="flex items-center gap-2">
        <span
          data-step-phase
          className="text-xs font-semibold uppercase tracking-[0.03em] text-gray-500"
        >
          {phase}
        </span>
        {undoable && (
          <button
            type="button"
            data-step-undo
            title="Rewind to before this step"
            onClick={() => onUndo(stepId)}
            className="border-none bg-transparent p-0 text-[11px] font-medium text-gray-400 hover:text-blue-600 hover:underline"
          >
            ↺ undo
          </button>
        )}
      </div>
      <div className="text-[13px] text-gray-600">{detail}</div>
    </div>
  );
}
