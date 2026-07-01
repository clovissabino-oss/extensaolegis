import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['node_modules', 'dist', 'e2e/**'],
    coverage: { provider: 'v8', include: ['src/core/**'], thresholds: { lines: 80, functions: 80 } },
  },
});
