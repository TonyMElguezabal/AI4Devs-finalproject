# MVP release-readiness gates

- Refreshed on 2026-10-22 from `docs/release/mvp-closure-report.md` (written on `main` @ `ae20ee26`, 2026-10-20), which superseded the first evaluation of these gates on `f4b6e492`. The evidence for each row is in the closure report section named in it.
- Changed since the closure report: lint and static analysis run in both packages and in CI (JOS-208, PR #82), so the "no lint step" gap is closed.
- Tracking ticket: JOS-203 (sections K1-K3, L1).
- Status words: **Met**, **Met with exceptions** (evidence exists, a named gap is accepted or pending acceptance), **Not met**, **Needs owner** (only the product owner can decide).

## Summary

| Gate | Result |
|---|---|
| 1. MVP scope complete | **Met with exceptions** (the owner accepts the human-review exceptions) |
| 2. Release candidate ready | **Met with exceptions** for the source MVP; **Not met** for a distributable release (JOS-205, JOS-206, JOS-207, JOS-210) |
| 3. Deployment approved | **Needs owner** (no stakeholder acceptance, limitations sign-off or deployment authorization) |

Verdict of the closure report: **Ready with Exceptions** for the MVP as a local application on `main`. Nothing has been deployed and no release or distribution has been authorized.

## Gate 1: MVP scope complete

| Item | Status | Evidence and gaps |
|---|---|---|
| Every MVP issue is traced | Met | 52 issues in 11 epics, all Done; all 52 OpenSpec changes archived (closure report B). |
| Required stories satisfy their acceptance criteria | **Met with exceptions** | Spec- and test-level evidence plus the real runs in closure report D. The human-review tasks were accepted as exceptions, not performed (JOS-203 M7, JOS-215). JOS-188 and JOS-189 are de-scoped to post-MVP. |
| Everything required is integrated | Met | `main` holds the whole MVP (promoted by #71); zero unmerged MVP commits on any remote branch (closure report C). |
| No unresolved scope blockers | Met | The remaining items are follow-up tickets (closure report G). |

## Gate 2: Release candidate ready

| Item | Status | Evidence and gaps |
|---|---|---|
| Application builds | **Met with exceptions** | Type checks and the frontend build pass. The packaged executables come only from the archived proof of concept, not from a repeatable build (JOS-205). |
| Automated tests and CI pass | Met | Backend 1,720 passed and frontend 258 passed on `3d0334c9`; CI green on `ae20ee26` (closure report D). The real-provider contract tests are opt-in and not run in CI. |
| Critical end-to-end flows validated | **Met with exceptions** | A 2-scene session with the four real providers reached `final-video`; the Windows executable generated a full video; the macOS executable passed its start-up checks. Not done: a full-size session (JOS-209), a browser E2E on the release SHA, a real kill-and-restart run. |
| No release-blocking defect or security finding | **Met with exceptions** | gitleaks over all history found no real secret; `npm audit --omit=dev` is 0; the API accepts only its own origins; credential files are ignored anywhere; lint runs in CI (JOS-208). Gaps: API-key-shaped text is not scrubbed from telemetry error text (JOS-212); what Grafana stores and a failing-run log are not checked (closure report G2); gitleaks runs in CI (JOS-211). |
| Repository cleanup is complete or exceptions documented | Met | Approved removals done (#76); kept items listed in `cleanup-inventory.md` (closure report E). |
| Documentation reflects the implementation | Met | README rewritten (#68) and corrected (#77); PRD, specs, ADRs and API spec current (closure report F). |
| Rollback and recovery procedures documented | **Met with exceptions** | README section 1.5 covers backup, restore, restart recovery and retries. Gaps: database downgrade is unverified (JOS-210); there is no release rollback because there is no release workflow (JOS-206). |

**Not met for a distributable release:** no repeatable packaged build (JOS-205), no release workflow for the single environment (JOS-206), unsigned executables (JOS-207), downgrade unverified (JOS-210).

## Gate 3: Deployment approved

| Item | Status | Evidence and gaps |
|---|---|---|
| MVP acceptance from the stakeholder | **Needs owner** | Not given. |
| Deployment environment and configuration validated | **Met with exceptions** | `main` is the single official environment (ADR 0007, #72); CI runs on pull requests into and pushes to `main`. The product is a local application with no release workflow (JOS-205, JOS-206). |
| Operational monitoring and failure handling ready | **Met with exceptions** | The telemetry relay is deployed and Grafana receives data (owner-confirmed, JOS-203 K4). Failure handling (bounded retries, restart recovery, pause, manual retry) is covered by tests and the real runs. Grafana's stored content is not checked (closure report G2). |
| Known limitations and risks accepted | **Needs owner** | List to accept: a timed-out clip may be billed twice (JOS-204); provisional time limits, never measured on a full-size session (JOS-209); no repeatable packaged build or release workflow (JOS-205, JOS-206); unsigned executables (JOS-207); database downgrade unverified (JOS-210); generic content-check error message (JOS-214); JOS-188 and JOS-189 de-scoped; the human-review exceptions of Gate 1. |
| Explicit deployment authorization | **Not given** | No deployment is performed or authorized by this document. |

## What happens next

1. The owner decides: accept or reject the Gate 1 exceptions and the Gate 3 limitations list, and give or withhold deployment authorization (closure report G1).
2. For a distributable release: JOS-205, JOS-206, JOS-207 and JOS-210, then re-run the validation on the release SHA (JOS-216).
