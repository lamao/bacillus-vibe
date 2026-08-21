import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

/** Runs a git command for the build id, falling back if git or history isn't available (e.g. a tarball checkout). */
function git(command: string, fallback: string): string {
  try {
    return execSync(command, { encoding: 'utf-8' }).trim() || fallback;
  } catch {
    return fallback;
  }
}

// Identifies exactly what's running on the page, so a stale/cached deploy is
// obvious rather than silently mistaken for the latest build. CI checks out
// full branch refs (not detached-HEAD SHAs), so HEAD's branch name resolves
// correctly there too; GITHUB_HEAD_REF/GITHUB_REF_NAME cover the PR/push
// Actions cases where it wouldn't. commitCount + shortSha are the unique,
// fully-automatic "counter": every commit changes at least the SHA.
const buildBranch =
  process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git('git rev-parse --abbrev-ref HEAD', 'unknown');
const buildCommitCount = git('git rev-list --count HEAD', '0');
const buildShortSha = git('git rev-parse --short HEAD', 'unknown');
const buildId = `${buildBranch}-${buildCommitCount}-${buildShortSha}`;

// Deployed to https://<owner>.github.io/<repo>/ — base must match the repo
// name so built asset URLs resolve under the Pages subpath. PR previews are
// published under /<repo>/pr-preview/pr-<n>/ by rossjrw/pr-preview-action,
// which rewrites base paths itself, so a single relative base works for both.
export default defineConfig({
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
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
