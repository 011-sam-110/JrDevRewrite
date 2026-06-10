#!/usr/bin/env node
/**
 * Quality gate for the JrDev rewrite.
 *
 * Modes (passed as argv[2]):
 *   lint       PostToolUse(Edit|Write) -> prettier --write + eslint --fix on the edited file (fast, per-file)
 *   typecheck  Stop                    -> project-wide `tsc --noEmit` (catches type errors at end of turn)
 *
 * Design notes (for the student reading this):
 *   - This runs AUTOMATICALLY via .claude/settings.json hooks. You don't call it by hand.
 *   - It NO-OPS cleanly until the project is scaffolded (no package.json or node_modules => exit 0).
 *     That's deliberate: a hook that errors on every edit would make the repo miserable to work in.
 *   - exit code 2 is special: Claude Code feeds whatever we print to stderr back to the model as
 *     feedback, so Claude sees the lint/type errors and fixes them before moving on.
 *   - If the Stop typecheck ever feels slow as the codebase grows, you can remove the "Stop" hook
 *     from settings.json and rely on the pre-commit gate (.githooks/pre-commit) instead.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const mode = process.argv[2] || 'lint';
const root = process.cwd();

// --- Bail out cleanly if the project isn't scaffolded yet ------------------
if (!existsSync(join(root, 'package.json'))) process.exit(0);
if (!existsSync(join(root, 'node_modules'))) process.exit(0);

const hasAny = (...names) => names.some((n) => existsSync(join(root, n)));

/** Run a command; return null on success or the combined stdout/stderr on failure. */
function run(cmd) {
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe' });
    return null;
  } catch (e) {
    const out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
    return out.trim() || `command failed: ${cmd}`;
  }
}

const problems = [];

if (mode === 'lint') {
  // The edited file path arrives on stdin as JSON: { tool_input: { file_path } }
  let stdin = '';
  try {
    stdin = readFileSync(0, 'utf8');
  } catch {
    /* no stdin */
  }
  let file = '';
  try {
    file = (JSON.parse(stdin || '{}').tool_input || {}).file_path || '';
  } catch {
    /* not JSON */
  }

  // Only touch JS/TS sources that still exist.
  if (!file || !/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file) || !existsSync(file)) process.exit(0);

  if (hasAny('.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.cjs', 'prettier.config.js', 'prettier.config.mjs', 'prettier.config.cjs')) {
    const out = run(`npx --no-install prettier --write "${file}"`);
    if (out) problems.push('Prettier:\n' + out);
  }

  if (hasAny('.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts')) {
    const out = run(`npx --no-install eslint --fix "${file}"`);
    if (out) problems.push('ESLint:\n' + out);
  }
}

if (mode === 'typecheck') {
  if (existsSync(join(root, 'tsconfig.json'))) {
    const out = run('npx --no-install tsc --noEmit');
    if (out) problems.push('TypeScript (tsc --noEmit):\n' + out);
  }
}

if (problems.length) {
  console.error(
    `⚠ Quality gate (${mode}) found issues that need fixing:\n\n` +
      problems.join('\n\n') +
      '\n\nFix these before continuing.'
  );
  process.exit(2); // 2 => surface stderr back to Claude
}

process.exit(0);
