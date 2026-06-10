---
slug: habit-tracker-app
title: Habit Tracker
role: mobile
difficulty: beginner
window:
  joinDays: 3
  buildDays: 7
  judgeDays: 3
requirements:
  - Create habits and check them off daily, with a streak counter per habit
  - Data persists on-device across app restarts
  - At least one delightful interaction (animation, haptic, satisfying check-off)
  - Runs on a real device or emulator in the demo video
---

The to-do app's more motivating cousin. React Native, Flutter, SwiftUI, Kotlin — your
pick. Judges look for native-feeling polish: smooth lists, sensible navigation, and a
check-off moment that makes you want to keep a streak. Small scope, high finish.

---
slug: offline-first-notes
title: Offline-First Notes with Sync
role: mobile
difficulty: intermediate
window:
  joinDays: 3
  buildDays: 10
  judgeDays: 3
requirements:
  - Notes fully usable with no connection — create, edit, delete offline
  - Sync to a backend when connectivity returns; show it in the demo (airplane mode on/off)
  - A visible, deliberate conflict story when the same note changed in two places
  - Sync status surfaced honestly in the UI (pending, synced, conflicted)
---

Offline-first is where mobile engineering gets real. The backend can be tiny (any
hosted DB or a few endpoints you write); the marked work is the client: a local store
as the source of truth, a sync queue, and conflicts handled on purpose instead of by
accident. The airplane-mode demo is mandatory drama.

---
slug: ar-campus-guide
title: Sensor-Driven Campus Guide
role: mobile
difficulty: advanced
window:
  joinDays: 4
  buildDays: 14
  judgeDays: 4
requirements:
  - Uses at least two device capabilities (GPS, compass, camera/AR, accelerometer…)
  - Guides a user to 5+ real campus locations with live distance and direction
  - Works in the field — the demo video is shot walking around campus
  - Battery and permission handling done respectfully (ask in context, degrade gracefully)
---

Build a guide that knows where you are and where you're pointing: a Sussex campus tour,
an orientation treasure hunt, an AR overlay on building entrances — your concept. This
pool rewards taming real sensors (GPS drift, compass jitter) and shipping something that
survives outside the simulator. Field-tested entries beat feature lists.
