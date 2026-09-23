# Design — Define the hardcoded providers and parameter values

## Context

§11 fixes the shape of the answer and leaves the answer blank. One provider per stage — reasoning, voice, alignment, image, video — each with a stated capability: split the script faithfully per §6.1 and generate visual instructions, at a capability reference the PRD sets as equivalent to Sonnet 4.6 or higher; produce the complete narration as MP3 with preconfigured voice, quality and speed, and deliver timestamps granular enough to locate every fragment of the script; derive those timestamps by forced alignment when the voice provider's are absent or unusable; generate 16:9 images at ≥1920×1080; animate a reference image at a requested duration within hardcoded admitted values. Alongside them sits a list of parameters whose values the section says a spike will supply.

The values are not independent, and treating them as a checklist would produce an inconsistent set. §6.1 says the lower bound "must be consistent with the shortest duration admitted by the video provider" — so the video provider is chosen first and the bound falls out. §4.1's language list is only real if the voice provider *and* the alignment provider both support each language, since §11.1 makes forced alignment the declared fallback and forced alignment is itself language-dependent. §10.1's per-stage request cap must sit below the provider's real rate limit with enough headroom that the 1 + 3 retry budget cannot breach it. The speed-factor limit is measured by `define-media-assembly` (JOS-182), whose Decision 5 hands the number here precisely so two changes do not fix the same constant.

Two properties cannot be read from documentation at all. **Timestamp granularity** decides whether the alignment stage is a fallback or the permanent mechanism: §6.1 cuts on sentence boundaries, so timestamps too coarse to locate a sentence make native timestamps unusable in the sense §11.1 already anticipates. And **how a provider signals a failure it will never succeed at** decides whether §10.1's not-retryable rule can be implemented: the PRD makes a content-filter rejection the canonical case, but a rejection that arrives as a generic error is indistinguishable from a transient one, and the system would burn the retry budget on it.

This is also the first change in the project to call a real provider. Every sibling runs against the stubbed provider from `define-backend-stack`. That stub was built to have configurable latency, transient failures, not-retryable failures and duplicate confirmations — this change is what tells us whether the real services behave like it.

## Goals / Non-Goals

**Goals:**
- Select one provider per stage, each verified against its §11 capability by calling it, with rejected candidates recorded.
- Fix a complete and internally consistent parameter set, derived in dependency order.
- Establish the not-retryable failure signal per provider, so §10.1 is implementable.
- Establish where the constants live in source, and how they and the PRD are kept in step.
- Verify the credential path: local environment or local secrets file, never the repository.
- Fill in `docs/PRD.md` §11 and record the change in its change log.

**Non-Goals:**
- Measuring the speed-factor quality threshold; `define-media-assembly` (JOS-182) measures it and this change records the value.
- Closing D11 (silence allocation), which consumes the speed-factor limit rather than setting it.
- Implementing any stage that calls a provider — US-09, US-15, US-16, US-22, US-37 own those.
- Provider switching, failover or reassignment, all out of the MVP (§11.2, D03).
- Cost modelling for production use; §2.3 excludes usage and cost reports. This change records only what the spike itself spent.
- Non-functional targets; none exist (PRD §15 gap 9, US-41).

## Decisions

**Decision 1 — Fix the values in dependency order, not as a flat list.**
Providers first; then the values a provider determines (admitted durations and maximum, voice options, language support, rate limits); then the values derived from those (segmentation lower bound, per-stage request cap, per-phase maximum times).
*Alternatives:* working through §11's list in the order written (rejected: it puts the lower bound before the admitted durations it must be consistent with, and the request cap before the rate limit it must respect — the list would be filled in, and wrong).

**Decision 2 — Verify every capability by calling the provider, never by reading its documentation.**
A capability counts as met when a call demonstrated it against this project's own requirement.
*Alternatives:* selecting from published specifications and confirming during implementation (rejected: the two properties that decide the architecture — timestamp granularity and the failure signal — are not reliably documented, and discovering either during US-09 or US-22 means rebuilding a phase rather than adjusting a constant).

