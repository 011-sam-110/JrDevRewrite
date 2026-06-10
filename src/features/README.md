# src/features — vertical slices

One folder per user capability (e.g. `prize-pools/join-pool/`). Each slice owns its server
action, validation, queries, and slice-local UI, plus a colocated test.

Rules (see the `vertical-slice-architecture` skill):

- Slices depend on `src/domain/` (pure rules) and `src/infra/` (I/O adapters) — **never on each other**.
- Business rules live in `src/domain/`, not here. A slice orchestrates: validate input → apply
  kernel rules → persist/emit via infra.
