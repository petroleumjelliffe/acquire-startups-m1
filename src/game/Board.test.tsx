import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Board } from './Board';
import { createEmptyBoard } from '../../engine/gameInit';
import type { Coord } from '../../engine/gameHelpers';
import type { TileCell } from '../../engine/gameTypes';

const boardWith = (cells: { [K in Coord]?: TileCell }): Record<Coord, TileCell> => {
  const board = createEmptyBoard();
  for (const [c, cell] of Object.entries(cells)) {
    if (cell) board[c as Coord] = cell;
  }
  return board;
};

describe('Board', () => {
  it('labels cells A1-style, never r-c', () => {
    render(<Board board={createEmptyBoard()} />);
    expect(screen.getByTitle('A1')).toBeInTheDocument();
    expect(screen.queryByText('0-0')).not.toBeInTheDocument();
    expect(screen.queryByText('1-1')).not.toBeInTheDocument();
  });

  // The initial is `Z` rather than `A` on purpose: the row headers render the
  // letters A–I, so a bare getByText('A') matches the header as well as the
  // badge and throws on the duplicate. Scoping to the cell pins what the test
  // is actually about — the badge is an initial, and it is on that tile.
  it('badges the last-placed tile with an initial, not a full name', () => {
    render(
      <Board
        board={boardWith({ E5: { placed: true } })}
        owners={{ E5: 'Z' } as Record<Coord, string>}
      />,
    );
    expect(within(screen.getByTitle('E5').parentElement!).getByText('Z')).toBeInTheDocument();
    expect(screen.queryByText('Zoe')).not.toBeInTheDocument();
  });

  it('gives chain members a brand ring so neighbours read as one outline', () => {
    const { container } = render(
      <Board board={boardWith({
        E3: { placed: true, startupId: 'Messla' },
        E4: { placed: true, startupId: 'Messla' },
      })} />,
    );
    const rings = container.querySelectorAll('[class*="ring-purple-500"]');
    expect(rings.length).toBeGreaterThanOrEqual(2);
  });

  it('marks blocked hand tiles and makes them unclickable', () => {
    const { container } = render(
      <Board board={createEmptyBoard()} hand={['C6'] as Coord[]} blocked={['C6'] as Coord[]} />,
    );
    expect(screen.getByTitle('C6').className).toMatch(/cursor-not-allowed/);
    expect(container.querySelector('[title="C6"][disabled]')).toBeTruthy();
  });

  it('shows the ticker on an HQ tile and keeps the coordinate reachable on hover', () => {
    render(<Board board={boardWith({ E3: { placed: true, startupId: 'Messla' } })} hqTiles={['E3'] as Coord[]} />);
    const hq = screen.getByTitle('E3');
    expect(hq.textContent).toContain('$M');
    expect(hq).toHaveAttribute('title', 'E3');
  });

  it('renders 108 cells plus headers', () => {
    const { container } = render(<Board board={createEmptyBoard()} />);
    expect(container.querySelectorAll('[title]').length).toBe(108);
  });
});
