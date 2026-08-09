/**
 * Who still has to liquidate, in turn order.
 *
 * A merger stops the game for every holder of the absorbed chain in turn, so
 * the queue answers "whose decision are we waiting on, and how many are left".
 */
export interface LiqHolder {
  emoji?: string;
  name: string;
  qty: number;
  status: 'done' | 'current' | 'pending';
}

export interface LiqQueueProps {
  holders: LiqHolder[];
}

// The chip recipe carries its own 1px border, so each status only names the
// border *colour* and the text; Tailwind's utilities are emitted after
// aqua.css, so `border-blue-600` on the current holder still wins.
const STATUS_CLASSES: Record<LiqHolder['status'], string> = {
  done: 'aqua-chip text-gray-400 opacity-70',
  current: 'aqua-chip aqua-chip-active border-blue-600 text-gray-900',
  pending: 'aqua-chip text-gray-600',
};

const MARK: Record<LiqHolder['status'], string> = {
  done: '✓',
  current: '›',
  pending: '·',
};

export function LiqQueue({ holders }: LiqQueueProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {holders.map((h) => (
        <div
          key={h.name}
          data-liq-status={h.status}
          className={`flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-[13px] ${STATUS_CLASSES[h.status]}`}
        >
          <span aria-hidden className="flex-none">{MARK[h.status]}</span>
          {h.emoji && <span className="flex-none text-base leading-none">{h.emoji}</span>}
          <span className="font-semibold">{h.name}</span>
          <span className="tabular-nums text-gray-500">{`×${h.qty}`}</span>
        </div>
      ))}
    </div>
  );
}
