# src/infra — shared I/O adapters

Mockable adapters around the outside world. Each external service gets an interface a slice can
depend on, a real implementation, and a dev fallback so missing credentials never block a build.

- `db/` — Drizzle client + schema (M0).
- `github/` — repo metadata + push events, server-side signals only (M2/M6).
- `video/` — Cloudflare Stream uploads + signed playback (M6).
- `judge/` — Judge0 submit/poll (M12).
- `ai/` — Vercel AI SDK / Anthropic client (M12/M17).
