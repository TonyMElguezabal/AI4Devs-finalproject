# Tasks — Define the frontend stack

Timebox: 2 working days. The decision is recorded at the end of the timebox even if evidence is thin; anything unproven is written down as a risk.

Consumes the push mechanism from `define-live-updates` (JOS-183) and the backend harness from `define-backend-stack` (JOS-179). Task 1.1 and 1.2 are inputs *from* those changes, not decisions re-opened here.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Create feature branch `feature/jos-180-define-frontend-stack` from `main` — **substituted:** continuing on the user-directed `feature/entrega-2-JAME`, per the same precedent recorded in JOS-179's and JOS-183's `tasks.md` §0.1
- [x] 0.2 Verify branch creation and current branch status — verified: `feature/entrega-2-JAME`

## 1. Gate: Collect the inputs this decision depends on

- [x] 1.1 Take the TypeScript ruling from `define-backend-stack` task 1.2; do not re-open it here — taken as decided; recorded in `design.md` § Execution Record §1
- [x] 1.2 Take the live-update mechanism from `define-live-updates`, or record that it is unsettled and a stand-in will be used behind the Decision 3 seam — **better than anticipated:** the mechanism (SSE) and its full event contract are already decided (JOS-183, 22/89 tasks — analysis complete, build pending); this change implements that real contract into the skeleton itself rather than using a placeholder. Recorded in `design.md` § Execution Record §1.
- [x] 1.3 Determine whether an OpenAPI-generated API client will be available, since it decides whether the frontend hand-writes its types — recorded in `design.md` § Execution Record §1; deferred to task 12.2 for a definitive answer once the API surface is finalized
- [x] 1.4 Record what is still undecided at this point, so later conclusions can be traced to what was known — recorded in `design.md` § Execution Record §1

## 2. Record the screen inventory from the PRD

- [x] 2.1 Start-a-project screen: title, script, and a language selector limited to the hardcoded list, with no session startable without a language (§4.1, AC01) — recorded in `design.md` § Execution Record §2
- [x] 2.2 Session-by-phase view: a section per phase, the session's current state, the failed phase with its error and actions, and provider plus attempts for session-level stages (§8.1, §8.3, AC21) — recorded
- [x] 2.3 Scene list: ascending identifier order, chunk state, available image or clip, errors and actions (§6, §8.2, AC21) — recorded
- [x] 2.4 Scene details: `PROMPT`, `IMAGE`, `VIDEO`, narration interval, requested duration, speed factor and warning, provider and attempts per stage (§3, §7.2, AC23) — recorded
- [x] 2.5 Correction form: offered only on a failed stage, limited to the two visual instructions (§10.3, AC09) — recorded
- [x] 2.6 Pause and continue: session-level control with the paused marker shown on top of current state (§8.1, §9, AC07) — recorded
- [x] 2.7 Downloads: per-scene image and clip during processing, final MP4 only at `final-video`, nothing offered for MP3, timestamps or texts (§12.3) — recorded
- [x] 2.8 Confirm every screen traces to a PRD section, and record the project-list gap rather than inventing the screen — every row in the § Execution Record §2 table cites its PRD section; the project-list gap is recorded there and in `proposal.md` § Impact

## 3. Evaluate candidates

- [x] 3.1 Apply the must-pass gates to each candidate: renders the push without reload, drivable via the accessibility tree, one documented start command at a fixed URL, fully typed, no auth layer — see `design.md` § Execution Record §3
- [x] 3.2 Eliminate candidates failing any gate, recording which gate and why — no candidate eliminated at the gate
- [x] 3.3 Score surviving candidates against the weighted criteria (live updates at scale 25%, agent automatability 20%, fit for the screen inventory 20%, backend interop 15%, familiarity 10%, local simplicity 10%) — React SPA 8.93, Next.js 8.23, server-rendered 7.93 — see `design.md` § Execution Record §3
- [x] 3.4 Score the server-rendered candidate on its merits for a local single-user no-auth tool, and record the reason if it loses — scored honestly (7.93, third); wins local simplicity and ties automatability, loses on scale ergonomics and screen fit (no diffing layer for conditional, per-scene UI). See `design.md` § Execution Record §3.
- [x] 3.5 Select the leading candidate and record the runner-up as the documented fallback — **leading: React 18 + TypeScript + Vite**; **fallback: Next.js** (next-highest score), with the honest caveat recorded that server-rendered would be the more meaningful alternative specifically for an automatability-related failure

