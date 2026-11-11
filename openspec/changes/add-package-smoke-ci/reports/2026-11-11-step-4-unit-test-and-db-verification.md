# Step 4 report: unit tests, database state and smoke runs (add-package-smoke-ci, JOS-279)

Run on 2026-11-11 on macOS arm64 from the branch `chore/jos-279-package-smoke-ci`.

- `npm run typecheck` and `npm run lint` in `backend/`: clean.
- `npm test` in `backend/` with scratch `DB_PATH` and `PROJECTS_ROOT`: 219 files passed, 6 skipped; 2,920 tests passed, 12 skipped.
- Developer data: `backend/data/` of the main checkout had 13 entries before and after.
- Step 5 (curl): not applicable, no endpoint changed.
- Step 6 (Playwright MCP): not applicable, no user-interface change. `npm run package:smoke:run` ran four times in a row against the built smoke flavor; each reached `final-video` with a 70,368-byte video, and port 3102 was free afterwards. A run on a folder with no executable fails at once with `the executable did not start: spawn /nonexistent/Vid4You ENOENT`, the executable's log section and exit code 1.
- Frontend: no change; its tests were not re-run.
