# Graph Report - AI4Devs-jos-193  (2026-10-20)

## Corpus Check
- 839 files · ~919,655 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 16 file(s) not represented in the graph (top: (none) 10, .dot 2, .css 2)

## Summary
- 9626 nodes · 15251 edges · 631 communities (596 shown, 35 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 1407 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8a813139`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- backend/src/db.ts
- backend/src/server.ts
- decomposition-retry.test.ts
- backend/src/orchestrator.ts
- voiceOverPhase.ts
- recordStageAttempt
- resetAll
- PRD — Vid4You
- PRD — Vid4You
- frontend/test/components.test.tsx
- Tasks — View per-scene status and results (JOS-151, US-19)
- PRD — Vid4You
- skeleton/src/routes.ts
- PRD — Vid4You
- registerDecomposition
- PRD — Vid4You
- PRD — Vid4You
- script-segmentation.test.ts
- PRD — Vid4You
- frontend/src/App.tsx
- scriptModeration.ts
- unitBoundaries
- PRD — Vid4You
- Requirements
- ADDED Requirements
- Tasks — Segment the script into chunks within duration bounds (JOS-140)
- frontend/package.json
- prototype/package.json
- Tasks — Preserve project progress across restarts (JOS-160, US-28)
- Requirements
- Requirements
- Dead Code Detection Methodology
- Dead Code Detection Methodology
- Common Mistakes
- Tasks — Distinguish a paused session from running generations
- ADDED Requirements
- Common Mistakes
- scenes
- ai-specs/skills/writing-skills/render-graphs.js
- Specboot: Augmented Spec-driven development
- ADDED Requirements
- decompositionPhase.ts
- Requirements
- ADDED Requirements
- Requirements
- Specboot: Augmented Spec-driven development
- Testing Skills With Subagents
- telemetry/index.ts
- skeleton/src/db.ts
- skeleton/package.json
- ADDED Requirements
- Testing Skills With Subagents
- ADDED Requirements
- reconcileOnBoot
- Requirements
- entry.ts
- ADDED Requirements
- scene-registration-persistence.test.ts
- ADDED Requirements
- Requirement: A failed voice-over can be retried by command
- Tasks — Retry a failed final assembly (JOS-159, US-27)
- Requirements
- Requirements
- Frontend Project Configuration and Best Practices
- readme.md
- Requirement: A failed voice-over can be retried by command
- telemetry.test.ts
- ADDED Requirements
- survey.ts
- ADDED Requirements
- Requirements
- Requirements
- Requirements
- ADDED Requirements
- Requirement: The representation reports running work separately from held work
- Step 9 — Manual endpoint testing with curl (retry-decomposition, JOS-156)
- backend/src/concurrency.ts
- ADDED Requirements
- Requirement: The script, title and language cannot be modified after registration
- Requirements
- Requirements
- Requirement: The script, title and language cannot be modified after registration
- ADDED Requirements
- ADDED Requirements
- ADDED Requirements
- Audit Phases
- Requirements
- ADDED Requirements
- Requirements
- Tasks — Generate the full voice-over
- Redesign the frontend visual design ("Studio" direction)
- prototype/test/components.test.tsx
- Requirements
- Requirements
- Requirement: The intervals partition the voice-over
- Requirement: Each phase reports provider and attempts of its session-level stages
- Audit Phases
- Requirements
- Tasks — Split a sentence at clause boundaries (JOS-141)
- ADDED Requirements
- Requirement: The intervals partition the voice-over
- Requirement: Each phase reports provider and attempts of its session-level stages
- ADDED Requirements
- ADDED Requirements
- Requirement: Repeated confirmations rejected by the store
- Tasks — Download the final video (JOS-164, US-32)
- Design — Obtain narration timestamps for the script (JOS-139)
- ADDED Requirements
- ADDED Requirements
- obtainNarrationTimestamps
- Testing Standards
- ADDED Requirements
- Requirements
- project-files-ac-pinning.test.ts
- Ignore repeated success confirmations
- Backend Project Standards and Best Practices
- skeleton/src/server.ts
- prototype/src/App.tsx
- ADDED Requirements
- ADDED Requirements
- Requirement: An invalid decomposition is a decomposition failure
- Requirements
- Requirement: Voice-over is the only audio and is never retimed
- Requirement: Every released slot has a matching slot that was taken
- getStageAttempts
- Tasks — Bounded retry policy for provider stages
- Tasks — Generate the clip of each scene (JOS-146)
- Requirement: An invalid decomposition is a decomposition failure
- downloadSceneUrl
- ADDED Requirements
- MODIFIED Requirements
- Requirements
- Backend Project Standards and Best Practices
- Model Descriptions
- Testing CLAUDE.md Skills Documentation
- Step 9 — Unit test and DB verification (JOS-159, retry-final-assembly)
- Requirements
- getRun
- compilerOptions
- prototype/src/api/useLiveSession.ts
- compilerOptions
- Tasks — Define the live progress update mechanism
- ADDED Requirements
- ADDED Requirements
- Requirements
- ADDED Requirements
- Requirements
- ADDED Requirements
- Testing CLAUDE.md Skills Documentation
- Process and rules
- Persuasion Principles for Skill Design
- Writing Skills
- scenePause.ts
- Tasks — Start a video project from a title, a script, and its language
- Decisions
- compilerOptions
- Requirement: Waiting is neither a failed attempt nor execution time
- ADDED Requirements
- ADDED Requirements
- frontend/src/types.ts
- Process and rules
- Persuasion Principles for Skill Design
- Writing Skills
- insertRegisteredScenes
- ADR 0005 — Provider selection and hardcoded operating parameters
- ADR 0005 — Video and audio assembly tooling
- compilerOptions
- Tasks — Define the frontend stack
- Tasks — Define the video and audio assembly tooling
- Tasks — Define persistence for sessions and project files
- Tasks — Manually retry a failed decomposition (JOS-156, US-24)
- ADDED Requirements
- Tasks — Define the hardcoded providers and parameter values
- Tasks — Name the downloaded final video after the project title (JOS-193)
- Requirements
- sync-agent-symlinks Skill
- clauseBoundaries.ts
- ADDED Requirements
- Run it
- Tasks — Define the backend stack
- Design — Define the live progress update mechanism
- Step 8 Report — Manual Endpoint Testing with curl
- ADDED Requirements
- Step 4 Report — Rendered Comparison and Threshold Sweep
- PhaseSection
- Requirement: Retry a failed clip without regenerating its image
- Decisions
- compare.ts
- template/docs/base-standards.md
- adversarial-review Skill
- Your objective
- show-spec-working Skill
- recordError
- ADDED Requirements
- ADR 0003 — Live progress update mechanism
- Packaging
- Design — Define the frontend stack
- Requirement: Interrupted requests are awaited or recorded as failed attempts
- updateCheck.ts
- Tasks — Define the production and UAT deployment
- Requirement: A project's files are kept in its project folder
- Requirements
- Requirements
- specboot/package.json
- Your objective
- 🚀 Setup Instructions
- [Analysis Title]
- ffmpegAssemblyTool.ts
- ADR 0004 — Frontend framework and build tooling
- Requirement: Interrupted requests are awaited or recorded as failed attempts
- Tasks — Pause the session and continue explicitly (JOS-152, US-20)
- build.mjs
- Design — Define the backend stack
- Step 7 Report — Manual Endpoint Testing with curl
- ADDED Requirements
- Design — Define persistence for sessions and project files
- Tasks — Decompose the script into chunks with their visual instructions
- Step 7 — Manual Endpoint Testing with curl
- Tasks — Raise the video stage time limit (JOS-197)
- Requirement: Retry a failed clip without regenerating its image
- Requirement: Moderation that cannot run refuses the submission
- ADDED Requirements
- Tasks — Retry or correct the image instruction after an image failure (JOS-157, US-25)
- [Analysis Title]
- Report Structure
- Returns: "OK" or lists conflicts
- ADDED Requirements
- openspec-explore/SKILL.md
- ADR 0001 — Backend language, runtime and framework
- ADR 0002 — Persistence for sessions and project files
- Step 9 Report — E2E Testing (Agent-Driven Walkthrough)
- 2026-09-26-define-visual-design/tasks.md
- Tasks — Lock the script at project start and the narration once complete (JOS-137)
- Step 8: unit tests and database verification (JOS-166, see-provider-and-attempts)
- Requirement: The downloaded file is named after the project title
- Requirements
- Tasks — Assemble the final video from completed scenes
- Execution Record
- Decisions
- Report Structure
- Returns: "OK" or lists conflicts
- Skill structure
- ADDED Requirements
- explore.md
- Step 10 Report — Manual Endpoint Testing with curl (held-open stream)
- Step 11 Report — E2E Testing (Live Push, Pause, Disconnect, Restart, Diagnostics)
- Obtain narration timestamps for the script
- Segment the script into chunks within duration bounds
- Step 7 Report - Unit Tests and Database Verification
- Split a sentence at clause boundaries when duration bounds can't otherwise be met
- contrast.mjs
- Tasks — Retime and join scene clips into the video track (JOS-149, US-16a)
- Requirement: A clip is polled through the query endpoint
- Tasks — Fix the RunningHub video adapter (JOS-196)
- ADDED Requirements
- Tasks — Prevent the final video while any scene is incomplete (JOS-150, US-17)
- Tasks — Record requested duration and speed-adjustment factor per scene (JOS-148)
- Requirement: The final video is not offered before it exists
- Tasks — Adjust the pause after a scene and rebuild the final video (JOS-190)
- Skill structure
- Coding Standards
- 2. Arquitectura del Sistema
- AGENTS.md
- Phase 2: File-by-File Analysis
- Skill authoring best practices
- providers.ts
- Design — Per-phase maximum execution time, measured from send
- Design — Retime and join scene clips into the video track
- CLAUDE.md
- codex.md
- GEMINI.md
- Tasks — Assign scene identifiers and visual instructions (JOS-144)
- Step 7 Report — Live Experiments (Burst, Disconnect, Restart, Idle, Isolation)
- Lock the script at project start and the narration once complete
- Step 10 Report - E2E Testing in the Browser
- Step 7 Report - Unit Tests and Database Verification
- Step 8 Report - Manual Testing with Real Providers
- Step 7 Report - Manual Testing with Real Providers
- Step 9 Report — Unit Tests and Database Verification
- SessionPage
- Request the admitted clip duration closest to the narrated interval
- Step 6: unit tests and database verification (JOS-186, harden-backend-foundation)
- Step 7 Report - Unit Tests and Database Verification
- Requirement: Repeated confirmations rejected by the store
- Step 10 Report - Browser E2E (JOS-153, distinguish-paused-session)
- ADDED Requirements
- Requirement: A clip is polled through the query endpoint
- Tasks — Manually retry a failed voice-over (JOS-155, US-23)
- Commands and Responses
- Proposed text
- Proposed text
- Tasks — Generate the image of each scene (JOS-145)
- Tasks — Download individual scene results during processing (JOS-163, US-31)
- 2026-10-19-retry-or-correct-clip/design.md
- Tasks — Run a session end to end (JOS-195)
- Decisions
- Tasks — Ignore repeated success confirmations (JOS-161, US-29)
- Step 8 — E2E Testing (Claude in Chrome, substituting for Playwright MCP)
- Step 4 — Select the Voice Provider and Settle the Timestamp Mechanism
- Step 9 Report - Manual Endpoint Testing with curl
- concurrent-write-capacity Specification
- Phase 2: File-by-File Analysis
- Skill authoring best practices
- Vid4You backend
- Tasks — Keep project files locally without overwriting or expiry (JOS-162, US-30)
- ADR 0007 — Distribution: a local packaged application (JOS-194)
- Define the backend stack
- Define the frontend stack
- Requirement: Every released slot has a matching slot that was taken
- Define the live progress update mechanism
- Design — Define the video and audio assembly tooling
- Define the video and audio assembly tooling
- Define persistence for sessions and project files
- Define and apply the frontend visual design
- Step 6 Report - Manual Endpoint Check (curl)
- Step 7 Report - E2E Testing (Render Console restyle)
- Step 8 Report - Unit Tests and Database Verification
- Step 9 Report - Manual Endpoint Testing with curl
- Step 8 Report - Manual Endpoint Testing with real providers
- Step 9 Report - E2E Testing in the Browser
- Step 6 Report - Unit Tests and Database Verification
- sweep.ts
- Step 5 — real timings from the first real script (raise-video-time-limit, JOS-197)
- Step 7 Report - Unit Tests and Database Verification
- Step 8 Report — Manual Endpoint Testing
- Step 10 — E2E testing in the browser (retry-decomposition, JOS-156)
- Design — See provider and attempts per stage
- See provider and attempts per stage
- Step 10: browser E2E (JOS-166, see-provider-and-attempts)
- Per-phase maximum execution time, measured from send
- Step 6: unit tests and database verification (JOS-185, stage-execution-time-limit)
- Distinguish a paused session from running generations
- Step 8 Report - Unit Tests, Coverage and Database Verification
- Step 8 Report - Unit Tests, Coverage and Database Verification
- videoProvider.ts
- Requirement: Launch-time check for a newer build on the app's channel
- Requirement: Voice and decomposition requests are given 600 seconds and clip requests 1200 seconds
- 16. Registro de cambios
- telemetry-relay/package.json
- PRD — Vid4You
- JOS-199 step 12 — manual endpoint testing with curl
- Step 10 — Unit Test and DB Verification
- 1.2 Spike: cut and insert silence in the narration, encode once
- Step 9 — Curl Endpoint Testing Report
- Assign scene identifiers and visual instructions
- ADDED Requirements
- Step 10 Report — Manual Testing
- Step 3 — Verify the Video Provider (RunningHub)
- Step 9 Report - Manual Endpoint Testing with curl
- retry-scheduler.test.ts
- 16. Registro de cambios
- MVP closure report
- Requirement: Launch-time check for a newer build on the app's channel
- Requirement: Voice-over is the only audio and is never retimed
- Step 8 Report - Unit Tests and Database Verification
- Step 1 — Gate: Collect the Inputs and Set the Limits
- Step 13 — Manual Endpoint Testing with curl
- Step 11 — Manual Endpoint Testing
- Step 7 — Manual endpoint testing with curl (JOS-164, download-final-video)
- Step 8 Report - Unit Tests and Database Verification
- Generate the image of each scene
- Step 5 — Unit test and DB verification (JOS-162, keep-project-files-locally)
- Requirement: Voice and decomposition requests are given 600 seconds and clip requests 1200 seconds
- Step 9 Report - Manual Endpoint Testing with curl
- Step 7 Report - Unit Tests and Database Verification
- Step 7 Report - Unit Tests and Database State Verification
- 2026-10-19-retry-or-correct-clip/tasks.md
- Add observability and telemetry to the packaged application
- Adjust the pause after a scene and rebuild the final video
- Design — Assemble the final video from completed scenes
- Assemble the final video from completed scenes
- Step 8 — Unit Test and DB Verification Report
- Design — Assign scene identifiers and visual instructions (JOS-144)
- Step 10 Report - E2E Testing in the Browser
- backend/src/types.ts
- Step 8 Report — curl vs. Rendered UI Shape Comparison
- SOLID Principles
- 6. OpenSpec Tasks Mandatory Steps
- Code Audit Methodology
- Model Descriptions
- Step 10 Report — Manual Endpoint Testing
- Backend stack walking skeleton (throwaway)
- Step 6 Report - Unit Test and State Verification
- Step 7 Report — Unit Tests and Database State Verification
- 2026-09-26-define-visual-design/design.md
- Step 12 — E2E Testing with Playwright MCP (Claude in Chrome)
- Step 8 Report - E2E Testing in the Browser
- Step 11 Report — E2E Testing in the Browser
- ADDED Requirements
- Step 8 — Unit tests and database verification (retry-decomposition, JOS-156)
- Step 9: curl endpoint testing (JOS-166, see-provider-and-attempts)
- Step 9 Report - Manual Endpoint Testing with curl
- Step 10 Report - E2E Testing in the Browser
- Step 12: E2E testing (JOS-198, redesign-visual-design)
- Design — Consult a session by its identifier
- Consult a session by its identifier
- Design — Decompose the script into chunks with their visual instructions
- Decompose the script into chunks with their visual instructions
- Define the production and UAT deployment
- Design — Define the hardcoded providers and parameter values
- Define the hardcoded providers and parameter values
- Step 6 — Establish the Supported Language List
- Step 7c — Rate Limits and Per-Stage Request Caps
- Step 8 — Measure the Timing Values
- Download the final video
- Download individual scene results during processing
- Step 7 — Manual endpoint testing with curl (JOS-163, download-scene-results)
- Design — Prevent the final video while any scene is incomplete
- Prevent the final video while any scene is incomplete
- Step 10 — Manual Endpoint Testing with curl
- Generate the full voice-over
- Step 10 Report - E2E Testing in the Browser
- Limit simultaneous provider requests per stage
- Moderate the script at submission
- Raise the per-phase time limits for real script sizes
- Record requested duration and speed-adjustment factor per scene
- Code Audit Methodology
- Domain-Driven Design Principles
- Claude Search Optimization (CSO)
- Bulletproofing Skills Against Rationalization
- visual-instructions.test.ts
- Step 6 Report — Unit Tests and Persisted-State Verification
- Step 8 Report — E2E Testing of Live Push (Experiment 4.4)
- Step 7 Report — Unit Tests and Database State Verification
- Step 9 Report — Unit Tests and Database State Verification
- Step 5 Report - Unit Tests and State Verification
- Step 11 Report — E2E Check
- Step 8 Report - Unit Tests and Database Verification
- Step 3 Report — Numeric Comparison
- JOS-166: See the provider and attempts of each stage
- Retime and join scene clips into the video track
- Step 9 Report - E2E Check in the Browser
- Step 11 — E2E testing with Playwright (JOS-159, retry-final-assembly)
- Step 8 — Unit tests and database verification (JOS-155, retry-voice-over)
- Run a session end to end
- Design — Start a video project from a title, a script, and its language
- Start a video project from a title, a script, and its language
- Vid4You privacy policy
- View progress by phase
- Step 8: unit tests and database verification (JOS-168, view-progress-by-phase)
- Name the downloaded final video after the project title
- Step 5 Report - Unit Tests and Database Verification
- Step 6 Report - Manual endpoint testing with curl (JOS-193)
- Repository cleanup inventory (MVP closure, JOS-203 item I5)
- MVP release-readiness gates
- JOS-199 step 11 — unit tests and database verification
- Step 10: unit tests and database verification (JOS-190, adjust-scene-pause)
- Step 9 Report - E2E Testing in the Browser
- Pause the session and continue explicitly
- Step 11: manual endpoint testing (JOS-190, adjust-scene-pause)
- Requirement: The final video appears only on success and never replaces a file
- Step 10 — E2E Testing Report
- Step 8 Report - Unit Tests and Database State Verification
- dependencies
- frontend/test/useLiveSession.test.tsx
- env.ts
- Claude Search Optimization (CSO)
- Bulletproofing Skills Against Rationalization
- Coding Standards
- Technology Stack
- ai-specs/skills/meta-prompt/SKILL.md
- ai-specs/skills/writing-skills/anthropic-best-practices.md
- Anti-Patterns
- Testing All Skill Types
- Step 8 Report - Manual Endpoint Testing with curl
- JOS-194 proof of concept — created resources (task 6.4)
- Step 9 Report - Unit Tests and Database Verification
- Step 15 — Spend Summary Against the $20 Ceiling
- compilerOptions
- Step 9 — Browser E2E (JOS-151)
- template/ai-specs/skills/meta-prompt/SKILL.md
- template/ai-specs/skills/writing-skills/anthropic-best-practices.md
- Anti-Patterns
- Testing All Skill Types
- API Design Standards
- Technology Stack
- frontend/src/components/FinalVideoDownload.tsx
- Step 7a — Failure Signal: Reasoning Provider (OpenAI)
- Phase 0: Pre-Analysis Setup
- Phase 4: Pattern Detection
- Phase 3.5: TypeScript Types Verification
- Phase 5: Library Recommendations
- Tool Usage Reference
- Phase 3: Best Practices Verification
- enrich-us Skill
- Evaluation and iteration
- Checklist for effective Skills
- Core principles
- File Organization
- RED-GREEN-REFACTOR for Skills
- Skill Types
- Step 9 Report — E2E Applicability (task 9.1)
- Step 9 — Derive the Remaining Values
- Step 8 — E2E testing with the browser (JOS-164, download-final-video)
- Step 6 — Unit test and DB verification (JOS-163, download-scene-results)
- template/ai-specs/agents/frontend-developer.md
- Phase 0: Pre-Analysis Setup
- Phase 4: Pattern Detection
- Phase 3.5: TypeScript Types Verification
- Phase 5: Library Recommendations
- Tool Usage Reference
- Phase 3: Best Practices Verification
- Evaluation and iteration
- Checklist for effective Skills
- Core principles
- File Organization
- RED-GREEN-REFACTOR for Skills
- Skill Types
- Database Patterns
- Security Best Practices
- update-docs Skill
- assembly.test.sh
- Waiting work reconciliation verification
- Step 10 Report - E2E Testing (Chrome browser automation)
- fetch
- Design — Generate the image of each scene (JOS-145)
- Step 9 Report - E2E Testing in the Browser
- Step 10 Report — E2E Check
- Design — Generate the clip of each scene (JOS-146)
- enrich-us Skill
- update-docs Skill
- ai-specs/scripts/code_review.sh
- assemble.sh
- generate-fixture.sh
- generate-long-session.sh
- sweep.sh
- Design — Generate the full voice-over
- Step 9 Report - Manual Endpoint Testing with curl
- template/ai-specs/scripts/code_review.sh
- Design — Ignore repeated success confirmations
- Keep project files locally without overwriting or expiry
- Step 6 — Manual endpoint testing with curl (JOS-162, keep-project-files-locally)
- startNewCycle
- Step 11: manual endpoint testing (JOS-198, redesign-visual-design)
- Step 8 — Unit tests and database verification (JOS-167)
- Frontend Project Standards and Best Practices
- contrast-output.md
- Step 10 Report - E2E Testing (Chrome browser automation)
- 2026-10-19-retry-or-correct-clip/proposal.md
- Step 5 Report — Manual Endpoint Testing
- Step 7: curl endpoint testing (JOS-185, stage-execution-time-limit)
- Step 6 Report — Browser End-to-End Testing
- Step 9 — Manual endpoint testing (JOS-155, retry-voice-over)
- Step 9 — unit tests and database verification (run-session-end-to-end, JOS-195)
- Step 10 Report - E2E Testing (Start a Video Project)
- Design — Segment the script into chunks within duration bounds (JOS-140)
- Step 8 Report - Unit Tests and Database State Verification
- Design — Preserve project progress across restarts
- Step 10 — Manual endpoint testing with curl (JOS-159, retry-final-assembly)
- Borrador de adenda al PRD — telemetría opcional (JOS-199)
- Step 9 Report - Manual Endpoint Testing with curl
- Design — Lock the script at project start and the narration once complete (JOS-137)
- Step 8 Report - Manual Endpoint Testing with curl
- Step 6.15 — B+ against the real R2 bucket, from a local container
- Step 6E — local packaged application, macOS (Decision 14)
- Step 7 — B+ experiments on Cloudflare Containers
- Step 6.20 — Windows x64 run (JOS-203 B3)
- Step 8 Report - Manual Endpoint Testing
- Step 12 Report - Unit Tests and Database Verification
- Step 5b — Verify the Image Provider, Verify the Reasoning Provider, Close Out Group 5
- Step 7b — Failure Signals: Voice, Image, Video Providers
- Grafana dashboards
- Step 8 — E2E testing with the browser (JOS-163, download-scene-results)
- 2026-10-19-fix-runninghub-adapter/design.md
- Step 4 — unit tests and database verification (fix-runninghub-adapter, JOS-196)
- Step 9 — Unit Test and DB Verification
- Step 8 Report - Unit Tests and Database State Verification
- Design — Keep project files locally without overwriting or expiry
- Step 10 — Browser end-to-end check (JOS-167)
- Design — Pause the session and continue explicitly
- Design — Retry or correct the image instruction after an image failure
- Step 1 — Moderation endpoint verification
- Step 4 — unit tests and database verification (raise-video-time-limit, JOS-197)
- redactPaths
- Requirement: Editing surface derived from stage state
- Requirement: No image action once the image succeeded
- Step 4 Report — Unit Tests and Database Verification
- devDependencies
- scripts
- Step 10 — Browser run (JOS-155, retry-voice-over)
- Step 10: E2E testing (JOS-168, view-progress-by-phase)
- 12. Persistencia, archivos y descargas
- 12. Persistencia, archivos y descargas
- JOS-199 step 13 — browser E2E
- Task 6.5: relay deployed and verified in Grafana Explore
- Task 8.3: dashboards imported into Grafana Cloud and checked against live data
- Step 5a — Select the Alignment Provider
- Step 5 — live API check of the fixed adapter (fix-runninghub-adapter, JOS-196)
- Step 11 — E2E Testing with Playwright MCP
- Step 7 — Unit tests and database verification
- Step 5 — short real-provider run (JOS-203 B4)
- name-final-video-after-title/design.md
- 10. Fallos, reintentos y correcciones
- 11. Proveedores y operación
- 2. Usuarios y alcance
- 7. Generación visual, duración y montaje
- 8. Estados y progreso
- 10. Fallos, reintentos y correcciones
- 11. Proveedores y operación
- 2. Usuarios y alcance
- 7. Generación visual, duración y montaje
- 8. Estados y progreso
- Step 7 — E2E testing with Playwright (JOS-162, keep-project-files-locally)
- Step 8 — Endpoint testing with curl
- 4. Entrada y conservación del contenido
- 6.1 Regla de segmentación
- 4. Entrada y conservación del contenido
- 6.1 Regla de segmentación
- promotion-check.sh
- Step 9 — End-to-end browser check
- Step 10 — manual endpoint testing with curl (run-session-end-to-end, JOS-195)
- Step 11 — browser end-to-end (run-session-end-to-end, JOS-195)
- work-removed.md
- 2026-10-19-define-production-deployment/reports/2026-10-13-step-10-curl-endpoint-testing.md
- 2026-10-19-define-production-deployment/reports/2026-10-13-step-11-e2e-browser.md

## God Nodes (most connected - your core abstractions)
1. `getRun()` - 130 edges
2. `createRun()` - 128 edges
3. `registerDecomposition()` - 104 edges
4. `writeArtefactOnce()` - 102 edges
5. `scenes()` - 94 edges
6. `resetAll()` - 78 edges
7. `getStageAttempts()` - 76 edges
8. `getScenesForRun()` - 62 edges
9. `insertVoiceOver()` - 59 edges
10. `recordStageAttempt()` - 51 edges

## Surprising Connections (you probably didn't know these)
- `2. Domain: expose the speed-adjustment factor already computed by duration selection (TDD, pure logic)` --references--> `requestedClipDuration`  [INFERRED]
  openspec/changes/archive/2026-10-19-record-speed-adjustment-factor/tasks.md → backend/src/admittedDurations.ts
- `4. Provider ports and adapters: reasoning and alignment (TDD)` --references--> `AlignmentProvider`  [INFERRED]
  openspec/changes/archive/2026-10-19-decompose-script-into-chunks/tasks.md → backend/src/alignmentProvider.ts
- `2. The gate (TDD, pure; design Decisions 1 and 2)` --references--> `isSceneSettled()`  [INFERRED]
  openspec/changes/archive/2026-10-19-gate-assembly-on-complete-scenes/tasks.md → backend/src/assemblyGate.ts
- `5. Editing the narration in the assembly tool` --references--> `AssemblyInput`  [INFERRED]
  openspec/changes/archive/2026-10-19-adjust-scene-pause/design.md → backend/src/assemblyTool.ts
- `4. Assembly tool port and adapter (TDD)` --references--> `AssemblyTool`  [INFERRED]
  openspec/changes/archive/2026-10-19-assemble-final-video/tasks.md → backend/src/assemblyTool.ts

## Import Cycles
- None detected.

## Communities (631 total, 35 thin omitted)

### Community 0 - "backend/src/db.ts"
Cohesion: 0.04
Nodes (57): DEFAULT_SECRETS_PATH, acceptLateResult(), applyMigrationsTo(), cancelScheduledAttempt(), cancelScheduledAttemptsOfInstance(), countNarrationTimestamps(), countSceneResults(), countSceneVideoResults() (+49 more)

### Community 1 - "backend/src/server.ts"
Cohesion: 0.05
Nodes (57): AssemblyClip, AssemblyInput, AssemblyResult, AssemblyTool, ADR-0005, getAssemblyTool(), nextAssemblyLaunchCount(), setAssemblyTool() (+49 more)

### Community 2 - "decomposition-retry.test.ts"
Cohesion: 0.04
Nodes (59): loadCredential(), readSecretsFile(), defaultDependencies(), dependencies, resetDecompositionDependencies(), setDecompositionDependencies(), DecompositionDependencies, decompositionLauncher (+51 more)

### Community 3 - "backend/src/orchestrator.ts"
Cohesion: 0.04
Nodes (104): ArtefactAlreadyExistsError, assertWithinProjectFolder(), bindSceneImageProvider(), bindSceneVideoProvider(), commitSceneVideoResult(), correctImageInstruction(), correctLegacyInstruction(), correctVideoInstruction() (+96 more)

### Community 4 - "voiceOverPhase.ts"
Cohesion: 0.04
Nodes (92): bindVoiceProvider(), getScheduledAttempts(), startVoiceAttempt(), events, armScheduledAttempt(), AttemptSender, dispatching, hasScheduledAttempt() (+84 more)

### Community 5 - "recordStageAttempt"
Cohesion: 0.07
Nodes (50): clearFinalVideoRebuildRequest(), completeStageAttempt(), countVoiceOvers(), insertFinalVideoBuild(), nextFinalVideoVersion(), recordStageAttempt(), setRunFailure(), closeAttempt() (+42 more)

### Community 6 - "resetAll"
Cohesion: 0.06
Nodes (42): createScene(), db, markChunkComplete(), markSceneFailed(), PROJECTS_ROOT, resetAll(), setRunPaused(), allowedOrigins() (+34 more)

### Community 7 - "PRD — Vid4You"
Cohesion: 0.04
Nodes (47): 10.1 Reintentos automáticos, 10.2 Reintentos manuales, 10.3 Edición permitida, 10. Fallos, reintentos y correcciones, 11.1 Marcas de tiempo y mecanismo de respaldo, 11.2 Vinculación y cambio de proveedor, 11.3 Recorded providers and parameter values (JOS-165), 11. Proveedores y operación (+39 more)

### Community 8 - "PRD — Vid4You"
Cohesion: 0.20
Nodes (9): 13. Criterios de aceptación del MVP, 14.1 POC de asignación de silencios (D11) — Cerrada, 14. Decisiones de producto, 15. Gaps abiertos no bloqueantes, 1. Objetivo del producto, 3. Conceptos y datos del proyecto, 5. Flujo funcional, 9. Pausa y continuación (+1 more)

### Community 9 - "frontend/test/components.test.tsx"
Cohesion: 0.13
Nodes (25): API_BASE, Props, SceneList(), Props, SceneRow(), runAction(), sceneActions, SCENE_RECOVERY_REFUSAL_SENTENCES (+17 more)

### Community 10 - "Tasks — View per-scene status and results (JOS-151, US-19)"
Cohesion: 0.09
Nodes (22): imageUrl(), Coding Standards, Capabilities, Impact, Modified Capabilities, New Capabilities, View per-scene status and results, What Changes (+14 more)

### Community 11 - "PRD — Vid4You"
Cohesion: 0.04
Nodes (45): 10.1 Reintentos automáticos, 10.2 Reintentos manuales, 10.3 Edición permitida, 10. Fallos, reintentos y correcciones, 11.1 Marcas de tiempo y mecanismo de respaldo, 11.2 Vinculación y cambio de proveedor, 11.3 Recorded providers and parameter values (JOS-165), 11. Proveedores y operación (+37 more)

### Community 12 - "skeleton/src/routes.ts"
Cohesion: 0.13
Nodes (28): createRun(), createScene(), getLatestProviderRequestForScene(), getScene(), setRunPaused(), broadcast(), continueSession(), correctAndRetry() (+20 more)

### Community 13 - "PRD — Vid4You"
Cohesion: 0.04
Nodes (44): 10.1 Reintentos automáticos, 10.2 Reintentos manuales, 10.3 Edición permitida, 10. Fallos, reintentos y correcciones, 11.1 Marcas de tiempo y mecanismo de respaldo, 11.2 Vinculación y cambio de proveedor, 11.3 Recorded providers and parameter values (JOS-165), 11. Proveedores y operación (+36 more)

### Community 14 - "registerDecomposition"
Cohesion: 0.04
Nodes (66): PER_PHASE_MAX_TIME_SECONDS, getScene(), getScenesForRun(), resetDownloadFetch(), deriveSessionState(), nextVideoStageLaunchCount(), RETRY_BUDGET, findInstructionProblem() (+58 more)

### Community 15 - "PRD — Vid4You"
Cohesion: 0.05
Nodes (43): 10.1 Reintentos automáticos, 10.2 Reintentos manuales, 10.3 Edición permitida, 10. Fallos, reintentos y correcciones, 11.1 Marcas de tiempo y mecanismo de respaldo, 11.2 Vinculación y cambio de proveedor, 11.3 Recorded providers and parameter values (JOS-165), 11. Proveedores y operación (+35 more)

### Community 16 - "PRD — Vid4You"
Cohesion: 0.04
Nodes (46): 10.1 Reintentos automáticos, 10.2 Reintentos manuales, 10.3 Edición permitida, 10. Fallos, reintentos y correcciones, 11.1 Marcas de tiempo y mecanismo de respaldo, 11.2 Vinculación y cambio de proveedor, 11.3 Recorded providers and parameter values (JOS-165), 11. Proveedores y operación (+38 more)

### Community 17 - "script-segmentation.test.ts"
Cohesion: 0.06
Nodes (45): buildUnits(), classifyMustSplit(), MustSplitClassification, Unit, TimestampCharacter, Grouping, isBetter(), SegmentationResult (+37 more)

### Community 18 - "PRD — Vid4You"
Cohesion: 0.05
Nodes (41): 10.1 Reintentos automáticos, 10.2 Reintentos manuales, 10.3 Edición permitida, 10. Fallos, reintentos y correcciones, 11.1 Marcas de tiempo y mecanismo de respaldo, 11.2 Vinculación y cambio de proveedor, 11. Proveedores y operación, 12.1 Conservación del proyecto (+33 more)

### Community 19 - "frontend/src/App.tsx"
Cohesion: 0.09
Nodes (34): continueSession(), correctScene(), createSession(), fetchLanguages(), getAppUpdate(), getTelemetryConsent(), pauseSession(), rebuildFinalVideo() (+26 more)

### Community 20 - "scriptModeration.ts"
Cohesion: 0.09
Nodes (21): MODERATION_MAX_TIME_SECONDS, SCRIPT_MODERATION, createOpenAiScriptModerator(), moderationSchema, ModerationVerdict, moderator, resetScriptModerator(), ScriptModerator (+13 more)

### Community 21 - "unitBoundaries"
Cohesion: 0.04
Nodes (51): unitBoundaries(), ADR 0006 — Silence allocation (D11), Consequences, Context, Decision, Idea raised, out of this decision's scope, Risks / Trade-offs, The verdict (+43 more)

### Community 22 - "PRD — Vid4You"
Cohesion: 0.05
Nodes (39): 10.1 Reintentos automáticos, 10.2 Reintentos manuales, 10.3 Edición permitida, 10. Fallos, reintentos y correcciones, 11.1 Marcas de tiempo y mecanismo de respaldo, 11.2 Vinculación y cambio de proveedor, 11. Proveedores y operación, 12.1 Conservación del proyecto (+31 more)

### Community 23 - "Requirements"
Cohesion: 0.05
Nodes (38): Purpose, Requirement: A missing credential fails without calling the provider, Requirement: A not-retryable failure is reported without altering the script, Requirement: A session has at most one voice-over, Requirement: A successful generation yields exactly one MP3, Requirement: A transient failure is classified and handed to the retry policy, Requirement: Each attempt is recorded before its request is sent, Requirement: Generation starts automatically from a registered session (+30 more)

### Community 24 - "ADDED Requirements"
Cohesion: 0.05
Nodes (37): ADDED Requirements, Requirement: A missing credential fails without calling the provider, Requirement: A not-retryable failure is reported without altering the script, Requirement: A session has at most one voice-over, Requirement: A successful generation yields exactly one MP3, Requirement: A transient failure is classified and handed to the retry policy, Requirement: Each attempt is recorded before its request is sent, Requirement: Generation starts automatically from a registered session (+29 more)

### Community 25 - "Tasks — Segment the script into chunks within duration bounds (JOS-140)"
Cohesion: 0.09
Nodes (18): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Update Technical Documentation (MANDATORY), 11. Close out, 2. Admitted durations (TDD) — design Decision 6, 4. Grouping (TDD) — Decisions 4 and 5, 5. Phase (TDD) — Decisions 5 and 7, 6. Review and Update Existing Unit Tests (MANDATORY), 7. Run Unit Tests and Verify Database State (MANDATORY) (+10 more)

### Community 26 - "frontend/package.json"
Cohesion: 0.05
Nodes (36): dependencies, react, react-dom, description, devDependencies, jsdom, @testing-library/jest-dom, @testing-library/react (+28 more)

### Community 27 - "prototype/package.json"
Cohesion: 0.05
Nodes (36): dependencies, react, react-dom, description, devDependencies, jsdom, @testing-library/jest-dom, @testing-library/react (+28 more)

### Community 28 - "Tasks — Preserve project progress across restarts (JOS-160, US-28)"
Cohesion: 0.07
Nodes (27): StageLauncher, Capabilities, Impact, Modified Capabilities, New Capabilities, Preserve project progress across restarts, What Changes, 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP) (+19 more)

### Community 29 - "Requirements"
Cohesion: 0.05
Nodes (36): app-telemetry Specification, Purpose, Requirement: Consent prompt and settings on the page, Requirement: Dashboards declared in the repository, Requirement: Error reports, Requirement: Per-signal opt-in consent, Requirement: Product usage events, Requirement: Provider usage metrics (+28 more)

### Community 30 - "Requirements"
Cohesion: 0.05
Nodes (36): deployment-foundation Specification, Purpose, Requirement: Build and release pipeline declared as code, Requirement: Credentials stay on the user's computer, Requirement: Data kept in the user's data folder, Requirement: Exactly one backend instance per user, Requirement: Follow-up work is specified, not implied, Requirement: Production releases are the artifacts UAT validated (+28 more)

### Community 31 - "Dead Code Detection Methodology"
Cohesion: 0.06
Nodes (33): 1. Dynamic Imports, 1. Run Detection Tool, 1. Unused Imports, 2. Framework Magic, 2. Parse and Categorize, 2. Unused Exports, 3. Re-exports for Public API, 3. Unused Variables (+25 more)

### Community 32 - "Dead Code Detection Methodology"
Cohesion: 0.06
Nodes (33): 1. Dynamic Imports, 1. Run Detection Tool, 1. Unused Imports, 2. Framework Magic, 2. Parse and Categorize, 2. Unused Exports, 3. Re-exports for Public API, 3. Unused Variables (+25 more)

### Community 33 - "Common Mistakes"
Cohesion: 0.06
Nodes (32): 1a. Native Worktree Tools (preferred), 1b. Git Worktree Fallback, 5.0 Detect Cleanup Mode, 5.1 Verify Work Is Saved, 5.2 Native Worktree Tools (preferred), 5.3 Git Worktree Fallback Cleanup, 5.4 Verify Cleanup, Assuming directory location (+24 more)

### Community 34 - "Tasks — Distinguish a paused session from running generations"
Cohesion: 0.14
Nodes (13): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 11. Update Technical Documentation (MANDATORY), 12. Close out, 2. Backend: running-work derivation (TDD), 3. Backend: payload and API schema (TDD), 4. Frontend: types and status mapping (TDD), 5. Frontend: session header (TDD) (+5 more)

### Community 35 - "ADDED Requirements"
Cohesion: 0.06
Nodes (35): ADDED Requirements, Deployment foundation, Requirement: Build and release pipeline declared as code, Requirement: Credentials stay on the user's computer, Requirement: Data kept in the user's data folder, Requirement: Exactly one backend instance per user, Requirement: Follow-up work is specified, not implied, Requirement: Production releases are the artifacts UAT validated (+27 more)

### Community 36 - "Common Mistakes"
Cohesion: 0.06
Nodes (32): 1a. Native Worktree Tools (preferred), 1b. Git Worktree Fallback, 5.0 Detect Cleanup Mode, 5.1 Verify Work Is Saved, 5.2 Native Worktree Tools (preferred), 5.3 Git Worktree Fallback Cleanup, 5.4 Verify Cleanup, Assuming directory location (+24 more)

### Community 37 - "scenes"
Cohesion: 0.07
Nodes (33): scenes(), 6.1 — Pre-test baseline (real store, untouched by this step), 6.2 — Targeted tests for this module, 6.3 — Full suite, 6.4 — Post-test verification and cleanup, 6.5 / 6.6 — Outcome, Isolation, Step 6 — Unit Test and Database State Verification (+25 more)

### Community 38 - "ai-specs/skills/writing-skills/render-graphs.js"
Cohesion: 0.10
Nodes (25): combineGraphs(), { execSync }, extractDotBlocks(), extractGraphBody(), fs, main(), path, renderToSvg() (+17 more)

### Community 39 - "Specboot: Augmented Spec-driven development"
Cohesion: 0.07
Nodes (29): 1) Install and Initialize OpenSpec, 2) Import Into Your Project, 3) Customize `docs/` for Your Project (Mandatory), 4) Point OpenSpec Config to Your `docs/` and `ai-specs/`, 🙏 Acknowledgements, Adapting to Your Project, 🎯 Benefits, 🤝 Contributing (+21 more)

### Community 40 - "ADDED Requirements"
Cohesion: 0.06
Nodes (34): ADDED Requirements, Requirement: Consent prompt and settings on the page, Requirement: Dashboards declared in the repository, Requirement: Error reports, Requirement: Per-signal opt-in consent, Requirement: Product usage events, Requirement: Provider usage metrics, Requirement: Published privacy policy (+26 more)

### Community 41 - "decompositionPhase.ts"
Cohesion: 0.03
Nodes (106): Goal, Output format, Rules, claimScheduledAttempt(), getNarrationTimestamps(), rowToNarrationTimestamps(), getDecompositionDependencies(), DecompositionLogger (+98 more)

### Community 42 - "Requirements"
Cohesion: 0.06
Nodes (32): Purpose, Requirement: A manual retry opens a new cycle, Requirement: A not-retryable failure fails the stage instance at once, Requirement: A retry resumes at the failed stage instance, Requirement: A transient failure with budget left is retried automatically, Requirement: An exhausted cycle fails the stage instance, Requirement: No mechanism can exceed the budget, Requirement: Pause holds retries (+24 more)

### Community 43 - "ADDED Requirements"
Cohesion: 0.06
Nodes (31): ADDED Requirements, Requirement: A manual retry opens a new cycle, Requirement: A not-retryable failure fails the stage instance at once, Requirement: A retry resumes at the failed stage instance, Requirement: A transient failure with budget left is retried automatically, Requirement: An exhausted cycle fails the stage instance, Requirement: No mechanism can exceed the budget, Requirement: Pause holds retries (+23 more)

### Community 44 - "Requirements"
Cohesion: 0.06
Nodes (33): decomposition-manual-retry Specification, Purpose, Requirement: A decomposition retry never regenerates the voice-over, Requirement: A division retry re-divides the same script, Requirement: A failed decomposition can be retried by command, Requirement: A retry opens a new cycle on the failed step, through the launch gate, Requirement: A timestamps retry runs on the same audio, Requirement: An accepted retry shows the decomposition in progress (+25 more)

### Community 45 - "Specboot: Augmented Spec-driven development"
Cohesion: 0.07
Nodes (29): 1) Install and Initialize OpenSpec, 2) Import Into Your Project, 3) Customize `docs/` for Your Project (Mandatory), 4) Point OpenSpec Config to Your `docs/` and `ai-specs/`, 🙏 Acknowledgements, Adapting to Your Project, 🎯 Benefits, 🤝 Contributing (+21 more)

### Community 46 - "Testing Skills With Subagents"
Cohesion: 0.07
Nodes (29): 1. Explicit Negation in Rules, 2. Entry in Rationalization Table, 3. Red Flag Entry, 4. Update description, Common Mistakes (Same as TDD), Example: TDD Skill Bulletproofing, GREEN Phase: Write Minimal Skill (Make It Pass), Initial Test (Failed) (+21 more)

### Community 47 - "telemetry/index.ts"
Cohesion: 0.08
Nodes (28): description, fastify, @fastify/cors, @fastify/swagger, @fastify/swagger-ui, fastify-type-provider-zod, @types/node, typescript (+20 more)

### Community 48 - "skeleton/src/db.ts"
Cohesion: 0.07
Nodes (53): applyMigrationsTo(), commitSceneResult(), countSceneResults(), db, deriveAndCreateProjectFolder(), formatFolderTimestamp(), getAllInFlightScenes(), getProviderRequest() (+45 more)

### Community 49 - "skeleton/package.json"
Cohesion: 0.07
Nodes (29): dependencies, fastify, @fastify/cors, @fastify/swagger, @fastify/swagger-ui, fastify-type-provider-zod, zod, description (+21 more)

### Community 50 - "ADDED Requirements"
Cohesion: 0.06
Nodes (32): ADDED Requirements, decomposition-manual-retry, Requirement: A decomposition retry never regenerates the voice-over, Requirement: A division retry re-divides the same script, Requirement: A failed decomposition can be retried by command, Requirement: A retry opens a new cycle on the failed step, through the launch gate, Requirement: A timestamps retry runs on the same audio, Requirement: An accepted retry shows the decomposition in progress (+24 more)

### Community 51 - "Testing Skills With Subagents"
Cohesion: 0.07
Nodes (29): 1. Explicit Negation in Rules, 2. Entry in Rationalization Table, 3. Red Flag Entry, 4. Update description, Common Mistakes (Same as TDD), Example: TDD Skill Bulletproofing, GREEN Phase: Write Minimal Skill (Make It Pass), Initial Test (Failed) (+21 more)

### Community 52 - "ADDED Requirements"
Cohesion: 0.04
Nodes (44): ADDED Requirements, Requirement: A pause holds every launch not yet sent, Requirement: A pause never reverts or removes work, Requirement: Continue launches every held generation, phase and retry once, Requirement: Every launcher is held by the gate, and gaps are visible, Requirement: Held work is distinguished from running work, Requirement: Pause and continue are idempotent, session-scoped and allowed in any state, Requirement: Requests already sent finish and their results are kept (+36 more)

### Community 53 - "reconcileOnBoot"
Cohesion: 0.04
Nodes (54): occupy(), inFlight(), Risks left unproven within the timebox, sceneCurrentRequestId(), reconcileOnBoot(), Context, Decision 1: Slots belong to a holder key, Decision 2: `occupy(stage, holder)` for requests already sent (+46 more)

### Community 54 - "Requirements"
Cohesion: 0.06
Nodes (31): chunk-video-generation Specification, Purpose, Requirement: A stored clip completes the chunk, Requirement: An interrupted clip resumes after a restart, Requirement: Clip failures belong to the video stage, Requirement: Clip generation launches from `image-complete` and uses the image and the `VIDEO` instruction, Requirement: No clip is requested without an available image, Requirement: The video provider is bound to the chunk's video stage (+23 more)

### Community 55 - "entry.ts"
Cohesion: 0.07
Nodes (10): allowedHosts, allowedOrigins, alreadyRunning(), CONTENT_TYPES, main(), openBrowser(), poll(), PORT (+2 more)

### Community 56 - "ADDED Requirements"
Cohesion: 0.06
Nodes (30): ADDED Requirements, Chunk video generation, Requirement: A stored clip completes the chunk, Requirement: An interrupted clip resumes after a restart, Requirement: Clip failures belong to the video stage, Requirement: Clip generation launches from `image-complete` and uses the image and the `VIDEO` instruction, Requirement: No clip is requested without an available image, Requirement: The video provider is bound to the chunk's video stage (+22 more)

### Community 57 - "scene-registration-persistence.test.ts"
Cohesion: 0.11
Nodes (17): closestAdmittedDuration, requestedClipDuration, VIDEO_ADMITTED_DURATIONS_SECONDS, DurationWarning, newRunId(), newScene(), registeredSceneId(), registerTwoChunks() (+9 more)

### Community 58 - "ADDED Requirements"
Cohesion: 0.07
Nodes (27): ADDED Requirements, Requirement: A fragment that cannot fit without a split is kept whole, Requirement: A script with no valid grouping is a decomposition failure, Requirement: A short sentence is grouped with its neighbour, Requirement: Cuts fall only between sentences, Requirement: Fragments fit the duration bounds, Requirement: The decomposition phase runs end to end, Requirement: The fragments reproduce the script (+19 more)

### Community 59 - "Requirement: A failed voice-over can be retried by command"
Cohesion: 0.06
Nodes (30): Purpose, Requirement: A failed voice-over can be retried by command, Requirement: A retry deletes nothing, Requirement: A retry opens a new cycle through the launch gate, Requirement: An accepted retry shows the voice-over in progress, Requirement: The page offers the retry on a failed voice-over phase, Requirement: The retry uses the same script, Requirement: The retry uses the session's bound voice provider (+22 more)

### Community 60 - "Tasks — Retry a failed final assembly (JOS-159, US-27)"
Cohesion: 0.07
Nodes (30): Goal, Output format, Rules, AssemblyRetryRefusal, AssemblyFailure, SessionFailure, PhaseRetryButton(), handleClick() (+22 more)

### Community 61 - "Requirements"
Cohesion: 0.07
Nodes (28): assembly-failure-recovery Specification, Purpose, Requirement: A failed assembly can be retried by command, Requirement: A failed assembly is recorded on the session, Requirement: A failed assembly keeps everything generated, Requirement: A retry opens a new cycle; pause holds assembly until continue, Requirement: An accepted retry shows the final video in progress, Requirement: An assembly retry uses only the components already generated (+20 more)

### Community 62 - "Requirements"
Cohesion: 0.07
Nodes (26): Live updates foundation, Purpose, Requirement: A defined event payload, Requirement: An idle connection stays alive or reconnects transparently, Requirement: An open page reaches current state after a disconnection, Requirement: Recorded evidence before implementation, Requirement: Session-scoped delivery, Requirement: Single documented live-update mechanism (+18 more)

### Community 63 - "Frontend Project Configuration and Best Practices"
Cohesion: 0.07
Nodes (26): Accessibility, API Efficiency, Bootstrap Integration, Bundle Optimization, Code Quality, Component Modernization, Component Optimization, Configuration Standards (+18 more)

### Community 64 - "readme.md"
Cohesion: 0.07
Nodes (26): **0.1. Tu nombre completo:**, **0.2. Nombre del proyecto:**, **0.3. Descripción breve del proyecto:**, **0.4. URL del proyecto:**, 0.5. URL o archivo comprimido del repositorio, 0. Ficha del proyecto, **1.1. Objetivo:**, **1.2. Características y funcionalidades principales:** (+18 more)

### Community 65 - "Requirement: A failed voice-over can be retried by command"
Cohesion: 0.07
Nodes (29): ADDED Requirements, Requirement: A failed voice-over can be retried by command, Requirement: A retry deletes nothing, Requirement: A retry opens a new cycle through the launch gate, Requirement: An accepted retry shows the voice-over in progress, Requirement: The page offers the retry on a failed voice-over phase, Requirement: The retry uses the same script, Requirement: The retry uses the session's bound voice provider (+21 more)

### Community 66 - "telemetry.test.ts"
Cohesion: 0.11
Nodes (26): getTelemetrySettings(), saveTelemetryConsent(), initTelemetry(), flushTelemetry(), resetTelemetryForTest(), setConsent(), setTelemetryLogger(), shutdownTelemetry() (+18 more)

### Community 67 - "ADDED Requirements"
Cohesion: 0.08
Nodes (25): ADDED Requirements, Live updates foundation, Requirement: A defined event payload, Requirement: An idle connection stays alive or reconnects transparently, Requirement: An open page reaches current state after a disconnection, Requirement: Recorded evidence before implementation, Requirement: Session-scoped delivery, Requirement: Single documented live-update mechanism (+17 more)

### Community 68 - "survey.ts"
Cohesion: 0.10
Nodes (10): CLIPS, ClipSpec, IMAGE_TEXTS, rhHeaders, rhKey, alignmentProvider, measurePauses(), PauseRecord (+2 more)

### Community 69 - "ADDED Requirements"
Cohesion: 0.08
Nodes (25): ADDED Requirements, assembly-failure-recovery, Requirement: A failed assembly can be retried by command, Requirement: A failed assembly is recorded on the session, Requirement: A failed assembly keeps everything generated, Requirement: A retry opens a new cycle; pause holds assembly until continue, Requirement: An accepted retry shows the final video in progress, Requirement: An assembly retry uses only the components already generated (+17 more)

### Community 70 - "Requirements"
Cohesion: 0.07
Nodes (29): final-video-assembly Specification, Purpose, Requirement: A successful assembly completes the session and makes the video downloadable, Requirement: An assembly failure preserves every successful component, Requirement: Assembly diagnostics are recorded without exposing credentials, Requirement: Assembly launches only when every scene is complete, Requirement: Clips are ordered by ascending scene identifier, Requirement: Each clip is placed at its chunk's persisted narration interval (+21 more)

### Community 71 - "Requirements"
Cohesion: 0.07
Nodes (29): Purpose, Requirement: A failed phase shows its error and its applicable actions, Requirement: A retried phase shows its in-progress state, Requirement: Held work is reported per phase, Requirement: The page reflects phase changes without reloading, Requirement: The session page shows one section per phase, Requirement: The session read lists the four phases in pipeline order, Requirements (+21 more)

### Community 72 - "Requirements"
Cohesion: 0.04
Nodes (46): Purpose, Requirement: A pause holds every launch not yet sent, Requirement: A pause never reverts or removes work, Requirement: Continue launches every held generation, phase and retry once, Requirement: Every launcher is held by the gate, and gaps are visible, Requirement: Held work is distinguished from running work, Requirement: Pause and continue are idempotent, session-scoped and allowed in any state, Requirement: Requests already sent finish and their results are kept (+38 more)

### Community 73 - "ADDED Requirements"
Cohesion: 0.07
Nodes (28): ADDED Requirements, Final video assembly, Requirement: A successful assembly completes the session and makes the video downloadable, Requirement: An assembly failure preserves every successful component, Requirement: Assembly diagnostics are recorded without exposing credentials, Requirement: Assembly launches only when every scene is complete, Requirement: Clips are ordered by ascending scene identifier, Requirement: Each clip is placed at its chunk's persisted narration interval (+20 more)

### Community 74 - "Requirement: The representation reports running work separately from held work"
Cohesion: 0.08
Nodes (25): paused-session-display Specification, Purpose, Requirement: A generation still in progress during a pause is shown as in progress, Requirement: A pause is shown as neither success nor failure, Requirement: A paused session shows its state and progress with a marker that waits for the User, Requirement: Continue is available whenever the session is paused, Requirement: The representation reports running work separately from held work, Requirements (+17 more)

### Community 75 - "Step 9 — Manual endpoint testing with curl (retry-decomposition, JOS-156)"
Cohesion: 0.33
Nodes (5): Cleanup, Observations, Results, Setup, Step 9 — Manual endpoint testing with curl (retry-decomposition, JOS-156)

### Community 76 - "backend/src/concurrency.ts"
Cohesion: 0.06
Nodes (42): acquire(), configuredLimits(), holders, holdersOf(), limits, queues, release(), resetAll() (+34 more)

### Community 77 - "ADDED Requirements"
Cohesion: 0.07
Nodes (28): ADDED Requirements, Requirement: A failed phase shows its error and its applicable actions, Requirement: A retried phase shows its in-progress state, Requirement: Held work is reported per phase, Requirement: The page reflects phase changes without reloading, Requirement: The session page shows one section per phase, Requirement: The session read lists the four phases in pipeline order, Scenario: A completed narration awaiting decomposition (+20 more)

### Community 78 - "Requirement: The script, title and language cannot be modified after registration"
Cohesion: 0.08
Nodes (24): content-lock Specification, Purpose, Requirement: A completed narration is never replaced, Requirement: A retry after a failed voice attempt is allowed, Requirement: No API operation modifies the locked content, Requirement: The script, title and language cannot be modified after registration, Requirement: Voice generation does not launch for a completed narration, Requirements (+16 more)

### Community 79 - "Requirements"
Cohesion: 0.08
Nodes (24): Purpose, Requirement: A silence threshold is stated, Requirement: One recorded rule allocates every silence, Requirement: Segmentation and narration intervals share one boundary computation, Requirement: The adopted rule keeps the bounds and the speed-factor limit, Requirement: The intervals partition the voice-over, Requirement: The PRD records the decision, Requirement: The rule is chosen from compared, human-judged evidence (+16 more)

### Community 80 - "Requirements"
Cohesion: 0.08
Nodes (24): Purpose, Requirement: A late result is accepted once, or discarded, Requirement: A scene-level image request is limited at the provider call, Requirement: A stage without a defined maximum time is not timed, Requirement: An attempt that exceeds the maximum time is a transient failure, Requirement: The clock survives a restart, Requirement: The execution clock starts when the attempt is sent, Requirements (+16 more)

### Community 81 - "Requirement: The script, title and language cannot be modified after registration"
Cohesion: 0.08
Nodes (23): ADDED Requirements, Content lock, Requirement: A completed narration is never replaced, Requirement: A retry after a failed voice attempt is allowed, Requirement: No API operation modifies the locked content, Requirement: The script, title and language cannot be modified after registration, Requirement: Voice generation does not launch for a completed narration, Scenario: A later phase failed after the narration completed (+15 more)

### Community 82 - "ADDED Requirements"
Cohesion: 0.08
Nodes (23): ADDED Requirements, Requirement: A silence threshold is stated, Requirement: One recorded rule allocates every silence, Requirement: Segmentation and narration intervals share one boundary computation, Requirement: The adopted rule keeps the bounds and the speed-factor limit, Requirement: The intervals partition the voice-over, Requirement: The PRD records the decision, Requirement: The rule is chosen from compared, human-judged evidence (+15 more)

### Community 83 - "ADDED Requirements"
Cohesion: 0.08
Nodes (23): ADDED Requirements, Requirement: A late result is accepted once, or discarded, Requirement: A scene-level image request is limited at the provider call, Requirement: A stage without a defined maximum time is not timed, Requirement: An attempt that exceeds the maximum time is a transient failure, Requirement: The clock survives a restart, Requirement: The execution clock starts when the attempt is sent, Scenario: A late failure arrives (+15 more)

### Community 84 - "ADDED Requirements"
Cohesion: 0.08
Nodes (23): ADDED Requirements, Requirement: A generation still in progress during a pause is shown as in progress, Requirement: A pause is shown as neither success nor failure, Requirement: A paused session shows its state and progress with a marker that waits for the User, Requirement: Continue is available whenever the session is paused, Requirement: The representation reports running work separately from held work, Scenario: A failed session that is paused, Scenario: A held scene is styled as waiting (+15 more)

### Community 85 - "Audit Phases"
Cohesion: 0.09
Nodes (22): After Audit, Analysis Categories, Async/Promise Issues, Audit Phases, Before Starting, Code Auditing Skill, Dead Code, During Audit (+14 more)

### Community 86 - "Requirements"
Cohesion: 0.07
Nodes (28): Purpose, Requirement: A consulted session shows only its own data, Requirement: A session can be consulted by its identifier, Requirement: An unknown identifier is reported as not found, Requirement: Locally-only artefacts are not exposed, Requirement: No account or authentication is requested, Requirement: One read serves consultation and resynchronisation, Requirement: Scenes are presented in identifier order (+20 more)

### Community 87 - "ADDED Requirements"
Cohesion: 0.07
Nodes (27): ADDED Requirements, Requirement: A consulted session shows only its own data, Requirement: A session can be consulted by its identifier, Requirement: An unknown identifier is reported as not found, Requirement: Locally-only artefacts are not exposed, Requirement: No account or authentication is requested, Requirement: One read serves consultation and resynchronisation, Requirement: Scenes are presented in identifier order (+19 more)

### Community 88 - "Requirements"
Cohesion: 0.07
Nodes (26): chunk-image-generation Specification, Purpose, Requirement: A successful generation completes the image stage, Requirement: A temporary link is stored locally before the stage succeeds, Requirement: Each chunk's image stage progresses independently, Requirement: Image generation is scoped to its own session, Requirement: Image generation launches automatically for a submitted chunk, Requirement: Only a horizontal 16:9 image of at least 1920×1080 is accepted (+18 more)

### Community 89 - "Tasks — Generate the full voice-over"
Cohesion: 0.11
Nodes (17): DerivedSessionState, assertSessionTransition(), canTransitionSession(), InvalidSessionTransitionError, SessionState, ALL_SESSION_STATES, ALLOWED, 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP) (+9 more)

### Community 90 - "Redesign the frontend visual design ("Studio" direction)"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Redesign the frontend visual design ("Studio" direction), What Changes, Why

### Community 91 - "prototype/test/components.test.tsx"
Cohesion: 0.18
Nodes (16): Props, Props, SceneList(), Props, SceneRow(), Props, SessionHeader(), SCENE_STATE_TO_CLASS (+8 more)

### Community 92 - "Requirements"
Cohesion: 0.07
Nodes (26): provider-configuration-foundation Specification, Purpose, Requirement: A complete and internally consistent parameter set, Requirement: A language is supported only where the whole chain supports it, Requirement: A recorded not-retryable failure signal per provider, Requirement: Credentials never enter the repository, Requirement: One recorded provider per stage, verified against its capability, Requirement: The timestamp mechanism is established before decomposition is built (+18 more)

### Community 93 - "Requirements"
Cohesion: 0.09
Nodes (22): image-failure-recovery Specification, Purpose, Requirement: A correction changes only `IMAGE`, Requirement: A failed image can be retried with the same instruction and provider, Requirement: No image action once the image succeeded, Requirement: Scene commands act only within their session, Requirement: The page shows and edits the `IMAGE` instruction, Requirements (+14 more)

### Community 94 - "Requirement: The intervals partition the voice-over"
Cohesion: 0.09
Nodes (22): narration-intervals Specification, Purpose, Requirement: Intervals come from the shared boundary rule, Requirement: The interval is immutable, Requirement: The interval is readable, Requirement: The interval is stored with the chunk, Requirement: The intervals partition the voice-over, Requirements (+14 more)

### Community 95 - "Requirement: Each phase reports provider and attempts of its session-level stages"
Cohesion: 0.09
Nodes (22): Purpose, Requirement: Diagnostics expose no credentials or confidential data, Requirement: Each phase reports provider and attempts of its session-level stages, Requirement: Each scene reports provider and attempts per stage, Requirement: The page shows diagnostics where the User looks, Requirements, Scenario: A scene that has not started, Scenario: A stage that has not run (+14 more)

### Community 96 - "Audit Phases"
Cohesion: 0.09
Nodes (22): After Audit, Analysis Categories, Async/Promise Issues, Audit Phases, Before Starting, Code Auditing Skill, Dead Code, During Audit (+14 more)

### Community 97 - "Requirements"
Cohesion: 0.07
Nodes (26): Purpose, Requirement: A language from the supported list is required, Requirement: A session is registered from a title, a script and a language, Requirement: An empty title or script starts nothing, Requirement: No product limit on script length, Requirement: The session records what its project folder name derives from, Requirement: The title, script and language cannot change after registration, Requirement: The User receives the identifier needed to return to the session (+18 more)

### Community 98 - "Tasks — Split a sentence at clause boundaries (JOS-141)"
Cohesion: 0.18
Nodes (10): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Close out, 2. Clause boundaries (TDD) — Decisions 1 and 4, 4. Grouping with splits (TDD) — AC1 to AC5, 5. Review and Update Existing Unit Tests (MANDATORY), 6. Run Unit Tests and Verify Database State (MANDATORY), 7. Manual Testing (MANDATORY - AGENT MUST EXECUTE), 8. E2E Testing (MANDATORY if applicable - AGENT MUST EXECUTE) (+2 more)

### Community 99 - "ADDED Requirements"
Cohesion: 0.09
Nodes (21): ADDED Requirements, Clause splitting, Requirement: A sentence over the maximum is split at clause boundaries, Requirement: A sentence without clause boundaries is kept whole, Requirement: A short clause piece follows the short-sentence rule, Requirement: A short sentence borrows the next sentence's first clause, Requirement: Clause boundaries are found by a fixed rule, Requirement: No other sentence is split (+13 more)

### Community 100 - "Requirement: The intervals partition the voice-over"
Cohesion: 0.09
Nodes (21): ADDED Requirements, Narration intervals, Requirement: Intervals come from the shared boundary rule, Requirement: The interval is immutable, Requirement: The interval is readable, Requirement: The interval is stored with the chunk, Requirement: The intervals partition the voice-over, Scenario: A gap between intervals is refused (+13 more)

### Community 101 - "Requirement: Each phase reports provider and attempts of its session-level stages"
Cohesion: 0.09
Nodes (21): ADDED Requirements, Requirement: Diagnostics expose no credentials or confidential data, Requirement: Each phase reports provider and attempts of its session-level stages, Requirement: Each scene reports provider and attempts per stage, Requirement: The page shows diagnostics where the User looks, Scenario: A scene that has not started, Scenario: A stage that has not run, Scenario: Assembly stage (+13 more)

### Community 102 - "ADDED Requirements"
Cohesion: 0.09
Nodes (21): ADDED Requirements, image-failure-recovery, Requirement: A correction changes only `IMAGE`, Requirement: A failed image can be retried with the same instruction and provider, Requirement: No image action once the image succeeded, Requirement: Scene commands act only within their session, Requirement: The page shows and edits the `IMAGE` instruction, Scenario: Blank instruction (+13 more)

### Community 103 - "ADDED Requirements"
Cohesion: 0.08
Nodes (25): ADDED Requirements, Provider configuration foundation, Requirement: A complete and internally consistent parameter set, Requirement: A language is supported only where the whole chain supports it, Requirement: A recorded not-retryable failure signal per provider, Requirement: Credentials never enter the repository, Requirement: One recorded provider per stage, verified against its capability, Requirement: The timestamp mechanism is established before decomposition is built (+17 more)

### Community 104 - "Requirement: Repeated confirmations rejected by the store"
Cohesion: 0.09
Nodes (21): Persistence foundation, Purpose, Requirement: Documented data model for this product, Requirement: File references bound to the owning project folder, Requirement: Provider requests recorded before they are sent, Requirement: Repeated confirmations rejected by the store, Requirement: Verification process reconciled with the chosen store, Requirements (+13 more)

### Community 105 - "Tasks — Download the final video (JOS-164, US-32)"
Cohesion: 0.07
Nodes (26): binaryFileSwaggerTransform(), downloadFinalVideoUrl(), Context, Design — Download the final video, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs (+18 more)

### Community 106 - "Design — Obtain narration timestamps for the script (JOS-139)"
Cohesion: 0.29
Nodes (6): Context, Design — Obtain narration timestamps for the script (JOS-139), Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 107 - "ADDED Requirements"
Cohesion: 0.10
Nodes (20): ADDED Requirements, Narration timestamps, Requirement: A retry after unusable native timestamps goes straight to alignment, Requirement: Failing to obtain timestamps is a decomposition failure, Requirement: Forced alignment is used when native timestamps are missing or unusable, Requirement: Obtained timestamps are stored once and never replaced, Requirement: Obtaining timestamps starts the decomposition phase, Requirement: Usable native timestamps are used (+12 more)

### Community 108 - "ADDED Requirements"
Cohesion: 0.08
Nodes (25): ADDED Requirements, Chunk image generation, Requirement: A successful generation completes the image stage, Requirement: A temporary link is stored locally before the stage succeeds, Requirement: Each chunk's image stage progresses independently, Requirement: Image generation is scoped to its own session, Requirement: Image generation launches automatically for a submitted chunk, Requirement: Only a horizontal 16:9 image of at least 1920×1080 is accepted (+17 more)

### Community 109 - "obtainNarrationTimestamps"
Cohesion: 0.04
Nodes (73): AlignmentProvider, AlignmentResult, createElevenLabsAlignmentProvider(), clearRunFailure(), getVoiceOver(), insertNarrationTimestamps(), resolveArtefactPath(), rowToVoiceOver() (+65 more)

### Community 110 - "Testing Standards"
Cohesion: 0.10
Nodes (21): Async Testing, Code Quality Standards, Common Anti-Patterns to Avoid, Controller Testing Specifics, Database Testing, Documentation, Error Testing, Example Test Structure (+13 more)

### Community 111 - "ADDED Requirements"
Cohesion: 0.08
Nodes (25): ADDED Requirements, Requirement: A language from the supported list is required, Requirement: A session is registered from a title, a script and a language, Requirement: An empty title or script starts nothing, Requirement: No product limit on script length, Requirement: The session records what its project folder name derives from, Requirement: The title, script and language cannot change after registration, Requirement: The User receives the identifier needed to return to the session (+17 more)

### Community 112 - "Requirements"
Cohesion: 0.05
Nodes (38): clip-duration-request Specification, Purpose, Requirement: A factor exceeding the acceptable limit records a warning, not a failure, Requirement: An interval over the maximum requests the maximum with a warning, Requirement: The requested duration is readable, Requirement: The requested duration is stored with the chunk and never changes, Requirement: The requested duration is the admitted duration needing the smallest speed change, Requirement: The requested duration stays within the admitted range (+30 more)

### Community 113 - "project-files-ac-pinning.test.ts"
Cohesion: 0.12
Nodes (24): commitSceneResult(), markImageComplete(), setFinalVideoPath(), completeImageStage(), completeVideoStage(), deliverClipSuccessForTests(), deliverImageSuccessForTests(), ACCEPTED_PNG (+16 more)

### Community 114 - "Ignore repeated success confirmations"
Cohesion: 0.29
Nodes (6): Capabilities, Ignore repeated success confirmations, Modified Capabilities, New Capabilities, What Changes, Why

### Community 115 - "Backend Project Standards and Best Practices"
Cohesion: 0.09
Nodes (22): API and OpenAPI Conventions, Architecture, Backend Project Standards and Best Practices, Coding Standards, Development Workflow, End-to-End Testing, Error Handling, Live Updates (+14 more)

### Community 116 - "skeleton/src/server.ts"
Cohesion: 0.11
Nodes (7): inFlightCounts, limits, queues, app, PORT, STAGE_CONCURRENCY_LIMIT, summary

### Community 117 - "prototype/src/App.tsx"
Cohesion: 0.17
Nodes (13): API_BASE, continueSession(), correctScene(), createSession(), pauseSession(), retryScene(), App(), sessionIdFromUrl() (+5 more)

### Community 118 - "ADDED Requirements"
Cohesion: 0.11
Nodes (18): ADDED Requirements, Media assembly foundation, Requirement: Committed fixture for assembly tests, Requirement: Duration accuracy held per clip and across a session, Requirement: Measured speed-factor threshold, Requirement: Mismatched sources normalised before joining, Requirement: Single documented assembly pipeline, Requirement: Voice-over is the only audio and is never retimed (+10 more)

### Community 119 - "ADDED Requirements"
Cohesion: 0.11
Nodes (18): ADDED Requirements, Clip duration request, Requirement: An interval over the maximum requests the maximum with a warning, Requirement: The requested duration is readable, Requirement: The requested duration is stored with the chunk and never changes, Requirement: The requested duration is the admitted duration needing the smallest speed change, Requirement: The requested duration stays within the admitted range, Scenario: A different admitted set later (+10 more)

### Community 120 - "Requirement: An invalid decomposition is a decomposition failure"
Cohesion: 0.08
Nodes (25): Purpose, Requirement: An invalid decomposition is a decomposition failure, Requirement: Chunks are numbered 1 to N in fragment order, Requirement: Established chunks cannot be split, merged, deleted or reordered, Requirement: Every chunk carries its four content fields, Requirement: Registered chunks start in submitted and the session in chunks-processing, Requirements, Scenario: A chunk is deleted directly in the store (+17 more)

### Community 121 - "Requirements"
Cohesion: 0.10
Nodes (19): Frontend foundation, Purpose, Requirement: A UI an agent can drive, Requirement: An open page recovers from a lost connection, Requirement: Editing surface derived from stage state, Requirement: Recorded evidence that the scene list holds at scale, Requirement: Single documented frontend stack, Requirements (+11 more)

### Community 122 - "Requirement: Voice-over is the only audio and is never retimed"
Cohesion: 0.08
Nodes (23): media-assembly-foundation Specification, Purpose, Requirement: Committed fixture for assembly tests, Requirement: Duration accuracy held per clip and across a session, Requirement: Measured speed-factor threshold, Requirement: Mismatched sources normalised before joining, Requirement: Single documented assembly pipeline, Requirement: Voice-over is the only audio and is never retimed (+15 more)

### Community 123 - "Requirement: Every released slot has a matching slot that was taken"
Cohesion: 0.10
Nodes (20): Purpose, Requirement: A scene takes at most one slot or queue place per stage, Requirement: Every released slot has a matching slot that was taken, Requirement: Requests in flight at restart count against the cap, Requirement: Waiting scene work resumes at boot, Requirements, restart-safe-concurrency Specification, Scenario: A launch for a scene that already holds a slot (+12 more)

### Community 124 - "getStageAttempts"
Cohesion: 0.06
Nodes (64): getInFlightAttempts(), getStageAttempt(), getStageAttempts(), inTransaction(), rowToStageAttempt(), timeOutAttempt(), attemptDeadline(), hasExpired() (+56 more)

### Community 125 - "Tasks — Bounded retry policy for provider stages"
Cohesion: 0.05
Nodes (40): stageInstanceKey(), 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Close out, 1. Gate: Confirm the foundations and the values, 2. Domain: deadlines (TDD), 3. Persistence: outcomes (TDD), 4. Application: the watcher and late results (TDD), 6. Run Unit Tests and Verify Database State (MANDATORY) (+32 more)

### Community 126 - "Tasks — Generate the clip of each scene (JOS-146)"
Cohesion: 0.06
Nodes (30): VideoProvider, Capabilities, Fix the RunningHub video adapter, Impact, Modified Capabilities, New Capabilities, What Changes, Why (+22 more)

### Community 127 - "Requirement: An invalid decomposition is a decomposition failure"
Cohesion: 0.08
Nodes (24): ADDED Requirements, Requirement: An invalid decomposition is a decomposition failure, Requirement: Chunks are numbered 1 to N in fragment order, Requirement: Established chunks cannot be split, merged, deleted or reordered, Requirement: Every chunk carries its four content fields, Requirement: Registered chunks start in submitted and the session in chunks-processing, Scenario: A chunk is deleted directly in the store, Scenario: A chunk's number or prompt is changed directly in the store (+16 more)

### Community 128 - "downloadSceneUrl"
Cohesion: 0.11
Nodes (16): downloadSceneUrl(), Context, Decisions, Design — View per-scene status and results, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs (+8 more)

### Community 129 - "ADDED Requirements"
Cohesion: 0.11
Nodes (17): ADDED Requirements, Frontend foundation, Requirement: A UI an agent can drive, Requirement: An open page recovers from a lost connection, Requirement: Editing surface derived from stage state, Requirement: Recorded evidence that the scene list holds at scale, Requirement: Single documented frontend stack, Scenario: A behaviour could not be proven within the timebox (+9 more)

### Community 130 - "MODIFIED Requirements"
Cohesion: 0.08
Nodes (25): ADDED Requirements, MODIFIED Requirements, Requirement: Layout adapts to the window width, Requirement: Motion respects user preferences, Requirement: One documented visual design token set, Requirement: Status is never color-only, Requirement: Styling does not regress the accessibility contract, Requirement: Sufficient text contrast on the chosen background (+17 more)

### Community 131 - "Requirements"
Cohesion: 0.08
Nodes (24): Purpose, Requirement: A failed session identifies its failed scenes, Requirement: Assembly may start only when every scene is complete, Requirement: Final video only exists once its file exists, Requirement: Successful results stay available after a failure, Requirement: The session stays in scene processing while any scene is still generating, Requirement: The session transition table records the gate, Requirements (+16 more)

### Community 132 - "Backend Project Standards and Best Practices"
Cohesion: 0.11
Nodes (18): Architecture Overview, Async/Await Patterns, AWS Lambda Configuration, Backend Project Standards and Best Practices, Code Quality, Database Query Optimization, Development Scripts, Development Workflow (+10 more)

### Community 133 - "Model Descriptions"
Cohesion: 0.11
Nodes (17): 10. Position, 11. Application, 12. Interview, 1. Candidate, 2. Education, 3. WorkExperience, 4. Resume, 5. Company (+9 more)

### Community 134 - "Testing CLAUDE.md Skills Documentation"
Cohesion: 0.12
Nodes (16): Documentation Variants to Test, Expected Results, Next Steps, NULL (Baseline - no skills doc), Scenario 1: Time Pressure + Confidence, Scenario 2: Sunk Cost + Works Already, Scenario 3: Authority + Speed Bias, Scenario 4: Familiarity + Efficiency (+8 more)

### Community 135 - "Step 9 — Unit test and DB verification (JOS-159, retry-final-assembly)"
Cohesion: 0.33
Nodes (5): AC → test mapping, Database state, spec.md scenario → test mapping, Step 9 — Unit test and DB verification (JOS-159, retry-final-assembly), Test runs

### Community 136 - "Requirements"
Cohesion: 0.08
Nodes (24): Purpose, Requirement: Each scene's pause is derived from locked data, Requirement: Pause edits are stored per scene and reset to the original, Requirement: Rebuilding applies the edits in a new final-video version, Requirement: The pause range keeps the scene's clip within the speed-factor limit, Requirement: The session read and the page expose the dial, Requirements, Scenario: A comfortable scene (+16 more)

### Community 137 - "getRun"
Cohesion: 0.06
Nodes (66): AssemblyRetryResult, retryAssembly(), SUPPORTED_LANGUAGES, beginAssemblyRetry(), createRun(), getRun(), insertVoiceOver(), TelemetrySettings (+58 more)

### Community 138 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module, moduleResolution (+8 more)

### Community 139 - "prototype/src/api/useLiveSession.ts"
Cohesion: 0.19
Nodes (8): eventsUrl(), fetchSnapshot(), LiveUpdatesLogEntry, record(), useLiveSession(), Window, SessionSnapshot, FakeEventSource

### Community 140 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module, moduleResolution (+8 more)

### Community 141 - "Tasks — Define the live progress update mechanism"
Cohesion: 0.12
Nodes (16): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE), 11. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE), 12. Record the decision, 13. Update Technical Documentation (MANDATORY), 14. Close out, 1. Gate: Collect the inputs this decision depends on, 2. Settle the direction of flow before comparing transports (+8 more)

### Community 142 - "ADDED Requirements"
Cohesion: 0.12
Nodes (16): ADDED Requirements, Persistence foundation, Requirement: Documented data model for this product, Requirement: File references bound to the owning project folder, Requirement: Provider requests recorded before they are sent, Requirement: Repeated confirmations rejected by the store, Requirement: Verification process reconciled with the chosen store, Scenario: A project folder is renamed in place (+8 more)

### Community 143 - "ADDED Requirements"
Cohesion: 0.12
Nodes (16): ADDED Requirements, Requirement: A scene takes at most one slot or queue place per stage, Requirement: Every released slot has a matching slot that was taken, Requirement: Requests in flight at restart count against the cap, Requirement: Waiting scene work resumes at boot, Scenario: A launch for a scene that already holds a slot, Scenario: A release by a scene that holds no slot, Scenario: A request recorded as failed at boot holds no slot (+8 more)

### Community 144 - "Requirements"
Cohesion: 0.08
Nodes (23): pipeline-handoffs Specification, Purpose, Requirement: A paused session waits for continue before decomposition, Requirement: A session created through the API reaches its final video, Requirement: A session is handed to decomposition at most once, Requirement: Decomposition starts when the narration is stored, Requirement: Decomposition that never started resumes at restart, Requirement: The running application assembles with the real tool by default (+15 more)

### Community 145 - "ADDED Requirements"
Cohesion: 0.09
Nodes (22): ADDED Requirements, Requirement: Each scene's pause is derived from locked data, Requirement: Pause edits are stored per scene and reset to the original, Requirement: Rebuilding applies the edits in a new final-video version, Requirement: The pause range keeps the scene's clip within the speed-factor limit, Requirement: The session read and the page expose the dial, Scenario: A comfortable scene, Scenario: A failed rebuild (+14 more)

### Community 146 - "Requirements"
Cohesion: 0.09
Nodes (22): Purpose, Requirement: A failed scene shows its error, affected stage and only the actions for that stage, Requirement: A scene's stored image is served read-only, scoped to its session, Requirement: Scene details show the available results, Requirement: Scenes are listed in ascending order with their live state, Requirement: The session read points at a scene's viewable results, Requirements, Scenario: A scene of another session (+14 more)

### Community 147 - "ADDED Requirements"
Cohesion: 0.09
Nodes (22): ADDED Requirements, Requirement: A failed session identifies its failed scenes, Requirement: Assembly may start only when every scene is complete, Requirement: Final video only exists once its file exists, Requirement: Successful results stay available after a failure, Requirement: The session stays in scene processing while any scene is still generating, Requirement: The session transition table records the gate, Scenario: A completed sibling of a failed scene (+14 more)

### Community 148 - "Testing CLAUDE.md Skills Documentation"
Cohesion: 0.12
Nodes (16): Documentation Variants to Test, Expected Results, Next Steps, NULL (Baseline - no skills doc), Scenario 1: Time Pressure + Confidence, Scenario 2: Sunk Cost + Works Already, Scenario 3: Authority + Speed Bias, Scenario 4: Familiarity + Efficiency (+8 more)

### Community 149 - "Process and rules"
Cohesion: 0.12
Nodes (15): 0. Description-only / no-git mode (check first), 1. Inspect current state, 2. Resolve scope: full commit vs feature-scoped commit, 3. Commit message, 4. Commit and push, 5. Pull Request, 6. Summary for the user, Arguments (+7 more)

### Community 150 - "Persuasion Principles for Skill Design"
Cohesion: 0.12
Nodes (15): 1. Authority, 2. Commitment, 3. Scarcity, 4. Social Proof, 5. Unity, 6. Reciprocity, 7. Liking, Ethical Use (+7 more)

### Community 151 - "Writing Skills"
Cohesion: 0.12
Nodes (15): Code Examples, Common Rationalizations for Skipping Testing, Directory Structure, Discovery Workflow, Flowchart Usage, Overview, Skill Creation Checklist (TDD Adapted), SKILL.md Structure (+7 more)

### Community 152 - "scenePause.ts"
Cohesion: 0.10
Nodes (33): NarrationEdit, getFinalVideoBuilds(), getScenePauseEdits(), findIntervalPartitionProblem(), finalVideoStatus(), derivePauses(), isAllowedPause(), isWhitespace() (+25 more)

### Community 153 - "Tasks — Start a video project from a title, a script, and its language"
Cohesion: 0.12
Nodes (15): nonEmptyAfterTrim(), 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE), 11. Update Technical Documentation (MANDATORY), 12. Close out, 1. Gate: Confirm the foundations this story stands on, 2. Backend: validation tests first (TDD), 3. Backend: implement registration (+7 more)

### Community 154 - "Decisions"
Cohesion: 0.09
Nodes (20): download(), 1. Depth and motion are pure CSS, not an animation library, 2. Theme follows `prefers-color-scheme`; no toggle, 3. Plain-language labels come from one new mapping: `src/statusLabels.ts`, 5. Scenes are a grid of cards; details expand the card across the row, 6. Icons are a tiny local component, not a library, 7. Typography and spacing tokens, 8. Contrast is verified by computation, both themes (+12 more)

### Community 155 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, noEmit (+7 more)

### Community 156 - "Requirement: Waiting is neither a failed attempt nor execution time"
Cohesion: 0.09
Nodes (22): provider-request-limit Specification, Purpose, Requirement: Every provider-calling stage has a hardcoded cap, Requirement: No more than the cap is sent at once, across all sessions, Requirement: Waiting is neither a failed attempt nor execution time, Requirement: Waiting requests are sent first come, first served, Requirement: Waiting work is never shown as failed, Requirements (+14 more)

### Community 157 - "ADDED Requirements"
Cohesion: 0.09
Nodes (21): ADDED Requirements, Requirement: A paused session waits for continue before decomposition, Requirement: A session created through the API reaches its final video, Requirement: A session is handed to decomposition at most once, Requirement: Decomposition starts when the narration is stored, Requirement: Decomposition that never started resumes at restart, Requirement: The running application assembles with the real tool by default, Scenario: A late voice-over result is accepted (+13 more)

### Community 158 - "ADDED Requirements"
Cohesion: 0.10
Nodes (20): ADDED Requirements, Requirement: Every provider-calling stage has a hardcoded cap, Requirement: No more than the cap is sent at once, across all sessions, Requirement: Waiting is neither a failed attempt nor execution time, Requirement: Waiting requests are sent first come, first served, Requirement: Waiting work is never shown as failed, Scenario: A due retry waits its turn, Scenario: A long wait does not time out (+12 more)

### Community 159 - "frontend/src/types.ts"
Cohesion: 0.08
Nodes (42): GLYPH, Icon(), IconName, Props, PhaseStepper(), Props, Props, SessionHeader() (+34 more)

### Community 160 - "Process and rules"
Cohesion: 0.12
Nodes (15): 0. Description-only / no-git mode (check first), 1. Inspect current state, 2. Resolve scope: full commit vs feature-scoped commit, 3. Commit message, 4. Commit and push, 5. Pull Request, 6. Summary for the user, Arguments (+7 more)

### Community 161 - "Persuasion Principles for Skill Design"
Cohesion: 0.12
Nodes (15): 1. Authority, 2. Commitment, 3. Scarcity, 4. Social Proof, 5. Unity, 6. Reciprocity, 7. Liking, Ethical Use (+7 more)

### Community 162 - "Writing Skills"
Cohesion: 0.12
Nodes (15): Code Examples, Common Rationalizations for Skipping Testing, Directory Structure, Discovery Workflow, Flowchart Usage, Overview, Skill Creation Checklist (TDD Adapted), SKILL.md Structure (+7 more)

### Community 163 - "insertRegisteredScenes"
Cohesion: 0.03
Nodes (64): intervalDurationSeconds(), insertRegisteredScenes(), RegisteredSceneInput, findFragmentProblem(), normaliseWhitespace(), SpeedFactorWarning, Context, Decisions (+56 more)

### Community 164 - "ADR 0005 — Provider selection and hardcoded operating parameters"
Cohesion: 0.13
Nodes (14): ADR 0005 — Provider selection and hardcoded operating parameters, Consequences, Context, Decision, Decision 1 — Video provider capability and derived duration bounds, Decision 2 — Voice/alignment timestamp mechanism (§11.1), Decision 3 — Reasoning/decomposition fidelity requires an explicit prompt instruction, Decision 4 — Supported language list (+6 more)

### Community 165 - "ADR 0005 — Video and audio assembly tooling"
Cohesion: 0.04
Nodes (42): ADR 0005 — Video and audio assembly tooling, Amendment to Decision 4b — 2026-10-15 (adjust-scene-pause, JOS-190), Consequences, Context, Cost (feeds US-22), Decision, Decision 1 — Retime video only; never touch the voice-over, Decision 2 — Discard each clip's audio at the input stage (+34 more)

### Community 166 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+6 more)

### Community 167 - "Tasks — Define the frontend stack"
Cohesion: 0.13
Nodes (14): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Record the decision, 11. Update Technical Documentation (MANDATORY), 12. Close out, 1. Gate: Collect the inputs this decision depends on, 2. Record the screen inventory from the PRD, 3. Evaluate candidates, 4. Build the prototype (+6 more)

### Community 168 - "Tasks — Define the video and audio assembly tooling"
Cohesion: 0.13
Nodes (14): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Update Technical Documentation (MANDATORY), 11. Commit the fixture, 12. Close out, 1. Establish the baseline, 2. Build the sample material, 3. Establish the command pipeline, 4. Run the experiments and record evidence (+6 more)

### Community 169 - "Tasks — Define persistence for sessions and project files"
Cohesion: 0.13
Nodes (14): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Record the decision, 11. Update Technical Documentation (MANDATORY), 12. Close out, 1. Gate: Collect the inputs this decision depends on, 2. Enumerate the record set from the PRD, 3. Choose the store, 4. Build the persistence layer on the existing harness (+6 more)

### Community 170 - "Tasks — Manually retry a failed decomposition (JOS-156, US-24)"
Cohesion: 0.14
Nodes (13): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE), 11. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 12. Update Technical Documentation (MANDATORY), 13. Close out, 3. Backend: retry service checks and step choice (TDD; design Decisions 1, 2 and 7), 4. Backend: the two steps and the voice-over (TDD; design Decision 4), 5. Backend: launcher, pause and derived state (TDD; design Decisions 5 and 6) (+5 more)

### Community 171 - "ADDED Requirements"
Cohesion: 0.10
Nodes (20): ADDED Requirements, Requirement: A factor exceeding the acceptable limit records a warning, not a failure, Requirement: The scene-details panel shows the requested duration and speed factor, Requirement: The speed-adjustment factor is derived from the requested duration and the narrated interval, Requirement: The speed-adjustment factor is readable, Requirement: The speed-adjustment factor is stored with the chunk and never changes, Scenario: A different acceptable limit later, Scenario: A scene's details are opened (+12 more)

### Community 172 - "Tasks — Define the hardcoded providers and parameter values"
Cohesion: 0.10
Nodes (19): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Write the constants into source, 11. Review and Update Existing Unit Tests (MANDATORY), 12. Run Unit Tests and Verify Database State (MANDATORY), 13. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE), 14. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 15. Record the decision, 16. Update Technical Documentation (MANDATORY) (+11 more)

### Community 173 - "Tasks — Name the downloaded final video after the project title (JOS-193)"
Cohesion: 0.13
Nodes (16): contentDisposition(), downloadFilename(), trimDotsAndSpaces(), RFC-5987, RFC-6266, 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 1. Gate, 2. Backend: the filename rule (TDD; design Decisions 1-3) (+8 more)

### Community 174 - "Requirements"
Cohesion: 0.07
Nodes (26): Purpose, Requirement: Layout adapts to the window width, Requirement: Motion respects user preferences, Requirement: One documented visual design token set, Requirement: Status is never color-only, Requirement: Styling does not regress the accessibility contract, Requirement: Sufficient text contrast on the chosen background, Requirements (+18 more)

### Community 175 - "sync-agent-symlinks Skill"
Cohesion: 0.14
Nodes (13): Add/Remove Scenarios, Command Patterns (Reference), Red Flags, Scenario A - New skill added in ai-specs, Scenario B - Skill removed from ai-specs, Scope and Safety Rules, Step 1 - Build inventories, Step 2 - Compute sync plan (+5 more)

### Community 176 - "clauseBoundaries.ts"
Cohesion: 0.19
Nodes (11): conjunctionsFor(), cutAtClauseBoundaries(), directlyAfterPunctuation(), ENGLISH_CONJUNCTIONS, findClauseBoundaries(), SPANISH_CONJUNCTIONS, Files, Results (+3 more)

### Community 177 - "ADDED Requirements"
Cohesion: 0.11
Nodes (18): ADDED Requirements, Requirement: Each segment carries its retiming and applied speed factor, Requirement: Frame counts are carried forward from the cumulative interval end, Requirement: Media tools are invoked without a shell, Requirement: The built track matches the plan within one frame, in the output shape, with no audio, Requirement: The plan orders scenes by ascending index, Requirement: The plan refuses inputs that break the assembly invariants, Scenario: A clip longer than its interval (+10 more)

### Community 178 - "Run it"
Cohesion: 0.13
Nodes (14): Branches and release channels, Development Guide, Development mode, Development-only switches, Local state, Packaged app (macOS), Prerequisites, Provider credentials (+6 more)

### Community 179 - "Tasks — Define the backend stack"
Cohesion: 0.14
Nodes (13): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Update Technical Documentation (MANDATORY), 11. Close out, 1. Gate: Resolve the binding constraints before any scoring, 2. Evaluate candidates, 3. Build the walking skeleton, 4. Run the experiments and record evidence, 5. Review and Update Existing Unit Tests (MANDATORY) (+5 more)

### Community 180 - "Design — Define the live progress update mechanism"
Cohesion: 0.14
Nodes (13): §1 — Inputs collected, §2 — Direction of flow (Decision 1, confirmed), §3 — Candidate evaluation, §4 — Contract (event payload shapes), §5 — Catch-up rule (confirmed: resync, not replay), Context, Decisions, Design — Define the live progress update mechanism (+5 more)

### Community 181 - "Step 8 Report — Manual Endpoint Testing with curl"
Cohesion: 0.14
Nodes (13): 8.1–8.2 — reachability and pre-test state, 8.3–8.4 — start a session, verify stored records, verify the read reflects storage, 8.5 — Experiment 5.3: duplicate success confirmation rejected, 8.6 — Experiment: retry appends a new attempt row rather than overwriting, 8.7 — Error cases, 8.8 — Cleanup and restoration, Experiment 5.1 — restart resumption, request identified by stage and provider, Experiment 5.2 — unrecoverable case, exactly one failed attempt (+5 more)

### Community 182 - "ADDED Requirements"
Cohesion: 0.14
Nodes (13): ADDED Requirements, Requirement: One documented visual design token set, Requirement: Status is never color-only, Requirement: Styling does not regress the accessibility contract, Requirement: Sufficient text contrast on the chosen background, Scenario: A component needs a status color, Scenario: A failed-state row is rendered, Scenario: A new component is added (+5 more)

### Community 183 - "Step 4 Report — Rendered Comparison and Threshold Sweep"
Cohesion: 0.14
Nodes (13): Files for the product owner (step 5), Method, Spend, Step 4 Report — Rendered Comparison and Threshold Sweep, Task 4.1 — the pick, Task 4.2 — assets generated, Task 4.3 — base comparison, Task 4.4 — threshold sweep (+5 more)

### Community 184 - "PhaseSection"
Cohesion: 0.05
Nodes (39): Accessible Naming Convention, PhaseSection(), describeStageDiagnostic(), formatStageDiagnostic(), phaseStatusClass(), 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 11. Update Technical Documentation (MANDATORY) (+31 more)

### Community 185 - "Requirement: Retry a failed clip without regenerating its image"
Cohesion: 0.11
Nodes (18): clip-failure-recovery Specification, Purpose, Requirement: Correct only `VIDEO` and retry the failed clip, Requirement: Offer clip recovery only for a failed video stage, Requirement: Retry a failed clip without regenerating its image, Requirements, Scenario: A concurrent correction loses safely, Scenario: Blank correction is refused (+10 more)

### Community 186 - "Decisions"
Cohesion: 0.11
Nodes (17): 10. Page, 1. A scene's pause is derived, never stored, 2. The allowed range per scene, 3. Storage: one mutable table, one write-once table, 4. Effective intervals are a pure function, 5. Editing the narration in the assembly tool, 6. The rebuild command, 7. State while a rebuild runs (+9 more)

### Community 187 - "compare.ts"
Cohesion: 0.08
Nodes (23): characters, clipIds, GROUPING, native, requestedDurations, sentences, spans, BoundaryRule (+15 more)

### Community 188 - "template/docs/base-standards.md"
Cohesion: 0.14
Nodes (11): 1. Core Principles, 2. Language Standards, 3. Specific standards, 4. Project Skills, 5. Symlink Integrity and Multi-Agent Portability, AI specs, Common Pitfalls and Anti-Patterns to be avoided by the AI, General rules (+3 more)

### Community 189 - "adversarial-review Skill"
Cohesion: 0.15
Nodes (12): adversarial-review Skill, Completion, Guardrails, Inputs, Mindset (adversarial review), Output format, Step 1 — Load the specification side first, Step 2 — Load the implementation side (+4 more)

### Community 190 - "Your objective"
Cohesion: 0.15
Nodes (12): 1. Skill gap and concept summary, 2. Alternatives to the solution, 3. Visual or mental model (when appropriate), 4. Quiz to validate learnings (interactive), Adaptive strategies, explain Skill, Handling the topic, Instructions (+4 more)

### Community 191 - "show-spec-working Skill"
Cohesion: 0.15
Nodes (12): API demo requirements, Browser MCP requirements, Completion contract, Inputs, Output format, show-spec-working Skill, Step 1.1 - Anti-report guardrail, Step 1 - Resolve target spec and scope (+4 more)

### Community 192 - "recordError"
Cohesion: 0.23
Nodes (16): reportProviderRequest(), reportStageAttempt(), getConsent(), getInstruments(), getProviders(), guarded(), normalizeOutcome(), recordError() (+8 more)

### Community 193 - "ADDED Requirements"
Cohesion: 0.10
Nodes (20): ADDED Requirements, Requirement: A failed scene shows its error, affected stage and only the actions for that stage, Requirement: A scene's stored image is served read-only, scoped to its session, Requirement: Scene details show the available results, Requirement: Scenes are listed in ascending order with their live state, Requirement: The session read points at a scene's viewable results, Scenario: A scene of another session, Scenario: A scene with a stored image (+12 more)

### Community 194 - "ADR 0003 — Live progress update mechanism"
Cohesion: 0.15
Nodes (12): ADR 0003 — Live progress update mechanism, Candidate Evaluation, Catch-up Rule, Justified, Consequences, Context, Contract (event payload shapes), Decision, Dependence on stand-ins — closed (+4 more)

### Community 195 - "Packaging"
Cohesion: 0.11
Nodes (17): Blockers for any useful build, Follow-up stories — JOS-194, L1 — A start-up function that works in a bundle and on Windows — PLAT, L2 — Per-user data folder and credentials file — DATA, CRED, L3 — Accept requests only from the app's own page (security) — LOCAL, L4 — One instance per user — ONE, L5 — Release builds are safe by construction — SAFE, L6 — Build the executables — PLAT (+9 more)

### Community 196 - "Design — Define the frontend stack"
Cohesion: 0.15
Nodes (12): §1 — Inputs collected, §2 — Screen inventory, §3 — Candidate evaluation, §5 — Experiments (2026-09-25), Context, Decisions, Design — Define the frontend stack, Execution Record (2026-09-25) (+4 more)

### Community 197 - "Requirement: Interrupted requests are awaited or recorded as failed attempts"
Cohesion: 0.08
Nodes (24): Purpose, Requirement: A restart never sends a unit of work twice, Requirement: A session reads the same after a restart, Requirement: Every stage declares its restart behaviour, Requirement: Interrupted requests are awaited or recorded as failed attempts, Requirement: Pending work continues after a restart, Requirements, restart-recovery Specification (+16 more)

### Community 198 - "updateCheck.ts"
Cohesion: 0.12
Nodes (18): BUILD, BuildChannel, BuildConfig, readBuildConfig(), checkForUpdate(), FetchLike, getUpdateResult(), NOT_AVAILABLE (+10 more)

### Community 199 - "Tasks — Define the production and UAT deployment"
Cohesion: 0.11
Nodes (17): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE), 11. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE), 12. Update Technical Documentation (MANDATORY), 13. Close the spike, 1. Gate: Collect the inputs and the product owner's answers, 2. Product: Draft the access change, 3. Evaluate the backend options (+9 more)

### Community 200 - "Requirement: A project's files are kept in its project folder"
Cohesion: 0.11
Nodes (17): project-files Specification, Purpose, Requirement: A project's files are kept in its project folder, Requirement: Project files never expire and are never deleted automatically, Requirement: Same-title projects never share a folder, Requirement: Temporary-link results are saved before the link expires, Requirements, Scenario: Clip delivered as a link (+9 more)

### Community 201 - "Requirements"
Cohesion: 0.11
Nodes (17): Purpose, Requirement: A scene's successful clip can be downloaded as soon as it exists, Requirement: A scene's successful image can be downloaded as soon as it exists, Requirement: Failed scenes do not block other scenes' downloads, Requirement: Narration, timestamps and generated texts are never offered for download, Requirement: The session read offers exactly the available scene downloads, Requirements, Scenario: Clip downloaded (+9 more)

### Community 202 - "Requirements"
Cohesion: 0.15
Nodes (12): Backend foundation, Purpose, Requirement: Provider credentials outside source control, Requirement: Recorded evidence for the hard runtime behaviours, Requirement: Single documented backend stack, Requirements, Scenario: A behaviour could not be proven within the timebox, Scenario: A required credential is absent at startup (+4 more)

### Community 203 - "specboot/package.json"
Cohesion: 0.15
Nodes (12): author, bin, lidr-specboot, description, engines, node, files, homepage (+4 more)

### Community 204 - "Your objective"
Cohesion: 0.15
Nodes (12): 1. Skill gap and concept summary, 2. Alternatives to the solution, 3. Visual or mental model (when appropriate), 4. Quiz to validate learnings (interactive), Adaptive strategies, explain Skill, Handling the topic, Instructions (+4 more)

### Community 205 - "🚀 Setup Instructions"
Cohesion: 0.15
Nodes (12): 1. Clone the Repository, 2. Environment Configuration, 3. Database Setup (PostgreSQL with Docker), 4. Backend Setup, 5. Frontend Setup, 6. Cypress Testing Suite Setup, Backend Testing, Development Guide (+4 more)

### Community 206 - "[Analysis Title]"
Cohesion: 0.17
Nodes (12): Advanced: Skills with executable code, [Analysis Title], Anti-patterns to avoid, Avoid offering too many options, Avoid Windows-style paths, Conditional workflow pattern, Examples pattern, Executive summary (+4 more)

### Community 207 - "ffmpegAssemblyTool.ts"
Cohesion: 0.14
Nodes (14): FFMPEG, FFPROBE, resolveTool(), AudioShape, buildMuxArguments(), buildNarrationFilter(), NarrationPart, probeVideoDuration() (+6 more)

### Community 208 - "ADR 0004 — Frontend framework and build tooling"
Cohesion: 0.17
Nodes (11): ADR 0004 — Frontend framework and build tooling, Candidate Evaluation, Consequences, Context, Decision, Dependence on stand-ins — closed, Evidence, Must-Pass Gates (+3 more)

### Community 209 - "Requirement: Interrupted requests are awaited or recorded as failed attempts"
Cohesion: 0.08
Nodes (23): ADDED Requirements, Requirement: A restart never sends a unit of work twice, Requirement: A session reads the same after a restart, Requirement: Every stage declares its restart behaviour, Requirement: Interrupted requests are awaited or recorded as failed attempts, Requirement: Pending work continues after a restart, restart-recovery, Scenario: Assembly attempt lost (+15 more)

### Community 210 - "Tasks — Pause the session and continue explicitly (JOS-152, US-20)"
Cohesion: 0.14
Nodes (13): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Run Unit Tests and Verify Database State (MANDATORY), 11. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE), 12. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 13. Update Technical Documentation (MANDATORY), 14. Close out, 4. Held work and the image launcher (TDD; design Decisions 3, 4, 5, 6), 5. Continue (TDD; design Decision 4) (+5 more)

### Community 211 - "build.mjs"
Cohesion: 0.17
Nodes (8): actual, assets, here, out, repo, seaConfig, tools, walk()

### Community 212 - "Design — Define the backend stack"
Cohesion: 0.17
Nodes (11): Candidate Evaluation (2026-09-25), Context, Decision, Decisions, Design — Define the backend stack, Goals / Non-Goals, Migration Plan, Must-pass gates (C1–C7, media invocation, single-command start) (+3 more)

### Community 213 - "Step 7 Report — Manual Endpoint Testing with curl"
Cohesion: 0.17
Nodes (11): 1. Health check and start-run (task 7.1–7.2), 2. Read-state endpoint (task 7.3), 3. Manual retry endpoint against a failed stage (task 7.4), 4. Error cases (task 7.5), 5. Experiment 4.1 — restart-safe resumption (live, PRD §12.1 / C6), 6. Experiment 4.2 — shared per-stage concurrency cap (live, PRD §10.1 / C3), 7. Experiment 4.3 — retry budget (live, PRD §10.1 / C2), 8. Experiment 4.5 — idempotent success confirmation (live, PRD §12.1 / C7) (+3 more)

### Community 214 - "ADDED Requirements"
Cohesion: 0.17
Nodes (11): ADDED Requirements, Backend foundation, Requirement: Provider credentials outside source control, Requirement: Recorded evidence for the hard runtime behaviours, Requirement: Single documented backend stack, Scenario: A behaviour could not be proven within the timebox, Scenario: A required credential is absent at startup, Scenario: An implementation story begins (+3 more)

### Community 215 - "Design — Define persistence for sessions and project files"
Cohesion: 0.17
Nodes (11): §1 — Inputs collected, §2 — Record derivation, §3 — Store evaluation, Context, Decisions, Design — Define persistence for sessions and project files, Execution Record (2026-09-25), Goals / Non-Goals (+3 more)

### Community 216 - "Tasks — Decompose the script into chunks with their visual instructions"
Cohesion: 0.12
Nodes (16): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Run Unit Tests and Verify Database State (MANDATORY), 11. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE), 12. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 13. Update Technical Documentation (MANDATORY), 14. Close out, 1. Gate: Confirm the foundations this phase stands on, 2. Domain: chunk and stage-instance model (TDD) (+8 more)

### Community 217 - "Step 7 — Manual Endpoint Testing with curl"
Cohesion: 0.15
Nodes (12): session(), 7.1 — Backend reachable, 7.2 — Pre-test session count (isolated store), 7.3 — Two sessions, same title, 7.4 — GET each by identifier, 7.5 — Unknown and malformed identifiers (Decision 4), 7.6 — No forbidden fields, 7.7 — No authentication required (+4 more)

### Community 218 - "Tasks — Raise the video stage time limit (JOS-197)"
Cohesion: 0.11
Nodes (15): Context, Decisions, Open Questions, Risks / Trade-offs, 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 1. Tests first, 2. Implement, 3. Review and Update Existing Unit Tests (MANDATORY) (+7 more)

### Community 219 - "Requirement: Retry a failed clip without regenerating its image"
Cohesion: 0.12
Nodes (16): ADDED Requirements, Requirement: Correct only `VIDEO` and retry the failed clip, Requirement: Offer clip recovery only for a failed video stage, Requirement: Retry a failed clip without regenerating its image, Scenario: A concurrent correction loses safely, Scenario: Blank correction is refused, Scenario: Concurrent clip retries, Scenario: Corrected instruction is sent to the bound provider (+8 more)

### Community 220 - "Requirement: Moderation that cannot run refuses the submission"
Cohesion: 0.12
Nodes (16): Purpose, Requirement: A flagged script is refused with a visible cause, Requirement: A submitted script is moderated before the session is registered, Requirement: Moderation that cannot run refuses the submission, Requirement: The start form shows the refusal and keeps the input, Requirements, Scenario: A clean script is registered, Scenario: A disallowed script is refused (+8 more)

### Community 221 - "ADDED Requirements"
Cohesion: 0.12
Nodes (15): ADDED Requirements, Requirement: A scene's successful clip can be downloaded as soon as it exists, Requirement: A scene's successful image can be downloaded as soon as it exists, Requirement: Failed scenes do not block other scenes' downloads, Requirement: Narration, timestamps and generated texts are never offered for download, Requirement: The session read offers exactly the available scene downloads, Scenario: Clip downloaded, Scenario: Clip not yet available (+7 more)

### Community 222 - "Tasks — Retry or correct the image instruction after an image failure (JOS-157, US-25)"
Cohesion: 0.17
Nodes (11): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 11. Update Technical Documentation (MANDATORY), 12. Close out, 2. Backend: session scoping (TDD; design Decision 1), 3. Backend: conditional writes and reason codes (TDD; design Decisions 2 and 3), 5. Backend: retry guarantees (TDD; design Decision 6), 7. Review and Update Existing Unit Tests (MANDATORY) (+3 more)

### Community 223 - "[Analysis Title]"
Cohesion: 0.17
Nodes (12): Advanced: Skills with executable code, [Analysis Title], Anti-patterns to avoid, Avoid offering too many options, Avoid Windows-style paths, Conditional workflow pattern, Examples pattern, Executive summary (+4 more)

### Community 224 - "Report Structure"
Cohesion: 0.18
Nodes (11): Action Plan, Critical Issues (Immediate Action), Executive Summary (2-3 paragraphs), High Priority Issues, Library Recommendations, Low Priority Issues, Medium Priority Issues, Phase 6: Report Generation (+3 more)

### Community 225 - "Returns: "OK" or lists conflicts"
Cohesion: 0.18
Nodes (11): Avoid assuming tools are installed, Create verifiable intermediate outputs, MCP tool references, Next steps, Package dependencies, Returns: "OK" or lists conflicts, Runtime environment, Technical notes (+3 more)

### Community 226 - "ADDED Requirements"
Cohesion: 0.12
Nodes (15): ADDED Requirements, Requirement: A project's files are kept in its project folder, Requirement: Project files never expire and are never deleted automatically, Requirement: Same-title projects never share a folder, Requirement: Temporary-link results are saved before the link expires, Scenario: Clip delivered as a link, Scenario: Corrected instruction stored, Scenario: Generated texts stored at chunk registration (+7 more)

### Community 227 - "openspec-explore/SKILL.md"
Cohesion: 0.18
Nodes (10): Check for context, Ending Discovery, Guardrails, Handling Different Entry Points, OpenSpec Awareness, The Stance, What You Don't Have To Do, What You Might Do (+2 more)

### Community 228 - "ADR 0001 — Backend language, runtime and framework"
Cohesion: 0.20
Nodes (9): ADR 0001 — Backend language, runtime and framework, Consequences, Context, Decision, Decision 1 — Are the inherited "database" and "TypeScript DoD" expectations binding?, Decision 2 — Candidate evaluation, Evidence — walking skeleton (Decision 1 of the design doc: prove it, don't just score it), Must-pass gates (+1 more)

### Community 229 - "ADR 0002 — Persistence for sessions and project files"
Cohesion: 0.18
Nodes (10): ADR 0002 — Persistence for sessions and project files, Candidate Evaluation, Consequences, Context, Decision, Decisions (from `design.md`, confirmed by evidence), Decisions to make (per the ticket) — answered, Evidence (+2 more)

### Community 230 - "Step 9 Report — E2E Testing (Agent-Driven Walkthrough)"
Cohesion: 0.18
Nodes (10): 9.1–9.2 — Environment and initial navigation, 9.3 — Cannot start without a language, 9.4 — Session view: sections and scene ordering, 9.5 — Pause/continue, marker distinct from state, 9.6 — Scene details, 9.7 — Conditional correction form, 9.8 — Download gating, 9.9 — Accessibility-tree-only interaction (+2 more)

### Community 231 - "2026-09-26-define-visual-design/tasks.md"
Cohesion: 0.18
Nodes (10): 0. Setup: Create Feature Branch (MANDATORY — FIRST STEP), 1. Design tokens (TDD: write the failing assertion first), 2. Implement the token set and status mapping, 3. Apply the styling across the screen inventory, 4. Review and Update Existing Unit Tests (MANDATORY), 5. Run Unit Tests and Verify State (MANDATORY), 6. Manual Endpoint Testing with curl (MANDATORY where applicable), 7. E2E Testing with Playwright MCP (MANDATORY — AGENT MUST EXECUTE) (+2 more)

### Community 232 - "Tasks — Lock the script at project start and the narration once complete (JOS-137)"
Cohesion: 0.15
Nodes (12): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 11. Update Technical Documentation (MANDATORY), 12. Close out, 1. Gate: Confirm what this story builds on, 3. Voice-over record lock (TDD) — design Decision 2, 5. Voice launch guard (TDD) — design Decision 4, 6. API surface (TDD) — design Decision 5 (+4 more)

### Community 233 - "Step 8: unit tests and database verification (JOS-166, see-provider-and-attempts)"
Cohesion: 0.18
Nodes (10): 7.2 Scenario coverage (`specs/stage-diagnostics/spec.md`), 7.3 Coverage (`@vitest/coverage-v8` installed with `--no-save` for this measurement only), 8.1 Baseline of the default store (`backend/data/skeleton.sqlite`), 8.2 Targeted tests, 8.3 Typecheck and full suites, 8.4 Post-test state, A cost found and fixed while verifying, Flaky behaviour (not caused by this change) (+2 more)

### Community 234 - "Requirement: The downloaded file is named after the project title"
Cohesion: 0.12
Nodes (15): ADDED Requirements, MODIFIED Requirements, Requirement: The assembled MP4 can be downloaded once it exists, Requirement: The downloaded file is named after the project title, Scenario: Distinct titles that sanitise alike, Scenario: Dots, spaces and whitespace runs, Scenario: Final video downloaded, Scenario: Non-ASCII title (+7 more)

### Community 235 - "Requirements"
Cohesion: 0.12
Nodes (15): Purpose, Requirement: Abuse limits, Requirement: Backend token stays on the server, Requirement: Relay accepts OTLP without a client secret, Requirement: Relay declared and deployed from the repository, Requirements, Scenario: Change deployed, Scenario: Flooding client (+7 more)

### Community 236 - "Tasks — Assemble the final video from completed scenes"
Cohesion: 0.13
Nodes (14): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 11. Update Technical Documentation (MANDATORY), 12. Close out, 1. Gate: Confirm the foundations this phase stands on, 2. Domain: all-scenes-complete gate (TDD), 3. Persistence: session assembly fields and stage instance (TDD), 4. Assembly tool port and adapter (TDD) (+6 more)

### Community 237 - "Execution Record"
Cohesion: 0.13
Nodes (14): §1.4 — Still undecided at this point, §1 — Product-owner answers (2026-10-12), §3 — Backend option evaluation (tasks 3.1–3.5; documentation retrieved 2026-10-12), §4 — Frontend placement (tasks 4.1–4.3), §5 — Delivery model (tasks 5.1–5.6, option A), §7 — Local packaged application: facts from the code (2026-10-13, base of this branch), Context, Decisions (+6 more)

### Community 238 - "Decisions"
Cohesion: 0.13
Nodes (14): 1. Gate inside `POST /sessions`, before `createRun`, 2. OpenAI's Moderation endpoint is the verdict, 3. Model id pinned in `providers.ts`, 4. Fail closed: no verdict → `503`, 5. One request, no automatic retry, no attempt record, 7. Response shapes, 8. Long scripts, 9. The finding is resolved by documentation, not by flipping the flag (+6 more)

### Community 239 - "Report Structure"
Cohesion: 0.18
Nodes (11): Action Plan, Critical Issues (Immediate Action), Executive Summary (2-3 paragraphs), High Priority Issues, Library Recommendations, Low Priority Issues, Medium Priority Issues, Phase 6: Report Generation (+3 more)

### Community 240 - "Returns: "OK" or lists conflicts"
Cohesion: 0.18
Nodes (11): Avoid assuming tools are installed, Create verifiable intermediate outputs, MCP tool references, Next steps, Package dependencies, Returns: "OK" or lists conflicts, Runtime environment, Technical notes (+3 more)

### Community 241 - "Skill structure"
Cohesion: 0.20
Nodes (10): Avoid deeply nested references, Naming conventions, Pattern 1: High-level guide with references, Pattern 2: Domain-specific organization, Pattern 3: Conditional details, Progressive disclosure patterns, Skill structure, Structure longer reference files with table of contents (+2 more)

### Community 242 - "ADDED Requirements"
Cohesion: 0.13
Nodes (14): ADDED Requirements, Requirement: A flagged script is refused with a visible cause, Requirement: A submitted script is moderated before the session is registered, Requirement: Moderation that cannot run refuses the submission, Requirement: The start form shows the refusal and keeps the input, Scenario: A clean script is registered, Scenario: A disallowed script is refused, Scenario: A refused script stays editable (+6 more)

### Community 243 - "explore.md"
Cohesion: 0.20
Nodes (9): Check for context, Ending Discovery, Guardrails, OpenSpec Awareness, The Stance, What You Don't Have To Do, What You Might Do, When a change exists (+1 more)

### Community 244 - "Step 10 Report — Manual Endpoint Testing with curl (held-open stream)"
Cohesion: 0.20
Nodes (9): 10.1 — Reachability, 10.2–10.3 — Hold the stream open, capture raw frames, confirm the payload shape, 10.4 — Snapshot read, 10.5 — A triggered state change appears on the held-open stream, 10.6 — Cross-session isolation, 10.7 — Unknown session identifier rejected, not silently streamed, 10.8 — Cleanup and restoration, Outcome (+1 more)

### Community 245 - "Step 11 Report — E2E Testing (Live Push, Pause, Disconnect, Restart, Diagnostics)"
Cohesion: 0.20
Nodes (9): 11.1 — Environment, 11.2–11.3 — Live update without reload (§8.3), 11.4 — Pause/continue, paused marker distinct from state, 11.5–11.6 — Disconnect/restore and backend restart, 11.7 — A failed scene shows its affected stage, provider and attempt count (§10.1, §11.2), 11.8 — Accessibility-tree-only interaction, 11.9 — Restoration, Outcome (+1 more)

### Community 246 - "Obtain narration timestamps for the script"
Cohesion: 0.18
Nodes (10): Capabilities, Impact, Mechanism (product owner decision, 2026-09-28), Modified Capabilities, New Capabilities, Obtain narration timestamps for the script, Out of Scope (owned by other tickets), Trigger (+2 more)

### Community 247 - "Segment the script into chunks within duration bounds"
Cohesion: 0.22
Nodes (8): Admitted clip durations (product owner decision, 2026-09-28), Capabilities, Modified Capabilities, New Capabilities, Out of Scope (owned by other tickets), Segment the script into chunks within duration bounds, What Changes, Why

### Community 248 - "Step 7 Report - Unit Tests and Database Verification"
Cohesion: 0.20
Nodes (9): Commands Executed, Coverage (task 6.3), Database State Verification, Intermittent failures, none caused by this change, Other Evidence, Outcome, Scenario to Test Mapping (task 6.2), Step 7 Report - Unit Tests and Database Verification (+1 more)

### Community 249 - "Split a sentence at clause boundaries when duration bounds can't otherwise be met"
Cohesion: 0.20
Nodes (9): Capabilities, Clause boundaries, Impact, Modified Capabilities, New Capabilities, Out of Scope (owned by other tickets), Split a sentence at clause boundaries when duration bounds can't otherwise be met, What Changes (+1 more)

### Community 250 - "contrast.mjs"
Cohesion: 0.14
Nodes (11): css, darkBlock, file, here, light, lightBlock, lin(), luminance() (+3 more)

### Community 251 - "Tasks — Retime and join scene clips into the video track (JOS-149, US-16a)"
Cohesion: 0.13
Nodes (14): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 11. Update Technical Documentation (MANDATORY), 12. Close out, 1. Gate, 2. One partition rule (design Decision 2), 3. Assembly plan (TDD, pure; design Decisions 1 and 3), 4. Process launch and media probe (TDD; design Decision 4) (+6 more)

### Community 252 - "Requirement: A clip is polled through the query endpoint"
Cohesion: 0.13
Nodes (14): Purpose, Requirement: A clip is polled through the query endpoint, Requirement: The clip is requested from the recorded model endpoint, Requirement: The first frame is uploaded as a multipart file, Requirements, runninghub-video-adapter Specification, Scenario: A submit that is refused, Scenario: A successful submit (+6 more)

### Community 253 - "Tasks — Fix the RunningHub video adapter (JOS-196)"
Cohesion: 0.14
Nodes (13): classifyHttpStatus(), doUpload(), providerErrorReason(), 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 1. Rewrite the adapter tests to the live shapes (TDD, failing first), 2. Implement (design Decisions 1-4), 3. Review and Update Existing Unit Tests (MANDATORY), 4. Run Unit Tests and Verify Database State (MANDATORY) (+5 more)

### Community 254 - "ADDED Requirements"
Cohesion: 0.14
Nodes (13): ADDED Requirements, Requirement: Abuse limits, Requirement: Backend token stays on the server, Requirement: Relay accepts OTLP without a client secret, Requirement: Relay declared and deployed from the repository, Scenario: Change deployed, Scenario: Flooding client, Scenario: Oversized body (+5 more)

### Community 255 - "Tasks — Prevent the final video while any scene is incomplete (JOS-150, US-17)"
Cohesion: 0.14
Nodes (13): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 11. Update Technical Documentation (MANDATORY), 12. Close out, 1. Gate, 2. The gate (TDD, pure; design Decisions 1 and 2), 4. Transition table (TDD; design Decision 5), 5. Session read and live updates (TDD) (+5 more)

### Community 256 - "Tasks — Record requested duration and speed-adjustment factor per scene (JOS-148)"
Cohesion: 0.14
Nodes (13): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 11. Update Technical Documentation (MANDATORY), 12. Close out, 1. Gate, 2. Domain: expose the speed-adjustment factor already computed by duration selection (TDD, pure logic), 4. Stability across builds (spec: a different acceptable limit later), 5. Backend exposure (spec: readable) (+5 more)

### Community 257 - "Requirement: The final video is not offered before it exists"
Cohesion: 0.14
Nodes (13): final-video-download Specification, Purpose, Requirement: One decision about whether the final video is available, Requirement: The assembled MP4 can be downloaded once it exists, Requirement: The final video is not offered before it exists, Requirements, Scenario: Every scene complete but assembly not finished, Scenario: Failed session (+5 more)

### Community 258 - "Tasks — Adjust the pause after a scene and rebuild the final video (JOS-190)"
Cohesion: 0.15
Nodes (12): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Run Unit Tests and Verify Database State (MANDATORY), 11. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE), 12. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 13. Update Technical Documentation (MANDATORY), 14. Close out, 1. Gate, 2. Backend: pause derivation and range (TDD; design Decisions 1-2) (+4 more)

### Community 259 - "Skill structure"
Cohesion: 0.20
Nodes (10): Avoid deeply nested references, Naming conventions, Pattern 1: High-level guide with references, Pattern 2: Domain-specific organization, Pattern 3: Conditional details, Progressive disclosure patterns, Skill structure, Structure longer reference files with table of contents (+2 more)

### Community 260 - "Coding Standards"
Cohesion: 0.20
Nodes (10): API Services, Coding Standards, Component Conventions, Component Props, Functional Components, Loading and Error States, Local State with Hooks, Naming Conventions (+2 more)

### Community 261 - "2. Arquitectura del Sistema"
Cohesion: 0.20
Nodes (9): 1. Descripción general del producto, **2.1. Diagrama de arquitectura:**, 2. Arquitectura del Sistema, 3. Modelo de Datos, 4. Especificación de la API, 5. Historias de Usuario, 6. Tickets de Trabajo, 7. Pull Requests (+1 more)

### Community 262 - "AGENTS.md"
Cohesion: 0.22
Nodes (8): 1. Core Principles, 2. Language Standards, 3. Specific standards, 4. Project Skills, 5. Planning Model Requirement, 6. Symlink Integrity and Multi-Agent Portability, 7. Mandatory OpenSpec Artifact Updates for Post-Apply Changes, graphify

### Community 263 - "Phase 2: File-by-File Analysis"
Cohesion: 0.22
Nodes (9): Async/Promise Issues, Code Smells & Anti-Patterns, Dead Code, Error Handling, Memory Leaks, Performance Issues, Phase 2: File-by-File Analysis, Security Vulnerabilities (+1 more)

### Community 264 - "Skill authoring best practices"
Cohesion: 0.22
Nodes (9): Avoid time-sensitive information, Common patterns, Content guidelines, Implement feedback loops, Skill authoring best practices, Template pattern, Use consistent terminology, Use workflows for complex tasks (+1 more)

### Community 265 - "providers.ts"
Cohesion: 0.08
Nodes (38): ALIGNMENT_PROVIDER, CappedStage, DECOMPOSITION_PROVIDER, DECOMPOSITION_REQUIRES_WHITESPACE_PRESERVATION_INSTRUCTION, FINAL_OUTPUT, IMAGE_GENERATION_SIZE, IMAGE_PROVIDER, MAX_ATTEMPTS_PER_CYCLE (+30 more)

### Community 266 - "Design — Per-phase maximum execution time, measured from send"
Cohesion: 0.22
Nodes (8): registerTimeoutHandler(), Context, Decisions, Design — Per-phase maximum execution time, measured from send, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 267 - "Design — Retime and join scene clips into the video track"
Cohesion: 0.25
Nodes (8): findPartitionProblem(), Context, Decisions, Design — Retime and join scene clips into the video track, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 268 - "CLAUDE.md"
Cohesion: 0.22
Nodes (8): 1. Core Principles, 2. Language Standards, 3. Specific standards, 4. Project Skills, 5. Planning Model Requirement, 6. Symlink Integrity and Multi-Agent Portability, 7. Mandatory OpenSpec Artifact Updates for Post-Apply Changes, graphify

### Community 269 - "codex.md"
Cohesion: 0.22
Nodes (8): 1. Core Principles, 2. Language Standards, 3. Specific standards, 4. Project Skills, 5. Planning Model Requirement, 6. Symlink Integrity and Multi-Agent Portability, 7. Mandatory OpenSpec Artifact Updates for Post-Apply Changes, graphify

### Community 270 - "GEMINI.md"
Cohesion: 0.22
Nodes (8): 1. Core Principles, 2. Language Standards, 3. Specific standards, 4. Project Skills, 5. Planning Model Requirement, 6. Symlink Integrity and Multi-Agent Portability, 7. Mandatory OpenSpec Artifact Updates for Post-Apply Changes, graphify

### Community 271 - "Tasks — Assign scene identifiers and visual instructions (JOS-144)"
Cohesion: 0.15
Nodes (12): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. E2E Testing (MANDATORY if applicable - AGENT MUST EXECUTE), 11. Update Technical Documentation (MANDATORY), 1. Gate and umbrella carve-out, 2. Persistence: columns, unique number, locks (TDD) — design Decisions 2, 3, 7, 3. Visual instructions port and OpenAI adapter (TDD) — Decision 4, 5. Session state and representation (TDD) — Decision 6, AC5, 6. API surface (TDD) — AC4 (+4 more)

### Community 272 - "Step 7 Report — Live Experiments (Burst, Disconnect, Restart, Idle, Isolation)"
Cohesion: 0.22
Nodes (8): 7.1–7.2 — Burst: 200 scenes, driven at real cadence, 7.3–7.4 — Disconnect and backend restart, 7.5 — Idle, 7.6 — Snapshot read cost at scale, 7.7 — Connection ceiling (two tabs), 7.8 — Cross-session isolation (AC22), Outcome, Step 7 Report — Live Experiments (Burst, Disconnect, Restart, Idle, Isolation)

### Community 273 - "Lock the script at project start and the narration once complete"
Cohesion: 0.22
Nodes (8): Capabilities, Impact, Lock the script at project start and the narration once complete, Modified Capabilities, New Capabilities, Out of Scope (owned by other tickets), What Changes, Why

### Community 274 - "Step 10 Report - E2E Testing in the Browser"
Cohesion: 0.22
Nodes (8): Applicability, Backend log for the run, Cleanup, Environment, Limitation, Outcome, Step 10 Report - E2E Testing in the Browser, Steps and Results

### Community 275 - "Step 7 Report - Unit Tests and Database Verification"
Cohesion: 0.22
Nodes (8): Commands Executed, Coverage (task 6.3), Database State Verification, Findings, Outcome, Scenario to Test Mapping (task 6.2), Step 7 Report - Unit Tests and Database Verification, Unit Test Results

### Community 276 - "Step 8 Report - Manual Testing with Real Providers"
Cohesion: 0.25
Nodes (7): Admitted durations (task 8.4), Cleanup and state (task 8.5), Finding: the first rule failed on real narration, Outcome, Real narration and decomposition (tasks 8.2 and 8.3), Spend, Step 8 Report - Manual Testing with Real Providers

### Community 277 - "Step 7 Report - Manual Testing with Real Providers"
Cohesion: 0.22
Nodes (8): Cleanup and state (task 7.4), English (5 sentences, 62.183 s narrated), Outcome, Real narration and clause splitting (tasks 7.2 and 7.3), Setup (task 7.1), Spanish (4 sentences, 50.759 s narrated), Spend, Step 7 Report - Manual Testing with Real Providers

### Community 278 - "Step 9 Report — Unit Tests and Database Verification"
Cohesion: 0.25
Nodes (7): Commands Executed, Database State Verification, New tests, by task, Outcome, Scenario to Test Mapping, Step 9 Report — Unit Tests and Database Verification, Unit Test Results

### Community 279 - "SessionPage"
Cohesion: 0.07
Nodes (34): Visual Design, resolveResultUrl(), SessionPage(), TopBar(), 4. Layout: project panel + pipeline, CSS grid with one breakpoint, 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Run Unit Tests and Verify Database State (MANDATORY), 11. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE) (+26 more)

### Community 280 - "Request the admitted clip duration closest to the narrated interval"
Cohesion: 0.22
Nodes (8): Capabilities, Impact, Modified Capabilities, New Capabilities, Out of Scope (owned by other tickets), Request the admitted clip duration closest to the narrated interval, What Changes, Why

### Community 281 - "Step 6: unit tests and database verification (JOS-186, harden-backend-foundation)"
Cohesion: 0.22
Nodes (8): 300-scene write capacity (spec `concurrent-write-capacity`), 6.1 Baseline of the default store (`backend/data/skeleton.sqlite`), 6.2 Targeted tests, 6.3 Typecheck and full suite, 6.4 Post-test state, Flaky behaviour found and fixed, Scenario coverage, Step 6: unit tests and database verification (JOS-186, harden-backend-foundation)

### Community 282 - "Step 7 Report - Unit Tests and Database Verification"
Cohesion: 0.22
Nodes (8): API contract (task 10.1), Commands Executed, Coverage (task 6.3), Database State Verification, Existing tests, Spec scenario to test map (task 6.2), Step 7 Report - Unit Tests and Database Verification, Unit Test Results

### Community 283 - "Requirement: Repeated confirmations rejected by the store"
Cohesion: 0.22
Nodes (8): MODIFIED Requirements, Requirement: Repeated confirmations rejected by the store, Scenario: A refused image confirmation leaves the scene as it is, Scenario: A scene is assembled once, Scenario: Assembly is not started twice, Scenario: The final video is recorded once, Scenario: The same confirmation arrives twice, Scenario: Two confirmations arrive concurrently

### Community 284 - "Step 10 Report - Browser E2E (JOS-153, distinguish-paused-session)"
Cohesion: 0.22
Nodes (8): 10.1 — Applicability, 10.2 — Setup, 10.3 — Paused page: marker, running, held, scene labels, 10.4 — Continue, live, no reload, Cleanup, Console, Outcome, Step 10 Report - Browser E2E (JOS-153, distinguish-paused-session)

### Community 285 - "ADDED Requirements"
Cohesion: 0.15
Nodes (12): ADDED Requirements, final-video-download, Requirement: One decision about whether the final video is available, Requirement: The assembled MP4 can be downloaded once it exists, Requirement: The final video is not offered before it exists, Scenario: Every scene complete but assembly not finished, Scenario: Failed session, Scenario: Final video downloaded (+4 more)

### Community 286 - "Requirement: A clip is polled through the query endpoint"
Cohesion: 0.15
Nodes (12): ADDED Requirements, Requirement: A clip is polled through the query endpoint, Requirement: The clip is requested from the recorded model endpoint, Requirement: The first frame is uploaded as a multipart file, Scenario: A submit that is refused, Scenario: A successful submit, Scenario: A successful upload, Scenario: An upload that is rejected with an error envelope (+4 more)

### Community 287 - "Tasks — Manually retry a failed voice-over (JOS-155, US-23)"
Cohesion: 0.15
Nodes (12): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 11. Update Technical Documentation (MANDATORY), 12. Close out, 2. Backend: retry service checks (TDD; design Decisions 2 and 4), 3. Backend: same script, same provider, nothing deleted (TDD; design Decisions 4-6), 5. Backend: route (TDD; design Decision 1), 6. Frontend: retry action (TDD; design Decision 8) (+4 more)

### Community 288 - "Commands and Responses"
Cohesion: 0.15
Nodes (12): 9.3 — Valid start (AC01), 9.4 — Empty title, empty script (AC03), 9.5 — Whitespace-only title (Decision 1), 9.6 — Missing/unsupported language (AC05, Decision 5), 9.7 — Script far longer than the 1500-word reference (AC04), 9.8 — Duplicate submission (Decision 7), 9.9 — Byte-identical script (Decision 1), Cleanup (+4 more)

### Community 289 - "Proposed text"
Cohesion: 0.17
Nodes (11): §11 / §2.1 credentials — adjust the wording, §12.2 Archivos — add one sentence, §12.3 Modelo de acceso, descargas y aislamiento — replace the first and last paragraphs, §16 Registro de cambios — new section, §2.3 Fuera del MVP — replace the bullet, D07 row in §14, PRD change draft — hosted single-user install behind an edge access gate, Proposed text (+3 more)

### Community 290 - "Proposed text"
Cohesion: 0.17
Nodes (11): §12.1 (persistence and resumption) — add one sentence, §12.2 Archivos — replace the sentence v1.6 added, §12.3 Modelo de acceso, descargas y aislamiento — replace the first and last paragraphs, §16 Registro de cambios — new section, §2.1 / §11 credentials — adjust the wording, §2.3 Fuera del MVP — replace the bullet v1.6 introduced, D07 row in §14, Deliberately not changed (+3 more)

### Community 291 - "Tasks — Generate the image of each scene (JOS-145)"
Cohesion: 0.06
Nodes (35): isAcceptedImageSize(), isStandaloneMarker(), isStartOfFrameMarker(), PNG_SIGNATURE, readImageDimensions(), readJpegDimensions(), sniffImageExtension(), downloadGeneratedImage() (+27 more)

### Community 292 - "Tasks — Download individual scene results during processing (JOS-163, US-31)"
Cohesion: 0.17
Nodes (11): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Close out, 1. Gate, 2. Backend: the download route (TDD; design Decisions 1, 2 and 4), 3. Backend: downloads in the session read (TDD; design Decision 3), 5. Review and Update Existing Unit Tests (MANDATORY), 6. Run Unit Tests and Verify Database State (MANDATORY), 7. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE) (+3 more)

### Community 293 - "2026-10-19-retry-or-correct-clip/design.md"
Cohesion: 0.17
Nodes (11): 1. Reuse the existing scene retry and correction routes, 2. Use video-specific conditional persistence transitions, 3. Reuse the existing video execution and success path, 4. Derive frontend controls from stage and state, 5. Keep the wire shape and generated API contract stable, Context, Decisions, Goals / Non-Goals (+3 more)

### Community 294 - "Tasks — Run a session end to end (JOS-195)"
Cohesion: 0.17
Nodes (11): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE), 11. E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE), 12. Update Technical Documentation (MANDATORY), 13. Close, 4. Voice-over hand-off (TDD; design Decision 3), 5. Boot (TDD; design Decision 4), 7. End to end through the API (TDD) (+3 more)

### Community 295 - "Decisions"
Cohesion: 0.12
Nodes (15): Context, D10 — Frontend: native `<dialog>` for consent, a banner for updates, D12 — Dashboards as committed JSON, imported manually, D13 — Metric names, D1 — Manual OpenTelemetry instrumentation, JSON over HTTP, logs and metrics only, D5 — Local log file: Pino multistream to a size-rotated file, written by us, D7 — Relay deploy workflow, D8 — Build identity from one config module (+7 more)

### Community 296 - "Tasks — Ignore repeated success confirmations (JOS-161, US-29)"
Cohesion: 0.18
Nodes (10): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Update Technical Documentation (MANDATORY), 11. Close out, 2. Backend: pin the stages that already hold (design Decision 4), 4. Backend: final assembly (TDD; design Decisions 2 and 3), 5. Backend: manual-testing aid, 7. Run Unit Tests and Verify Database State (MANDATORY), 8. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE) (+2 more)

### Community 297 - "Step 8 — E2E Testing (Claude in Chrome, substituting for Playwright MCP)"
Cohesion: 0.18
Nodes (10): 8.1 — Servers running, 8.2 / 8.3 — Start a project, land on the session page, 8.4 — Reopen the same address in a new page, 8.5 — Second project, same title, 8.6 — Unknown identifier, 8.7 — Accessibility-tree-only interaction, 8.8 — Cleanup and restore, Outcome (+2 more)

### Community 298 - "Step 4 — Select the Voice Provider and Settle the Timestamp Mechanism"
Cohesion: 0.18
Nodes (10): 4.1 — Shortlist, 4.2 — Test script, 4.3 — Timestamp granularity, 4.4 — Sentence boundary locatability, 4.5 — Which §11.1 mechanism applies, 4.6 — Narration voice, quality and speed, 4.7 — Provider selected, Billing note (feeds Decision 6) (+2 more)

### Community 299 - "Step 9 Report - Manual Endpoint Testing with curl"
Cohesion: 0.25
Nodes (7): 9.2 — `running` on a fresh session, 9.4 — continue, then the stub completing empties running, 9.5 — error cases, 9.6 — Cleanup, Environment, Outcome, Step 9 Report - Manual Endpoint Testing with curl

### Community 300 - "concurrent-write-capacity Specification"
Cohesion: 0.22
Nodes (8): concurrent-write-capacity Specification, Purpose, Requirement: Measured write capacity is recorded, Requirement: Result recording holds at MVP session scale, Requirements, Scenario: 300 scenes complete at once with duplicate deliveries, Scenario: The scale evidence is reviewed, Scenario: The session reaches its final state

### Community 301 - "Phase 2: File-by-File Analysis"
Cohesion: 0.22
Nodes (9): Async/Promise Issues, Code Smells & Anti-Patterns, Dead Code, Error Handling, Memory Leaks, Performance Issues, Phase 2: File-by-File Analysis, Security Vulnerabilities (+1 more)

### Community 302 - "Skill authoring best practices"
Cohesion: 0.22
Nodes (9): Avoid time-sensitive information, Common patterns, Content guidelines, Implement feedback loops, Skill authoring best practices, Template pattern, Use consistent terminology, Use workflows for complex tasks (+1 more)

### Community 303 - "Vid4You backend"
Cohesion: 0.33
Nodes (5): Commands, Environment, Layout, Restarting, Vid4You backend

### Community 304 - "Tasks — Keep project files locally without overwriting or expiry (JOS-162, US-30)"
Cohesion: 0.18
Nodes (10): 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 1. Gate, 3. Backend: pin the acceptance criteria that already hold (design Decision 4), 4. Review and Update Existing Unit Tests (MANDATORY), 5. Run Unit Tests and Verify Database State (MANDATORY), 6. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE), 7. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE), 8. Update Technical Documentation (MANDATORY) (+2 more)

### Community 305 - "ADR 0007 — Distribution: a local packaged application (JOS-194)"
Cohesion: 0.25
Nodes (7): ADR 0007 — Distribution: a local packaged application (JOS-194), Consequences, Context, Cost, Decision, Evidence (proof of concept on macOS, 2026-10-13), Options evaluated

### Community 306 - "Define the backend stack"
Cohesion: 0.25
Nodes (7): Capabilities, Define the backend stack, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 307 - "Define the frontend stack"
Cohesion: 0.25
Nodes (7): Capabilities, Define the frontend stack, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 308 - "Requirement: Every released slot has a matching slot that was taken"
Cohesion: 0.18
Nodes (10): MODIFIED Requirements, Requirement: A scene takes at most one slot or queue place per stage, Requirement: Every released slot has a matching slot that was taken, Scenario: A launch for a scene that already holds a slot, Scenario: A release by a scene that holds no slot, Scenario: An attempt's slot is released once, when its call returns, Scenario: The cap holds across a restart and a burst of new work, Scenario: The same scene is launched twice while queued (+2 more)

### Community 309 - "Define the live progress update mechanism"
Cohesion: 0.25
Nodes (7): Capabilities, Define the live progress update mechanism, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 310 - "Design — Define the video and audio assembly tooling"
Cohesion: 0.25
Nodes (7): Context, Decisions, Design — Define the video and audio assembly tooling, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 311 - "Define the video and audio assembly tooling"
Cohesion: 0.25
Nodes (7): Capabilities, Define the video and audio assembly tooling, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 312 - "Define persistence for sessions and project files"
Cohesion: 0.25
Nodes (7): Capabilities, Define persistence for sessions and project files, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 313 - "Define and apply the frontend visual design"
Cohesion: 0.25
Nodes (7): Capabilities, Define and apply the frontend visual design, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 314 - "Step 6 Report - Manual Endpoint Check (curl)"
Cohesion: 0.25
Nodes (7): Cleanup, Commands Executed, Comparison against what the UI renders, Outcome, Responses, Scope, Step 6 Report - Manual Endpoint Check (curl)

### Community 315 - "Step 7 Report - E2E Testing (Render Console restyle)"
Cohesion: 0.25
Nodes (7): Accessible-name regression check, Cleanup, Environment, Outcome, Scenarios executed, Step 7 Report - E2E Testing (Render Console restyle), Tooling note

### Community 316 - "Step 8 Report - Unit Tests and Database Verification"
Cohesion: 0.25
Nodes (7): Commands Executed, Database State Verification, Other Evidence Recorded Here, Outcome, Scenario to Test Mapping (task 7.3), Step 8 Report - Unit Tests and Database Verification, Unit Test Results

### Community 317 - "Step 9 Report - Manual Endpoint Testing with curl"
Cohesion: 0.25
Nodes (7): Cleanup, Environment, Notes, Outcome, Results, Step 9 Report - Manual Endpoint Testing with curl, Transcript

### Community 318 - "Step 8 Report - Manual Endpoint Testing with real providers"
Cohesion: 0.25
Nodes (7): Cleanup, Findings that matter for the next stories, How it was exercised, Outcome, Results, Step 8 Report - Manual Endpoint Testing with real providers, Transcript

### Community 319 - "Step 9 Report - E2E Testing in the Browser"
Cohesion: 0.25
Nodes (7): Applicability, Cleanup, Environment, Findings, Outcome, Step 9 Report - E2E Testing in the Browser, Steps and Results

### Community 320 - "Step 6 Report - Unit Tests and Database Verification"
Cohesion: 0.25
Nodes (7): Commands Executed, Coverage (task 5.3), Database State Verification, Outcome, Scenario to Test Mapping (task 5.2), Step 6 Report - Unit Tests and Database Verification, Unit Test Results

### Community 321 - "sweep.ts"
Cohesion: 0.38
Nodes (6): buildSweptAudio(), PAUSE_LENGTHS, run(), SENTENCE1, SENTENCE2, trimClip()

### Community 322 - "Step 5 — real timings from the first real script (raise-video-time-limit, JOS-197)"
Cohesion: 0.18
Nodes (10): Findings, Findings, Measurements at the product's real script size (2026-10-13/14), Not measured yet, Open, Step 5 — real timings from the first real script (raise-video-time-limit, JOS-197), The 11-scene run (2026-10-14, session `01M4W4294K86VRGKTW9JF6AHKK`, limits at 600 s), The completed run (2026-10-14, after the balance was topped up and the video limit set to 1200 s) (+2 more)

### Community 323 - "Step 7 Report - Unit Tests and Database Verification"
Cohesion: 0.25
Nodes (7): Commands Executed, Coverage check (task 6.5), Database State Verification, Outcome, Scenario-to-test mapping (task 6.4), Step 7 Report - Unit Tests and Database Verification, Unit Test Results

### Community 324 - "Step 8 Report — Manual Endpoint Testing"
Cohesion: 0.25
Nodes (7): Cleanup (task 8.6), OpenAPI (task 8.5), Over-maximum case (task 8.3), Result, Setup (task 8.1), Step 8 Report — Manual Endpoint Testing, Trying to change the values (task 8.4)

### Community 325 - "Step 10 — E2E testing in the browser (retry-decomposition, JOS-156)"
Cohesion: 0.25
Nodes (7): 11.1 Applicability, 11.2 Environment, Cleanup, Defects found and fixed (spec first, then test, then code), Notes, Results, Step 10 — E2E testing in the browser (retry-decomposition, JOS-156)

### Community 326 - "Design — See provider and attempts per stage"
Cohesion: 0.25
Nodes (7): Context, Decisions, Design — See provider and attempts per stage, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 327 - "See provider and attempts per stage"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, See provider and attempts per stage, What Changes, Why

### Community 328 - "Step 10: browser E2E (JOS-166, see-provider-and-attempts)"
Cohesion: 0.25
Nodes (7): 10.1 Applicability, 10.2 Setup and scene details, 10.3 A count that rises without a reload, 10.4 Phase sections, and nothing sensitive on the page, 10.5 Restore, Step 10: browser E2E (JOS-166, see-provider-and-attempts), Tool used, and why

### Community 329 - "Per-phase maximum execution time, measured from send"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Per-phase maximum execution time, measured from send, What Changes, Why

### Community 330 - "Step 6: unit tests and database verification (JOS-185, stage-execution-time-limit)"
Cohesion: 0.25
Nodes (7): 6.2 Targeted tests, 6.3 Typecheck and full suite, 6.4 Post-test state, Coverage (`@vitest/coverage-v8` installed with `--no-save` for this measurement only), Flaky behaviour, Scenario coverage (`specs/stage-execution-time-limit/spec.md`), Step 6: unit tests and database verification (JOS-185, stage-execution-time-limit)

### Community 331 - "Distinguish a paused session from running generations"
Cohesion: 0.25
Nodes (7): Capabilities, Distinguish a paused session from running generations, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 332 - "Step 8 Report - Unit Tests, Coverage and Database Verification"
Cohesion: 0.25
Nodes (7): Commands Executed, Coverage (task 7.3), Database State Verification, Outcome, Scenario-to-test mapping (task 7.2), Step 8 Report - Unit Tests, Coverage and Database Verification, Unit Test Results

### Community 333 - "Step 8 Report - Unit Tests, Coverage and Database Verification"
Cohesion: 0.25
Nodes (7): Commands Executed, Coverage (task 7.3), Database State Verification, Outcome, Scenario-to-test mapping (task 7.2), Step 8 Report - Unit Tests, Coverage and Database Verification, Unit Test Results

### Community 334 - "videoProvider.ts"
Cohesion: 0.04
Nodes (61): clearScenePauseEdit(), setScenePauseEdit(), RebuildRefusal, RebuildResult, assemblyStageLauncher, launchVideoStageForRun(), resetAssemblyLaunchCount(), resetAssemblyTool() (+53 more)

### Community 335 - "Requirement: Launch-time check for a newer build on the app's channel"
Cohesion: 0.18
Nodes (10): Purpose, Requirement: Launch-time check for a newer build on the app's channel, Requirement: Update banner on the page, Requirements, Scenario: Already up to date, Scenario: Banner shown and dismissed, Scenario: Development build, Scenario: Newer release exists (+2 more)

### Community 336 - "Requirement: Voice and decomposition requests are given 600 seconds and clip requests 1200 seconds"
Cohesion: 0.18
Nodes (10): Purpose, Requirement: Voice and decomposition requests are given 600 seconds and clip requests 1200 seconds, Requirements, Scenario: A 14-second clip, Scenario: A clip that exceeds the limit, Scenario: A clip that takes about six minutes, Scenario: A decomposition of a full-size script, Scenario: A narration of a full-size script (+2 more)

### Community 337 - "16. Registro de cambios"
Cohesion: 0.20
Nodes (10): 16. Registro de cambios, De la versión 1.1 a la 1.2, From version 1.2 to 1.3, From version 1.3 to 1.4, From version 1.4 to 1.5, From version 1.5 to 1.6, From version 1.6 to 1.7, From version 1.7 to 1.8 (+2 more)

### Community 338 - "telemetry-relay/package.json"
Cohesion: 0.12
Nodes (16): description, devDependencies, typescript, vitest, wrangler, typescript, vitest, name (+8 more)

### Community 339 - "PRD — Vid4You"
Cohesion: 0.20
Nodes (9): 13. Criterios de aceptación del MVP, 14.1 POC de asignación de silencios (D11) — Cerrada, 14. Decisiones de producto, 15. Gaps abiertos no bloqueantes, 1. Objetivo del producto, 3. Conceptos y datos del proyecto, 5. Flujo funcional, 9. Pausa y continuación (+1 more)

### Community 340 - "JOS-199 step 12 — manual endpoint testing with curl"
Cohesion: 0.20
Nodes (9): 12.1 Baseline, 12.2 Defaults, 12.3 Consent writes, 12.4 Update check, 12.5 Stubbed session to final video, 12.6 Log file, 12.7 Store check, Findings (+1 more)

### Community 341 - "Step 10 — Unit Test and DB Verification"
Cohesion: 0.22
Nodes (8): Backend, Frontend, Full test suite (10.3), Post-test baseline (skeleton.sqlite), Pre-test baseline (skeleton.sqlite), Step 10 — Unit Test and DB Verification, Tests run (10.2 targeted tests), Verdict

### Community 342 - "1.2 Spike: cut and insert silence in the narration, encode once"
Cohesion: 0.20
Nodes (9): 1.1 Gate: the base still matches design.md § Context, 1.2 Spike: cut and insert silence in the narration, encode once, 1.3 Real-narration pauses (from JOS-142's recorded survey), Caveats, Conclusion, Deviations from the task text (recorded, not hidden), Method, Results (+1 more)

### Community 343 - "Step 9 — Curl Endpoint Testing Report"
Cohesion: 0.20
Nodes (9): 9.1 Server reachable, 9.2 Full pipeline to final-video, 9.3 Audio track verification, 9.4 Failed chunk prevents assembly, 9.5 Assembly transient failure — retries exhausted, 9.6 No route exposes MP3, timestamps, or generated texts, 9.7 Cleanup, Step 9 — Curl Endpoint Testing Report (+1 more)

### Community 344 - "Assign scene identifiers and visual instructions"
Cohesion: 0.20
Nodes (9): Assign scene identifiers and visual instructions, Capabilities, Impact, Modified Capabilities, New Capabilities, Out of Scope (owned by other tickets), Trigger (product owner decision, 2026-09-27), What Changes (+1 more)

### Community 345 - "ADDED Requirements"
Cohesion: 0.20
Nodes (9): ADDED Requirements, Requirement: Chunk intervals partition the voice-over without gaps or overlaps, Requirement: Manual retries of the two steps are owned by `retry-decomposition`, Requirement: Timestamps and decomposition are retried as separate stage instances, Scenario: A gap or overlap exists, Scenario: The manual retry is specified elsewhere, Scenario: The partition is valid, Scenario: Timestamps fail transiently and recover (+1 more)

### Community 346 - "Step 10 Report — Manual Testing"
Cohesion: 0.33
Nodes (5): Cleanup and state (task 10.3), Outcome, Real narration and decomposition (task 10.2), Setup (task 10.1), Step 10 Report — Manual Testing

### Community 347 - "Step 3 — Verify the Video Provider (RunningHub)"
Cohesion: 0.20
Nodes (9): 3.1 — Capability call, 3.2 — Admitted duration set and maximum, 3.3 — Output resolution and frame rate vs. D08, 3.4 — Version identifiers and retirement exposure, 3.5 — Availability, 3.6 — Capability conclusion, Provider and model selected for this test, Spend (+1 more)

### Community 348 - "Step 9 Report - Manual Endpoint Testing with curl"
Cohesion: 0.20
Nodes (9): 9.2 - A failed scene beside a generating one, 9.3 - The generating scene completes, 9.4 - Every scene complete, 9.5 - OpenAPI, 9.6 - Cleanup, Notes, Outcome, Setup (9.1) (+1 more)

### Community 349 - "retry-scheduler.test.ts"
Cohesion: 0.28
Nodes (7): scheduleStageAttempt(), registerSlotKeyResolver(), attempt(), at(), newRunId(), NOW, scheduleRetry()

### Community 350 - "16. Registro de cambios"
Cohesion: 0.22
Nodes (9): 16. Registro de cambios, De la versión 1.1 a la 1.2, From version 1.2 to 1.3, From version 1.3 to 1.4, From version 1.4 to 1.5, From version 1.5 to 1.6, From version 1.6 to 1.7, From version 1.7 to 1.8 (+1 more)

### Community 351 - "MVP closure report"
Cohesion: 0.22
Nodes (8): A. Executive summary, B. Traceability matrix (refreshed), C. Git integration, D. Testing and quality, E. Cleanup and security, F. Documentation, G. Remaining actions, MVP closure report

### Community 352 - "Requirement: Launch-time check for a newer build on the app's channel"
Cohesion: 0.22
Nodes (8): ADDED Requirements, Requirement: Launch-time check for a newer build on the app's channel, Requirement: Update banner on the page, Scenario: Already up to date, Scenario: Banner shown and dismissed, Scenario: Development build, Scenario: Newer release exists, Scenario: Offline

### Community 353 - "Requirement: Voice-over is the only audio and is never retimed"
Cohesion: 0.22
Nodes (8): MODIFIED Requirements, Requirement: Voice-over is the only audio and is never retimed, Scenario: An edit that cannot be kept in sync, Scenario: An edited pause, Scenario: Clips carry their own audio, Scenario: No pause edits, Scenario: The stored narration is untouched, Scenario: Video is retimed

### Community 354 - "Step 8 Report - Unit Tests and Database Verification"
Cohesion: 0.22
Nodes (8): Commands Executed, Coverage (task 7.3), Database State Verification, Other Evidence, Outcome, Scenario to Test Mapping (task 7.2), Step 8 Report - Unit Tests and Database Verification, Unit Test Results

### Community 355 - "Step 1 — Gate: Collect the Inputs and Set the Limits"
Cohesion: 0.22
Nodes (8): 1.1 — Spend ceiling (Decision 10), 1.2 — Image and video providers, 1.2a — Shared account?, 1.3 — Speed-factor limit from `define-media-assembly` (JOS-182), 1.4 — Reasoning capability reference, re-checked against the current model line, 1.5 — What remains undecided at this point, Outcome, Step 1 — Gate: Collect the Inputs and Set the Limits

### Community 356 - "Step 13 — Manual Endpoint Testing with curl"
Cohesion: 0.22
Nodes (8): 13.1 — Credential loading, 13.2 — Real request/response per provider (pointers to existing evidence), 13.3 — Not-retryable vs. transient failure: distinguishability, 13.4 — Voice provider's timestamp payload granularity, 13.5 — Redaction confirmation, 13.6 — Spend for this step, 13.7 — This report, Step 13 — Manual Endpoint Testing with curl

### Community 357 - "Step 11 — Manual Endpoint Testing"
Cohesion: 0.22
Nodes (8): 11.1 Health check, 11.2 Create session and pause, 11.3 Pause twice and continue twice, 11.4 Unknown session → 404, 11.5 Default store untouched, 11.6 API docs — `held` documented, Step 11 — Manual Endpoint Testing, Verdict

### Community 358 - "Step 7 — Manual endpoint testing with curl (JOS-164, download-final-video)"
Cohesion: 0.22
Nodes (8): 7.1 — Health check, 7.2 — 409 before assembly finishes, 7.3 — 200 with headers and byte-identical content, 7.4 — 404 cases, 7.5 — Published contract, 7.6 — Cleanup, Note: the bare stub assembly tool never writes real bytes, Step 7 — Manual endpoint testing with curl (JOS-164, download-final-video)

### Community 359 - "Step 8 Report - Unit Tests and Database Verification"
Cohesion: 0.22
Nodes (8): Commands Executed, Coverage Comparison (task 7.3), Database State Verification, Existing tests reviewed (task 7.1), Outcome, Scenario-to-test mapping (task 7.2), Step 8 Report - Unit Tests and Database Verification, Unit Test Results

### Community 360 - "Generate the image of each scene"
Cohesion: 0.22
Nodes (8): Capabilities, Generate the image of each scene, Impact, Modified Capabilities, New Capabilities, Out of Scope (owned by other tickets), What Changes, Why

### Community 361 - "Step 5 — Unit test and DB verification (JOS-162, keep-project-files-locally)"
Cohesion: 0.22
Nodes (8): AC/scenario → test map, Scope expansion note (task 1.1), Step 5 — Unit test and DB verification (JOS-162, keep-project-files-locally), Task 4.1 — existing tests reviewed for the new project-folder files, Task 4.3 — coverage not decreased, Task 5.1/5.4 — default store untouched, Task 5.3 — typecheck and full test suite, Task 8.1 — `docs/api-spec.yml`

### Community 362 - "Requirement: Voice and decomposition requests are given 600 seconds and clip requests 1200 seconds"
Cohesion: 0.22
Nodes (8): ADDED Requirements, Requirement: Voice and decomposition requests are given 600 seconds and clip requests 1200 seconds, Scenario: A 14-second clip, Scenario: A clip that exceeds the limit, Scenario: A clip that takes about six minutes, Scenario: A decomposition of a full-size script, Scenario: A narration of a full-size script, Scenario: Configuration and PRD agree

### Community 363 - "Step 9 Report - Manual Endpoint Testing with curl"
Cohesion: 0.22
Nodes (8): 9.2 — GET /sessions/:id, hand-verified against the group-2 formula, 9.3 / 9.4 — Factor over the limit, combined with the unsplittable-sentence duration warning, 9.5 — Attempts to change the values are refused, 9.6 — OpenAPI documentation, 9.7 — Cleanup, Outcome, Setup, Step 9 Report - Manual Endpoint Testing with curl

### Community 364 - "Step 7 Report - Unit Tests and Database Verification"
Cohesion: 0.22
Nodes (8): Commands Executed, Coverage (task 6.3), Database State Verification, Existing Tests Reviewed (task 6.1), Outcome, Scenario to Test Mapping (task 6.2), Step 7 Report - Unit Tests and Database Verification, Unit Test Results

### Community 365 - "Step 7 Report - Unit Tests and Database State Verification"
Cohesion: 0.22
Nodes (8): API contract (task 10.1), Commands Executed, Coverage (task 6.3), Database State Verification, Part of the work that already passed, Scenario to test map (task 6.2), Step 7 Report - Unit Tests and Database State Verification, Unit Test Results

### Community 366 - "2026-10-19-retry-or-correct-clip/tasks.md"
Cohesion: 0.22
Nodes (8): 0. Setup, 1. Backend clip recovery (TDD), 2. Frontend clip recovery (TDD), 3. Review and update existing unit tests (MANDATORY), 4. Run unit tests and verify database state (MANDATORY), 5. Manual endpoint testing with curl (MANDATORY — AGENT MUST EXECUTE), 6. End-to-end browser testing (MANDATORY — AGENT MUST EXECUTE), 7. Technical documentation and final verification (MANDATORY)

### Community 367 - "Add observability and telemetry to the packaged application"
Cohesion: 0.25
Nodes (7): Add observability and telemetry to the packaged application, Capabilities, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 368 - "Adjust the pause after a scene and rebuild the final video"
Cohesion: 0.25
Nodes (7): Adjust the pause after a scene and rebuild the final video, Capabilities, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 369 - "Design — Assemble the final video from completed scenes"
Cohesion: 0.25
Nodes (7): Context, Decisions, Design — Assemble the final video from completed scenes, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 370 - "Assemble the final video from completed scenes"
Cohesion: 0.25
Nodes (7): Assemble the final video from completed scenes, Capabilities, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 371 - "Step 8 — Unit Test and DB Verification Report"
Cohesion: 0.25
Nodes (7): 8.1 Pre-test state, 8.2 Targeted test run (JOS-149 test files), 8.3 Full suite run, 8.4 Post-test state, 8.5 New test files introduced, 8.6 Conclusion, Step 8 — Unit Test and DB Verification Report

### Community 372 - "Design — Assign scene identifiers and visual instructions (JOS-144)"
Cohesion: 0.25
Nodes (7): Context, Decisions, Design — Assign scene identifiers and visual instructions (JOS-144), Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 373 - "Step 10 Report - E2E Testing in the Browser"
Cohesion: 0.25
Nodes (7): Applicability, Cleanup, Environment, Findings, Outcome, Step 10 Report - E2E Testing in the Browser, Steps and Results

### Community 374 - "backend/src/types.ts"
Cohesion: 0.07
Nodes (34): ascending(), assemblyGate, isSceneSettled(), getProviderRequest(), SessionProgress, computeOutcome(), deliverWhenReady(), PollOutcome (+26 more)

### Community 375 - "Step 8 Report — curl vs. Rendered UI Shape Comparison"
Cohesion: 0.25
Nodes (7): 8.1 — Reachability, 8.2 — Every endpoint the prototype consumes, with its exact response shape, 8.3 — Field-by-field: what the backend returns vs. what the UI actually reads, 8.4 — A state change reaches the open page without a reload, 8.5 — Cleanup, Outcome, Step 8 Report — curl vs. Rendered UI Shape Comparison

### Community 376 - "SOLID Principles"
Cohesion: 0.25
Nodes (8): Dependency Inversion Principle (DIP), DRY (Don't Repeat Yourself), Interface Segregation Principle (ISP), Liskov Substitution Principle (LSP), Open/Closed Principle (OCP), Single Responsibility Principle (SRP), SOLID and DRY Principles, SOLID Principles

### Community 377 - "6. OpenSpec Tasks Mandatory Steps"
Cohesion: 0.25
Nodes (8): 6.1 Read OpenSpec configuration first, 6.2 Required backend task structure, 6.3 Manual testing execution is agent responsibility, 6.4 Mandatory curl coverage (for endpoint work), 6.5 Mandatory Playwright E2E coverage (when applicable), 6.6 Completion checklist before finalizing `tasks.md`, 6.7 Mandatory artifact updates for change requests between `/apply` and `/archive`, 6. OpenSpec Tasks Mandatory Steps

### Community 378 - "Code Audit Methodology"
Cohesion: 0.29
Nodes (6): Code Audit Methodology, Common Pitfalls to Avoid, File Identification, Organization, Performance Optimization, Phase 1: Discovery

### Community 379 - "Model Descriptions"
Cohesion: 0.13
Nodes (15): replaceFinalVideoPath(), requestFinalVideoRebuild(), 3. Provider request / stage attempt (`provider_requests` table), 4. Scene result commit (`scene_results` table), 4c. Pause edits (`scene_pause_edits` table) and rebuilt final videos (`final_video_builds` table) — `adjust-scene-pause`, JOS-190, migration 16, 4d. Telemetry settings (`telemetry_settings` table) — `add-observability-telemetry`, JOS-199, migration 17, 5. Schema migrations (`schema_migrations` table), Data Model Documentation (+7 more)

### Community 380 - "Step 10 Report — Manual Endpoint Testing"
Cohesion: 0.25
Nodes (7): Cleanup (task 10.5), OpenAPI (task 10.4), Real narration and decomposition (task 10.2), Result, Setup (task 10.1), Step 10 Report — Manual Endpoint Testing, Trying to change an interval (task 10.3)

### Community 381 - "Backend stack walking skeleton (throwaway)"
Cohesion: 0.29
Nodes (6): Architecture, Backend stack walking skeleton (throwaway), Disposition, Environment, Running it, What this is not

### Community 382 - "Step 6 Report - Unit Test and State Verification"
Cohesion: 0.29
Nodes (6): Commands Executed, Filesystem State Verification, Outcome, Scope note, Step 6 Report - Unit Test and State Verification, Test Results

### Community 383 - "Step 7 Report — Unit Tests and Database State Verification"
Cohesion: 0.29
Nodes (6): A real bug found and fixed during this step, Commands Executed, Database State Verification, Outcome, Step 7 Report — Unit Tests and Database State Verification, Unit Test Results

### Community 384 - "2026-09-26-define-visual-design/design.md"
Cohesion: 0.29
Nodes (6): Context, Decisions, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 385 - "Step 12 — E2E Testing with Playwright MCP (Claude in Chrome)"
Cohesion: 0.25
Nodes (7): 12.1 Applicability, 12.2 Setup, 12.3 Session created and paused, 12.4 Continue removes paused text, 12.5 Cleanup, Step 12 — E2E Testing with Playwright MCP (Claude in Chrome), Verdict

### Community 386 - "Step 8 Report - E2E Testing in the Browser"
Cohesion: 0.29
Nodes (6): Applicability, Cleanup, Environment, Findings, Step 8 Report - E2E Testing in the Browser, Steps and Results

### Community 387 - "Step 11 Report — E2E Testing in the Browser"
Cohesion: 0.29
Nodes (6): Applicability, Cleanup, Environment, Findings, Step 11 Report — E2E Testing in the Browser, Steps and Results

### Community 388 - "ADDED Requirements"
Cohesion: 0.29
Nodes (6): ADDED Requirements, Requirement: Measured write capacity is recorded, Requirement: Result recording holds at MVP session scale, Scenario: 300 scenes complete at once with duplicate deliveries, Scenario: The scale evidence is reviewed, Scenario: The session reaches its final state

### Community 389 - "Step 8 — Unit tests and database verification (retry-decomposition, JOS-156)"
Cohesion: 0.29
Nodes (6): Coverage (task 8.3), Database state (tasks 9.1, 9.4), Existing tests reviewed (task 8.1), Runs (tasks 9.2-9.3), Scenario coverage (task 8.2), Step 8 — Unit tests and database verification (retry-decomposition, JOS-156)

### Community 390 - "Step 9: curl endpoint testing (JOS-166, see-provider-and-attempts)"
Cohesion: 0.29
Nodes (6): 9.1 Start, 9.2 A scene through the clip stage, then the image stage, 9.3 Session-level stages, with sentinel text in every free-text column, 9.4 Error case and the generated API docs, 9.5 Clean-up, Step 9: curl endpoint testing (JOS-166, see-provider-and-attempts)

### Community 391 - "Step 9 Report - Manual Endpoint Testing with curl"
Cohesion: 0.25
Nodes (7): Cleanup, How registration was exercised, Notes, Outcome, Results, Step 9 Report - Manual Endpoint Testing with curl, Transcript

### Community 392 - "Step 10 Report - E2E Testing in the Browser"
Cohesion: 0.25
Nodes (7): Applicability, Cleanup, Environment, Findings, Outcome, Step 10 Report - E2E Testing in the Browser, Steps and Results

### Community 393 - "Step 12: E2E testing (JOS-198, redesign-visual-design)"
Cohesion: 0.25
Nodes (7): Cleanup, Console, Environment, Observation outside this change, Scenarios, Screenshots (`screenshots/`), Step 12: E2E testing (JOS-198, redesign-visual-design)

### Community 394 - "Design — Consult a session by its identifier"
Cohesion: 0.25
Nodes (7): Context, Decisions, Design — Consult a session by its identifier, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 395 - "Consult a session by its identifier"
Cohesion: 0.25
Nodes (7): Capabilities, Consult a session by its identifier, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 396 - "Design — Decompose the script into chunks with their visual instructions"
Cohesion: 0.25
Nodes (7): Context, Decisions, Design — Decompose the script into chunks with their visual instructions, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 397 - "Decompose the script into chunks with their visual instructions"
Cohesion: 0.25
Nodes (7): Capabilities, Decompose the script into chunks with their visual instructions, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 398 - "Define the production and UAT deployment"
Cohesion: 0.25
Nodes (7): Capabilities, Define the production and UAT deployment, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 399 - "Design — Define the hardcoded providers and parameter values"
Cohesion: 0.25
Nodes (7): Context, Decisions, Design — Define the hardcoded providers and parameter values, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 400 - "Define the hardcoded providers and parameter values"
Cohesion: 0.25
Nodes (7): Capabilities, Define the hardcoded providers and parameter values, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 401 - "Step 6 — Establish the Supported Language List"
Cohesion: 0.25
Nodes (7): 6.1 — Candidates, 6.2 — Narration, 6.3 — Alignment, 6.4 — Reasoning segmentation, 6.5 — Supported language list, Spend, Step 6 — Establish the Supported Language List

### Community 402 - "Step 7c — Rate Limits and Per-Stage Request Caps"
Cohesion: 0.25
Nodes (7): 7.4 — Rate limit and account tier per provider, 7.5 — Derived maximum simultaneous requests per stage, 7.5a — Shared-account stages, 7.6 — Derivation recorded, not just the numbers, Note: an avoidable cost during this task, Spend, Step 7c — Rate Limits and Per-Stage Request Caps

### Community 403 - "Step 8 — Measure the Timing Values"
Cohesion: 0.25
Nodes (7): 8.1 — Latency spread per stage (4 samples each, wall-clock via `curl -w, 8.2 — Concurrent-load measurement, 8.3 — Per-phase maximum time (set above the slow tail), 8.4 — Clock starts at request-send, not queue-entry, 8.5 — Assembly phase maximum time, 8.6 — Spend to date, Step 8 — Measure the Timing Values

### Community 404 - "Download the final video"
Cohesion: 0.25
Nodes (7): Capabilities, Download the final video, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 405 - "Download individual scene results during processing"
Cohesion: 0.25
Nodes (7): Capabilities, Download individual scene results during processing, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 406 - "Step 7 — Manual endpoint testing with curl (JOS-163, download-scene-results)"
Cohesion: 0.25
Nodes (7): 7.1 — Health check, 7.2 — Image downloads while video-generating; clip 409, 7.3 — Restart with `success-bytes`; clips complete, 7.4 — Rejected kinds and cross-session scoping, 7.5 — Cleanup, Step 7 — Manual endpoint testing with curl (JOS-163, download-scene-results), Unrelated finding: a pre-attempt assembly failure's `attemptsInCycle: 0` fails response serialization

### Community 407 - "Design — Prevent the final video while any scene is incomplete"
Cohesion: 0.25
Nodes (7): Context, Decisions, Design — Prevent the final video while any scene is incomplete, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 408 - "Prevent the final video while any scene is incomplete"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Prevent the final video while any scene is incomplete, What Changes, Why

### Community 409 - "Step 10 — Manual Endpoint Testing with curl"
Cohesion: 0.25
Nodes (7): 10.1 — Server start and health check, 10.2 — Happy path (stub success): `video-generating` → `chunk-complete`, 10.3 — Failure path (stub transient): budget exhausted → 409 on retry/correct, 10.4 — Real RunningHub call, 10.5 — Schema check (`GET /docs/json`), 10.6 — Cleanup, Step 10 — Manual Endpoint Testing with curl

### Community 410 - "Generate the full voice-over"
Cohesion: 0.25
Nodes (7): Capabilities, Generate the full voice-over, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 411 - "Step 10 Report - E2E Testing in the Browser"
Cohesion: 0.25
Nodes (7): Applicability, Cleanup, Environment, Findings, Outcome, Step 10 Report - E2E Testing in the Browser, Steps and Results

### Community 412 - "Limit simultaneous provider requests per stage"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Limit simultaneous provider requests per stage, Modified Capabilities, New Capabilities, What Changes, Why

### Community 413 - "Moderate the script at submission"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Moderate the script at submission, Modified Capabilities, New Capabilities, What Changes, Why

### Community 414 - "Raise the per-phase time limits for real script sizes"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Raise the per-phase time limits for real script sizes, What Changes, Why

### Community 415 - "Record requested duration and speed-adjustment factor per scene"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Record requested duration and speed-adjustment factor per scene, What Changes, Why

### Community 416 - "Code Audit Methodology"
Cohesion: 0.29
Nodes (6): Code Audit Methodology, Common Pitfalls to Avoid, File Identification, Organization, Performance Optimization, Phase 1: Discovery

### Community 417 - "Domain-Driven Design Principles"
Cohesion: 0.29
Nodes (7): Additional Recommendations, Aggregates, Domain-Driven Design Principles, Domain Services, Entities, Repositories, Value Objects

### Community 418 - "Claude Search Optimization (CSO)"
Cohesion: 0.33
Nodes (6): 1. Rich Description Field, 2. Keyword Coverage, 3. Descriptive Naming, 4. Cross-Referencing Other Skills, 4. Token Efficiency (Critical), Claude Search Optimization (CSO)

### Community 419 - "Bulletproofing Skills Against Rationalization"
Cohesion: 0.33
Nodes (6): Address "Spirit vs Letter" Arguments, Build Rationalization Table, Bulletproofing Skills Against Rationalization, Close Every Loophole Explicitly, Create Red Flags List, Update CSO for Violation Symptoms

### Community 420 - "visual-instructions.test.ts"
Cohesion: 0.20
Nodes (7): createOpenAiVisualInstructionGenerator(), FRAGMENTS, generatorWith(), RecordedCall, TWO_PAIRS, Real finding: the reasoning provider's default timeout is tight for 5 scenes, 6. Port, adapter and holder, like the decomposition dependencies

### Community 422 - "Step 6 Report — Unit Tests and Persisted-State Verification"
Cohesion: 0.33
Nodes (5): Commands Executed, Outcome, Persisted-State Verification, Step 6 Report — Unit Tests and Persisted-State Verification, Unit Test Results

### Community 423 - "Step 8 Report — E2E Testing of Live Push (Experiment 4.4)"
Cohesion: 0.33
Nodes (5): 8.2–8.3 — live update without reload (PRD §8.3 / C8), 8.4 — drop the connection, let a change occur, restore it, confirm correct final state, Finding raised and fixed during this experiment, Outcome, Step 8 Report — E2E Testing of Live Push (Experiment 4.4)

### Community 424 - "Step 7 Report — Unit Tests and Database State Verification"
Cohesion: 0.33
Nodes (5): Commands Executed, Database State Verification, Outcome, Step 7 Report — Unit Tests and Database State Verification, Unit Test Results

### Community 425 - "Step 9 Report — Unit Tests and Database State Verification"
Cohesion: 0.33
Nodes (5): Commands Executed, Database State Verification, Outcome, Step 9 Report — Unit Tests and Database State Verification, Unit Test Results

### Community 426 - "Step 5 Report - Unit Tests and State Verification"
Cohesion: 0.33
Nodes (5): Commands Executed, Database/State Verification, Outcome, Step 5 Report - Unit Tests and State Verification, Unit Test Results

### Community 427 - "Step 11 Report — E2E Check"
Cohesion: 0.33
Nodes (5): Applicability (task 11.1), Check performed, Cleanup, Result, Step 11 Report — E2E Check

### Community 428 - "Step 8 Report - Unit Tests and Database Verification"
Cohesion: 0.25
Nodes (7): Commands Executed, Coverage Comparison (task 7.4), Database State Verification, Outcome, Scenario-to-test mapping (task 7.3), Step 8 Report - Unit Tests and Database Verification, Unit Test Results

### Community 429 - "Step 3 Report — Numeric Comparison"
Cohesion: 0.33
Nodes (5): Answering §14.1's specific checks (design Decision 6), Conclusion for this step, Files, Results, Step 3 Report — Numeric Comparison

### Community 430 - "JOS-166: See the provider and attempts of each stage"
Cohesion: 0.33
Nodes (5): JOS-166: See the provider and attempts of each stage, Reconciled with what has merged, Verification, What changed, Worth a look

### Community 431 - "Retime and join scene clips into the video track"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Retime and join scene clips into the video track, What Changes, Why

### Community 432 - "Step 9 Report - E2E Check in the Browser"
Cohesion: 0.33
Nodes (5): Applicability (9.1), Findings, Setup (9.2), Step 9 Report - E2E Check in the Browser, Steps

### Community 433 - "Step 11 — E2E testing with Playwright (JOS-159, retry-final-assembly)"
Cohesion: 0.33
Nodes (5): 11.1 — Applicability, 11.2 — Failed state shown, 11.3 — Retry succeeds, live update, scene rows unchanged, 11.4 — Cleanup, Step 11 — E2E testing with Playwright (JOS-159, retry-final-assembly)

### Community 434 - "Step 8 — Unit tests and database verification (JOS-155, retry-voice-over)"
Cohesion: 0.25
Nodes (7): 7.1 — Existing tests reviewed, 7.2 — Spec scenario to test map, 7.3 — Coverage, 8.1 / 8.4 — Default store, 8.2 / 8.3 — Results, Not executed here, Step 8 — Unit tests and database verification (JOS-155, retry-voice-over)

### Community 435 - "Run a session end to end"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Run a session end to end, What Changes, Why

### Community 436 - "Design — Start a video project from a title, a script, and its language"
Cohesion: 0.25
Nodes (7): Context, Decisions, Design — Start a video project from a title, a script, and its language, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 437 - "Start a video project from a title, a script, and its language"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Start a video project from a title, a script, and its language, What Changes, Why

### Community 438 - "Vid4You privacy policy"
Cohesion: 0.25
Nodes (7): The three signals, Turning things off, Update notice, Vid4You privacy policy, What is never sent, What stays on your computer regardless, Where the data goes

### Community 439 - "View progress by phase"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, View progress by phase, What Changes, Why

### Community 440 - "Step 8: unit tests and database verification (JOS-168, view-progress-by-phase)"
Cohesion: 0.25
Nodes (7): 7.2 Scenario coverage, 7.2 Ticket acceptance criteria, 8.1 Baseline of the default store (`backend/data/skeleton.sqlite`), 8.2 Targeted tests, 8.3 Typecheck and full suites, 8.4 Post-test state, Step 8: unit tests and database verification (JOS-168, view-progress-by-phase)

### Community 441 - "Name the downloaded final video after the project title"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, Name the downloaded final video after the project title, New Capabilities, What Changes, Why

### Community 442 - "Step 5 Report - Unit Tests and Database Verification"
Cohesion: 0.25
Nodes (7): Commands Executed, Database State Verification, Finding outside this change, Outcome, Scenario to test mapping, Step 5 Report - Unit Tests and Database Verification, Unit Test Results

### Community 443 - "Step 6 Report - Manual endpoint testing with curl (JOS-193)"
Cohesion: 0.25
Nodes (7): 6.2-6.3 Downloads (all 200, `content-type: video/mp4`, `content-length: 12`), 6.4 Unchanged refusals, 6.5 Contract, Cleanup, Outcome, Setup notes, Step 6 Report - Manual endpoint testing with curl (JOS-193)

### Community 444 - "Repository cleanup inventory (MVP closure, JOS-203 item I5)"
Cohesion: 0.29
Nodes (6): Correction, Findings that are not removals, Needs a rewrite, not a removal, Not covered here, Removals and fixes (approved 2026-10-20), Repository cleanup inventory (MVP closure, JOS-203 item I5)

### Community 445 - "MVP release-readiness gates"
Cohesion: 0.29
Nodes (6): Gate 1: MVP scope complete, Gate 2: Release candidate ready, Gate 3: Deployment approved, MVP release-readiness gates, Summary, What happens next

### Community 446 - "JOS-199 step 11 — unit tests and database verification"
Cohesion: 0.29
Nodes (6): Baseline (11.1), JOS-199 step 11 — unit tests and database verification, Notes, Post-test state (11.4), Re-run after the "Not now" and privacy-link change (11.7), Runs

### Community 447 - "Step 10: unit tests and database verification (JOS-190, adjust-scene-pause)"
Cohesion: 0.29
Nodes (6): 10.1 Baseline, 10.2-10.3 Commands and results, 10.4 Post-test state, 9.3 Scenario coverage (`specs/`), Outcome, Step 10: unit tests and database verification (JOS-190, adjust-scene-pause)

### Community 448 - "Step 9 Report - E2E Testing in the Browser"
Cohesion: 0.29
Nodes (6): Applicability, Cleanup, Environment, Findings, Step 9 Report - E2E Testing in the Browser, Steps and Results

### Community 449 - "Pause the session and continue explicitly"
Cohesion: 0.29
Nodes (6): Capabilities, Impact, Modified Capabilities, New Capabilities, Pause the session and continue explicitly, What Changes

### Community 450 - "Step 11: manual endpoint testing (JOS-190, adjust-scene-pause)"
Cohesion: 0.29
Nodes (6): Baseline, Cleanup, Not exercised here, `POST /sessions/:id/final-video/rebuild`, `POST /sessions/:id/scenes/:sceneId/pause`, Step 11: manual endpoint testing (JOS-190, adjust-scene-pause)

### Community 451 - "Requirement: The final video appears only on success and never replaces a file"
Cohesion: 0.29
Nodes (6): MODIFIED Requirements, Requirement: The final video appears only on success and never replaces a file, Scenario: A failed rebuild, Scenario: A successful rebuild keeps earlier versions, Scenario: Failed attempt leaves nothing, Scenario: Successful retry after failures

### Community 452 - "Step 10 — E2E Testing Report"
Cohesion: 0.29
Nodes (6): 10.1 Applicability decision, 10.2 Environment, 10.3 E2E scenario, 10.4 Environment restored, Result, Step 10 — E2E Testing Report

### Community 453 - "Step 8 Report - Unit Tests and Database State Verification"
Cohesion: 0.29
Nodes (6): Commands Executed, Coverage (task 7.3), Database State Verification, Spec scenario to test mapping (task 7.2), Step 8 Report - Unit Tests and Database State Verification, Unit Test Results

### Community 454 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, fastify, @fastify/cors, @fastify/swagger, @fastify/swagger-ui, fastify-type-provider-zod, @opentelemetry/api, @opentelemetry/api-logs (+7 more)

### Community 455 - "frontend/test/useLiveSession.test.tsx"
Cohesion: 0.18
Nodes (8): eventsUrl(), fetchSnapshot(), LiveUpdatesLogEntry, record(), useLiveSession(), Window, SessionSnapshot, FakeEventSource

### Community 456 - "env.ts"
Cohesion: 0.33
Nodes (5): dataDir, execFileShim(), ffmpegPath, ffprobePath, mapBinary()

### Community 457 - "Claude Search Optimization (CSO)"
Cohesion: 0.33
Nodes (6): 1. Rich Description Field, 2. Keyword Coverage, 3. Descriptive Naming, 4. Cross-Referencing Other Skills, 4. Token Efficiency (Critical), Claude Search Optimization (CSO)

### Community 458 - "Bulletproofing Skills Against Rationalization"
Cohesion: 0.33
Nodes (6): Address "Spirit vs Letter" Arguments, Build Rationalization Table, Bulletproofing Skills Against Rationalization, Close Every Loophole Explicitly, Create Red Flags List, Update CSO for Violation Symptoms

### Community 459 - "Coding Standards"
Cohesion: 0.33
Nodes (6): Coding Standards, Error Handling, Logging Standards, Naming Conventions, TypeScript Usage, Validation Patterns

### Community 460 - "Technology Stack"
Cohesion: 0.33
Nodes (6): Core Technologies, Development Tools, State Management & Data Flow, Technology Stack, Testing Framework, UI Framework

### Community 461 - "ai-specs/skills/meta-prompt/SKILL.md"
Cohesion: 0.40
Nodes (4): Instructions, Instructions, meta-prompt Skill, Original prompt:

### Community 462 - "ai-specs/skills/writing-skills/anthropic-best-practices.md"
Cohesion: 0.40
Nodes (4): [Analysis Title], Executive summary, Key findings, Recommendations

### Community 463 - "Anti-Patterns"
Cohesion: 0.40
Nodes (5): Anti-Patterns, ❌ Code in Flowcharts, ❌ Generic Labels, ❌ Multi-Language Dilution, ❌ Narrative Example

### Community 464 - "Testing All Skill Types"
Cohesion: 0.40
Nodes (5): Discipline-Enforcing Skills (rules/requirements), Pattern Skills (mental models), Reference Skills (documentation/APIs), Technique Skills (how-to guides), Testing All Skill Types

### Community 465 - "Step 8 Report - Manual Endpoint Testing with curl"
Cohesion: 0.40
Nodes (4): Findings, Setup, Step 8 Report - Manual Endpoint Testing with curl, Steps

### Community 466 - "JOS-194 proof of concept — created resources (task 6.4)"
Cohesion: 0.29
Nodes (6): B+ deploy attempt, 2026-10-13 (stopped by the plan), B+ deployed, 2026-10-13 (after Workers Paid was activated), B+ proof of concept (created 2026-10-13 from `poc/terraform-bplus/`, separate state), JOS-194 proof of concept — created resources (task 6.4), Proof-of-concept files removed — 2026-10-13, Teardown — 2026-10-13 (task 13.2)

### Community 467 - "Step 9 Report - Unit Tests and Database Verification"
Cohesion: 0.29
Nodes (6): Commands Executed, Database State Verification, Findings for the CI follow-up story (task 8.2), Outcome, Step 9 Report - Unit Tests and Database Verification, Unit Test Results

### Community 468 - "Step 15 — Spend Summary Against the $20 Ceiling"
Cohesion: 0.29
Nodes (6): ElevenLabs (voice + alignment) — subscription, $0 incremental, Fal.ai (image) — count-measured, dollar cost estimated, OpenAI (decomposition) — token-measured, dollar cost estimated, RunningHub (video) — itemized, exact, Step 15 — Spend Summary Against the $20 Ceiling, Total

### Community 469 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+5 more)

### Community 470 - "Step 9 — Browser E2E (JOS-151)"
Cohesion: 0.33
Nodes (5): Findings (9.3), Live update (9.4), Restore (9.5), Setup (9.2), Step 9 — Browser E2E (JOS-151)

### Community 471 - "template/ai-specs/skills/meta-prompt/SKILL.md"
Cohesion: 0.40
Nodes (4): Instructions, Instructions, meta-prompt Skill, Original prompt:

### Community 472 - "template/ai-specs/skills/writing-skills/anthropic-best-practices.md"
Cohesion: 0.40
Nodes (4): [Analysis Title], Executive summary, Key findings, Recommendations

### Community 473 - "Anti-Patterns"
Cohesion: 0.40
Nodes (5): Anti-Patterns, ❌ Code in Flowcharts, ❌ Generic Labels, ❌ Multi-Language Dilution, ❌ Narrative Example

### Community 474 - "Testing All Skill Types"
Cohesion: 0.40
Nodes (5): Discipline-Enforcing Skills (rules/requirements), Pattern Skills (mental models), Reference Skills (documentation/APIs), Technique Skills (how-to guides), Testing All Skill Types

### Community 475 - "API Design Standards"
Cohesion: 0.40
Nodes (5): API Design Standards, CORS Configuration, Error Response Format, Request/Response Patterns, REST Endpoints

### Community 476 - "Technology Stack"
Cohesion: 0.40
Nodes (5): Core Technologies, Database & ORM, Development Tools, Technology Stack, Testing Framework

### Community 477 - "frontend/src/components/FinalVideoDownload.tsx"
Cohesion: 0.09
Nodes (24): Useful Skills, FinalVideoDownload(), rebuild(), Props, oneDecimal(), PauseDial(), commit(), save() (+16 more)

### Community 478 - "Step 7a — Failure Signal: Reasoning Provider (OpenAI)"
Cohesion: 0.29
Nodes (6): 7.1 - Trigger a not-retryable rejection (reasoning / OpenAI `gpt-6-astra`), 7.2 - Exact shape, 7.3 - Distinguishing from a transient failure, Spend, Step 7a — Failure Signal: Reasoning Provider (OpenAI), Still open (blocked this session)

### Community 479 - "Phase 0: Pre-Analysis Setup"
Cohesion: 0.50
Nodes (4): 1. Project Configuration, 2. Baseline Checks, 3. Documentation Loading, Phase 0: Pre-Analysis Setup

### Community 480 - "Phase 4: Pattern Detection"
Cohesion: 0.50
Nodes (4): Abstraction Opportunities, Cross-File Patterns, Inconsistencies, Phase 4: Pattern Detection

### Community 481 - "Phase 3.5: TypeScript Types Verification"
Cohesion: 0.50
Nodes (4): Check for Duplicate Types, Common Issues, Phase 3.5: TypeScript Types Verification, Verify @types Packages

### Community 482 - "Phase 5: Library Recommendations"
Cohesion: 0.50
Nodes (4): Common Replacements, Discovery Process, Evaluation Criteria, Phase 5: Library Recommendations

### Community 483 - "Tool Usage Reference"
Cohesion: 0.50
Nodes (4): Context7, GitHub CLI, Package Research, Tool Usage Reference

### Community 484 - "Phase 3: Best Practices Verification"
Cohesion: 0.50
Nodes (4): Context7 Documentation Check, Cross-Reference Findings, GitHub Research, Phase 3: Best Practices Verification

### Community 485 - "enrich-us Skill"
Cohesion: 0.50
Nodes (3): enrich-us Skill, Instructions, Notes

### Community 486 - "Evaluation and iteration"
Cohesion: 0.50
Nodes (4): Build evaluations first, Develop Skills iteratively with Claude, Evaluation and iteration, Observe how Claude navigates Skills

### Community 487 - "Checklist for effective Skills"
Cohesion: 0.50
Nodes (4): Checklist for effective Skills, Code and scripts, Core quality, Testing

### Community 488 - "Core principles"
Cohesion: 0.50
Nodes (4): Concise is key, Core principles, Set appropriate degrees of freedom, Test with all models you plan to use

### Community 489 - "File Organization"
Cohesion: 0.50
Nodes (4): File Organization, Self-Contained Skill, Skill with Heavy Reference, Skill with Reusable Tool

### Community 490 - "RED-GREEN-REFACTOR for Skills"
Cohesion: 0.50
Nodes (4): GREEN: Write Minimal Skill, RED-GREEN-REFACTOR for Skills, RED: Write Failing Test (Baseline), REFACTOR: Close Loopholes

### Community 491 - "Skill Types"
Cohesion: 0.50
Nodes (4): Pattern, Reference, Skill Types, Technique

### Community 492 - "Step 9 Report — E2E Applicability (task 9.1)"
Cohesion: 0.50
Nodes (3): Decision: not applicable, Outcome, Step 9 Report — E2E Applicability (task 9.1)

### Community 493 - "Step 9 — Derive the Remaining Values"
Cohesion: 0.29
Nodes (6): 9.1 — Segmentation lower bound, 9.2 — Workability against §6.1.1 edge cases, 9.3 — Output resolution and frame rate vs. D08, 9.4 — Speed-factor limit, 9.5 — Cross-check for internal consistency, Step 9 — Derive the Remaining Values

### Community 494 - "Step 8 — E2E testing with the browser (JOS-164, download-final-video)"
Cohesion: 0.29
Nodes (6): 8.1 — No final-video link while scenes are still processing, 8.2 — The link appears live, without a reload, 8.3 — Following the link downloads the real file, no prompt, 8.4 — Restore and cleanup, Note: the bare stub assembly tool never writes real bytes, Step 8 — E2E testing with the browser (JOS-164, download-final-video)

### Community 495 - "Step 6 — Unit test and DB verification (JOS-163, download-scene-results)"
Cohesion: 0.29
Nodes (6): AC/scenario → test map, Default store untouched, Full run, Scope check (task 1.1), Step 6 — Unit test and DB verification (JOS-163, download-scene-results), Task 5.3 — coverage not decreased

### Community 496 - "template/ai-specs/agents/frontend-developer.md"
Cohesion: 0.50
Nodes (3): Goal, Output format, Rules

### Community 497 - "Phase 0: Pre-Analysis Setup"
Cohesion: 0.50
Nodes (4): 1. Project Configuration, 2. Baseline Checks, 3. Documentation Loading, Phase 0: Pre-Analysis Setup

### Community 498 - "Phase 4: Pattern Detection"
Cohesion: 0.50
Nodes (4): Abstraction Opportunities, Cross-File Patterns, Inconsistencies, Phase 4: Pattern Detection

### Community 499 - "Phase 3.5: TypeScript Types Verification"
Cohesion: 0.50
Nodes (4): Check for Duplicate Types, Common Issues, Phase 3.5: TypeScript Types Verification, Verify @types Packages

### Community 500 - "Phase 5: Library Recommendations"
Cohesion: 0.50
Nodes (4): Common Replacements, Discovery Process, Evaluation Criteria, Phase 5: Library Recommendations

### Community 501 - "Tool Usage Reference"
Cohesion: 0.50
Nodes (4): Context7, GitHub CLI, Package Research, Tool Usage Reference

### Community 502 - "Phase 3: Best Practices Verification"
Cohesion: 0.50
Nodes (4): Context7 Documentation Check, Cross-Reference Findings, GitHub Research, Phase 3: Best Practices Verification

### Community 503 - "Evaluation and iteration"
Cohesion: 0.50
Nodes (4): Build evaluations first, Develop Skills iteratively with Claude, Evaluation and iteration, Observe how Claude navigates Skills

### Community 504 - "Checklist for effective Skills"
Cohesion: 0.50
Nodes (4): Checklist for effective Skills, Code and scripts, Core quality, Testing

### Community 505 - "Core principles"
Cohesion: 0.50
Nodes (4): Concise is key, Core principles, Set appropriate degrees of freedom, Test with all models you plan to use

### Community 506 - "File Organization"
Cohesion: 0.50
Nodes (4): File Organization, Self-Contained Skill, Skill with Heavy Reference, Skill with Reusable Tool

### Community 507 - "RED-GREEN-REFACTOR for Skills"
Cohesion: 0.50
Nodes (4): GREEN: Write Minimal Skill, RED-GREEN-REFACTOR for Skills, RED: Write Failing Test (Baseline), REFACTOR: Close Loopholes

### Community 508 - "Skill Types"
Cohesion: 0.50
Nodes (4): Pattern, Reference, Skill Types, Technique

### Community 509 - "Database Patterns"
Cohesion: 0.50
Nodes (4): Database Patterns, Migrations, Prisma Schema, Repository Pattern

### Community 510 - "Security Best Practices"
Cohesion: 0.50
Nodes (4): Dependency Injection, Environment Variables, Input Validation, Security Best Practices

### Community 515 - "Step 10 Report - E2E Testing (Chrome browser automation)"
Cohesion: 0.29
Nodes (6): Applicability (10.1), Cleanup (10.4), Outcome, Result (10.3), Setup (10.2), Step 10 Report - E2E Testing (Chrome browser automation)

### Community 516 - "fetch"
Cohesion: 0.13
Nodes (16): ALLOWED_ATTRIBUTE_KEYS, ALLOWED, Env, fetch(), PATHS, readCapped(), refuse(), stripAttributes() (+8 more)

### Community 517 - "Design — Generate the image of each scene (JOS-145)"
Cohesion: 0.29
Nodes (6): Context, Design — Generate the image of each scene (JOS-145), Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 518 - "Step 9 Report - E2E Testing in the Browser"
Cohesion: 0.33
Nodes (5): Applicability (9.1), Cleanup (9.4), Restart (9.3), Setup (9.2), Step 9 Report - E2E Testing in the Browser

### Community 519 - "Step 10 Report — E2E Check"
Cohesion: 0.29
Nodes (6): Applicability (task 10.1), Check performed (task 10.3), Cleanup (task 10.4), Result, Setup (task 10.2), Step 10 Report — E2E Check

### Community 520 - "Design — Generate the clip of each scene (JOS-146)"
Cohesion: 0.29
Nodes (6): Context, Design — Generate the clip of each scene (JOS-146), Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 528 - "Design — Generate the full voice-over"
Cohesion: 0.29
Nodes (6): Context, Design — Generate the full voice-over, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 529 - "Step 9 Report - Manual Endpoint Testing with curl"
Cohesion: 0.29
Nodes (6): Additional checks, Cleanup (9.9), Outcome, Results, Setup, Step 9 Report - Manual Endpoint Testing with curl

### Community 544 - "Design — Ignore repeated success confirmations"
Cohesion: 0.33
Nodes (5): Design — Ignore repeated success confirmations, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 545 - "Keep project files locally without overwriting or expiry"
Cohesion: 0.29
Nodes (6): Capabilities, Keep project files locally without overwriting or expiry, Modified Capabilities, New Capabilities, What Changes, Why

### Community 546 - "Step 6 — Manual endpoint testing with curl (JOS-162, keep-project-files-locally)"
Cohesion: 0.29
Nodes (6): 6.1 — Health check, 6.2 — Same-title counter, 6.4 — Restart, re-read both sessions, 6.5 — Cleanup, Scope-expansion check — corrected-instructions.json over HTTP, Step 6 — Manual endpoint testing with curl (JOS-162, keep-project-files-locally)

### Community 547 - "startNewCycle"
Cohesion: 0.05
Nodes (47): countProviderRequestsByScene(), countScenesForRun(), getStageInstanceAttempts(), stageInstanceKeyOf(), DecompositionRetryRefusal, DecompositionRetryResult, hasPendingRetry(), retryDecomposition() (+39 more)

### Community 548 - "Step 11: manual endpoint testing (JOS-198, redesign-visual-design)"
Cohesion: 0.40
Nodes (4): Cleanup, Environment, Requests, Step 11: manual endpoint testing (JOS-198, redesign-visual-design)

### Community 549 - "Step 8 — Unit tests and database verification (JOS-167)"
Cohesion: 0.29
Nodes (6): Database state (8.1, 8.4), Existing tests changed (7.1), Not verified, Results, Scenario to test map (7.2), Step 8 — Unit tests and database verification (JOS-167)

### Community 550 - "Frontend Project Standards and Best Practices"
Cohesion: 0.17
Nodes (12): Architecture: The Live-Update Seam, Deployment, Development Workflow, Frontend Project Standards and Best Practices, Not Yet Decided, Overview, Project Structure, Screen Inventory (+4 more)

### Community 552 - "Step 10 Report - E2E Testing (Chrome browser automation)"
Cohesion: 0.29
Nodes (6): Applicability (task 10.1), Cleanup (task 10.5), Outcome, Setup, Step 10 Report - E2E Testing (Chrome browser automation), Steps and result (task 10.2-10.4)

### Community 553 - "2026-10-19-retry-or-correct-clip/proposal.md"
Cohesion: 0.29
Nodes (6): Capabilities, Impact, Modified Capabilities, New Capabilities, What Changes, Why

### Community 554 - "Step 5 Report — Manual Endpoint Testing"
Cohesion: 0.29
Nodes (6): Cleanup, Commands and Results, Environment, Notes, Outcome, Step 5 Report — Manual Endpoint Testing

### Community 555 - "Step 7: curl endpoint testing (JOS-185, stage-execution-time-limit)"
Cohesion: 0.20
Nodes (9): 7.3 The first attempt hangs, the retry answers (`hang-once-then-success`, retry delay 1 s), 7.4 The answer arrives late, before the retry's delay (`success-after-limit`, retry delay 10 s), 7.5 The provider always hangs (`hang`, retry delay 1 s), 7.6 Time held before sending is not timed (`hang-once-then-success`, retry delay 3 s), 7.7 Clean-up, 8.1 E2E, Finding outside this change, Not shown over HTTP, and why (+1 more)

### Community 556 - "Step 6 Report — Browser End-to-End Testing"
Cohesion: 0.29
Nodes (6): Cleanup, Environment, Notes, Outcome, Scenarios and Results, Step 6 Report — Browser End-to-End Testing

### Community 557 - "Step 9 — Manual endpoint testing (JOS-155, retry-voice-over)"
Cohesion: 0.29
Nodes (6): 9.5 — Clean-up, Results (9.1 - 9.4), Session 1: failed, then retry, Session 2: failed, paused, retry held, continue, Step 9 — Manual endpoint testing (JOS-155, retry-voice-over), Transcripts

### Community 558 - "Step 9 — unit tests and database verification (run-session-end-to-end, JOS-195)"
Cohesion: 0.29
Nodes (6): Cleanup, Commands, Database state, Results, Step 9 — unit tests and database verification (run-session-end-to-end, JOS-195), The 11 failures after the hand-off, and what they were

### Community 559 - "Step 10 Report - E2E Testing (Start a Video Project)"
Cohesion: 0.29
Nodes (6): Cleanup, Environment, Outcome, Scenarios executed, Step 10 Report - E2E Testing (Start a Video Project), Tooling note

### Community 560 - "Design — Segment the script into chunks within duration bounds (JOS-140)"
Cohesion: 0.29
Nodes (6): Context, Design — Segment the script into chunks within duration bounds (JOS-140), Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 561 - "Step 8 Report - Unit Tests and Database State Verification"
Cohesion: 0.29
Nodes (6): Addendum — a transient failure found and run to ground after this step, Commands Executed, Database State Verification, Outcome, Step 8 Report - Unit Tests and Database State Verification, Unit Test Results

### Community 562 - "Design — Preserve project progress across restarts"
Cohesion: 0.33
Nodes (5): Design — Preserve project progress across restarts, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 563 - "Step 10 — Manual endpoint testing with curl (JOS-159, retry-final-assembly)"
Cohesion: 0.33
Nodes (5): 10.1 — Server start and health check, 10.2 — A session fails in assembly; nothing generated is touched, 10.4 — Error cases, 10.5 — Cleanup, Step 10 — Manual endpoint testing with curl (JOS-159, retry-final-assembly)

### Community 564 - "Borrador de adenda al PRD — telemetría opcional (JOS-199)"
Cohesion: 0.33
Nodes (5): 12.4 Telemetría y privacidad (nuevo), Borrador de adenda al PRD — telemetría opcional (JOS-199), Decisiones tomadas (2026-10-18), Pendiente, Propuesta de texto

### Community 565 - "Step 9 Report - Manual Endpoint Testing with curl"
Cohesion: 0.33
Nodes (5): Cleanup (9.7), Outcome, Results, Setup, Step 9 Report - Manual Endpoint Testing with curl

### Community 566 - "Design — Lock the script at project start and the narration once complete (JOS-137)"
Cohesion: 0.29
Nodes (6): Context, Design — Lock the script at project start and the narration once complete (JOS-137), Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 567 - "Step 8 Report - Manual Endpoint Testing with curl"
Cohesion: 0.29
Nodes (6): 8.2 Queued and in-flight work across `kill -9`, 8.3 Interrupted timestamps and assembly attempts, 8.4 Paused session, 8.5 Cleanup, Setup, Step 8 Report - Manual Endpoint Testing with curl

### Community 568 - "Step 6.15 — B+ against the real R2 bucket, from a local container"
Cohesion: 0.33
Nodes (5): Findings, Not done, Stand-ins, Step 6.15 — B+ against the real R2 bucket, from a local container, What this answers

### Community 569 - "Step 6E — local packaged application, macOS (Decision 14)"
Cohesion: 0.33
Nodes (5): Not done here, Results (run with `env -i PATH=/usr/bin:/bin`, so nothing from Homebrew is reachable), Stand-ins (each one is a follow-up story), Step 6E — local packaged application, macOS (Decision 14), What was built

### Community 570 - "Step 7 — B+ experiments on Cloudflare Containers"
Cohesion: 0.33
Nodes (5): Findings, Not done, Results, Stand-ins, Step 7 — B+ experiments on Cloudflare Containers

### Community 571 - "Step 6.20 — Windows x64 run (JOS-203 B3)"
Cohesion: 0.33
Nodes (5): Confirmed, Not reported, Outcome, Step 6.20 — Windows x64 run (JOS-203 B3), What differed from macOS

### Community 572 - "Step 8 Report - Manual Endpoint Testing"
Cohesion: 0.29
Nodes (6): get(), Cleanup, Outcome, Results, Setup, Step 8 Report - Manual Endpoint Testing

### Community 573 - "Step 12 Report - Unit Tests and Database Verification"
Cohesion: 0.33
Nodes (5): Commands Executed, Database State Verification, Outcome, Step 12 Report - Unit Tests and Database Verification, Unit Test Results

### Community 574 - "Step 5b — Verify the Image Provider, Verify the Reasoning Provider, Close Out Group 5"
Cohesion: 0.33
Nodes (5): 5.3 — Image provider (Fal.ai), 5.4 / 5.5 — Reasoning provider (OpenAI), 5.6 — Providers selected, Spend, Step 5b — Verify the Image Provider, Verify the Reasoning Provider, Close Out Group 5

### Community 575 - "Step 7b — Failure Signals: Voice, Image, Video Providers"
Cohesion: 0.33
Nodes (5): 7.1 - Trigger a not-retryable rejection (voice, image, video), 7.2 - Exact shape, 7.3 - Distinguishing from a transient failure, Spend, Step 7b — Failure Signals: Voice, Image, Video Providers

### Community 576 - "Grafana dashboards"
Cohesion: 0.40
Nodes (4): Grafana dashboards, Import, Metric and label names the queries rely on, Where to update the prices

### Community 577 - "Step 8 — E2E testing with the browser (JOS-163, download-scene-results)"
Cohesion: 0.33
Nodes (5): 8.1 — A video-generating scene offers only its image download, 8.2 — Following the image link downloads the real file, 8.3 — Clip links appear live, without a reload, 8.4 — Restore and cleanup, Step 8 — E2E testing with the browser (JOS-163, download-scene-results)

### Community 578 - "2026-10-19-fix-runninghub-adapter/design.md"
Cohesion: 0.33
Nodes (5): Context, Decisions, Goals / Non-Goals, Open Questions, Risks / Trade-offs

### Community 579 - "Step 4 — unit tests and database verification (fix-runninghub-adapter, JOS-196)"
Cohesion: 0.33
Nodes (5): Commands, Database state, Results, Step 4 — unit tests and database verification (fix-runninghub-adapter, JOS-196), Tests whose assertions changed

### Community 580 - "Step 9 — Unit Test and DB Verification"
Cohesion: 0.33
Nodes (5): 9.1 Pre-test baseline (default store), 9.2 Targeted tests, 9.3 Full test suite and typecheck, 9.4 Post-test DB state, Step 9 — Unit Test and DB Verification

### Community 581 - "Step 8 Report - Unit Tests and Database State Verification"
Cohesion: 0.33
Nodes (5): Commands Executed, Database State Verification, Outcome, Step 8 Report - Unit Tests and Database State Verification, Unit Test Results

### Community 582 - "Design — Keep project files locally without overwriting or expiry"
Cohesion: 0.33
Nodes (5): Design — Keep project files locally without overwriting or expiry, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 583 - "Step 10 — Browser end-to-end check (JOS-167)"
Cohesion: 0.33
Nodes (5): Applicability, Cleanup, Result, Setup, Step 10 — Browser end-to-end check (JOS-167)

### Community 585 - "Design — Pause the session and continue explicitly"
Cohesion: 0.33
Nodes (5): Design — Pause the session and continue explicitly, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 586 - "Design — Retry or correct the image instruction after an image failure"
Cohesion: 0.33
Nodes (5): Design — Retry or correct the image instruction after an image failure, Goals / Non-Goals, Migration Plan, Open Questions, Risks / Trade-offs

### Community 587 - "Step 1 — Moderation endpoint verification"
Cohesion: 0.33
Nodes (5): Decision, Latency samples (clean English script, pinned snapshot), Notes, Step 1 — Moderation endpoint verification, Verdicts (pinned snapshot `omni-moderation-2024-09-26`)

### Community 588 - "Step 4 — unit tests and database verification (raise-video-time-limit, JOS-197)"
Cohesion: 0.33
Nodes (5): Commands, Database state, Results, Step 4 — unit tests and database verification (raise-video-time-limit, JOS-197), Tests changed or added

### Community 589 - "redactPaths"
Cohesion: 0.17
Nodes (12): escapeRegExp(), redactPaths(), safeUserName(), 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP), 10. Backend: Review and Update Existing Unit Tests (MANDATORY), 11. Backend: Run Unit Tests and Verify Database State (MANDATORY - AGENT MUST EXECUTE), 12. Backend: Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE), 13. Frontend: E2E Testing with Playwright MCP (MANDATORY - AGENT MUST EXECUTE) (+4 more)

