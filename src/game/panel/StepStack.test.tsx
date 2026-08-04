import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StepStack } from './StepStack';
import { ActiveStep } from './ActiveStep';

const ENTRIES = [
  { stepId: 1, phase: 'Place a tile', detail: <span>Alex played E6</span> },
  { stepId: 2, phase: 'Found a startup', detail: <span>Messla founded</span> },
  { stepId: 3, phase: 'Buy shares', detail: <span>2 × Messla</span> },
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
  it('renders one undo control per entry when onUndo is supplied', () => {
    const { container } = render(<StepStack entries={ENTRIES} onUndo={() => {}} />);
    expect(container.querySelectorAll('[data-step-undo]')).toHaveLength(ENTRIES.length);
  });

  it('renders no undo control at all when onUndo is not supplied', () => {
    const { container } = render(<StepStack entries={ENTRIES} />);
    expect(container.querySelectorAll('[data-step-undo]')).toHaveLength(0);
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
