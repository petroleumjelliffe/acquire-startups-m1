import { Cash } from '../atoms/Cash';
import { StockStack } from '../atoms/StockStack';
import { isStartupId } from '../../../engine/startups';

/**
 * The current player's holdings: their share stacks and their balance.
 *
 * Zero-count holdings are dropped rather than rendered as `×0` — an empty
 * portfolio says "no shares" once instead of seven times.
 */
export interface HandZoneProps {
  /** Empty when no player's hand is on show — during the turn-order draw. */
  name: string;
  portfolio: Record<string, number>;
  /** Omitted when there is no viewing player, so no balance is shown. */
  cash?: number;
  /** Per-share prices, keyed by startup id, when the caller has them. */
  prices?: Record<string, number>;
}

export function HandZone({ name, portfolio, cash, prices = {} }: HandZoneProps) {
  const held = Object.entries(portfolio).filter(([id, n]) => n > 0 && isStartupId(id));
  // Before the turn-order draw there is no viewing player at all. The zone
  // still renders, at its full reserved height, so the panel does not resize
  // the moment play begins — it just has nobody's holdings to show.
  const hasViewer = name.length > 0;

  return (
    <div className="flex-none border-t border-gray-100 px-4 py-3">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-gray-400">
        {hasViewer ? `${name}'s hand` : 'Hand'}
      </div>
      {/*
        A floor, not a fixed height. 64px is one row of stock stacks, measured
        on a real page by `npm run verify:layout` rather than derived — jsdom
        reports 0 for all of it. The floor is what stops the jitter the
        reservation exists for: without it the zone snapped 57px -> 64px the
        moment a player bought their first share, shifting every zone below.
        Growing past it is fine and expected — a player can hold all seven
        brands, which needs a second row — and the panel scrolls to suit.
        Re-measure the floor if the stack's size or this zone's padding changes.
      */}
      <div
        data-zone="holdings"
        data-may-grow="true"
        className="flex min-h-[64px] flex-wrap items-end gap-3 transition-[min-height] duration-200 motion-reduce:transition-none"
      >
        {!hasViewer ? (
          <span className="text-xs text-gray-400">Not dealt yet</span>
        ) : held.length === 0 ? (
          <span className="text-xs text-gray-400">no shares</span>
        ) : (
          held.map(([id, n]) =>
            isStartupId(id) ? (
              <StockStack key={id} id={id} count={n} price={prices[id]} size="sm" />
            ) : null,
          )
        )}
        {cash !== undefined && (
          <div className="inline-flex flex-col items-start justify-center rounded-lg border border-[#cfe8da] bg-green-50 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-gray-500">Balance</span>
            <span className="text-lg font-extrabold">
              <Cash amount={cash} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
