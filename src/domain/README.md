# src/domain — the pure kernel

Cross-cutting business rules: state machines, scoring, vote aggregation, XP/levels/Elo,
anti-cheat predicates, AI-generation policy. Plain data in, plain data out.

**Hard rule:** this layer imports nothing from `src/app/`, `src/infra/`, `src/features/`, or any
framework. Everything here is unit-testable without a DB or network, and written **test-first**.

Planned modules: `prize-pools/` (M3), `battles/` (M11), `gamification/` (M9/M11),
`ai-generation/` (M17).
