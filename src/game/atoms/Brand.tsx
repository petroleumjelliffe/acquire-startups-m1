import { BRAND_CLASSES, type BrandKey } from '../tokens';

/**
 * A company's identity — a filled *pill*, labelled with the full name.
 *
 * The counterpart to `StockCard`, which is one *share* of the company: a
 * portrait certificate labelled with the ticker. Company vs share is the second
 * of the two locked semantic separations, and it still holds — under the aqua
 * skin both are filled with the brand's gradient, so what separates them is
 * shape and content rather than fill against outline. Nothing here should ever
 * render a ticker.
 */
export interface BrandProps {
  id: BrandKey;
  mode?: 'static' | 'select';
  selected?: boolean;
  disabled?: boolean;
  size?: 'sm';
  onClick?: () => void;
}

// No `border`/`rounded`: `.aqua-brand-pill` carries the radius, the gradient
// and its own edge.
const BASE = 'inline-flex items-center gap-1.5 align-middle font-semibold leading-snug';

export function Brand({ id, mode = 'static', selected, disabled, size, onClick }: BrandProps) {
  const brand = BRAND_CLASSES[id];
  const sizing = size === 'sm' ? 'px-[7px] py-px text-xs' : 'px-[9px] py-[3px] text-sm';
  const state = [
    selected ? 'outline outline-2 outline-offset-1 outline-blue-600' : '',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const className = `${BASE} ${sizing} aqua-brand-pill ${brand.grad} ${state}`;

  if (mode === 'select') {
    // `cursor-pointer` is only added when enabled: adding both it and
    // `cursor-not-allowed` would leave the winner to Tailwind's emit order.
    return (
      <button
        type="button"
        className={disabled ? className : `${className} cursor-pointer`}
        disabled={disabled}
        onClick={onClick}
      >
        {id}
      </button>
    );
  }

  return <span className={className}>{id}</span>;
}