**Decision 3 — Treat timestamp granularity as a gate on the voice provider, and record which of §11.1's two mechanisms actually applies.**
Verify granularity against a real script containing the structures §6.1 cuts on, and state plainly whether the alignment stage is a fallback or the standing mechanism.
*Alternatives:* accepting any timestamps the provider returns (rejected: §11.1 says native timestamps count only when usable, and "usable" here means sufficient to place a sentence boundary — a provider returning one mark per paragraph satisfies the word "timestamps" and none of the requirement); deferring the check to the decomposition story (rejected: §11.1 already states it is a task prior to implementing that phase).

**Decision 4 — Derive the supported language list from what every stage in the chain supports, verified per language.**
A language enters §4.1's list only if the voice provider narrates it, the alignment provider aligns it, and the reasoning provider segments it correctly. Each is confirmed with a real script in that language.
*Alternatives:* taking the voice provider's advertised list (rejected: it ignores the alignment fallback, which §11.1 makes the declared mechanism for exactly the cases where native timestamps fail — a language offering neither would be selectable at project start and fail at decomposition); a single language for the MVP (rejected: §4.1 and D09 commit to a list the user selects from, and the list may legitimately be short — but it is an outcome of verification, not a way to avoid it).

**Decision 5 — Record each provider's not-retryable failure signal as part of its selection.**
For each stage, document how a rejection the provider will never succeed at is distinguishable from a transient error, and what the system matches on.
*Alternatives:* treating every error as transient (rejected: §10.1 requires a not-retryable failure to skip retries, and a content-filter rejection would otherwise consume four attempts and a wait each time); assuming HTTP status codes suffice (rejected: content-filter rejections commonly arrive as a success-shaped response or a generic client error, so the distinction may live in a body field — which is exactly why it is verified rather than assumed).

**Decision 6 — Derive the per-stage request cap from the measured rate limit, with headroom for the retry budget, and record the account tier it came from.**
*Alternatives:* setting the cap to the provider's published limit (rejected: §10.1 makes the cap shared across all sessions and the 1 + 3 retry budget adds attempts on top, so a cap at the limit breaches it under exactly the conditions retries exist for); picking a conservative round number (rejected: it hides whether the constraint is the provider or the guess, and §10.1 warns that internal recovery must not multiply the functional limit — a number nobody derived cannot be checked against that).
*Recorded, not assumed:* rate limits usually belong to the account tier rather than the provider, so the tier is part of the value's provenance.

**Decision 7 — Set per-phase maximum times from a distribution of real runs, measured from launch.**
Repeat each stage enough times to see spread, and set the limit above the slow tail rather than at the average.
*Alternatives:* a single timed run per stage (rejected: generation latency varies widely with load, and §10.1 explicitly warns that waiting must not cause a premature failure — a limit set from one fast sample fails healthy requests); a generous round number (rejected: a limit far above any real duration never fires, which makes it decoration rather than a control).
*Also recorded:* queue waiting counts neither as a failed attempt nor as execution time (§10.1), so the clock starts when the request is sent.

