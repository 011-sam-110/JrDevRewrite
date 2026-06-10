import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirror tsconfig's "@/*" → "./src/*" alias — Vitest resolves imports itself
  // (it doesn't read tsconfig paths), so the mapping is declared in both places.
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    // Unit/integration tests live next to the code they test (VSA: slice-local tests).
    // Playwright owns tests/e2e/ — keep the two runners out of each other's files.
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
