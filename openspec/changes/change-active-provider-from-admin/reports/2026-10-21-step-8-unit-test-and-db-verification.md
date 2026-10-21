# Step 8: unit tests and database verification (JOS-171, change-active-provider-from-admin)

Date: 2026-10-21. Branch `feature/jos-171-change-active-provider`, on top of `origin/main` at `8a813139` plus JOS-173 (#83) and JOS-174 (#84).

## 8.1 Baseline

This worktree is new: before any run, `backend/data/` did not exist, there was no `backend/.secrets.json`, and `ADMIN_PASSWORD` was not set in the environment. There was therefore no default store to snapshot. Every verifying backend run used a scratch `DB_PATH` and `PROJECTS_ROOT` in the session scratchpad. Two earlier development runs created `backend/data/` by accident (the default paths); it is git-ignored and was deleted again.

## 8.2-8.3 Commands and results

| Check | Result |
| --- | --- |
| `npm run typecheck`, backend and frontend | clean (exit 0) |
| `npm test`, backend (scratch paths) | 1881 passed, 5 skipped (133 files passed, 4 skipped) |
| `npm test`, frontend | 277 passed (5 files) |

Tests added: 64. Backend 58: `active-provider-storage` (7), `active-provider` (23), `active-provider-binding-image` (4), `-video` (2), `-voice` (4), `-decomposition` (4), `-guarantees` (3), `admin-providers-route` (11). Frontend 6: `active-providers-section`. The base counts follow by subtraction: 1823 backend (the JOS-174 merge run) and 271 frontend.

One existing test was changed (task 7.1): `session-api-surface.test.ts` "offers no PUT, PATCH or DELETE route at all" now also exempts `PUT /admin/providers/:stage`, the way it already exempts the telemetry consent setting. Both are app-level settings that touch no session content. Nothing else changed: the registries keep `defaultIdentifier` (design Decision 1), so no test that builds a registry needed an edit.

**Coverage (task 7.3):** the project has no coverage tool installed and its standard asks for named branches, not a percentage, so none was added. The evidence is the test count above and the scenario map below.

## 8.4 Post-test state

`backend/data/` does not exist, no `.secrets.json` was left behind, and the scratch store was outside the checkout.

## 7.2 Scenario and acceptance-criterion coverage

active-provider-selection (spec) -> tests
- No /admin choice: backend/test/active-provider.test.ts "is the registry's settings default when no choice was made" (each of the five stages); admin-providers-route.test.ts "returns the five stages ... source settings"
- An /admin choice survives a restart: active-provider-binding-guarantees.test.ts "sees a choice written outside the process cache, as it would after a restart" (the choice is read from the database on every call); active-provider.test.ts "sees a write at once, with no restart"
- Unknown provider: admin-providers-route.test.ts "refuses a provider the stage does not ship with 400 and the selectable ids, and changes nothing"; active-provider.test.ts "refuses a provider the stage does not ship", "refuses an alias"
- Change without Administrator access: admin-providers-route.test.ts "Administrator access (AC2)" (GET and PUT without the password, and with a wrong one); frontend active-providers-section.test.tsx "locks the page again when the change is refused with 401"
- A new scene after the change: active-provider-binding-image.test.ts "AC1"; -video "AC1"; -voice "AC1"; -decomposition "AC1: both bind ..." (reasoning and alignment)
- Reasoning is bound per session: active-provider-binding-decomposition.test.ts "AC1: both bind to the providers active at the first attempt" (also the recorded attempt rows)
- Two first attempts race: active-provider-binding-guarantees.test.ts "two first attempts across a change both use the single stored binding"; active-provider-storage.test.ts "binds on the first call and never changes afterwards" (reasoning and alignment)
- Automatic retry after the change: active-provider-binding-voice.test.ts "AC3: an automatic retry sent after the change goes to the bound provider"; -decomposition "AC3 ... a retry after the change" (alignment and reasoning)
- Manual retry after the change: -video "AC3 and AC5 ..."; -image "AC3 and AC5 ..."; -voice "AC3 and AC5 ..."
- Completed images after the change: active-provider-binding-image.test.ts "AC4: a completed image is not requested again after the change"
- Retries exhausted: active-provider-binding-voice.test.ts "AC5: when the retries are exhausted ..."; the "AC3 and AC5" tests of image, video and voice assert nothing reached the other provider
- Viewing active providers: frontend active-providers-section.test.tsx "shows one row per stage with its select set to the active provider and its source"; backend admin-providers-route.test.ts "reports an /admin choice with source admin", "reports a choice this build no longer ships as orphaned"
- Native timestamps bind no alignment provider (design Decision 3): active-provider-binding-guarantees.test.ts "leaves the session's alignment binding empty when the voice provider's timestamps are usable"

JOS-171 ACs: AC1 = the "AC1" tests of the five stages; AC2 = "Administrator access (AC2)"; AC3 = the retry tests; AC4 = "AC4: a completed image ..." (no code path regenerates a result on a change: the change writes one row and nothing else); AC5 = the exhausted-retries tests.

Migration (spec: backfill, design Decision 3): active-provider-storage.test.ts "backfills a pre-migration run from its earliest attempt of each stage", "does not backfill alignment from native timestamps", "leaves a run with no attempts unbound".
