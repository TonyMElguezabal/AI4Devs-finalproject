# Step 6 — Unit Test and Database State Verification

**Change:** consult-session (JOS-135)
**Date:** 2026-09-26
**Working directory:** `backend/`

## Isolation

Learning from a process gap during `start-video-project` (step 8), where an unisolated
`npx vitest run` collided with data written by manual `npm start` testing, this run used
explicit isolation from the very first command:

```
DB_PATH=data/test.sqlite PROJECTS_ROOT=data/test-projects
```

The real store (`data/skeleton.sqlite`, `data/projects/`) was never opened by any test
process in this step.

## 6.1 — Pre-test baseline (real store, untouched by this step)

| | Value |
|---|---|
| `runs` rows | 0 |
| `scenes` rows | 0 |
| `data/projects/` folders | 1 (pre-existing, unrelated to this step) |
| `data/test.sqlite` | absent |
| `data/test-projects/` | absent |

## 6.2 — Targeted tests for this module

```
DB_PATH=data/test.sqlite PROJECTS_ROOT=data/test-projects \
  npx vitest run test/session-consultation.test.ts test/session-read.test.ts
```

Result: **15/15 passed** (`session-read.test.ts` 12, `session-consultation.test.ts` 3), 668ms.

## 6.3 — Full suite

```
DB_PATH=data/test.sqlite PROJECTS_ROOT=data/test-projects npx vitest run
```

Result: **48/48 passed**, 2.08s total.

| File | Tests |
|---|---|
| `orchestrator.test.ts` | 11 |
| `session-creation.test.ts` | 15 |
| `session-read.test.ts` | 12 |
| `persistence.test.ts` | 7 |
| `session-consultation.test.ts` | 3 |

No failures, no flakes on this run.

## 6.4 — Post-test verification and cleanup

Real store re-checked after the full suite ran:

| | Baseline | After | Match |
|---|---|---|---|
| `runs` rows | 0 | 0 | ✓ |
| `scenes` rows | 0 | 0 | ✓ |
| `data/projects/` folders | 1 | 1 | ✓ |

The isolated `data/test.sqlite` (+ `-shm`/`-wal`) and `data/test-projects/` created by this
run were removed:

```
rm -f data/test.sqlite data/test.sqlite-shm data/test.sqlite-wal
rm -rf data/test-projects
```

Confirmed absent afterward (`ls data/ | grep test` → no matches).

## 6.5 / 6.6 — Outcome

All targeted and full-suite tests pass under correct isolation; the real store's state is
byte-for-byte the same before and after; no test artefacts remain on disk. Step 6 is complete.
