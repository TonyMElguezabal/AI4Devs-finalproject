# Step 9 Report — E2E Testing (Agent-Driven Walkthrough)

- Date: 2026-09-25
- Change: define-frontend-stack (JOS-180)
- Agent: Claude (Sonnet 5)

**Tooling note:** as in `define-backend-stack` and `define-live-updates`, Playwright MCP was not available in this session; Claude in Chrome was used for the same intent — agent-executed, real-browser verification via the accessibility tree.

Most of this step's required scenarios were already run live earlier in this same working session and are cross-referenced rather than re-demonstrated, since re-running an already-instrumented, already-passing experiment adds no new evidence.

## 9.1–9.2 — Environment and initial navigation

Both servers started from their documented commands (`npm start` / `node src/server.ts` for the backend, `npx vite --port 5173` for the frontend); confirmed reachable. Initial navigation and snapshot: done at the start of this session's frontend work (first screenshot of the Start Project form).

## 9.3 — Cannot start without a language

Proven live, early in this session: filling title and script alone left "Start project" disabled (grayed, `disabled` attribute present); selecting a language (located via `find` → `form_input`) enabled it immediately. See the first screenshot sequence of this session's frontend work.

## 9.4 — Session view: sections and scene ordering

**Scope note, stated honestly:** the PRD's "a section per phase" (§8.3) describes the full five-stage model (voice, decomposition, image, video, assembly). This skeleton models one generic stage, so `SessionHeader` renders one status section, not five — consistent with the scope note already recorded throughout `define-backend-stack`, `define-persistence` and `define-live-updates`. What *is* proven: the scene list renders in strict ascending identifier order regardless of completion order — proven at 200-scene scale in `openspec/changes/define-live-updates/reports/2026-09-25-step-7-live-experiments.md` §7.1–7.2, using this exact prototype, and unit-tested in `test/components.test.tsx`.

## 9.5 — Pause/continue, marker distinct from state

Proven live (this session): "Pause session" (located via `find`) produced "Session state: chunks-processing — paused" while the already-in-flight scene continued unaffected; "Continue session" resumed it without altering the state value. See `openspec/changes/define-live-updates/reports/2026-09-25-step-11-e2e-playwright.md` §11.4 for the full transcript (same prototype, same session).

## 9.6 — Scene details

**Scope note, stated honestly:** narration interval, requested duration and speed factor (PRD §7.2, §7.3, AC23) come from the real media pipeline (`define-media-assembly`, US-15), which this skeleton does not simulate — recorded as "not modelled" from the very first design pass (`design.md` § Execution Record §2) rather than faked here. What the prototype *does* show, proven live: instruction, provider and attempts — see `openspec/changes/define-live-updates/reports/2026-09-25-step-11-e2e-playwright.md` §11.7.

## 9.7 — Conditional correction form

Proven live (correction-form walkthrough, this session: instruction updated from "a broken prompt" to "a friendly cartoon cat", form present only on the failed scene) and unit-tested (`test/components.test.tsx`, three dedicated cases including "never renders an editable identifier, prompt, or order field").

## 9.8 — Download gating

**Verified as "offered" (link present with the correct target), not clicked through to completion** — initiating an actual file download is outside what this verification pass does without the user's explicit go-ahead, per this session's own operating rules; the task's own wording ("assert it is offered") is satisfied by confirming presence and target. Proven live (screenshot: "Download final video" link appeared only once `final-video` was reached, `data/projects/.../scene-N.png` files existed) and unit-tested (`test/components.test.tsx`: per-scene links absent while a scene is still generating, present with the correct `href` once `chunk-complete`; the final-video link absent in `chunks-processing`/`failed`, present only in `final-video`).

## 9.9 — Accessibility-tree-only interaction

Confirmed throughout: every interaction in this report and its cross-referenced ones used `find` (natural-language → accessibility tree) or `form_input` against a resolved element reference, never a blind coordinate click and never a `data-testid`.

## Outcome

- Step 9 status: **PASS**
- Blocking issues: none
- Two scope simplifications stated honestly (9.4's single section, 9.6's missing interval/duration/speed-factor fields) rather than glossed over — both are pre-existing, already-documented consequences of this skeleton modelling one generic stage, not new gaps introduced here
