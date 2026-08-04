import type { ReactNode } from 'react';
import { Cash } from '../atoms/Cash';

/**
 * The staging pile: what the current step has accumulated but not committed.
 *
 * This is where panel-height stability is enforced. Three reservations, all
 * structural rather than conditional, so the zone is the same height in every
 * state a step can be in:
 *
 *  1. the pile carries a `min-h` sized to a populated row, so empty ↔ filled
 *     does not shift;
 *  2. the `Net` total is always rendered, muted at zero;
 *  3. the action slot is always rendered with a `min-h`, so button ↔ no button
 *     does not shift.
 *
 * The `data-zone` attributes exist so those reservations can be asserted
 * without matching on Tailwind class soup — they document which elements carry
 * the reservation, and removing one breaks a test rather than the eye.
 */
export interface StagingZoneProps {
  label: string;
  shares?: ReactNode;
  cashDelta?: number;
  action?: ReactNode;
}

export function StagingZone({ label, shares, cashDelta = 0, action }: StagingZoneProps) {
  return (
    <div
      data-zone="staging"
      className="flex-none border-t border-dashed border-[#e7dfbf] bg-[#fffdf5] px-4 py-3"
    >
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-gray-400">{label}</div>

      {/*
        Fixed, not merely minimum. A `min-h` sized to a *typical* row still
        grows when the row is taller: measured in Chrome, an empty pile sat at
        62px while a staged stack pushed it to 68px, and the depth margin on a
        6+ stack adds another 3px on top of that. 72px clears the tallest thing
        the pile can hold — an `sm` stack at depth 2 — so the zone is the same
        height in every state. jsdom reports 0 for layout, so no test catches
        this; it took measuring the real page.
      */}
      <div data-zone="pile" className="flex h-[72px] min-h-[72px] flex-wrap items-end gap-3">
        {shares ?? <span className="self-center text-[13px] text-[#c9bd93]">empty</span>}
      </div>

      <div
        data-zone="net"
        className="mt-1.5 flex items-baseline justify-end gap-2.5 border-t border-dashed border-[#e7dfbf] pt-2"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#a8935a]">Net</span>
        <span className="text-lg font-extrabold">
          <Cash amount={cashDelta} sign="delta" />
        </span>
      </div>

      {/* Same story: the phase-advance button measures 38px, so a 32px
          reservation shifted the zone by 6px whenever a button appeared. */}
      <div data-zone="action" className="mt-3 flex h-10 min-h-[40px] items-stretch">
        {action}
      </div>
    </div>
  );
}
