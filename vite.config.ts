import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { BASE_PATH } from "./basePath";
import { APP_COLORS } from "./src/game/tokens";

/** Every file under dir, as paths relative to it. */
function walk(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, root) : [relative(root, full)];
  });
}

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
    // Writes dist/sw.js after the build, from scripts/sw.template.js.
    //
    // The precache list is *derived* — every file the build emitted (plus the
    // public/ copies), never a hand-maintained array, so a renamed chunk
    // cannot silently rot it. The cache name is a hash of the listed files'
    // contents: identical builds reuse their cache, any real change mints a
    // new one, and activation prunes the rest. `closeBundle` rather than
    // `writeBundle` because the public/ copies (manifest, icons) are not in
    // the bundle object and this list must include them.
    {
      name: "sw-from-build",
      apply: "build",
      closeBundle() {
        const dist = join(__dirname, "dist");
        const files = walk(dist)
          .filter((f) => !f.endsWith(".map") && f !== "sw.js" && f !== "404.html")
          .sort();
        const hash = createHash("sha256");
        for (const f of files) hash.update(f).update(readFileSync(join(dist, f)));
        // replaceAll, always. A .replace() here substituted the first
        // occurrence — which was the template's own comment naming the
        // placeholder — and shipped a worker whose PRECACHE was still the
        // placeholder. The same mistake as index.html's theme colour, made
        // twice in one day; replaceAll is now the house rule for templating.
        const sw = readFileSync(join(__dirname, "scripts", "sw.template.js"), "utf8")
          .replaceAll("__CACHE_NAME__", `acquire-${hash.digest("hex").slice(0, 12)}`)
          .replaceAll("__BASE__", `${BASE_PATH}/`)
          .replaceAll("__PRECACHE__", JSON.stringify(
            files.map((f) => `${BASE_PATH}/${f.replaceAll("\\", "/")}`),
            null, 2,
          ));
        writeFileSync(join(dist, "sw.js"), sw);
        console.log(`✓ sw.js written (${files.length} files precached)`);
      },
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
