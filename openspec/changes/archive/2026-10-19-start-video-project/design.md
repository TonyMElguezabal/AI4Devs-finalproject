# Design — Start a video project from a title, a script, and its language

## Context

§3 defines a session as a video project with a system-generated identifier, holding the title, the script, the narration, the chunks, the progress, the results and the language the user selected. §5 step 1 makes starting the project the first act of the flow, and §8.1 puts the result in `submitted`: registered, nothing generated yet. §4.1 fixes what the user provides — a non-empty title, a non-empty script, and a language from the hardcoded list — and states that no provider is called before a language is selected, that no product word limit exists, and that a script a service cannot process is reported rather than trimmed or summarised. §4.2 and D10 lock the script from `submitted` onward. §12.2 names the project folder from the title plus the creation date and time to the minute, with a counter on collision. §12.3 makes sessions reachable by identifier, and states that separation between sessions is functional integrity, not a security control.

The story looks small — three validations and an insert — and the ticket sizes it S. What makes it worth designing is that it is the point where several later obligations are either made easy or made impossible. The script the pipeline must reconstruct exactly (§4.2, AC03) is the one stored here. The folder name US-30 derives (§12.2) depends on a creation time recorded here. The immutability every later story must respect is a property this record either has or does not.

Four foundations it rests on are still open. `define-backend-stack`, `define-frontend-stack` and `define-persistence` are In Progress, and `define-provider-configuration` owns the language list. There is no application code in the repository beyond `packages/specboot`. This design therefore states decisions in terms the chosen stacks will satisfy, rather than naming frameworks it cannot yet know.

## Goals / Non-Goals

**Goals:**
- Register a session that satisfies AC01 through AC05.
- Make the §4.2 lock structural: the title, script and language cannot be changed after registration.
- Store the script faithfully enough that reconstruction (AC03) is achievable later.
- Record creation time at the precision §12.2's folder naming needs.
- Establish the first API contract entry and the first screen for this product.

**Non-Goals:**
- Starting the voice-over, which is §5 step 2 and the next story's; this one ends at `submitted`.
- Creating the project folder on disk, which is US-30; this story records what its name will be derived from.
- Segmentation, instructions, or anything about chunks — none exist at `submitted`.
- Choosing the backend, frontend or store, or the language list itself.
- Inventing a way to list sessions; the gap is recorded, not filled (see Open Questions).

## Decisions

