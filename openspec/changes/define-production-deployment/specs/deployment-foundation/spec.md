# Deployment foundation

Requirements established by choosing how Vid4You is hosted in UAT and production. They govern where and how the application runs and who can reach it, not what it does. Product behaviour stays owned by the stories that specified it.

## ADDED Requirements

### Requirement: Single documented hosting decision

The project SHALL record exactly one chosen hosting option for the frontend and the backend in an ADR. The ADR SHALL state the must-pass gates, the weighted criteria, the score of every evaluated option, the rejected alternatives with the gate or criterion each lost on, a monthly cost estimate per environment, and the evidence behind the choice. `docs/backend-standards.md`, `docs/frontend-standards.md` and `docs/development_guide.md` SHALL describe the same decision. Implementation stories SHALL follow that record rather than choosing a platform themselves.

#### Scenario: A deployment story begins

- **WHEN** work starts on a story that builds, ships or operates the application
- **THEN** the ADR and the standards name the same hosting option for the frontend and the backend
- **AND** the story does not select its own platform

#### Scenario: An option is rejected

- **WHEN** an evaluated option is not chosen
- **THEN** the ADR names the gate it failed or the criteria it scored lower on
- **AND** the reason refers to a fact recorded in the change, not to preference

### Requirement: No exposure without an approved access gate

The application SHALL NOT be reachable outside a local environment until the product owner has approved a PRD change to §2.3, §12.3 and D07 that defines who may reach it. Every hosted environment SHALL place an access gate in front of both the frontend and the backend API, so that a request without an allowed identity reaches neither. The allowed identities SHALL be an explicit list declared with the infrastructure; initially it holds the single product-owner address. The gate SHALL NOT require user accounts inside the application.

#### Scenario: An unauthenticated request reaches a hosted environment

- **WHEN** a request without an allowed identity is sent to the frontend or the API of UAT or production
- **THEN** the gate rejects it before it reaches the application

#### Scenario: The API is called directly

- **WHEN** someone bypasses the frontend and calls the backend's public address
- **THEN** the same gate applies to that request

#### Scenario: The PRD change is not yet approved

- **WHEN** the PRD access change is still a draft
- **THEN** no production hostname is published
- **AND** proof-of-concept traffic runs only on a temporary hostname behind the gate

### Requirement: Exactly one backend instance per environment

Each environment SHALL run exactly one backend process at a time. The platform SHALL NOT scale the backend horizontally. The deploy process SHALL NOT start a second process against the same store, and SHALL stop the old process before the new one starts processing sessions. The backend SHALL keep processing sessions while no browser is connected. A restart, whether caused by a deploy or by the platform, SHALL leave every session resumable: the new process SHALL rely on the existing boot-time reconciliation to resume work, and the data lost across the restart SHALL stay within the recovery bound recorded in the ADR.

#### Scenario: Load increases

- **WHEN** several sessions are processing at once
- **THEN** the environment still runs a single backend instance
- **AND** the concurrency cap per stage is enforced by that instance alone

#### Scenario: A deploy happens mid-session

- **WHEN** a new version is deployed while a session is processing
- **THEN** at no point do two backend processes process sessions against the same store
- **AND** the session resumes after the new process starts, without user action

#### Scenario: The platform restarts the backend

- **WHEN** the platform stops and restarts the backend without a deploy
- **THEN** every session resumes from its persisted state without user action
- **AND** anything lost is within the recorded recovery bound

#### Scenario: Nobody is watching

- **WHEN** a session is processing and no browser has the page open for longer than the platform's inactivity timeout
- **THEN** the session keeps progressing and reaches its next state without a request arriving

### Requirement: Durable and recoverable storage

The SQLite store at `DB_PATH` and every file under `PROJECTS_ROOT` SHALL live on storage that survives a backend restart, a redeploy and a host replacement. Each environment SHALL take backups of both on a recorded schedule to a separate location. A restore SHALL be performed at least once and its result recorded before production goes live.

#### Scenario: The backend restarts

- **WHEN** the backend process restarts or a new version is deployed
- **THEN** every session, scene result and project file present before is still present
- **AND** an in-progress session resumes from its persisted state

#### Scenario: Storage is lost

- **WHEN** the environment's storage is replaced
- **THEN** restoring the latest backup brings back the sessions and their project files
- **AND** the time between backups bounds the data that can be lost, and that bound is recorded

### Requirement: Production ships the artifact UAT validated