### Community 590 - "Requirement: Editing surface derived from stage state"
Cohesion: 0.33
Nodes (5): MODIFIED Requirements, Requirement: Editing surface derived from stage state, Scenario: A visual stage succeeded, Scenario: The image stage failed, Scenario: The video stage failed

### Community 591 - "Requirement: No image action once the image succeeded"
Cohesion: 0.33
Nodes (5): MODIFIED Requirements, Requirement: No image action once the image succeeded, Scenario: Failed clip is routed to clip recovery, Scenario: Image generated, scene still processing, Scenario: No image action on a clip failure

### Community 592 - "Step 4 Report — Unit Tests and Database Verification"
Cohesion: 0.33
Nodes (5): Commands Executed, Database State Verification, Outcome, Step 4 Report — Unit Tests and Database Verification, Unit Test Results

### Community 593 - "devDependencies"
Cohesion: 0.50
Nodes (4): devDependencies, @types/node, typescript, vitest

### Community 594 - "scripts"
Cohesion: 0.50
Nodes (4): scripts, start, test, typecheck

### Community 595 - "Step 10 — Browser run (JOS-155, retry-voice-over)"
Cohesion: 0.33
Nodes (5): 10.1 — Applicability, 10.5 — Environment, Finding and fix (spec, design and tasks updated first), Results, Step 10 — Browser run (JOS-155, retry-voice-over)

