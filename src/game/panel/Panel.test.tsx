import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Panel } from './Panel';

describe('Panel', () => {
  // The zone order is a locked design decision, so it must come from the
  // component and not from the order a caller happens to pass the props in.
  it('renders the five zones in the fixed order regardless of prop order', () => {
    const { container } = render(
      <Panel
        players={<span>players</span>}
        hand={<span>hand</span>}
        staging={<span>staging</span>}
        active={<span>active</span>}
        stepstack={<span>stepstack</span>}
      />,
    );
    const slots = Array.from(container.querySelectorAll('[data-slot]')).map((el) =>
      el.getAttribute('data-slot'),
    );
    expect(slots).toEqual(['stepstack', 'active', 'staging', 'hand', 'players']);
  });

  it('omits a zone entirely when its slot is not supplied', () => {
    const { container } = render(<Panel stepstack={<span>stepstack</span>} />);
    const slots = Array.from(container.querySelectorAll('[data-slot]')).map((el) =>
      el.getAttribute('data-slot'),
    );
    expect(slots).toEqual(['stepstack']);
  });

  it('is a full-height column so the step stack can pin the zones below it', () => {
    const { container } = render(<Panel stepstack={<span>stepstack</span>} />);
    expect(container.firstElementChild?.className).toMatch(/flex-col/);
    expect(container.firstElementChild?.className).toMatch(/h-full/);
  });
});
