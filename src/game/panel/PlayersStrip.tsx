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
    <div className="flex flex-none gap-2 border-t border-gray-200 bg-gray-50 px-3 py-2.5">
      {players.map((p) => (
        <div
          key={p.id}
          className={`flex flex-1 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 ${
            p.active ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'
          }`}
        >
          <span className="flex-none text-base leading-none">{p.emoji || '•'}</span>
          <span className="font-semibold">{p.name}</span>
          <span className="ml-auto">
            <Cash amount={p.cash} />
          </span>
        </div>
      ))}
    </div>
  );
}
