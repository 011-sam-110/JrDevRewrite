---
slug: personal-dashboard
title: Personal Dashboard
role: frontend
difficulty: beginner
window:
  joinDays: 3
  buildDays: 7
  judgeDays: 3
requirements:
  - At least 4 distinct widgets (e.g. clock, weather, todo, links) on one responsive page
  - State persists across reloads (localStorage or similar)
  - Keyboard accessible — every control reachable and usable without a mouse
  - Deployed or runnable with one documented command
---

Build the dashboard you'd actually open every morning. Pick any framework (or none).
What judges look for: visual polish, sensible information hierarchy, and small details
that show care — empty states, loading states, a layout that doesn't fall apart on a
phone. Scope is deliberately small; depth beats breadth.

---
slug: live-search-ui
title: Instant-Search Interface
role: frontend
difficulty: intermediate
window:
  joinDays: 3
  buildDays: 10
  judgeDays: 3
requirements:
  - Search-as-you-type over a dataset of 1,000+ items with debouncing
  - Results keyboard-navigable (arrows + enter), with highlighted match text
  - Handles slow networks gracefully — show your loading/stale strategy
  - Filterable by at least two facets (category, date, tags…)
---

Build a search experience that feels instant. Use any public dataset (movies, books,
packages, Pokémon — your call) served from a local JSON file or a public API. The hard
parts are the ones users feel: debounce tuning, race conditions between stale and fresh
results, and keyboard flow. Demo the failure modes too — judges will notice.

---
slug: collaborative-whiteboard
title: Collaborative Whiteboard
role: frontend
difficulty: advanced
window:
  joinDays: 4
  buildDays: 14
  judgeDays: 4
requirements:
  - Freehand drawing, shapes, and text on an infinite or pannable canvas
  - Two browser tabs stay in sync in real time (WebSocket, WebRTC, or CRDT library)
  - Undo/redo that survives concurrent edits sanely
  - Selection, move, and delete for existing elements
---

The classic hard frontend problem: a shared canvas. Multiplayer can be same-machine
(two tabs talking through a tiny relay you write or a service like Liveblocks' free
tier). Judges reward smooth drawing performance, conflict handling you can explain in
the demo, and an interface that doesn't need a manual.
