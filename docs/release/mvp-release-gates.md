# MVP release-readiness gates

- Evaluated against: `origin/feature/entrega-2-JAME` @ `f4b6e4920b1b9581461f4ae1ee9a12d2d0e16fe2` (merge of PR #67), on 2026-10-20.
- Tracking ticket: JOS-203 (sections K1-K3). Detailed evidence for earlier phases is in that ticket and in the reports it links.
- Status words: **Met**, **Met with exceptions** (evidence exists, a named gap is accepted or pending acceptance), **Not met**, **Needs owner** (only the product owner can decide).

## Summary

| Gate | Result |
|---|---|
| 1. MVP scope complete | **Met with exceptions** (exceptions need the owner's acceptance) |
| 2. Release candidate ready | **Not met** (cleanup, security scan, README merge, rollback evidence, packaged build) |
| 3. Deployment approved | **Not met** (needs the owner; no deployment environment is enabled) |

Nothing has been deployed and no deployment has been authorized.

## Gate 1: MVP scope complete

| Item | Status | Evidence and gaps |
|---|---|---|
| Every MVP issue is in the traceability report | Met | In Linear, 63 issues carry the `MVP` label and all 63 are Done. On 2026-10-20 the product owner moved JOS-178 from Canceled to Done (it is the umbrella of five Done spikes, US-42a-e) and took the label off JOS-203, the closure ticket itself, so it is outside the MVP target. The Phase 1 report was built from that label and the MVP epics. It must be refreshed in the closing report (JOS-203 L1): the epics are now Done and the open-task counts changed. |
| Every MVP epic and child was audited | Met | Phase 1 audited the 11 MVP epics (E1-E10, E13) and their children; E1-E10 and E13 are Done in Linear since 2026-10-20. |
| Required stories satisfy their acceptance criteria | **Met with exceptions** | Evidence is spec- and test-level, not a human check of every criterion: all archived changes carry their Given/When/Then scenarios, the full backend and frontend suites pass, a real-provider session and a Windows run reached a final video. Exceptions: 26 issues were classed "integrated but not verified" because human-review tasks stayed open (for example `define-provider-configuration` 17.7 and `decompose-script-into-chunks` 11.4); they were accepted as exceptions when the changes were archived (JOS-203 B1, M7), not performed. JOS-188 and JOS-189 are de-scoped to post-MVP. |
| Everything required is integrated in `feature/entrega-2-JAME` | Met | Zero unmerged commits on remote branches (`git cherry`) at Phase 1; the only open pull request is the documentation PR #68. On 2026-10-20 `main` was 77 commits behind the integration branch (it could be fast-forwarded: `main` had nothing the integration branch lacked). The product owner decided that `main` is the official environment, so a promotion pull request from `feature/entrega-2-JAME` to `main` was opened; see Gate 3. |
| No unresolved scope blockers | Met | The remaining items are follow-ups, tracked as JOS-204 to JOS-210 and JOS-203 section M. |

**Gate 1 decision needed from the owner:** accept the human-review exceptions listed above, or ask for specific reviews to be performed.

## Gate 2: Release candidate ready

| Item | Status | Evidence and gaps |
|---|---|---|
| Application builds | **Met with exceptions** | Frontend `npm run build` and backend and frontend type checks pass on `f4b6e492`. The packaged executables come only from the archived proof of concept, not from a repeatable build (JOS-205). |
| Automated tests and CI pass | Met | CI is green on `f4b6e492`. Re-run locally on that code: backend 1719 passed (5 skipped), frontend 258 passed. The four real-provider contract tests are opt-in and are not run in CI. |
| Critical end-to-end flows validated | **Met with exceptions** | 2026-10-20: a 2-scene session with the four real providers reached `final-video` with one attempt per stage; the Windows executable generated a full video; per-change browser E2E reports exist in the archive. Not done: a full-size session (30-50 clips, JOS-209) and a browser E2E on this exact SHA. |
| No release-blocking defect or security finding | **Not met (evidence incomplete)** | `npm audit --omit=dev` reports 0 in backend and frontend; no `.secrets.json` or `.env` was ever committed; a regex scan of history found no key-shaped strings; the API accepts only its own origins. Still open: a real secrets scanner over history (I1), a scan of logs, docs and telemetry for secrets and personal data (I2), the check that dev-only settings cannot be enabled outside the packaged build (I3). No lint or static analysis exists (JOS-208). |
| Repository cleanup is complete or exceptions documented | **Not met** | Done: per-developer config untracked, assembly work folder removed. Open: the unused-files, dependencies and TODO inventory with owner approval (I5, I6), and 10 worktrees and 21 remote branches awaiting a decision (I7). |
| Documentation reflects the implementation | **Not met until PR #68 merges** | The README rewrite is written and its commands were run (backend start, health, docs, origin policy, tests, build). It also states the known limits. Sections 5 and 6 still carry Entrega 1 text and the project URL is `TBD`. |
| Rollback and recovery procedures documented | **Met with exceptions (after #68)** | README section 1.5: backup of the data folder, restore, restart recovery, retries. Gaps: whether an older build can open a newer database is unverified (JOS-210), and there is no release rollback because no release workflow exists (JOS-206). |

**Blocking items for Gate 2:** I1 to I3, I5 to I7 (with owner approval), merge of PR #68, a decision on the rollback gaps (JOS-210, JOS-206) or their written acceptance.

## Gate 3: Deployment approved

| Item | Status | Evidence and gaps |
|---|---|---|
| MVP acceptance from the stakeholder | **Needs owner** | Not requested or given. |
| Deployment environment and configuration validated | **Not met** | Product owner decision (2026-10-20): `main` is the official environment, replacing the UAT/production split of ADR 0007, and the integration branch is promoted to it by pull request. Until that PR is merged `main` has none of the MVP. The product is a local application (ADR 0007): no release workflow publishes executables (JOS-205 and JOS-206), CI runs on pull requests into `main` but not on pushes to it, and the executables are unsigned (JOS-207). The ADR, the README channel text and `ci.yml` still describe the old split. The Windows executable ran once on a real laptop. |
| Operational monitoring and failure handling ready | **Met with exceptions** | Opt-in telemetry exists with Grafana dashboards in `infra/grafana`; the relay at `otel.vid4you.download` is up (empty probes to `/v1/logs` and `/v1/metrics` on 2026-10-20 answered 204 and 200). Not verified: that data reaches Grafana, and the relay's deploy workflow triggers on pushes to `main` that touch `infra/telemetry-relay/`, so merging the promotion pull request will run it (it deploys the relay Worker to Cloudflare if its secrets are set). Failure handling: bounded retries, restart recovery, pause and manual retry are covered by tests and the real runs. |
| Known limitations and risks accepted | **Needs owner** | List to accept: unsigned executables; no repeatable packaged build or release workflow; no full-size timing and provisional time limits (voice and reasoning 600 s, video 1200 s); database downgrade unverified; no lint step; generic content-check error message; MP3 audio in the MP4 (PRD v1.10); JOS-188 and JOS-189 de-scoped; JOS-204 open; human-review exceptions from Gate 1. |
| Explicit deployment authorization | **Not given** | No deployment is performed or authorized by this document. |

## What happens next

1. Merge PR #68, then run Phase 4 items I1 to I3 and the I5 inventory for the owner's approval.
2. The owner decides: Gate 1 exceptions, which Gate 2 gaps become tickets versus accepted exceptions, and the Gate 3 limitations list.
3. Re-evaluate the gates on the release SHA (JOS-203 M8) and deliver the Phase 7 closing report.
