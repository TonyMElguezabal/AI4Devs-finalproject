# Local database compatibility report (JOS-210)

- Written on 2026-11-11. Question: what happens when a build opens a database left at another migration level, and is a rollback supported?
- Mechanism: `applyMigrationsTo` in `backend/src/db.ts` runs at boot, applies every migration missing from `schema_migrations` (levels 2 to 27) and ignores every other row. Nothing records or checks a maximum level.

## Upgrade: a newer build opens an older database

A database left at each of the 26 levels (2 to 27) is built from a version-1 fixture holding a session and a scene, then opened by the current build.

| Database level | Result |
|---|---|
| 1 (no migration) and every level 2 to 27 | The session and scene are unchanged, the missing migrations are applied, and `schema_migrations` lists 2 to 27 with no gap. |

Pinned by `backend/test/migration-levels.test.ts` (28 tests).

## Downgrade: an older build opens a newer database

Run on 2026-11-11 with the oldest release build (`release-79305e4`, commit `e2ad6f6`, migration level 25) against a database that the current build (level 27) created and used to finish one stubbed session.

| Build | Database level | Result |
|---|---|---|
| Release `79305e4` (level 25) | 27 | Starts without a log error at level warn or above, serves `GET /sessions/:id` with the finished session, and leaves `schema_migrations` unchanged (max 27). Stages the older build does not know are shown as "Unknown provider". |

Why it works today: all 26 migrations either add a column with a default or a nullable column, create a table, or rebuild one table with the same rows (level 13, `stage_attempts`). An older build never reads what it does not know about.

What was not run: creating a new session on the older build (its moderation step needs a real OpenAI key) and builds between 25 and 27. Writes by an older build into a newer table with a `CHECK` constraint (`stage_attempts.outcome`) were not exercised.

## Decision

Supported with a documented limit. A rollback restores the data-folder backup taken before the upgrade; sessions created after the upgrade are lost. Running an older build on a newer database directly happened to work in the one case tested, but it is not guaranteed: a later migration that drops, renames or adds a `NOT NULL` column without a default would make it fail or corrupt data silently, because the runner ignores unknown levels.

Recommendation (follow-up ticket JOS-278, not done here): make the boot refuse to start when `schema_migrations` holds a level above the newest the build knows, with a message naming both levels and pointing to the backup. It protects only builds that ship the check, so it should land before the next non-additive migration. Until then the README step stands: restore the backup.

The test `ignores a migration level this build does not know` pins today's behavior; the follow-up flips it.