### Community 596 - "Step 10: E2E testing (JOS-168, view-progress-by-phase)"
Cohesion: 0.33
Nodes (5): Cleanup, Console, Environment, Scenarios, Step 10: E2E testing (JOS-168, view-progress-by-phase)

### Community 597 - "12. Persistencia, archivos y descargas"
Cohesion: 0.40
Nodes (5): 12.1 Conservación del proyecto, 12.2 Archivos, 12.3 Modelo de acceso, descargas y aislamiento, 12.4 Telemetría y privacidad, 12. Persistencia, archivos y descargas

### Community 598 - "12. Persistencia, archivos y descargas"
Cohesion: 0.40
Nodes (5): 12.1 Conservación del proyecto, 12.2 Archivos, 12.3 Modelo de acceso, descargas y aislamiento, 12.4 Telemetría y privacidad, 12. Persistencia, archivos y descargas

### Community 599 - "JOS-199 step 13 — browser E2E"
Cohesion: 0.40
Nodes (4): Deviation to know about (13.4), JOS-199 step 13 — browser E2E, Not checked, Re-check after the product owner's decisions (13.7)

### Community 600 - "Task 6.5: relay deployed and verified in Grafana Explore"
Cohesion: 0.40
Nodes (4): Notes, Result, Task 6.5: relay deployed and verified in Grafana Explore, What was done

