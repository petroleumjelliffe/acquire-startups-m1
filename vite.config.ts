import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: { port: 5173 },
  base: command === 'build' ? "/acquire-startups-m1" : "/",
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Two projects, one reason: `engine/` must not depend on browser
    // globals. It is imported by `server/` (Node) as well as by `src/`, so a
    // stray `window.` in engine code is a production crash — but under a
    // single jsdom suite `window` always exists and no test can ever catch
    // it. Running `engine/**` under `environment: 'node'` makes that
    // boundary enforced instead of merely documented. Everything else keeps
    // the jsdom + jest-dom setup it had.
    projects: [
      {
        extends: true,
        test: {
          name: 'engine',
          include: ['engine/**/*.test.ts'],
          environment: 'node',
          globals: true,
          setupFiles: [],
        },
      },
      {
        extends: true,
        test: {
          name: 'app',
          include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
          environment: 'jsdom',
          globals: true,
          setupFiles: './src/test/setup.ts',
        },
      },
    ],
  },
}));
