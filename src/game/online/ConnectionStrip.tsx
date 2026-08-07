import { useEffect, useState } from 'react';
import type { ConnectionStatus } from '../../net/connection';

/**
 * How long a connect may take before it is worth explaining.
 *
 * Short enough that nobody watches an unexplained pill for long; long enough
 * that an ordinary blip — a laptop lid, a tunnel — never triggers the longer
 * copy and makes a two-second reconnect sound like a thirty-second one.
 */
const EXPLAIN_AFTER_MS = 3000;

/**
 * Connection state, and only inside the room.
 *
 * Its predecessor was fixed across every route, which put a bar over the top
 * of pass-and-play and the catalog — neither of which has a server to be
 * disconnected from. A centred pill rather than a full-width bar, because the
 * board underneath it is the thing the player is trying to read.
 *
 * The long form names the deployment's own worst case: the free Render tier
 * sleeps after fifteen minutes and takes about thirty seconds to wake
 * (DEPLOYMENT.md). A player who knows that waits; a player watching
 * "Connecting…" for half a minute assumes it is broken.
 */
export function ConnectionStrip({ status }: { status: ConnectionStatus }) {
  const [slow, setSlow] = useState(false);

  // Declared above the early return, because hooks cannot run conditionally.
  useEffect(() => {
    if (status === 'open') {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), EXPLAIN_AFTER_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === 'open') return null;

  return (
    <div
      data-testid="connection-strip"
      role="status"
      className="fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white shadow-lg"
    >
      {slow
        ? 'Waking the server — this can take up to 30 seconds'
        : status === 'connecting' ? 'Connecting…' : 'Disconnected — reconnecting…'}
    </div>
  );
}
