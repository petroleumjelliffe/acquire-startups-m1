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

export default defineConfig(({ command, isPreview }) => ({
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
    //
    // order: 'pre' (Vite 7 regression fix, 2026-08-09): Vite's own dev-only
    // devHtmlHook runs before any transformIndexHtml hook that doesn't
    // declare 'pre', and it treats an unsubstituted href like
    // "__PWA_BASE__manifest.webmanifest" as a *bare relative* specifier
    // (isBareRelative: starts with a word character, no ':') whenever the
    // request's originalUrl isn't exactly "/" — true for every client route
    // (/online, /room/:id, …) and even "/" with a query string. It then
    // prepends config.base ("/" in dev) to that raw placeholder text,
    // producing "/__PWA_BASE__manifest.webmanifest" *before* this plugin
    // ever runs — so the later replaceAll below turns that leading "/" +
    // the substituted "/" into "//manifest.webmanifest", a protocol-relative
    // URL the browser resolves as host "manifest.webmanifest" (DNS failure).
    // 'pre' makes this plugin's substitution happen first, so devHtmlHook
    // only ever sees the real, already-absolute path — which its own
    // same-branch path.posix.join collapses back to a single leading slash,
    // same as it always did before Vite 7. Root ("/") never hit this because
    // its originalUrl is literally "/", the one value that heuristic skips —
    // which is why the bug looked route-dependent. Build is unaffected
    // either way: it never runs devHtmlHook.
    {
      name: "pwa-placeholders-from-tokens",
      transformIndexHtml: {
        order: "pre",
        handler: (html) =>
          html
            .replaceAll("__THEME_COLOR__", APP_COLORS.theme)
            .replaceAll("__PWA_BASE__", `${command === "build" ? BASE_PATH : ""}/`),
      },
      // The generated manifest carries the *prod* start_url and scope, but
      // the dev server serves the app at '/'. Installing from a dev LAN URL
      // — which the owner did, first thing — produced an app that opened
      // /acquire-startups-m1/ against a router with no route there: a white
      // screen as the install's first impression. Dev rewrites the manifest
      // to its own origin's shape; the built file is untouched.
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split("?")[0] !== "/manifest.webmanifest") return next();
          const raw = readFileSync(join(__dirname, "public", "manifest.webmanifest"), "utf8");
          const manifest = JSON.parse(raw) as { start_url: string; scope: string };
          manifest.start_url = "/";
          manifest.scope = "/";
          res.setHeader("Content-Type", "application/manifest+json");
          res.end(JSON.stringify(manifest, null, 2));
        });
      },
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
  // 7932 is Acquire's dev-client slot in the cross-game port registry (the
  // game-host repo's PORTS.md); strictPort fails loudly rather than sliding
  // into a neighbour's slot. allowedHosts covers the host machine's mDNS
  // name, which Vite's DNS-rebind guard would otherwise refuse.
  server: {
    port: 7932, strictPort: true, allowedHosts: ['.local'],
    // Dev plays the part Caddy plays in hosting: the client is origin-relative
    // and this proxy carries its socket path to the game server. 4002 per
    // game-host PORTS.md — build tooling, not shipped code.
    //
    // Two keys because the client's path follows its base: dev serves at '/'
    // so it asks for '/socket.io' — the target must run with
    // SOCKET_PATH=/socket.io, which the dev:server script does — while
    // preview serves the built client at BASE_PATH, so it asks for the
    // prefixed path, which a bare `tsx server/index.ts` mounts by default.
    proxy: {
      '/socket.io': { target: 'http://localhost:4002', ws: true },
      [`${BASE_PATH}/socket.io`]: { target: 'http://localhost:4002', ws: true },
    },
  },
  // `isPreview` matters as much as `command` here. Preview runs as `serve`,
  // so without it preview hosted `dist/` at "/" while the built index.html
  // asked for `${BASE_PATH}/assets/…`. Every asset missed and the SPA
  // fallback answered with index.html and a **200**, so the page rendered
  // blank and a status-code check read as success. Dev still wants "/".
  //
  // Note this stays derived from BASE_PATH rather than repeating the path in
  // the preview script — the whole point of basePath.ts is that there is one
  // copy, and it has already been three.
  base: command === 'build' || isPreview ? BASE_PATH : "/",
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
            // The shared lobby, as a submodule. Its protocol and server
            // halves are node-side; its client half is jsdom and belongs to
            // the `app` project below. A consumer that does not run these
            // will not notice when a submodule bump breaks it.
            'vendor/lobby/protocol/**/*.test.ts',
            'vendor/lobby/server/**/*.test.ts',
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
          include: ['src/**/*.test.{ts,tsx}', 'vendor/lobby/client/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: './src/test/setup.ts',
        },
      },
    ],
  },
}));
