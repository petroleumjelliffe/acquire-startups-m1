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
  /** Who did it — a name, or `You`. Omitted where there is nobody to name. */
  actor?: string;
  detail: ReactNode;
  stepId?: number;
  onUndo?: (stepId: number) => void;
}

export function StepEntry({ phase, actor, detail, stepId, onUndo }: StepEntryProps) {
  const undoable = onUndo != null && stepId != null;

  return (
    // No arrival animation of its own. An entry cannot animate its own arrival
    // in a bottom-aligned list — by the time it exists, every entry above it
    // has already jumped to its new position. `StepStack` moves the whole list
    // instead, which is the motion this used to approximate by lifting its own
    // text 18px.
    // `data-step-id` is how `StepStack` measures the rows that are leaving, so
    // it can drop the list by exactly their height.
    <div data-step-id={stepId} className="flex flex-col gap-[3px]">
      <div className="flex items-center gap-2">
        {/*
          The name leads and the phase follows, both in the label's own
          treatment — an attribution rather than a rewritten sentence, because
          the phases are the engine's strings and not uniformly verb phrases:
          "Placed a tile" takes a subject, "Merger payout" does not. One rule
          covers both, and the engine's copy stays the engine's.
        */}
        <span
          data-step-phase
          className="text-xs font-semibold uppercase tracking-[0.03em] text-gray-500"
        >
          {actor ? <span data-step-actor className="text-gray-700">{actor} </span> : null}
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
