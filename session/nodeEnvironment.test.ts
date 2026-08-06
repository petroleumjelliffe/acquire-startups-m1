import { describe, it, expect } from 'vitest';

/**
 * The boundary `vite.config.ts`'s two-project split exists to enforce:
 * `engine/`, `session/` and `server/` run under `environment: 'node'` and
 * must never depend on a browser global, because `src/test/setup.ts`'s jsdom
 * `localStorage` shim is exactly the kind of stray global that would be a
 * production crash in the server process if it silently became available
 * here too.
 *
 * This is not hypothetical: a root-level `test.setupFiles` in
 * `vite.config.ts` once leaked that shim into this project regardless of the
 * `node` project's own `setupFiles: []`, because vitest 4's `extends: true`
 * merges setup-file arrays rather than letting a child override them with an
 * empty one. The fix moved `setupFiles` off the shared root entirely — this
 * test is what keeps that fix checked rather than merely documented.
 *
 * Checking the descriptor's *shape*, not `globalThis.localStorage` itself,
 * is deliberate: Node's own still-experimental `localStorage` global is
 * present here regardless (confirmed empirically — identical accessor
 * descriptor in both projects), so reading the value can't tell "the shim
 * never loaded" from "it did, and returns undefined anyway" — and reading it
 * is exactly what prints `ExperimentalWarning: localStorage is not
 * available because --localstorage-file was not provided`, defeating the
 * point of a pristine `npx vitest run`. `src/test/setup.ts`'s shim installs
 * with `Object.defineProperty(..., { value: {...} })` — a data descriptor —
 * which replaces Node's own accessor (`get`/`set`) descriptor outright. So a
 * `get` function still being there is proof the shim never touched this
 * environment; inspecting that shape never invokes the getter.
 */
describe('the node project sees no browser globals', () => {
  it('keeps Node\'s own localStorage accessor untouched by the jsdom-only shim', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    expect(typeof descriptor?.get).toBe('function');
    expect(descriptor?.value).toBeUndefined();
  });
});
