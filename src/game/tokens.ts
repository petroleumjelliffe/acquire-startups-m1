import type { StartupId } from '../../engine/gameTypes';
import { AVAILABLE_STARTUPS } from '../../engine/startups';

export type BrandKey = StartupId | 'Cash';

export interface BrandClasses {
  stroke: string;
  tint: string;
  text: string;
  ring: string;
  /**
   * The aqua reskin's gradient stops, as a class defined in
   * `src/styles/aqua.css` that sets `--aqua-top` / `--aqua-bot`. Composed with
   * a recipe that consumes them (`.aqua-tile-chain`, `.aqua-cert`, …) so the
   * gloss is one rule and the hue is per brand.
   */
  grad: string;
}

/**
 * The approved palette, expressed in Tailwind's default scale: stroke -500,
 * tint -100, text -700. Every value is a complete literal because Tailwind's
 * JIT scans source for literal class strings — an interpolated name emits no
 * CSS and fails silently as an unstyled element.
 *
 * Blue and true green are reserved (hand/selection and cash respectively), so
 * no brand may use them. Cash is registered as a brand so the liquidation
 * sell card can be a green stock card.
 */
export const BRAND_CLASSES: Record<BrandKey, BrandClasses> = {
  Gobble:        { stroke: 'border-red-500',    tint: 'bg-red-100',    text: 'text-red-700',    ring: 'ring-red-500',    grad: 'aqua-brand-Gobble' },
  Scrapple:      { stroke: 'border-orange-500', tint: 'bg-orange-100', text: 'text-orange-700', ring: 'ring-orange-500', grad: 'aqua-brand-Scrapple' },
  WrecksonMobil: { stroke: 'border-amber-500',  tint: 'bg-amber-100',  text: 'text-amber-700',  ring: 'ring-amber-500',  grad: 'aqua-brand-WrecksonMobil' },
  PaperfulPost:  { stroke: 'border-lime-500',   tint: 'bg-lime-100',   text: 'text-lime-700',   ring: 'ring-lime-500',   grad: 'aqua-brand-PaperfulPost' },
  ZuckFace:      { stroke: 'border-teal-500',   tint: 'bg-teal-100',   text: 'text-teal-700',   ring: 'ring-teal-500',   grad: 'aqua-brand-ZuckFace' },
  Messla:        { stroke: 'border-purple-500', tint: 'bg-purple-100', text: 'text-purple-700', ring: 'ring-purple-500', grad: 'aqua-brand-Messla' },
  CamCrooned:    { stroke: 'border-pink-500',   tint: 'bg-pink-100',   text: 'text-pink-700',   ring: 'ring-pink-500',   grad: 'aqua-brand-CamCrooned' },
  Cash:          { stroke: 'border-green-500',  tint: 'bg-green-100',  text: 'text-green-700',  ring: 'ring-green-500',  grad: 'aqua-brand-Cash' },
};

const TICKERS = new Map<string, string>(AVAILABLE_STARTUPS.map((s) => [s.id, s.ticker]));

export function tickerFor(id: BrandKey): string {
  return id === 'Cash' ? '$$' : TICKERS.get(id) ?? id;
}

/**
 * The app's chrome, as real colour values.
 *
 * `BRAND_CLASSES` above is Tailwind class names, which is right for
 * components and useless for anything outside the CSS pipeline — the PWA
 * manifest wants hex. These are the two colours the installed app shows the
 * OS: `theme` is the primary action blue (Tailwind blue-600) and `background`
 * is the page ground (gray-50) painted behind the splash while the shell
 * loads.
 *
 * The manifest is *generated* from these at build time
 * (`scripts/generate-manifest.ts`) — never hand-copied — so a reskin that
 * retargets this object flows into installed apps on the next build. If you
 * are the reskin: change the values here and you are done; do not touch the
 * generator.
 */
export const APP_COLORS = {
  /** Primary action colour — the aqua primary lozenge's deep stop. */
  theme: '#1a6ecb',
  /** Page ground — the lighter stripe of the aqua pinstripe deck. */
  background: '#eef1f6',
} as const;
