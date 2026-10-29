# Repository cleanup inventory (MVP closure, JOS-203 item I5)

- Taken from `origin/main` @ `f6a4638a` plus the merged follow-ups, on 2026-10-20. 1,864 tracked files.
- **Decision (product owner, 2026-10-20):** R1 removed (a one-page note stays), R2 made portable instead of removed, R3 removed. Done in the pull request "Remove the media-assembly work folder, make the hook paths portable". Everything else in this list is unchanged. Removing files does not shrink Git history, and no history rewrite is proposed.
- A removal is safe only if nothing in the application, tests, CI or documentation references the file. The "References" column says what was checked.

## Correction

The earlier Phase 4 cleanup commit `802d22ca` ("untrack per-developer config, drop the media-assembly work dir, index the ADRs") exists only on a local branch (`chore/phase4-cleanup`). It was never pushed and is **not in `main`**, so neither the media-assembly work folder nor the per-developer config was removed there. `JOS-203` and `docs/release/mvp-release-gates.md` said it was done; that was wrong and is corrected. Items R1 and R2 below would reuse that commit.

## Removals and fixes (approved 2026-10-20)

| ID | Item | Size / evidence | References | Proposed action | Risk |
|---|---|---|---|---|---|
| R1 (approved: remove, keep the note) | `openspec/changes/archive/2026-09-26-define-media-assembly/work/` | 343 files, about 60 MB of the 64 MB under `openspec/`: scratch media, sweep clips, long-session assemblies, fixtures from the assembly spike | One mention in `archive/2026-10-19-retime-and-join-scene-clips/tasks.md` and in the generated `graphify-out` files. The spike's reports and ADR 0005 stay. | Remove the folder, keep a one-page `work-removed.md` note (what it held, where the evidence lives). Commit `802d22ca` already does this. | Low to medium: raw experiment evidence disappears from the working tree (it stays in history). The reports keep the numbers. |
| R2 (approved: make portable) | `.claude/settings.json` (tracked) | Holds two hook commands with an absolute path to one developer's home folder, so they fail on any other machine | Read by Claude Code on this project; not used by the app, tests or CI | Done: the absolute path is replaced with the bare `graphify` command, so the hooks work on any machine that has graphify on its PATH (the file stays tracked) | Medium: the graphify guard hooks stop being shared. Decide whether they should be. |
| R3 (approved: remove) | `.vscode/settings.json` (tracked) | An empty `{}` | None | Remove | None |

## Findings that are not removals

| ID | Item | Verdict |
|---|---|---|
| K1 | `graphify-out/` (588 files, 18 MB) | Keep. It is committed on purpose (project instruction: the graph is rewritten whole on every build). Its hash cache is a gitleaks false positive; `.gitleaks.toml` allowlists it by path (JOS-211). |
| K2 | `openspec/changes/archive/.../poc/` (7 files) | Keep. README, ADR 0007 and JOS-205 depend on it until the build script is productized. |
| K3 | `docs/PRD-v1.2.md` to `PRD-v1.9.md` (0.36 MB) | Keep. Version history is part of the PRD process. |
| K4 | `prompts.md`, `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`/`codex.md` | Keep. Course deliverable and symlinks to `docs/base-standards.md`. |
| K5 | `packages/specboot/template/` | Keep. It is a bootstrap template copied into other projects by `bin/init.js`; it carries sample content from a different stack, now with placeholder credentials (PR #73). |
| K6 | `backend/public/index.html` | Keep. `server.ts` serves it at `/` in development. |
| K7 | Dependencies | No unused dependency. `depcheck` flagged `typescript` (backend, frontend, relay), `jsdom` (frontend) and `wrangler` (relay); all are used (`tsc` scripts, the vitest `jsdom` environment, `wrangler deploy`). |
| K8 | `TODO`/`FIXME`/`HACK` comments | None in `backend/src`, `frontend/src`, `infra` or `packages`. Three `ponytail:` notes mark deliberate limits and stay. |
| K9 | Hardcoded local paths | Only R2. The test fixtures use fake paths on purpose; `/opt/homebrew/bin` in `backend/src/config/ffmpeg.ts` is the documented macOS default behind `FFMPEG_PATH`. |

## Needs a rewrite, not a removal

- `ai-specs/agents/backend-developer.md` and `frontend-developer.md` describe a different technology stack (24 and 5 mentions of tools this project does not use). They are agent instructions, not application code; they should be rewritten for the real stack or the agents retired. Not touched here.
- `docs/frontend-standards.md` has two such mentions.

## Not covered here

Worktrees and remote branches are I7. Generated artifacts outside Git (build output, local data folders) are ignored by `.gitignore` and were not inventoried.