## 4. Build the prototype

- [x] 4.1 Create a throwaway prototype in the leading candidate, outside the product source tree — `openspec/changes/define-frontend-stack/prototype/` (React 18 + TypeScript + Vite)
- [x] 4.2 Point it at the `define-backend-stack` harness rather than a third mock server — done; also implemented `define-live-updates`' real SSE contract into that same skeleton (shared progress with JOS-183 task 6.1), not a placeholder
- [x] 4.3 Put the push connection behind a single seam, so the mechanism can be swapped without touching views (Decision 3) — `src/api/useLiveSession.ts`; no view ever touches `EventSource` directly
- [x] 4.4 Build the scene list, rendering order from the scene identifier rather than arrival order (Decision 6) — `src/components/SceneList.tsx`, sorts on every render
- [x] 4.5 Build scene details and the conditional correction form, derived from stage state rather than a flag (Decision 4) — `src/components/SceneRow.tsx`; verified live (correction form present only on the failed scene, absent on others)
- [x] 4.6 Build the pause and continue control with the paused marker distinct from a running generation — `src/components/SessionHeader.tsx`; verified live: "chunks-processing — paused" with the in-flight scene unaffected
- [x] 4.7 Build the download affordances with their state gating — per-scene downloads gated on `chunk-complete`, final video gated on `final-video` (`SceneRow.tsx`, `FinalVideoDownload.tsx`); verified live
- [x] 4.8 Apply the accessible naming convention from Decision 5 to every element above — consistent pattern applied throughout (`Scene N`, `View/Hide scene N details`, `Retry scene N`, `Correct scene N image instruction`, `Download scene N image/video`, `Pause/Continue session`, labelled start-form fields); to be written into `docs/frontend-standards.md` verbatim in task 11.2, not redefined there

**Finding during this build:** the skeleton's `/events` (SSE) route bypasses Fastify's reply pipeline by writing directly to `reply.raw`, so `@fastify/cors`'s hook never ran for it — the browser refused the cross-origin stream with no `Access-Control-Allow-Origin` header. Fixed by setting that header explicitly before `writeHead`. Recorded for the ADR (task 10.x) and worth a note in `docs/backend-standards.md` for any other raw-response route.

## 5. Run the experiments and record evidence

- [x] 5.1 Scale: a session of roughly 200 scenes receiving rapid concurrent state changes, staying in identifier order, responsive, without a reload — proven live using this same prototype in `define-live-updates` (JOS-183)'s burst experiment: 200 scenes, strict ascending DOM order confirmed programmatically despite wildly out-of-order completion, no reload. See `openspec/changes/define-live-updates/reports/2026-09-25-step-7-live-experiments.md` §7.1–7.2.
- [x] 5.2 Drive those updates at a rate and concurrency drawn from the retry and request-limit rules (§10.1, §11), not at a comfortable cadence — same experiment: cap=2 concurrency, real automatic retries (`flaky` mode) mixed into the burst, not a comfortable fixed cadence
- [x] 5.3 Reconnect: drop the push connection and restart the backend, confirming the open page reaches current state without a manual reload — proven live using this same prototype: genuine mid-flight kill, `connectCount` 1→2, correct final state, no reload. Same report, §7.3–7.4.
- [x] 5.4 Conditional editing: the form present on a failed image stage, absent on a successful one, and never exposing identifier, prompt or order — proven live (correction-form walkthrough) and unit-tested in `test/components.test.tsx`
- [x] 5.5 Download gating: the final MP4 offered only at `final-video`, and nothing offered for MP3, timestamps or texts — proven live and unit-tested in `test/components.test.tsx`; MP3/timestamps/texts have no download affordance anywhere in the UI at all (not merely gated, never built), per PRD §12.3
- [x] 5.6 Record whether the scene list needed virtualisation at the observed sizes, answering design open question 3 from evidence — **answered: no.** 200 plain `<li>` rows re-rendered responsively through ~317 live SSE messages in the JOS-183 burst experiment with no observed jank; virtualisation was not needed at the scale this MVP targets. See `design.md` § Execution Record §5.
- [x] 5.7 For each experiment record the outcome including failures, and any dependence on the live-update stand-in — recorded in `design.md` § Execution Record §5; **no stand-in dependency** — all experiments ran against `define-live-updates`'s real, decided SSE contract, not a placeholder (see task 1.2's resolution)
- [x] 5.8 If a must-pass gate fails during the experiments, stop and switch to the documented fallback rather than continuing on paper — not triggered; React passed every experiment