There SHALL be exactly two hosted environments. UAT SHALL deploy from `feature/entrega-2-JAME` and production SHALL deploy from `main`. This branch-to-environment mapping SHALL be declared in one place, so changing it later does not touch pipeline logic. The backend image SHALL be built once for a given source tree and promoted to production as that same image, never rebuilt. Production SHALL deploy only an image that UAT has already run. The frontend SHALL either be the same build in both environments or be rebuilt from the same source with only environment configuration changed, and the ADR SHALL record which. A production deploy SHALL require a manual approval.

#### Scenario: A change reaches production

- **WHEN** the UAT branch is merged into `main`
- **THEN** production runs the same backend image digest that ran in UAT, even though the merge created a new commit
- **AND** a person approved the production deploy

#### Scenario: Main contains code UAT never ran

- **WHEN** `main` holds a source tree for which no UAT-deployed image exists
- **THEN** the production deploy fails instead of building a new image

#### Scenario: The branch mapping changes

- **WHEN** a different branch is assigned to an environment
- **THEN** only the declared mapping changes

#### Scenario: Environments differ

- **WHEN** UAT and production behave differently
- **THEN** the difference is explained by environment configuration that is declared and reviewable, not by different code

### Requirement: Safe configuration in hosted environments

In a hosted environment, test-only endpoints (`ALLOW_TEST_ENDPOINTS`) SHALL be disabled, and both UAT and production SHALL use real providers with every `USE_STUB_*` flag off. UAT and production SHALL use separate provider credentials or, if the same keys are shared, the ADR SHALL record that their spend cannot be told apart. Provider credentials SHALL be injected as per-environment secrets and SHALL NOT appear in the repository, in the image or in logs. The backend SHALL accept cross-origin requests only from the environment's own frontend origin. The assembly stage SHALL find ffmpeg and ffprobe on the host it runs on.

#### Scenario: A hosted backend starts

- **WHEN** the UAT or production backend starts
- **THEN** no test-only endpoint answers and no stubbed provider is active

#### Scenario: The image is inspected

- **WHEN** the backend image or the repository is searched for provider credentials
- **THEN** none are found

#### Scenario: A foreign origin calls the API

- **WHEN** a browser page from an origin other than the environment's frontend calls the API
- **THEN** the backend does not grant it cross-origin access

#### Scenario: Assembly runs on the hosted platform

- **WHEN** a session reaches final assembly in a hosted environment
- **THEN** the assembly tool runs ffmpeg and ffprobe successfully on that host

### Requirement: Infrastructure declared as code

Every hosted resource the application depends on (DNS records, frontend hosting, the backend's route from the edge, the access gate and its policy, and any storage bucket) SHALL be declared in version-controlled infrastructure code. Applying that code SHALL be able to recreate an environment, and its state SHALL be stored outside any developer's machine. Secrets SHALL NOT be stored in that code or its state in plain text.

#### Scenario: An environment is recreated

- **WHEN** the infrastructure code is applied to an empty account or project
- **THEN** it creates every resource that environment needs, apart from secret values supplied separately

#### Scenario: A resource is changed by hand

- **WHEN** a hosted resource differs from its declaration
- **THEN** a plan shows the drift before the next apply

### Requirement: Recorded evidence on the chosen platform

Before the decision is accepted, a proof of concept on the chosen option SHALL run one stubbed session end to end behind the access gate. The run SHALL show live updates arriving over the SSE stream through the edge, a successful final-video download, and recovery after a backend restart mid-session. Each outcome SHALL be recorded, failures included, with any observation that relied on a stand-in named as such.

#### Scenario: Live updates pass through the edge

- **WHEN** a session is processing in the proof of concept
- **THEN** the open page receives state changes over SSE without reloading
- **AND** a quiet stretch longer than the edge's idle timeout does not leave the page stale

#### Scenario: The backend restarts in the proof of concept

- **WHEN** the backend is restarted while the session is processing
- **THEN** the session reaches its final video with no data lost and no manual reload

#### Scenario: A must-pass gate fails

- **WHEN** the chosen option fails a must-pass gate during the proof of concept
- **THEN** the evaluation moves to the next-ranked option rather than continuing on paper

### Requirement: Follow-up work is specified, not implied

The change SHALL finish with a list of implementation stories that turn the decision into the real UAT and production environments. Each story SHALL have acceptance criteria and SHALL name the requirement of this capability it satisfies. Any gap found during the spike and not closed by it SHALL appear either as a story or as a recorded risk.

#### Scenario: The spike closes

- **WHEN** the timebox ends
- **THEN** every blocker found (for example, the hard-coded ffmpeg paths or the build-time API address) is closed, turned into a story, or recorded as a risk
- **AND** no blocker is left unmentioned
