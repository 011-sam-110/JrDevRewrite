# content/pools — manual pool specs

One markdown file per job role; entries delimited with YAML frontmatter (title, role, difficulty,
window, requirements). Ingested by `npm run pools:import` (lands in M4), which validates every
entry, reports malformed ones, dedupes by slug, and creates pools in `draft` for operator approval.

The full format spec + starter specs per launch role are an M4 deliverable.
