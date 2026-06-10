# src/realtime — WebSocket service (own deployable)

Standalone long-running service for battle presence, match rooms, the synchronized "go" signal,
live opponent progress, and match timers (M13). Started with `npm run dev:ws` (script lands in M13).

**Transport only.** It relays events into slices/domain — authoritative state, scoring, and
results never live here. A WS message is *input*, validated by the kernel, never a mutation.
