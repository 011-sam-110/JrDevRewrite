# battles slices

Synchronous 1v1 code battles.

Live (M12 — problem bank):

- `draft-problem/` — the AI-drafted, machine-verified pipeline: draft (curated
  fixtures in dev, Claude with a key, behind `infra/ai`) → validate (kernel) →
  verify the reference solution against its own hidden tests via `infra/judge` →
  persist as a verified draft. `seed.ts` (`npm run problems:seed`) runs the same
  pipeline then approves, to seed the bank.
- `approve-draft/` — the operator review queue: approve a verified draft into the
  playable bank, reject (archival), or retire an approved problem (rotation).
  Operator-gated in the action; page at `/operator/problems`.

Planned slices (M13–M16):
`send-challenge/`, `accept-challenge/`, `enter-queue/`, `submit-solution/`, `resolve-battle/`.
