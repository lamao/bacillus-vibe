import { defineConfig } from 'vitest/config';

// Deployed to https://<owner>.github.io/<repo>/ — base must match the repo
// name so built asset URLs resolve under the Pages subpath. PR previews are
// published under /<repo>/pr-preview/pr-<n>/ by rossjrw/pr-preview-action,
// which rewrites base paths itself, so a single relative base works for both.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/engine/**/*.ts'],
      thresholds: {
        lines: 85,
      },
    },
  },
});
