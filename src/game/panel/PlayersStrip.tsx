import { Cash } from '../atoms/Cash';

/** The roster along the bottom of the panel; the active player is outlined. */
export interface PlayersStripPlayer {
  id: string;
  emoji: string;
  name: string;
  cash: number;
  active?: boolean;
}

export interface PlayersStripProps {
  players: PlayersStripPlayer[];
}

export function PlayersStrip({ players }: PlayersStripProps) {
  return (
    // Two columns, not one row. A seat cannot shrink past its emoji and its
    // cash — both are flex-none, and cash is the number people are reading —
    // so four seats in a row needed ~428px inside a 319px panel and silently
    // clipped the last two. Two columns give each seat ~143px, which fits at
    // every table size from two to six. The row count varies with the number
    // of players, which is fixed for a whole game, so the zone still never
    // resizes while anyone is looking at it.
    <div className="grid flex-none grid-cols-2 gap-2 border-t border-gray-200 bg-gray-50 px-3 py-2.5">
      {players.map((p) => (
        // `min-w-0` is load-bearing: a flex item's default `min-width: auto`
        // refuses to shrink below its content, and with `whitespace-nowrap`
        // inside, six seats overflowed a 320px panel to 1061px and the last
        // four were clipped away silently. The name truncates instead; cash
        // never does, because it is the number people are reading.
        <div
          key={p.id}
          data-seat={p.id}
          className={`flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 ${
            p.active ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'
          }`}
        >
          <span className="flex-none text-base leading-none">{p.emoji || '•'}</span>
          <span className="min-w-0 truncate font-semibold">{p.name}</span>
          <span className="ml-auto flex-none">
            <Cash amount={p.cash} />
          </span>
        </div>
      ))}
    </div>
  );
}