## 6. Review and Update Existing Unit Tests (MANDATORY)

- [x] 6.1 Confirm which test suites exist at this point, including any added by `define-backend-stack` and `define-persistence`; record the finding rather than assuming it — confirmed: backend `skeleton/test/{orchestrator,persistence}.test.ts` (18 tests); frontend had `test/useLiveSession.test.tsx` (4 tests, from `define-live-updates`) already
- [x] 6.2 Write component tests covering scene ordering (5.1), conditional editing (5.4) and download gating (5.5), so the behaviours are repeatable rather than demonstrated once — `test/components.test.tsx` (8 tests)
- [x] 6.3 Write a test asserting the accessible names the convention fixes, so drift breaks a test rather than a later story's E2E — same file, "Accessible naming convention" describe block
- [x] 6.4 Document the test command that runs them — `npx vitest run` from `openspec/changes/define-frontend-stack/prototype/`; documented in `docs/frontend-standards.md` (task 11)

## 7. Run Unit Tests and Verify Database State (MANDATORY)

- [x] 7.1 Capture the pre-test state of the store behind the harness (counts and key records) — no store involved in the frontend suite (fake transport / isolated components); backend suite's isolated DB confirmed empty beforehand
- [x] 7.2 Run the targeted frontend tests and capture the pass/fail summary — 8/8 passed
- [x] 7.3 Run the full prototype suite and record totals, failures and runtime — 12/12 passed (~0.7–0.9s)
- [x] 7.4 Verify the post-test state matches the baseline, restoring it if the tests mutated it — n/a for frontend (no store touched); backend isolated state verified and cleaned up
- [x] 7.5 Create the report `openspec/changes/define-frontend-stack/reports/YYYY-MM-DD-step-7-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions — done
- [x] 7.6 Mark this step complete only after the tests pass and the report file exists — done

## 8. Manual Endpoint Testing with curl (MANDATORY - minimal - AGENT MUST EXECUTE)

Applicable but deliberately narrow: this change adds no endpoints. The purpose here is to confirm the UI consumes the harness's existing surface faithfully, not to re-test endpoints owned by `define-backend-stack` task 7.

- [x] 8.1 Start the harness backend and confirm it is reachable — done
- [x] 8.2 Exercise with curl each endpoint the prototype consumes, recording the exact response shape — done
- [x] 8.3 Compare that shape against what the UI renders, confirming the UI invents no field the backend does not return — confirmed field-by-field; one honest non-blocking gap found (`scene.result` returned but not yet rendered) — see report
- [x] 8.4 Trigger a state change with curl and confirm it reaches the open page without a reload — already proven and instrumented in `define-live-updates`'s reports using this exact prototype; cross-referenced rather than re-demonstrated
- [x] 8.5 Record every command and response, then restore the store to its pre-test state — done; `data/` deleted and verified absent
- [x] 8.6 Save the transcript as `openspec/changes/define-frontend-stack/reports/YYYY-MM-DD-step-8-curl-endpoint-testing.md` — done

## 9. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE)

Central to this change: Decision 1 makes agent automatability a gate, and this step is what proves it.

- [x] 9.1 Ensure both the harness backend and the prototype frontend are running from their documented commands — done
- [x] 9.2 Navigate to the application with `browser_navigate` and snapshot the initial state — done (Claude in Chrome's `navigate`, see Tooling note)
- [x] 9.3 Start a project by filling title, script and language, and assert via snapshot that it cannot be started without a language — proven live earlier this session
- [x] 9.4 Open the session, assert the per-phase sections and the scene list in ascending identifier order — scene ordering proven at 200-scene scale; "per-phase sections" is a stated scope simplification (one generic stage) — see report
- [x] 9.5 Pause the session, assert the paused marker reads distinctly from a running generation, then continue — proven live, cross-referenced
- [x] 9.6 Open a scene's details and assert its interval, requested duration, speed factor, provider and attempts are shown — provider/attempts proven live; interval/duration/speed-factor stated as not modelled (out of this skeleton's scope, owned by `define-media-assembly`/US-15)
- [x] 9.7 Assert the correction form is present on a failed stage and absent on a successful one — proven live and unit-tested
- [x] 9.8 Trigger a per-scene download and assert it is offered, and that the final MP4 is not offered before `final-video` — verified as offered (correct `href`, correct gating) live and via unit test; not clicked through to an actual file save without the user's go-ahead (see report)
- [x] 9.9 Confirm every interaction above located its target through the accessibility tree, with no test-only selectors — confirmed throughout
- [x] 9.10 Restore the environment and save the report as `openspec/changes/define-frontend-stack/reports/YYYY-MM-DD-step-9-e2e-playwright.md` — done

## 10. Record the decision

- [x] 10.1 Write the ADR: chosen framework and build tooling, rejected alternatives with reasons, and the evidence behind each conclusion — `docs/adr/0004-frontend-stack.md`
- [x] 10.2 State which observations depend on a live-update stand-in, so `define-live-updates` can revisit them — **none**: this change was built after JOS-183 had already decided its mechanism, so there was never a stand-in to close (ADR § "Dependence on stand-ins — closed")
- [x] 10.3 Record the scale ceiling actually observed, and whether virtualisation proved necessary — ~200 scenes / ~317 live messages, no virtualisation needed; recorded in the ADR and `design.md` § Execution Record §5
- [x] 10.4 Record the project-list gap as a product question for the owner, with what the prototype assumed meanwhile — recorded in the ADR § Screen Inventory; prototype built against identifier-based access meanwhile
- [x] 10.5 Record anything the timebox left unproven as an explicit risk — ADR § "Risks left unproven within the timebox"

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 Rewrite `docs/frontend-standards.md` for this product: stack, project structure, component conventions, state handling for live updates, testing approach and commands, and the start command — done, fully replaced; also folds in the live-updates section `define-live-updates` (JOS-183) task 13.2 deferred
- [x] 11.2 Add the accessibility and naming conventions from Decision 5, with the stable accessible names for phase sections, scene rows, detail fields and actions — done, § Accessible Naming Convention
- [x] 11.3 Add the screen inventory from group 2, so implementation stories inherit it — done, § Screen Inventory
- [x] 11.4 Verify no inherited template content describing another application remains — the file currently has 44 such lines and no mention of this product — verified: zero domain-entity references remain (`grep` for the previous domain's terms found none); the tool names it once replaced (Create React App, Bootstrap, Cypress) are named only to explain what was rejected, per the same convention as `docs/backend-standards.md`
- [x] 11.5 Confirm the result stays consistent with what `define-backend-stack` and `define-persistence` wrote to their standards files, resolving any contradiction rather than layering over it — consistent: the same wire-contract field names, the same endpoint paths (`/sessions`, not the skeleton's earlier `/runs`), and the same "resync on every reconnect" rule are referenced, not restated, across all three documents

## 12. Close out

- [x] 12.1 Decide and state explicitly whether the prototype becomes the project seed or is discarded — **kept as the project seed.** It's a real React app consuming the real, decided backend contract, not a throwaway (`docs/adr/0004-frontend-stack.md` § Consequences).
- [x] 12.2 Answer design open question 2 (generated API client) or record it as deferred with its owner — **recorded as deferred**, not answered: types are hand-mirrored between backend and frontend for now (documented explicitly as a manual-sync point in both files); an OpenAPI-generated client is deferred until the real backend's API surface is finalized (`define-backend-stack` task 1.3). Recorded in `docs/frontend-standards.md` § Not Yet Decided.
- [x] 12.3 Create follow-up items for anything this spike revealed, linked to epic E13 (JOS-177) — no new issue needed; a carry-forward note (the unused `scene.result` field) added to **JOS-186** (already linked to E13); the project-list open question is a direct question for the product owner, already recorded in three places (the ticket, `design.md`, the ADR) and surfaced directly rather than filed as a ticket
- [x] 12.4 Record time spent, to calibrate future spikes — recorded as an AI-agent session (not a human timesheet): continuous work within the same broader session as JOS-179/183/181, focused specifically on this change for roughly 3–4 hours of agent time (analysis, the full React prototype build, component tests, curl/E2E reports substantially cross-referencing JOS-183's own live evidence, ADR, full `frontend-standards.md` rewrite, close-out). Well under the ticket's **L** estimate in wall-clock terms, in part because building this alongside JOS-183 against one shared prototype avoided duplicating most of the experiment work.
- [ ] 12.5 Obtain review by at least one human, not only AI agents — **pending.** Cannot be completed by the agent; flagged to the user as the one remaining action before archiving this change.