### Community 601 - "Task 8.3: dashboards imported into Grafana Cloud and checked against live data"
Cohesion: 0.40
Nodes (4): Findings and changes, Result, Setup, Task 8.3: dashboards imported into Grafana Cloud and checked against live data

### Community 602 - "Step 5a — Select the Alignment Provider"
Cohesion: 0.40
Nodes (4): 5.1 — Shortlist, 5.2 — Real alignment run, 5.6 (partial) — Alignment provider selected, Step 5a — Select the Alignment Provider

### Community 603 - "Step 5 — live API check of the fixed adapter (fix-runninghub-adapter, JOS-196)"
Cohesion: 0.40
Nodes (4): After the fix, through the adapter, Before the fix (plain requests, same account, same minute), Findings, Step 5 — live API check of the fixed adapter (fix-runninghub-adapter, JOS-196)

### Community 604 - "Step 11 — E2E Testing with Playwright MCP"
Cohesion: 0.40
Nodes (4): 11.1 — Applicability decision, Conclusion, Status of state display (summarised from existing tests), Step 11 — E2E Testing with Playwright MCP

### Community 605 - "Step 7 — Unit tests and database verification"
Cohesion: 0.40
Nodes (4): DB baseline (7.1, 7.4), Notes, Results, Step 7 — Unit tests and database verification

