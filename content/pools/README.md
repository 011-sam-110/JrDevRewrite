# content/pools — manual pool specs

One markdown file per job role (`frontend.md`, `backend.md`, `fullstack.md`, `ml.md`,
`mobile.md`). Files starting with an uppercase letter (like this README) are docs and are
ignored by the importer.

Ingest with:

```bash
docker compose up -d db   # importer writes to the local Postgres
npm run pools:import
```

The importer validates every entry (reporting **all** problems per entry), dedupes by slug
(against the file, the batch, and pools already in the database — re-running is safe), and
creates pools in `draft`. Drafts only become joinable when an operator approves them at
`/operator/pools`.

## Entry format

A file holds one or more entries. Each entry is a YAML frontmatter block followed by a
markdown **brief** (the project description entrants see):

```markdown
---
slug: component-library          # kebab-case, unique everywhere, never renamed
title: Build a Component Library # ≤ 120 chars
role: frontend                   # frontend | backend | fullstack | ml | mobile
difficulty: beginner             # beginner | intermediate | advanced
window:                          # durations in DAYS (fractions allowed, ≥ 1 hour)
  joinDays: 3                    # join window opens at operator approval
  buildDays: 7                   # build window starts when joining closes
  judgeDays: 3                   # judging starts at the submission deadline
requirements:                    # the checklist judges rank against
  - At least 5 documented components
  - Storybook or equivalent demo page
entrantCap: 30                   # optional, default 30, minimum 6
---

The brief: what to build, for whom, and what "good" looks like. Plain markdown.
```

Rules worth knowing:

- **Windows are durations, not dates.** Deadlines are computed when the operator approves
  the draft (`domain/prize-pools/schedule.ts`), so a spec written today works whenever it
  ships.
- **A `---` line always starts the next frontmatter block.** Don't use `---` horizontal
  rules inside a brief — use `***` instead.
- **Slugs are durable identifiers.** They dedupe imports and survive rejection: a rejected
  slug stays rejected; re-importing won't resurrect it. To genuinely re-propose a pool,
  give it a new slug.
- Unknown frontmatter keys are errors (typos fail loudly instead of being ignored).
