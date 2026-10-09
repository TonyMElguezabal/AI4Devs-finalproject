# Step 8 Report - Unit Tests, Coverage and Database Verification

- Date: 2026-10-09
- Change: retry-or-correct-image (JOS-157)
- Agent: Claude Sonnet 5

## Scenario-to-test mapping (task 7.2)

Every scenario in `specs/image-failure-recovery/spec.md`, and ticket AC1 (retry resends IMAGE), AC2 (correction changes only IMAGE), AC3 (no action once image succeeded), AC4 (retry uses the bound provider):

| Requirement | Scenario | Test |
|---|---|---|
| Scene commands act only within their session | Scene of another session | `scene-api-surface.test.ts` > "Image recovery routes are scoped by session" > "answers 404 for a retry…"/"…a correction at another session's URL…"; "…unknown session…"; "…unknown scene within a real session" |
| A failed image can be retried with the same instruction and provider | Retry sends the same instruction | `image-stage.test.ts` > "a retry sends the stored image_instruction to the provider unchanged, byte for byte" |
| | Retry uses the bound provider | `image-stage.test.ts` > "a retry stays bound to the provider from the first attempt, even if the registry default changes" |
| | Fresh budget | `orchestrator.test.ts` > "a manual retry after failure starts a fresh 1 + RETRY_BUDGET cycle" (pinned, same reset site for stub and real image path) |
| | Concurrent retries | `scene-api-surface.test.ts` > "Image recovery refusals carry reason codes" > "gives exactly one 200 and one 409 not-failed for two concurrent retries…" |
| A correction changes only `IMAGE` | Correct and retry | `scene-api-surface.test.ts` > "A correction changes only IMAGE" > "sets image_instruction to the trimmed value…" |
| | Only `IMAGE` changes | `scene-api-surface.test.ts` > "…changes only image_instruction, status, attempts and updated_at…"; the four pre-existing JOS-143/JOS-144/JOS-147/JOS-148 "is unchanged when a correction body names it" tests |
| | Blank instruction | `scene-api-surface.test.ts` > "…answers 400 for a blank or whitespace-only correction body…" |
| | Extra field in the correction body | `scene-api-surface.test.ts` > "…ignores an extra field in the correction body rather than rejecting it" (design correction — see design.md Decision 5) |
| No image action once the image succeeded | Image generated, clip failed | `scene-api-surface.test.ts` > "…409 image-already-generated for retry and correct on a scene whose clip failed"; `video-stage.test.ts` > both "…answers {ok:false} with image-already-generated…" tests |
| | Image generated, scene still processing | `scene-api-surface.test.ts` > "…409 not-failed for retry and correct on a scene that has not failed"; `orchestrator.test.ts` > "is rejected on a scene that has not failed" (an `image-complete` scene) |
| | Nothing offered on the page | `components.test.tsx` > "sceneActions derives actions from state and affected stage" (unchanged, pinned) |
| The page shows and edits the `IMAGE` instruction | Form pre-filled with `IMAGE` | `components.test.tsx` > "Scene details show PROMPT, IMAGE and VIDEO" > "shows PROMPT, IMAGE and VIDEO for a real chunk"; "pre-fills the correction form with IMAGE on a real chunk"; "falls back to the legacy instruction…" |
| | Refusal shown | `components.test.tsx` > "Scene retry and correction refusals show a sentence" (3 reason codes + unknown-reason fallback + correction-path variant) |

## Commands Executed

```
cd backend && npm install && npx vitest run
cd backend && npx tsc --noEmit
cd frontend && npm install && npx tsc --noEmit && npm test
```

Targeted files: `backend/test/scene-api-surface.test.ts`, `backend/test/image-stage.test.ts`, `backend/test/video-stage.test.ts`, `backend/test/orchestrator.test.ts`, `backend/test/narration-interval-immutability.test.ts`, `backend/test/session-api-surface.test.ts` (unchanged, confirmed passing), `frontend/test/components.test.tsx`.

## Unit Test Results

- Full backend suite: 1355 passed, 4 skipped, 0 failed (82 files, 3 skipped files) — up from 1339 before this change (16 new tests).
- Full frontend suite: 151 passed, 0 failed (2 files) — up from 142 before this change (9 new tests).
- `npx tsc --noEmit` clean in both `backend` and `frontend`.
- No `backend/.secrets.json` and no provider-credential env vars were present in this worktree during any run.
- One pre-existing flaky test (`orchestrator.test.ts` > "session pause and continue" > "does not affect a request already sent before the pause", a `waitFor` timing race unrelated to this change) was observed once across several full-suite runs and passed on its own and on every other run; not a regression from this change.

## Coverage (task 7.3)

Base is the propose commit (rebased onto `feature/entrega-2-JAME`, same commit hash `287a876` before and after the rebase since the propose commit had no conflicts), compared against this branch's tip, in a disposable detached worktree (`git worktree add --detach`, removed after the run). `@vitest/coverage-v8@3.2.7` was installed with `--no-save` for the measurement only; `package.json`/`package-lock.json` are unchanged.

```
npx vitest run --coverage --coverage.provider=v8 --coverage.include='src/**' --coverage.reporter=json-summary
```

| Metric | Base | Head | Delta |
|---|---|---|---|
| Statements | 92.31% | 92.37% | +0.06 |
| Branches | 93.14% | 93.37% | +0.23 |
| Functions | 98.70% | 98.71% | +0.01 |
| Lines | 92.31% | 92.37% | +0.06 |

Coverage did not decrease on any metric.

## Database State Verification

Same situation as recorded for JOS-153 (`distinguish-paused-session`, step 8 report): `backend/src/db.ts` defaults `DB_PATH`/`PROJECTS_ROOT` to `data/skeleton.sqlite`/`data/projects` when unset, and this worktree's `backend/data/` (gitignored, worktree-local, not copied by `git worktree add`) is what every `npm test` run here wrote to. Confirmed the main checkout's real database is untouched:

```
stat -f "%Sm" /Users/josemunoz/Software/Vid4You/AI4Devs-finalproject/backend/data/skeleton.sqlite
# Oct 4 22:39:07 2026 — unchanged throughout this session's work
```

No restoration was needed in either location.

## Outcome

- Step 8 status: PASS
- Blocking issues: none