### Community 606 - "Step 5 — short real-provider run (JOS-203 B4)"
Cohesion: 0.40
Nodes (4): Findings, Output checks, Result, Step 5 — short real-provider run (JOS-203 B4)

### Community 607 - "name-final-video-after-title/design.md"
Cohesion: 0.40
Nodes (4): Context, Decisions, Goals / Non-Goals, Risks / Trade-offs

### Community 608 - "10. Fallos, reintentos y correcciones"
Cohesion: 0.50
Nodes (4): 10.1 Reintentos automáticos, 10.2 Reintentos manuales, 10.3 Edición permitida, 10. Fallos, reintentos y correcciones

### Community 609 - "11. Proveedores y operación"
Cohesion: 0.50
Nodes (4): 11.1 Marcas de tiempo y mecanismo de respaldo, 11.2 Vinculación y cambio de proveedor, 11.3 Recorded providers and parameter values (JOS-165), 11. Proveedores y operación

### Community 610 - "2. Usuarios y alcance"
Cohesion: 0.50
Nodes (4): 2.1 Roles, 2.2 Incluido en el MVP, 2.3 Fuera del MVP, 2. Usuarios y alcance

### Community 611 - "7. Generación visual, duración y montaje"
Cohesion: 0.50
Nodes (4): 7.1 Imagen, 7.2 Clip, 7.3 Sincronización y montaje final, 7. Generación visual, duración y montaje

