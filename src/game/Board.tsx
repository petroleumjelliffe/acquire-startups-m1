import type { CSSProperties } from 'react';
import { Tile } from './atoms/Tile';
import { isStartupId } from '../../engine/startups';
import { ROWS, COLS, coord as toCoord, type Coord } from '../../engine/gameHelpers';
import type { TileCell } from '../../engine/gameTypes';

/**
 * The 9×12 board, pure over a board fixture.
 *
 * Closes the five parity defects `src/components/Board.tsx` carries: A1-style
 * coordinates rather than `r-c`, an owner *initial* rather than a full name,
 * chain outlines, blocked/dead-tile treatment, and the coordinate staying
 * reachable on a founded tile.
 */
export interface BoardProps {
  board: Record<Coord, TileCell>;
  /** Placeable tiles in the current player's hand. */
  hand?: Coord[];
  /** The tile placed this turn — the one still undoable. */
  placed?: Coord | null;
  /** Coord → the owning player's initial, badged on the tile. */
  owners?: Record<Coord, string>;
  /** Hand tiles whose placement would illegally merge two safe chains. */
  blocked?: Coord[];
  /** The one labelled cell per chain, showing the ticker. */
  hqTiles?: Coord[];
  onCellClick?: (c: Coord) => void;
}

/**
 * `container-type: inline-size` plus `cqi` label sizing is what makes one board
 * work from tablet to desktop: the text scales with the board itself, so no
 * breakpoint-specific font sizes are needed anywhere below.
 */
const GRID_VARS = {
  '--tile-label': '2.3cqi',
  '--tile-overlay': '4.6cqi',
} as CSSProperties;

export function Board({
  board,
  hand = [],
  placed = null,
  owners = {},
  blocked = [],
  hqTiles = [],
  onCellClick,
}: BoardProps) {
  return (
    <div
      data-board="grid"
      style={GRID_VARS}
      className="grid h-full max-w-full grid-cols-[22px_repeat(12,1fr)] gap-[5px] rounded-xl bg-gray-200 p-2 aspect-[13/10] [container-type:inline-size]"
    >
      <div />
      {COLS.map((c) => (
        <div key={`col-${c}`} className="flex items-center justify-center text-[11px] text-gray-600">
          {c}
        </div>
      ))}

      {ROWS.map((r) => (
        <RowCells
          key={r}
          row={r}
          board={board}
          hand={hand}
          placed={placed}
          owners={owners}
          blocked={blocked}
          hqTiles={hqTiles}
          onCellClick={onCellClick}
        />
      ))}
    </div>
  );
}

function RowCells({
  row,
  board,
  hand,
  placed,
  owners,
  blocked,
  hqTiles,
  onCellClick,
}: Required<Omit<BoardProps, 'onCellClick'>> & { row: (typeof ROWS)[number]; onCellClick?: (c: Coord) => void }) {
  return (
    <>
      <div className="flex items-center justify-center text-[11px] text-gray-600">{row}</div>
      {COLS.map((c) => {
        const id = toCoord(row, c);
        const cell: TileCell = board[id] ?? { placed: false };
        // `TileCell.startupId` is a plain string; narrow it through the
        // engine's guard rather than asserting it into a `StartupId`.
        const brand = cell.startupId != null && isStartupId(cell.startupId) ? cell.startupId : undefined;
        const founded = brand != null;
        const inHand = hand.includes(id) && !cell.placed;
        const isBlocked = inHand && blocked.includes(id);
        const owner = owners[id];

        const state = founded
          ? hqTiles.includes(id)
            ? 'founded'
            : 'chain'
          : cell.placed
            ? 'filled'
            : inHand
              ? isBlocked
                ? 'blocked'
                : 'hand'
              : 'empty';

        // Only a live hand tile or the undoable placed tile is worth a click;
        // everything else stays out of the keyboard order rather than making
        // a caller tab through 108 dead cells.
        const clickable = (inHand && !isBlocked) || placed === id;

        return (
          <div key={id} className="relative">
            <Tile
              coord={id}
              state={state}
              brand={brand}
              selected={placed === id}
              fill
              onClick={clickable && onCellClick ? () => onCellClick(id) : undefined}
            />
            {owner && (
              <span className="pointer-events-none absolute right-px top-px z-[4] rounded-sm bg-white/85 px-0.5 py-px text-[8px] font-bold leading-none text-gray-900">
                {owner}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
