---
name: dev-environment
description: How Claude Code is configured for the JrDev rewrite — memory, hooks, MCP, skills, teaching mode.
metadata:
  type: reference
---

Claude Code workspace setup for the JrDev rewrite, configured 2026-06-05.

- **Project memory** lives in `.claude/memory/` (this folder), tracked in git. All durable
  project facts go here, indexed by `MEMORY.md`. This is separate from Sampo's global user memory.
- **Vertical Slice Architecture** is the structural standard — see the `vertical-slice-architecture`
  skill in `.claude/skills/`. Features are slices under `src/features/`; a pure kernel lives in
  `src/domain/`; shared I/O adapters in `src/infra/`. This supersedes the older flat `services/` sketch.
- **Teaching mode**: Sampo is a student. Explain the *why*, name patterns/trade-offs, and enforce
  best practice rather than just complying. See the "Working with you" section in CLAUDE.md.
- **Visual debugging = Playwright MCP** (`.mcp.json`). Lets Claude drive a real browser against the
  running app: open pages, screenshot, read the DOM, click, catch console errors. Needs approval on
  first launch and `npx playwright install chromium`. Screenshots can go to `.claude/debug-shots/`.
- **Quality-gate hooks** (`.claude/settings.json` + `.claude/hooks/quality-gate.mjs`): PostToolUse
  runs prettier+eslint --fix on each edited file; Stop runs `tsc --noEmit`. Both NO-OP until the
  project is scaffolded (package.json + node_modules present).
- **Pre-commit gate** (`.githooks/pre-commit`): blocks commits when typecheck or tests fail.
  Activate with `git config core.hooksPath .githooks`. Also no-ops pre-scaffold.
- **Migrated skills**: `grill-me` and `prd` were re-created in `.claude/skills/` with proper YAML
  frontmatter (the originals in the top-level `skills/` folder were never loaded by Claude Code).
  The old `skills/` folder can be deleted once the new ones are confirmed working.
- **`/goal` build orchestrator** (added 2026-06-10, `.claude/skills/goal/`): resumable loop over
  `ROADMAP.md` — one milestone per run, test-first per VSA, gates (typecheck/lint/tests/Playwright
  evidence) before `[x]`, one commit per milestone, external creds never block (mockable `infra/`
  adapters + a "Needs from Sampo" list in the roadmap). `/goal status` reports, `/goal replan`
  revises scope. Built after the 2026-06-10 grilling session resolved all PRD questions.