### Community 612 - "8. Estados y progreso"
Cohesion: 0.50
Nodes (4): 8.1 Estados de la sesión, 8.2 Estados del chunk, 8.3 Información visible, 8. Estados y progreso

### Community 613 - "10. Fallos, reintentos y correcciones"
Cohesion: 0.50
Nodes (4): 10.1 Reintentos automáticos, 10.2 Reintentos manuales, 10.3 Edición permitida, 10. Fallos, reintentos y correcciones

### Community 614 - "11. Proveedores y operación"
Cohesion: 0.50
Nodes (4): 11.1 Marcas de tiempo y mecanismo de respaldo, 11.2 Vinculación y cambio de proveedor, 11.3 Recorded providers and parameter values (JOS-165), 11. Proveedores y operación

### Community 615 - "2. Usuarios y alcance"
Cohesion: 0.50
Nodes (4): 2.1 Roles, 2.2 Incluido en el MVP, 2.3 Fuera del MVP, 2. Usuarios y alcance

### Community 616 - "7. Generación visual, duración y montaje"
Cohesion: 0.50
Nodes (4): 7.1 Imagen, 7.2 Clip, 7.3 Sincronización y montaje final, 7. Generación visual, duración y montaje

### Community 617 - "8. Estados y progreso"
Cohesion: 0.50
Nodes (4): 8.1 Estados de la sesión, 8.2 Estados del chunk, 8.3 Información visible, 8. Estados y progreso

