import type { ConnectionStatus } from '../../net/connection';

/**
 * Connection state, and only inside the room.
 *
 * Its predecessor was fixed across every route, which put a bar over the top
 * of pass-and-play and the catalog — neither of which has a server to be
 * disconnected from. A centred pill rather than a full-width bar, because the
 * board underneath it is the thing the player is trying to read.
 */
export function ConnectionStrip({ status }: { status: ConnectionStatus }) {
  if (status === 'open') return null;

  return (
    <div
      role="status"
      className="fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white shadow-lg"
    >
      {status === 'connecting' ? 'Connecting…' : 'Disconnected — reconnecting…'}
    </div>
  );
}
