# src/components — cross-feature UI primitives

Only genuinely shared primitives live here — feature-specific UI belongs inside its slice.

Built in M1 (design system). Tokens are the single source of truth in `src/app/globals.css`
(`@theme`) — components consume token utilities (`bg-surface`, `text-volt`, `shadow-glow`),
never raw hex. Fonts: Russo One (display), Chakra Petch (body), JetBrains Mono (code/stats),
wired via `next/font` in `src/app/layout.tsx`.

| Primitive | File | Notes |
| --- | --- | --- |
| `Button` | `button.tsx` | variants primary/secondary/ghost/danger · sizes sm/md/lg · `loading` |
| `Card` family | `card.tsx` | compound components; `accent` = cut-corner volt plate |
| `Badge` | `badge.tsx` | neutral/volt/gold/elo/info/danger/outline |
| `Input`, `Label`, `Field` | `input.tsx` | `Field` wires label/hint/error ids for a11y |
| `Modal` | `modal.tsx` | client; Escape + scrim close, labelled dialog |
| `AppShell`, `Logo`, `PageShell`, `PageHeader` | `nav-shell.tsx` | server-safe app chrome |
| `LeaderboardRow`, `StatCard` | `stat-row.tsx` | rank plates (gold/silver/bronze), `you` highlight |
| `ToastProvider`, `useToast` | `toast.tsx` | client; aria-live, 4s auto-dismiss |

Every primitive in every state renders on `/styleguide` — keep that page in sync when adding
or changing primitives.