### Community 618 - "Step 7 — E2E testing with Playwright (JOS-162, keep-project-files-locally)"
Cohesion: 0.50
Nodes (3): 7.1 — Applicability decision, 7.2, Step 7 — E2E testing with Playwright (JOS-162, keep-project-files-locally)

### Community 619 - "Step 8 — Endpoint testing with curl"
Cohesion: 0.50
Nodes (3): DB state (8.7), Notes, Step 8 — Endpoint testing with curl

### Community 620 - "4. Entrada y conservación del contenido"
Cohesion: 0.67
Nodes (3): 4.1 Entrada del usuario, 4.2 Fidelidad e inmutabilidad, 4. Entrada y conservación del contenido

### Community 621 - "6.1 Regla de segmentación"
Cohesion: 0.67
Nodes (3): 6.1.1 Edge cases (v1.3), 6.1 Regla de segmentación, 6. Chunks y orden narrativo

### Community 622 - "4. Entrada y conservación del contenido"
Cohesion: 0.67
Nodes (3): 4.1 Entrada del usuario, 4.2 Fidelidad e inmutabilidad, 4. Entrada y conservación del contenido

### Community 623 - "6.1 Regla de segmentación"
Cohesion: 0.67
Nodes (3): 6.1.1 Edge cases (v1.3), 6.1 Regla de segmentación, 6. Chunks y orden narrativo

