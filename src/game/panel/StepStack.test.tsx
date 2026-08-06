import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StepStack } from './StepStack';
import { ActiveStep } from './ActiveStep';

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
