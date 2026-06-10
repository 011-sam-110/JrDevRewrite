import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit/integration tests live next to the code they test (VSA: slice-local tests).
    // Playwright owns tests/e2e/ — keep the two runners out of each other's files.
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
