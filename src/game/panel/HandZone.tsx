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
  name: string;
  portfolio: Record<string, number>;
  cash: number;
  /** Per-share prices, keyed by startup id, when the caller has them. */
  prices?: Record<string, number>;
}

export function HandZone({ name, portfolio, cash, prices = {} }: HandZoneProps) {
  const held = Object.entries(portfolio).filter(([id, n]) => n > 0 && isStartupId(id));

  return (
    <div className="flex-none border-t border-gray-100 px-4 py-3">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-gray-400">
        {`${name}'s hand`}
      </div>
      {/*
        Reserved at the height this row takes once the player holds a share:
        a stock stack is taller than the "no shares" placeholder, so without
        this the zone grew 57px -> 64px the moment anyone bought anything,
        shifting every zone below it. The figure is measured on a real page by
        `npm run verify:layout`, not derived — jsdom reports 0 for all of it.
        Re-measure if the stack's size or this zone's padding changes.
      */}
      <div data-zone="holdings" className="flex h-[64px] min-h-[64px] flex-wrap items-end gap-3">
        {held.length === 0 ? (
          <span className="text-xs text-gray-400">no shares</span>
        ) : (
          held.map(([id, n]) =>
            isStartupId(id) ? (
              <StockStack key={id} id={id} count={n} price={prices[id]} size="sm" />
            ) : null,
          )
        )}
        <div className="inline-flex flex-col items-start justify-center rounded-lg border border-[#cfe8da] bg-green-50 px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-gray-500">Balance</span>
          <span className="text-lg font-extrabold">
            <Cash amount={cash} />
          </span>
        </div>
      </div>
    </div>
  );
}