**Decision 8 — Keep the values in one typed constants module in source, and assert it against PRD §11 in a test.**
§2.3 excludes configuration files and runtime configuration; a typed module compiled into the application is neither.
*Alternatives:* constants scattered where each is used (rejected: the lower bound and the admitted durations must stay consistent, and §6.1's consistency requirement is unenforceable once the two live apart); a configuration file (rejected: §2.3 excludes it explicitly, and it would reintroduce the Administrator surface the MVP defers); documenting in the PRD only (rejected: the PRD and the code would drift, and §11 would describe a system nobody runs).

**Decision 9 — Weigh availability heavily, because there is no failover.**
D03 and §11.2 keep a stage retrying the same provider until it recovers, so an unavailable provider stalls that stage indefinitely.
*Alternatives:* scoring on capability and price alone (rejected: it treats availability as recoverable when the MVP has deliberately removed every recovery path).

**Decision 10 — Cap the spike's own spend, and record it.**
Set a spend ceiling before the first call, use short scripts sized to exercise the behaviour rather than to produce a finished video, and record actual spend per stage.
*Alternatives:* spending as needed (rejected: the experiments involve image and video generation, the two most expensive stages, and a burst of latency measurements is easy to repeat without noticing); simulating cost (rejected: the point of this change is that documented behaviour is not evidence).

**Decision 11 — Record the decision in an ADR unconditionally, including the rejected candidates.**
The ticket softens it to "if applicable". Five provider choices with cost and capability trade-offs are exactly what a later reader will want the reasoning for.

## Risks / Trade-offs

- **Keys or secrets leak into the recorded evidence** → Every artefact this change produces is captured through a path that redacts credentials, and the evidence is reviewed for key material before it is committed. The credential path itself (§2.1) is verified as a task, not assumed.
- **The voice provider's timestamps are too coarse and the finding arrives late** → Decision 3 makes it a gate, checked before the rest of the parameter set is built on that provider.
- **A hardcoded model, voice or endpoint version is deprecated by the provider** → Hardcoding means a provider-side retirement breaks the application silently, and §11.2 removes every switching path. Record the version identifiers explicitly and note the review trigger, so the exposure is known rather than discovered when a stage starts failing.
- **The speed-factor limit is fixed before `define-media-assembly` measures it** → Record it as provisional with the dependency named, exactly as that change's risk section asks. It is the one value this change should be willing to leave open.
- **Latency measured on an idle account differs from latency under the shared request cap** → Measure at least one stage under concurrent load at the cap, so the per-phase limit is not set from the quiet case.
- **The language list is verified for one language and generalised** → Decision 4 requires a real script per language; a list of one verified language is a more honest MVP than a list of six assumed ones.
- **The reasoning capability reference in §11 names a model generation that has moved on** → Re-check the bar against the current model line at the time of the spike rather than inheriting it, and record what it was compared against.
- **Values land in the PRD but not in code, or vice versa** → Decision 8's test is what makes the two inseparable; without it this change produces a document that decays.
- **Costs run past the ceiling during video experiments** → Decision 10 sets the ceiling first and the tasks record spend as they go, rather than totalling it at the end.

## Migration Plan

Nothing is deployed and no code reads these constants yet, so there is no migration. The durable outputs are the ADR, the PRD §11 values with a version bump, and the constants module. Rollback is reverting the PRD section and deleting the module; no data or users are affected. Provider accounts created for the spike are recorded so they can be closed if a provider is later rejected.

## Open Questions

1. **Which stages already have an intended provider?** Answered: **image and video are decided**, with credentials already held for both. They enter as inputs verified against §11, not as open evaluations, which is why group 3 extracts values rather than comparing candidates. Reasoning, voice and alignment remain open — and since the timestamp gate in Decision 3 sits on the voice provider, the undecided half now holds the project's highest-risk unknown. Still to confirm: whether the two held keys belong to one provider account, since Decision 6 derives rate limits per account rather than per stage.
2. **Does the acceptable speed-factor limit arrive from `define-media-assembly` before this change closes?** If not, the value is provisional and the dependency is stated in the PRD entry itself, not only in the ADR.
3. **Is the reasoning capability bar in §11 still the right reference?** It names a specific model generation; confirm against what is current rather than assuming the bar aged well.
4. **Does any chosen provider's admitted duration set change over time?** §11.2 already says a later change to admitted durations must not alter chunks and intervals in existing sessions — worth confirming which provider makes that a live concern rather than a hypothetical one.
5. **What does the spike do if no single provider satisfies a §11 capability?** Escalate as a product question rather than quietly weakening the requirement; the capability text is the PRD's, not the spike's to relax.
