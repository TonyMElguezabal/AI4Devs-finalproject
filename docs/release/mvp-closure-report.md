# MVP closure report

- Ticket: JOS-203 (section L1). Written 2026-10-20 on `main` @ `ae20ee26` (CI green on that SHA).
- This report supersedes the evaluation in `mvp-release-gates.md`, which was written on `f4b6e492` and is out of date (it still lists the README PR, the cleanup and the security scan as open). The gates file is refreshed from section A below in a follow-up.
- Evidence level: spec- and test-level plus the real runs listed in D. No human reviewed every acceptance criterion (see A and G).

## A. Executive summary

**Verdict: Ready with Exceptions** for the MVP as a local application on `main`. **Not authorized for release or distribution**: that is the owner's decision (Gate 3), and the packaged build and release workflow do not exist yet.

| Gate | Result | What decides it |
|---|---|---|
| 1. MVP scope complete | **Met with exceptions** | The owner accepts the human-review exceptions (G1). |
| 2. Release candidate ready | **Met with exceptions** for the source MVP; **Not met** for a distributable release | Source: build, tests, CI, cleanup, security scan and README are done. Distribution: no repeatable packaged build (JOS-205), no release workflow (JOS-206), unsigned executables (JOS-207), downgrade unverified (JOS-210). The I2 telemetry check is only partly done (Grafana content, one failing-run log). |
| 3. Deployment approved | **Needs owner** | No stakeholder acceptance, no limitations sign-off, no deployment authorization. The telemetry relay is deployed and Grafana receives data (owner-confirmed). |

