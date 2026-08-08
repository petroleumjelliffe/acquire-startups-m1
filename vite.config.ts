import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { BASE_PATH } from "./basePath";
import { APP_COLORS } from "./src/game/tokens";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Substitutes the PWA placeholders in index.html.
    //
    // __THEME_COLOR__ comes from the same token the manifest generator reads
    // (APP_COLORS in src/game/tokens.ts), so a palette change — the Aqua
    // Titanium reskin rewrites that file — flows into both without either
    // being typed by hand. Safe to import here: tokens.ts depends only on
    // engine/, which is Node-clean by construction.
    //
    // __PWA_BASE__ exists because Vite's own %BASE_URL% inserts the base
    // *verbatim*: with base '/acquire-startups-m1' it produced
    // href="/acquire-startups-m1manifest.webmanifest" — no slash. This one is
    // normalized to always end in exactly one slash, in dev and build alike.
    //
    // replaceAll, not replace: the first __THEME_COLOR__ in the file is in
    // the comment explaining it, and .replace() substituted the comment and
    // left the actual meta tag carrying the placeholder. Caught by grepping
    // dist, which is why the verification step exists.
    {
      name: "pwa-placeholders-from-tokens",
      transformIndexHtml: (html) =>
        html
          .replaceAll("__THEME_COLOR__", APP_COLORS.theme)
          .replaceAll("__PWA_BASE__", `${command === "build" ? BASE_PATH : ""}/`),
    },
  ],
  server: { port: 5173 },
  base: command === 'build' ? BASE_PATH : "/",
  test: {
    globals: true,
    environment: 'jsdom',
    // No root-level `setupFiles`: vitest 4's `extends: true` merges arrays,
    // so a child project's `setupFiles: []` does not override a root value —
    // it only adds nothing to it. The `node` project's own `[]` below only
    // means what it says because there is nothing here for it to inherit.
    // Confirmed by the boundary assertion in `session/nodeEnvironment.test.ts`:
    // without this, `globalThis.localStorage` was live under `--project
    // node` too, silently disarming the guard the split below exists for.
    //
    // Two projects, one reason: `engine/`, `session/` and `server/` must not
    // depend on browser globals. They run under Node in production — the
    // server process — and are imported by `src/` as well, so a stray
    // `window.` is a production crash. Under a single jsdom suite `window`
    // always exists and no test can ever catch it. Running them under
    // `environment: 'node'` makes that boundary enforced instead of merely
    // documented. `src/` keeps the jsdom + jest-dom setup it had.
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: [
            'engine/**/*.test.ts',
            'session/**/*.test.ts',
            'server/**/*.test.ts',
          ],
          environment: 'node',
          globals: true,
          setupFiles: [],
        },
      },
      {
        extends: true,
        test: {
          name: 'app',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: './src/test/setup.ts',
        },
      },
    ],
  },
}));
