---
slug: campus-noticeboard
title: Campus Noticeboard
role: fullstack
difficulty: beginner
window:
  joinDays: 3
  buildDays: 7
  judgeDays: 3
requirements:
  - Post, browse, and search notices with categories
  - Real persistence (any database) behind a real API — no hardcoded data
  - Mobile-friendly UI with empty/loading/error states handled
  - Seeded demo data so judges see a living board, not a blank page
---

A noticeboard for campus life: events, lost-and-found, flat listings, study groups.
Full CRUD, both halves of the stack yours. Judges reward an app that feels finished —
seeded content, sensible validation, a UI you'd actually use — over half-built extra
features.

---
slug: split-the-bill
title: Split-the-Bill App
role: fullstack
difficulty: intermediate
window:
  joinDays: 3
  buildDays: 10
  judgeDays: 3
requirements:
  - Groups with shared expenses; balances update for every member
  - Settlement suggestions that minimise the number of transfers
  - Auth (sessions or magic links) with per-group access control
  - The balance maths unit-tested — the demo shows a non-trivial multi-user scenario
---

Everyone's flat-share argument, solved. The deceptively hard part is the money logic:
balances must always sum to zero, settlements should be minimal, and floating-point
pennies will betray you (use integer pence). Judges look for correct maths under messy
input and an interface a non-developer flatmate could use.

---
slug: realtime-quiz-platform
title: Realtime Quiz Platform
role: fullstack
difficulty: advanced
window:
  joinDays: 4
  buildDays: 14
  judgeDays: 4
requirements:
  - Host creates a quiz; players join from their own devices with a room code
  - Questions reveal simultaneously; answers are scored live with a leaderboard
  - Handles a player disconnecting and rejoining mid-game
  - Works for at least 5 concurrent players — show it in the demo
---

Build a Kahoot-style live quiz. This is a full vertical: auth-lite room joining,
realtime fan-out, server-authoritative scoring (no trusting the client), and a UI with
game-show energy. The demo writes itself — get four friends in a room and play. Judges
reward synchronisation that feels tight and a host flow that never stalls.
