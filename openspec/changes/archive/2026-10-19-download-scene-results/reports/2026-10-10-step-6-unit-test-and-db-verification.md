# Step 6 — Unit test and DB verification (JOS-163, download-scene-results)

## Scope check (task 1.1)

JOS-158 and JOS-162 both merged into `feature/entrega-2-JAME` since this change was proposed. Verified: JOS-158's `routes.ts`/`SceneRow.tsx` diffs touch only `/retry`, `/correct` and the correction-form logic — not the download route or the download-link rendering. JOS-162 added project-folder files only. No artifact updates were needed; the branch was merged up to date with no conflicts.

## AC/scenario → test map

| spec.md scenario | AC | Test |
|---|---|---|
| Image downloaded while other scenes are processing | AC1 | `test/scene-download.test.ts` |
| Image downloaded while the scene's own clip is generating | AC1, AC3 | `test/scene-download.test.ts` |
| Image not yet available | AC1 | `test/scene-download.test.ts` |
| Clip downloaded | AC2 | `test/scene-download.test.ts` |
| Clip not yet available | AC2 | `test/scene-download.test.ts` |
| Other scenes failed | AC3 | `test/scene-download.test.ts` |
| The scene's own clip failed | AC1, AC3 | `test/scene-download.test.ts` |
| Links follow availability | — | `test/scene-downloads-read.test.ts` (backend), `frontend/test/components.test.tsx` "Download gating" (frontend) |
| Session with narration and texts (AC4) | AC4 | `test/scene-download.test.ts` (400 for `voice-over`/`timestamps`/`texts`), `test/scene-downloads-read.test.ts` (no field on the read), `components.test.tsx` (no link rendered) |

Every scenario in `specs/scene-result-downloads/spec.md` has at least one test. 404/409/404-escaping/missing-file/cross-session cases (not named as their own spec scenarios but covered by design Decision 2) are also pinned in `scene-download.test.ts`.

## Task 5.3 — coverage not decreased

Diff isolated to this change's own commits (since the merge commit `7ed6d2b`, excluding the 62 merged-in commits from JOS-157/158/159/162): 13 files touched, two new backend test files (`scene-download.test.ts` 15 tests, `scene-downloads-read.test.ts` 5 tests), `frontend/test/components.test.tsx`'s "Download gating" block replaced 2 tests with 5 more specific ones, and two existing backend tests updated to write real files instead of bare DB references — no test file or `describe`/`it` block was deleted. Backend: 1413 → 1439 tests (JOS-162's baseline was 1419; this change added 20). Frontend: 159 → 162.

## Default store untouched

`backend/data/` does not exist in this worktree, before or after the full run. No `backend/.secrets.json` present.

## Full run

- `backend`: `npm run typecheck` clean. `npx vitest run` (isolated `DB_PATH`/`PROJECTS_ROOT`) — **1439 passed, 4 skipped**, 0 failed.
- `frontend`: `npm run typecheck` clean. `npm test` — **162 passed**, 0 failed.
