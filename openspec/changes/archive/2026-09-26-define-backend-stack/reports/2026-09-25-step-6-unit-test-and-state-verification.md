# Step 6 Report — Unit Tests and Persisted-State Verification

- Date: 2026-09-25
- Change: define-backend-stack (JOS-179)
- Agent: Claude (Sonnet 5)
- Scope: `skeleton/test/orchestrator.test.ts`, run against an isolated test database (`DB_PATH=data/test.sqlite`), never the shared demo database used for the live curl/browser experiments in `reports/2026-09-25-step-7-curl-manual-testing.md` and `reports/2026-09-25-step-8-e2e-live-push.md`.

Per §1.1's resolution (`../design.md` § Open Question 1), "database state" is read as "persisted state" — this skeleton's stand-in is SQLite via `node:sqlite`, not an assumption of any particular RDBMS.

## Commands Executed

- `npx tsc --noEmit` (fully-typed check, `strict: true`)
- `DB_PATH=data/test.sqlite npx vitest run`

## Unit Test Results

- Targeted tests = full suite (one cohesive test file, seven tests covering the five required experiments' underlying mechanisms plus the concurrency primitive): **7 passed, 0 failed, 0 skipped**
- Runtime: 674ms total (436ms test execution)
- Notes: no flaky tests observed across the run captured here. `test/orchestrator.test.ts` disables file-level parallelism (`vitest.config.ts`) since all cases share one SQLite file and reset it in `beforeEach`.

Tests map to the required evidence as follows:
| Experiment | Test(s) |
|---|---|
| 4.3 retry budget | "a transient failure consumes 1 + RETRY_BUDGET attempts, then fails"; "a not-retryable failure fails immediately, with no retries"; "a manual retry after failure starts a fresh cycle" |
| 4.5 idempotency | "delivering the same success twice yields one result and one next-stage launch" |
| 4.1 restart resumption | "resumes a still-pending request across a simulated restart"; "records exactly one failed attempt when the provider can no longer recover the request" |
| 4.2 concurrency (primitive only — the live cross-session proof is in the Step 7 curl report) | "queues waiters beyond the limit and releases them in FIFO order" |

## Persisted-State Verification

- Pre-test baseline (`data/test.sqlite`): file did not exist — `runs=0, scenes=0, provider_requests=0`
- Post-test validation (`data/test.sqlite`): `runs=0, scenes=0, provider_requests=0` (the suite's `beforeEach` calls `resetAll()`, and the final test in the file makes no persisted writes, so the file ends empty)
- State restored: **N/A** — the isolated test database is disposable by design and was never shared with the live-demo database (`data/skeleton.sqlite`) used in Steps 7–8, so there was nothing to restore there.
- The live-demo database's own state is addressed separately in the Step 7 report's cleanup section, since that is where it was mutated.

## Outcome

- Step 6 status: **PASS**
- Blocking issues: none