**Decision 1 — Store the script exactly as submitted, and judge emptiness on a trimmed view without storing the trimmed value.**
Validation asks whether the content is empty once surrounding whitespace is disregarded; persistence keeps the original bytes.
*Alternatives:* storing a trimmed script (rejected: §4.2 allows only separator-space normalisation when chunk fragments are rejoined, and AC03 requires the fragments to reconstruct the script — silently editing the input at the door means the thing the system must reproduce is already not what the user wrote); accepting whitespace-only input as non-empty (rejected: AC03's intent is that nothing starts without real content, and a script of spaces would narrate nothing).

**Decision 2 — Make the title, script and language write-once in the record itself.**
No later operation offers a path to modify them; the lock is enforced where the data lives, not by convention.
*Alternatives:* enforcing immutability in each story that touches a session (rejected: §4.2 and D10 make the lock absolute from `submitted` onward, and a rule re-implemented per story is a rule that eventually is not — the retry, correction and pause stories all touch sessions and none of them should be able to reach these fields).

**Decision 3 — Generate an opaque, creation-ordered identifier.**
The identifier is system-generated (§3), not derived from the title, and sorts by creation.
*Alternatives:* a sequential counter (rejected: it leaks nothing dangerous — §12.3 is explicit that this is not a security control — but it makes two installations' identifiers collide in conversation and offers no creation ordering without a second field); deriving it from the title (rejected: §3 and §12.2 both require two projects with the same title to stay separate, which a title-derived identifier fights); a random identifier with no ordering (rejected: with no project-list screen specified, creation order is the one piece of structure that costs nothing to keep and would have to be reconstructed otherwise).

**Decision 4 — Record the creation instant at registration, and make the folder name derive from it rather than from the clock at folder-creation time.**
§12.2 names the folder from the title plus the creation date and time to the minute. That instant is a property of the session, captured here.
*Alternatives:* letting US-30 read the clock when it creates the folder (rejected: the folder can be created minutes after registration — the voice-over has to start first — so the name would record when the directory was made, not when the project began, and two sessions started in the same minute could land in the same folder or in unrelated ones depending on timing); storing only a date (rejected: §12.2 specifies minute precision, and the collision counter it defines only makes sense at that resolution).

**Decision 5 — Validate the language against the hardcoded list on the server, and have the form offer that same list from the same source.**
The form restricts what can be chosen; the server rejects anything outside the list regardless of what the form did.
*Alternatives:* trusting the form's restriction (rejected: AC05 requires that no session starts without a supported language, which is a property of the system, not of one client — and the endpoint is reachable directly); duplicating the list in the frontend (rejected: two copies of a hardcoded list drift, and `define-provider-configuration` establishes exactly one place it lives).

**Decision 6 — Impose no size limit of our own, and make any infrastructure limit report its cause.**
Where a request body, a column type or a transport limit prevents accepting a script, the response says what prevented it.
*Alternatives:* leaving framework defaults in place (rejected: most stacks reject a large body with a generic error, which a user cannot distinguish from the word limit §4.1 says does not exist — AC04 would pass a unit test and fail a real long script); silently truncating to fit (rejected: §4.1 forbids trimming or summarising to adapt content, and it would corrupt the very text §4.2 locks).

**Decision 7 — Two identical submissions create two sessions.**
Submitting the same title and script twice is not treated as a duplicate to be collapsed.
*Alternatives:* deduplicating on title or on content (rejected: §3 and §12.2 explicitly anticipate projects with identical titles and require them to stay separate with their own folders — a user regenerating a video from the same script is a supported case, not an accident to guard against). The idempotency §12.1 requires concerns repeated provider confirmations, not repeated user intent, and should not be borrowed here.

**Decision 8 — End the story at `submitted`, and let the voice-over story own the transition out of it.**
Registration does not itself launch a provider call.
*Alternatives:* starting the voice-over in the same operation (rejected: it would make this story's success depend on a provider and a phase it does not own, and §8.1 defines `submitted` as a state the session actually occupies — collapsing it would leave a state nothing can ever be observed in); requiring a second user action to begin (rejected: §5 describes an automatic flow, and no PRD section asks the user to start processing separately).

**Decision 9 — Reset the API contract to this product before adding this endpoint to it.**
`docs/api-spec.yml` describes an unrelated inherited application. The first real endpoint is written into a contract for this product, not appended to that one.
*Alternatives:* appending this endpoint to the existing file (rejected: the contract would describe two unrelated products at once, and every later story would inherit the confusion); deferring the contract (rejected: the story's Definition of Done requires OpenAPI documentation, and a contract started late is a contract reconstructed from code).

## Risks / Trade-offs

- **The four foundations land differently than assumed** → Every decision here is stated in behavioural terms rather than framework terms, so the tasks bind to whatever the spikes choose. If a spike's outcome contradicts a decision, it is revisited here rather than worked around in code.
- **A long script passes the tests and fails in practice** → Decision 6 is only real if it is tested with a script far beyond the 1500-word reference §4.1 mentions. The tasks exercise a large script explicitly rather than trusting the absence of a limit.
- **The script is altered on the way in and the damage surfaces at AC03** → Decision 1 keeps the original, and a test asserts the stored script is byte-identical to what was submitted, so a normalisation added later breaks a test rather than a downstream acceptance criterion.
- **The session becomes unreachable the moment the page is closed** → With no project-list screen, the identifier shown at creation may be the only route back. The story shows it and records the gap; it does not invent the screen (see Open Questions).
- **Whitespace handling differs between the form and the server** → One rule, applied server-side, with the form matching it — otherwise a title the form accepts is rejected by the endpoint, or worse, the reverse.
- **The validation approach in the Definition of Done may not fit the chosen stack** → It names VineJS or Zod "or equivalent", and whether that expectation is binding is `define-backend-stack`'s ruling. This story follows it rather than re-opening it.
- **The story is sized S and the API contract reset is not small** → The reset is scoped to what this endpoint needs, not a full contract for the unwritten API; the tasks say so, so the work does not quietly expand.

## Migration Plan

Nothing is deployed and no session exists anywhere, so there is no data to migrate. If a spike's skeleton was kept as the project seed, this story extends it; if not, it introduces the first application code. Rollback is removing the endpoint, the screen and the record definition. The API contract reset is the one change that outlives a rollback of this story, and it is an improvement independent of it.

## Open Questions

1. **How does a user return to a session?** §12.3 describes reaching one by identifier, and no project-list screen appears in the PRD or the backlog — recorded by `define-frontend-stack` as a product gap. This story surfaces the identifier at creation and assumes identifier-based access; the screen is not invented here.
2. **What starts the voice-over?** §5 describes an automatic flow, so the transition out of `submitted` is expected to be automatic, but the trigger belongs to the voice-over story. Agreed at the boundary rather than implemented twice.
3. **Is there a maximum the infrastructure genuinely cannot exceed?** Decision 6 requires the cause to be reported, which presumes knowing what the ceiling is. Discovered during implementation against the chosen stack and store, and recorded.
4. **Who owns resetting `docs/api-spec.yml` beyond this endpoint?** This story resets what it needs. The rest of the contract has no owner yet.
