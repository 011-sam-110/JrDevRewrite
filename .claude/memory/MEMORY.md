# Project Memory Index — JrDev rewrite

This is the **project-local** memory for the JrDev rewrite. It is version-controlled with the repo,
so it captures durable facts about *this project* (decisions, gotchas, state, conventions) that the
code and git history don't already make obvious.

How it works:
- One fact per file, kebab-case filename, with YAML frontmatter (`name`, `description`,
  `metadata.type` = `decision` | `project` | `reference` | `gotcha`).
- Add a one-line pointer here when you create a memory. This index is what gets skimmed first.
- Update the matching file instead of duplicating; delete a file if it turns out to be wrong.
- Don't record what the code/CLAUDE.md/git already says. Record what was non-obvious.

## Index

- [Dev environment & Claude Code setup](dev-environment.md) — Playwright MCP, quality-gate hooks, pre-commit gate, VSA skill, teaching mode (configured 2026-06-05)