## Knowledge Gaps
- **54 isolated node(s):** `@fastify/cors`, `@fastify/swagger`, `@fastify/swagger-ui`, `fastify`, `fastify-type-provider-zod` (+49 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 6049 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `scenes()` connect `scenes` to `Tasks — Record requested duration and speed-adjustment factor per scene (JOS-148)`, `backend/src/orchestrator.ts`, `Step 8 — Unit tests and database verification (retry-decomposition, JOS-156)`, `Design — Generate the image of each scene (JOS-145)`, `Step 9 — Unit test and DB verification (JOS-159, retry-final-assembly)`, `Design — Per-phase maximum execution time, measured from send`, `Design — Retime and join scene clips into the video track`, `Tasks — Define the live progress update mechanism`, `Tasks — Assign scene identifiers and visual instructions (JOS-144)`, `script-segmentation.test.ts`, `Step 7 Report - Unit Tests and Database Verification`, `Step 8 Report - Manual Testing with Real Providers`, `Step 7 Report - Manual Testing with Real Providers`, `Step 9 Report — Unit Tests and Database Verification`, `unitBoundaries`, `Step 6: unit tests and database verification (JOS-186, harden-backend-foundation)`, `Tasks — Start a video project from a title, a script, and its language`, `insertRegisteredScenes`, `Tasks — Generate the image of each scene (JOS-145)`, `Step 10 Report - E2E Testing (Chrome browser automation)`, `decompositionPhase.ts`, `Tasks — Manually retry a failed decomposition (JOS-156, US-24)`, `Step 5 Report — Manual Endpoint Testing`, `Step 8 Report - Unit Tests and Database Verification`, `reconcileOnBoot`, `View progress by phase`, `PhaseSection`, `Step 8: unit tests and database verification (JOS-168, view-progress-by-phase)`, `Step 8 Report - Unit Tests and Database Verification`, `Step 8 Report - Manual Endpoint Testing`, `Step 12 Report - Unit Tests and Database Verification`, `Step 6 Report - Unit Tests and Database Verification`, `Step 5 — real timings from the first real script (raise-video-time-limit, JOS-197)`, `Step 7 Report - Unit Tests and Database Verification`, `Requirements`, `ADDED Requirements`, `Step 4 Report — Unit Tests and Database Verification`, `Step 7 Report — Manual Endpoint Testing with curl`, `Assign scene identifiers and visual instructions`, `Step 10 Report — Manual Testing`, `Step 7 — Unit tests and database verification`, `Step 8 Report - Unit Tests and Database Verification`, `Step 8 Report - Unit Tests and Database Verification`, `Step 8: unit tests and database verification (JOS-166, see-provider-and-attempts)`, `Step 9 Report - Manual Endpoint Testing with curl`, `Step 7 Report - Unit Tests and Database Verification`, `obtainNarrationTimestamps`, `Design — Assign scene identifiers and visual instructions (JOS-144)`, `Step 7 Report - Unit Tests and Database Verification`, `Model Descriptions`, `Backend stack walking skeleton (throwaway)`, `Tasks — Generate the clip of each scene (JOS-146)`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Are the 47 inferred relationships involving `registerDecomposition()` (e.g. with `.generate()` and `Provider adapters`) actually correct?**
  _`registerDecomposition()` has 47 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@fastify/cors`, `@fastify/swagger`, `@fastify/swagger-ui` to the rest of the system?**
  _54 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `backend/src/db.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.04244694132334582 - nodes in this community are weakly interconnected._
- **Why does `registerDecomposition()` connect `registerDecomposition` to `Tasks — Record requested duration and speed-adjustment factor per scene (JOS-148)`, `backend/src/server.ts`, `decomposition-retry.test.ts`, `backend/src/orchestrator.ts`, `voiceOverPhase.ts`, `recordStageAttempt`, `resetAll`, `Step 9 Report - Manual Endpoint Testing with curl`, `Step 10 Report - E2E Testing (Chrome browser automation)`, `getRun`, `Design — Retime and join scene clips into the video track`, `Tasks — Assign scene identifiers and visual instructions (JOS-144)`, `script-segmentation.test.ts`, `Tasks — Segment the script into chunks within duration bounds (JOS-140)`, `Record requested duration and speed-adjustment factor per scene`, `startNewCycle`, `insertRegisteredScenes`, `Step 10 Report - E2E Testing (Chrome browser automation)`, `decompositionPhase.ts`, `scene-registration-persistence.test.ts`, `Tasks — Retry a failed final assembly (JOS-159, US-27)`, `Step 8 Report — Manual Endpoint Testing`, `Design — See provider and attempts per stage`, `videoProvider.ts`, `Tasks — Pause the session and continue explicitly (JOS-152, US-20)`, `Tasks — Decompose the script into chunks with their visual instructions`, `Step 9 Report - Manual Endpoint Testing with curl`, `Step 9 Report - Manual Endpoint Testing with curl`, `obtainNarrationTimestamps`, `project-files-ac-pinning.test.ts`, `Step 10 Report - E2E Testing in the Browser`, `Tasks — Prevent the final video while any scene is incomplete (JOS-150, US-17)`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 28 inferred relationships involving `writeArtefactOnce()` (e.g. with `Persistence` and `5b. Voice-over (`voice_overs` table) and stage attempts (`stage_attempts` table) — `generate-voice-over`, JOS-136, migration 4`) actually correct?**
  _`writeArtefactOnce()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Should `backend/src/server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.053313587560162905 - nodes in this community are weakly interconnected._