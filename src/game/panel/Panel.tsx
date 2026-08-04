import type { ReactNode } from 'react';

/**
 * The side panel: five slots in one fixed order — `stepstack → active →
 * staging → hand → players`. The order is a locked design decision, so it
 * lives here and not in the order a caller passes the props.
 *
 * The column is full-height and the step stack is the flex spacer, which is
 * what pins the remaining zones to the bottom of the panel.
 */
export interface PanelProps {
  stepstack?: ReactNode;
  active?: ReactNode;
  staging?: ReactNode;
  hand?: ReactNode;
  players?: ReactNode;
}

const ORDER = ['stepstack', 'active', 'staging', 'hand', 'players'] as const;

export function Panel(props: PanelProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-gray-200">
      {ORDER.map((slot) =>
        props[slot] == null ? null : (
          <div
            key={slot}
            data-slot={slot}
            className={slot === 'stepstack' ? 'flex min-h-0 flex-1 flex-col' : 'flex-none'}
          >
            {props[slot]}
          </div>
        ),
      )}
    </div>
  );
}
