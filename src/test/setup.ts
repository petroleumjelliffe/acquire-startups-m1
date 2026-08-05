import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

/**
 * Polyfill localStorage for jsdom tests.
 *
 * Under vitest ^4.0.14 with jsdom ^27.2.0, `globalThis.localStorage` is undefined
 * despite jsdom shipping native localStorage for years. Without this polyfill, tests
 * that read/write localStorage (e.g., src/net/identity.test.ts) fail with:
 *
 *   TypeError: Cannot read properties of undefined (reading 'clear')
 *
 * This is likely due to jsdom's origin/sandbox handling: each test frame may be
 * configured differently, or sandbox settings prevent storage APIs. The attempted fix
 * via `vite.config.ts` environmentOptions.jsdom.localStorage: true does nothing under
 * this configuration pair.
 *
 * This shim implements only the subset used by tests — getItem, setItem, removeItem,
 * clear, length, and key() — with in-memory storage. It does NOT implement storage
 * events (cross-tab sync), per-origin isolation, or persistence. Tests run in isolation
 * with this implementation; production code relies on the browser's real localStorage.
 */
if (!globalThis.localStorage) {
  const store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem(key: string) {
      return store[key] || null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      for (const key in store) {
        delete store[key];
      }
    },
    get length() {
      return Object.keys(store).length;
    },
    key(index: number) {
      return Object.keys(store)[index] || null;
    },
  } as Storage;
}

// Cleanup after each test
afterEach(() => {
  cleanup();
});