Closure work merged on 2026-10-20: `main` promoted (#71), single-environment docs (#72), README rewrite (#68), cleanup (#76), README observations (#77); secrets scan run (I1).

Biggest risks, in order: (1) a timed-out clip is requested again while the first provider task keeps running and is billed (JOS-204; 8 of 8 attempts on 14 s clips timed out on 2026-10-14); (2) the per-phase time limits were never measured on a full-size session (JOS-209); (3) there is no way to publish an installable build (JOS-205, JOS-206, JOS-207).

## B. Traceability matrix (refreshed)

Source: Linear, project Vid4You, label `MVP` (63 issues, all Done). The old matrix counted 53 issues; JOS-188 and JOS-189 left the MVP (post-MVP), JOS-178 joined it (Done), and JOS-203 itself is outside it.

| Epic | Epic status | Issues | Done | Notes |
|---|---|---|---|---|
| E1 Project Session Intake | Done | 2 | 2 | JOS-134, 135 |
| E2 Narration | Done | 2 | 2 | JOS-136, 137 |
| E3 Scene Decomposition | Done | 8 | 8 | includes JOS-138 spike (decision recorded, no PR) and JOS-190 |
| E4 Scene Image and Clip Generation | Done | 4 | 4 | |
| E5 Final Video Assembly | Done | 2 | 2 | MP4 audio is the voice-over MP3 copied unchanged (PRD v1.10) |
| E6 Progress Visibility | Done | 2 | 2 | |
| E7 Pause and Continue | Done | 2 | 2 | |
| E8 Failure Recovery | Done | 8 | 8 | JOS-154 umbrella plus 184, 185; 155 to 159 |
| E9 Persistence, Local Files, Downloads | Done | 5 | 5 | |
| E10 Provider Operation and Diagnostics | Done | 4 | 4 | JOS-188, 189 de-scoped |
| E13 Foundation and Tech Stack | Done | 7 | 7 | JOS-178 umbrella of the five spikes 179 to 183, plus 186 |
| Standalone | n/a | 6 | 6 | JOS-194, 195, 196, 197, 198 (no PR, committed directly), 199 |
| **Total** | **11 of 11 Done** | **52** | **52** | plus the 11 epics = 63 labelled issues |

OpenSpec: all 52 changes are archived; none is active. 13 tasks stay unchecked in 11 changes, plus 124 in the two umbrellas archived as superseded (`decompose-script-into-chunks` 78, `retime-and-join-scene-clips` 46; their work shipped as smaller changes):

| Kind | Changes | Accepted as |
|---|---|---|
| Human review never performed | `retry-voice-over` 12.3, `stage-execution-time-limit` 10.4, `obtain-narration-timestamps` 11.4, `see-provider-and-attempts` 12.3 | Exception (G1) |
| PR or Linear-comment chores that are now moot | `start-video-project` 12.4, `adjust-scene-pause` 14.2, `run-session-end-to-end` 13.1 and 13.2, `moderate-script-at-submission` 11.1, `retry-voice-over` 12.1, `view-progress-by-phase` 12.1, `pause-and-continue-session` 14.5 | Closed by merge; boxes left as history |
| Coverage not measured | `limit-provider-requests-per-stage` 7.3 (no coverage tool in the backend) | Exception; falls under JOS-208 |

Not in the MVP, kept: E11, E12 and their children (post-MVP, Backlog); JOS-171, 173, 174, 201 In Progress on their own branches (rebase onto `main` later); JOS-172, 175, 176, 200, 202.

## C. Git integration

- `main` @ `ae20ee26` holds the whole MVP (promoted by #71). Zero unmerged MVP commits on any remote branch (`git cherry`). No open pull request.
- CI (`ci.yml`: typecheck and tests, backend and frontend, Node 24) runs on PRs into and pushes to `main` and `feature/entrega-2-JAME`; green on `ae20ee26`. The relay deploy workflow succeeded on manual dispatch (run 39473232133).
- Kept branches: `main`, `feature/entrega-1-JAME` (course history), `feature/entrega-2-JAME` (former integration branch), the four post-MVP branches. 21 stale remote branches and 13 worktrees were removed on the owner's approval (tip SHAs are in JOS-203 I7).
- Left over: remote branch `docs/jos-203-readme-known-limitations` (merged, not deleted); local branch `chore/graphify-update-after-closure` (`225f9409`, graph rebuild, not pushed).

## D. Testing and quality

Run on `main` @ `3d0334c9` (plus the graph rebuild); `ae20ee26` only adds documentation.

| Check | Result |
|---|---|
| Backend typecheck, frontend typecheck | clean |
| Backend tests | 1,720 passed, 4 skipped (provider contract tests), 122 files |
| Frontend tests, build | 258 passed, build OK |
| CI | green on `ae20ee26` |
| Real-provider session (2026-10-20) | 2 scenes (6 s and 11 s clips), four real providers, reached `final-video` with one attempt per stage |
| Windows x64 executable (2026-10-20) | generated a full video on the owner's laptop |
| macOS arm64 executable (2026-10-20) | built from a temporary copy of the proof-of-concept script; `/health` and page 200; foreign Origin or Host 403; `/docs` and test endpoints 404 even with `ALLOW_TEST_ENDPOINTS=1`; second launch detected |
| Lint (one-off ESLint 9, recommended) | 110 backend errors (68 `any`, 40 unused variables, 2 other), 1 frontend; none security-related; not fixed (JOS-208) |

Not done: a full-size session (1,500 to 1,800 words, 30 to 50 clips; JOS-209), a full session with the macOS binary, the contract tests with real keys for this closure, a measured coverage figure, a browser E2E on this exact SHA, a real kill-and-restart run (recovery is confirmed from spec and tests only).

## E. Cleanup and security

| Item | Result |
|---|---|
| Secrets scan over all history (gitleaks 8.30.1, 641 commits) | No real secret. 16 findings: 8 file-hash false positives, 3 example passwords (replaced), 5 placeholder bearer examples. History not rewritten. Adding gitleaks to CI is JOS-211. |
| `npm audit --omit=dev` | 0 in backend and frontend |
| API origin policy | only the app's own origins and loopback hosts |
| `.gitignore` | `.secrets.json`, `.env`, `.env.*` ignored anywhere; packaged entry strips `ALLOW_TEST_ENDPOINTS` and `USE_STUB_*`; JOS-205 criterion 5 keeps the guard |
| Telemetry privacy (I2) | Relay allowlist (13 keys, every level) and tests checked; only free-text keys are `exception.message` and `exception.stacktrace`, scrubbed for paths and user name. **Gap:** API-key-shaped text is not scrubbed (low risk, nothing sends it today; JOS-212). **Not checked:** what Grafana actually stores; logs of a longer or failing real-provider run. |
| Personal data in the repo | Home path redacted in six archived reports (#77). The owner's email stays in two docs (public through commit authorship). |
| Repository cleanup | Media-assembly work folder removed (`openspec/` 64 MB to 6 MB), hook paths made portable, empty VS Code settings removed (#76); agent files rewritten for the real stack. Inventory in `cleanup-inventory.md`. Graph output, archived proof of concept, PRD history and the specboot template kept on purpose. |

## F. Documentation

README rewritten for the built MVP (#68) and corrected in #77: known limitations (section 1.6), nine broken links repointed to the archive, test counts and lint baseline, project URL `https://vid4you.download` (no public site yet), packaged-build check. README and `docs/PRD.md` stay in Spanish (course template); the exception is in `docs/base-standards.md`. Also current: PRD v1.10, specs, `backend-standards.md`, ADR 0005, ADR 0007 (single environment), API spec. Sections 5 and 6 of the README are the Entrega 1 baseline by design. The J1 to J14 boxes in JOS-203 wait for the owner's review.

## G. Remaining actions

| # | Action | Owner | Severity | Ref |
|---|---|---|---|---|
| 1 | Accept (or reject) the human-review exceptions and the limitations list; give or withhold deployment authorization | Owner | Decision | Gates 1 and 3, M7 |
| 2 | Check Grafana storage for one error record, and read one failing-run log | Owner | Medium | I2 |
| 3 | Keep one provider task per scene when a clip times out | Dev | **High** (cost) | JOS-204 |
| 4 | Time a full-size session and confirm the 600 s and 1200 s limits | Dev | **High** | JOS-209, M1 |
| 5 | Repeatable build script for the packaged executables | Dev | **High** for distribution | JOS-205 |
| 6 | Release workflow rewritten for the single environment | Dev | **High** for distribution | JOS-206 |
| 7 | Verify database upgrade and downgrade, or accept the gap in writing | Dev, Owner | Medium | JOS-210 |
| 8 | Sign the macOS and Windows executables | Dev | Medium | JOS-207 |
| 9 | Gitleaks in CI with the graph cache allowlisted | Dev | Medium | JOS-211 |
| 10 | Lint and static analysis in both packages and CI (baseline in README 2.6) | Dev | Low | JOS-208 |
| 11 | Scrub API-key-shaped text from telemetry error text | Dev | Low | JOS-212 |
| 12 | Improve the content-check error message (four causes, one text) | Dev | Low | M3, deferred, no ticket |
| 13 | De-scoped: real request caps and clause-boundary checks | Dev | Low | JOS-188, 189 |
| 14 | Refresh `mvp-release-gates.md` from this report; push or drop the graph commit `225f9409`; delete the merged remote docs branch | Dev | Low | housekeeping |
