# Agent Overview

- **Name:** _Not yet implemented_
- **Purpose:** This project currently exposes a Cloudflare Worker API without registered Agent classes. Future Agents should be documented here when introduced.
- **Class:** _N/A_
- **Bindings:**
  - `DB` (D1, migrations located in `migrations/`)
  - `CACHE` (KV)
  - `R2` (R2 bucket)
  - `SCAN_QUEUE` (Queue producer)
  - `AI` (Workers AI)
  - `VEC` (Vectorize index)
  - Durable Objects: `SchedulerActor`, `GitHubActor`, `AppStoreActor`, `RedditActor`, `DiscordActor`, `CuratorActor`, `UserSessionActor`
- **Dependencies:** Hono-based Worker entry point at `src/index.ts`
- **Migration Tag:** Initial schema plus queued migrations in `migrations/0001_init.sql` through `0004_user_preferences.sql`
- **Usage Example:** Run `wrangler dev` for local testing; apply database migrations with `wrangler d1 migrations apply DB`.

## Notes
- Keep D1 schema changes incremental via new files in `migrations/` and update this manifest when Agents or additional resources are introduced.
- Ensure `wrangler.jsonc` stays consistent with bindings defined in code and documented here.
- **Always run testing before completing any task.** Execute the relevant validation commands for your change (e.g., `npm run lint`, `npm run build`, or dedicated test suites) and include the command output in delivery notes.
