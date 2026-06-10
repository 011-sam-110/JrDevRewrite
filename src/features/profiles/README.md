# profiles slices

Developer profile + identity surface — the recruiter-facing portfolio (the
product thesis). Slices (M10):

- `view-profile/` — read model + `ProfileView` for the public profile at
  `/u/<handle>` (handle = the linked GitHub username). Renders level/XP, pool
  rank, wins, badges, streaks and competition history. "Losses appear in
  aggregate stats only" is enforced in the read model: non-podium results show as
  "Shipped"/"Competed", never a losing rank.
- `view-leaderboard/` — read models + `LeaderboardTable` for `/leaderboard`. The
  **global** board reads the authoritative `profiles.globalRank` aggregate; the
  **per-role** boards (`?role=…`) are computed from `pool_results` joined to each
  pool's role. Both exclude private profiles.
- `toggle-privacy/` — the single account-level public/private toggle. The privacy
  *rule* lives in `domain/gamification/visibility` (`canViewProfile`,
  `appearsInLeaderboard`); the slice just validates + persists the chosen value.

Pure rules consumed here live in `domain/gamification/`: `badges` (catalogue +
predicates), `visibility` (the privacy rule), plus the existing `levels`/`rank`.
