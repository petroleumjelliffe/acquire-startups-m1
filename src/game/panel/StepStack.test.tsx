import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { StepStack } from './StepStack';
import { ActiveStep } from './ActiveStep';
import { STEP_EXIT_MS } from './stepMotion';

// Every entry is a real undo point here; the `undoable` flag's own behaviour is
// covered by 'offers undo only on entries marked undoable' below.
const ENTRIES = [
  { stepId: 1, phase: 'Place a tile', detail: <span>Alex played E6</span>, undoable: true },
  { stepId: 2, phase: 'Found a startup', detail: <span>Messla founded</span>, undoable: true },
  { stepId: 3, phase: 'Buy shares', detail: <span>2 × Messla</span>, undoable: true },
];

describe('StepStack', () => {
  it('renders the entries in order', () => {
    const { container } = render(<StepStack entries={ENTRIES} />);
    const phases = Array.from(container.querySelectorAll('[data-step-phase]')).map(
      (el) => el.textContent,
    );
    expect(phases).toEqual(['Place a tile', 'Found a startup', 'Buy shares']);
  });

  // The undo affordance is what makes a completed step a rewind point. It is
  // present exactly when a caller can act on it, which is how the catalog shows
  // the undoable and the read-only appearance from one component.
  it('renders one undo control per undoable entry when onUndo is supplied', () => {
    const { container } = render(<StepStack entries={ENTRIES} onUndo={() => {}} />);
    expect(container.querySelectorAll('[data-step-undo]')).toHaveLength(ENTRIES.length);
  });

  it('renders no undo control at all when onUndo is not supplied', () => {
    const { container } = render(<StepStack entries={ENTRIES} />);
    expect(container.querySelectorAll('[data-step-undo]')).toHaveLength(0);
  });

  /**
   * The list is one transformable element, not a set of self-animating rows.
   * Both halves matter: a per-entry animation in a bottom-aligned list can
   * only animate the newest row while every older one jumps, which is the
   * defect the whole motion rework exists to fix.
   *
   * jsdom cannot see the motion itself — every height here is zero, so the
   * effect measures a growth of 0 and correctly does nothing. What the
   * animation looks like is settled on a real page by `verify:layout`'s
   * step-rise probe and by eye.
   */
  it('animates the list, not the entries', () => {
    const { container } = render(<StepStack entries={ENTRIES} />);
    const list = container.querySelector('[data-step-list]');
    expect(list).not.toBeNull();
    expect(list!.querySelectorAll('[data-step-phase]')).toHaveLength(ENTRIES.length);
    expect(container.querySelectorAll('.step-enter')).toHaveLength(0);
  });

  // stepId is the entry's identity — the same id Plan 1a's rewindTo takes —
  // so undo must call back with that step's own id, not its array index.
  it('calls back with that entry own stepId', () => {
    const onUndo = vi.fn();
    const { container } = render(<StepStack entries={ENTRIES} onUndo={onUndo} />);
    const second = container.querySelectorAll('[data-step-undo]')[1];
    fireEvent.click(second);
    expect(onUndo).toHaveBeenCalledWith(2);
  });
});

/**
 * The exit is one of the few things about this motion jsdom *can* see: the
 * question is not how far anything moved but *when* the old row stops being
 * rendered. Sequential means it is still there for the whole exit and gone
 * before the new one arrives — which is exactly a question about the DOM over
 * time.
 */
describe('a step being replaced', () => {
  const PLACED_E6 = { stepId: 1, phase: 'Placed a tile', detail: <span>E6</span>, undoable: true };
  const PLACED_H8 = { stepId: 2, phase: 'Placed a tile', detail: <span>H8</span>, undoable: true };

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('holds the outgoing step on screen while it leaves, then lets the new one in', () => {
    const { container, rerender } = render(<StepStack entries={[PLACED_E6]} />);
    expect(container.textContent).toContain('E6');

    rerender(<StepStack entries={[PLACED_H8]} />);

    // Mid-exit: the old step is still rendered, and the new one has not
    // arrived. Dropping the old row immediately is what "it just appears"
    // looked like, and is the break for this test.
    expect(container.textContent).toContain('E6');
    expect(container.textContent).not.toContain('H8');

    act(() => { vi.advanceTimersByTime(STEP_EXIT_MS); });

    expect(container.textContent).not.toContain('E6');
    expect(container.textContent).toContain('H8');
  });

  it('drops a whole rewind in one go rather than one row at a time', () => {
    const three = [
      PLACED_E6,
      { stepId: 2, phase: 'Founded a brand', detail: <span>Messla</span>, undoable: true },
      { stepId: 3, phase: 'Buy shares', detail: <span>2 × Messla</span>, undoable: true },
    ];
    const { container, rerender } = render(<StepStack entries={three} />);

    rerender(<StepStack entries={[PLACED_E6]} />);
    expect(container.textContent).toContain('Messla');

    // One exit, not one per row: after a single exit's worth of time every
    // removed row is gone.
    act(() => { vi.advanceTimersByTime(STEP_EXIT_MS); });
    expect(container.textContent).not.toContain('Messla');
    expect(container.textContent).toContain('E6');
  });

  /**
   * The panel re-renders for reasons that have nothing to do with the stack —
   * a share staged, a socket status change — and `stepsOf` hands back a fresh
   * array every time. An exit that cancelled itself on each of those would
   * leave the outgoing step on screen for good, translated out of view, with
   * its replacement never arriving.
   */
  it('survives a re-render in the middle of leaving', () => {
    const { container, rerender } = render(<StepStack entries={[PLACED_E6]} />);
    rerender(<StepStack entries={[PLACED_H8]} />);

    act(() => { vi.advanceTimersByTime(STEP_EXIT_MS / 2); });
    // Same entries, new array — exactly what a parent re-render produces.
    rerender(<StepStack entries={[{ ...PLACED_H8 }]} />);
    act(() => { vi.advanceTimersByTime(STEP_EXIT_MS); });

    expect(container.textContent).not.toContain('E6');
    expect(container.textContent).toContain('H8');
  });

  it('does not hold anything back when a step is only added', () => {
    const { container, rerender } = render(<StepStack entries={[PLACED_E6]} />);
    rerender(<StepStack entries={[PLACED_E6, PLACED_H8]} />);
    // Nothing left, so there is nothing to wait for.
    expect(container.textContent).toContain('H8');
  });
});

describe('ActiveStep', () => {
  it('renders its label and body', () => {
    render(<ActiveStep label="Buy shares" body={<p>Pick up to three</p>} />);
    expect(screen.getByText('Buy shares')).toBeInTheDocument();
    expect(screen.getByText('Pick up to three')).toBeInTheDocument();
  });

  it('renders the button slot only when one is supplied', () => {
    const { container: withBtn } = render(
      <ActiveStep label="Buy shares" body={<p>body</p>} button={<button>Done</button>} />,
    );
    expect(within(withBtn).getByRole('button', { name: 'Done' })).toBeInTheDocument();

    const { container: without } = render(<ActiveStep label="Buy shares" body={<p>body</p>} />);
    expect(without.querySelector('button')).toBeFalsy();
  });
});

it('offers undo only on entries marked undoable', () => {
  const onUndo = vi.fn();
  render(
    <StepStack
      onUndo={onUndo}
      entries={[
        { stepId: 1, phase: 'Placed a tile', detail: 'E5', undoable: true },
        { stepId: 2, phase: 'Merger payout', detail: 'paid', undoable: false },
      ]}
    />,
  );
  expect(screen.getAllByRole('button')).toHaveLength(1);
});
