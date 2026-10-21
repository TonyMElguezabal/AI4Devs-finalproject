# Design — Consult a session by its identifier

## Context

§3 defines a session by a system-generated identifier and keeps sessions separate even when their titles match. §6 numbers scenes 1 to N inside each session, so the same scene identifier exists in many sessions. §12.3 makes the identifier the way a session is reached, states that separation between sessions is a functional integrity requirement rather than a security control, and restricts in-app downloads to per-scene images and clips and the final MP4. §12.2 says sessions never expire. §8.3 asks for a page with a section per phase, scene state, results, errors and actions, updated without reloading. AC22 is the acceptance criterion this story is measured against.

`start-video-project` (JOS-134) registers a session and shows its identifier; its Decision 3 makes the identifier opaque and creation-ordered. `generate-voice-over` (JOS-136) adds `voiceOver` and `failure` to the session representation and says the read that carries them is this story's. `define-live-updates` (JOS-183) chose resync-on-reconnect (Decision 3) and made "the one snapshot read that resync depends on" part of its contract (Decision 4): session state, paused marker as a separate field, and every scene's current state, in the same shapes as its events. `define-frontend-stack` (JOS-180) recorded that no project-list screen exists and that pages should be built against identifier-based access; it also fixed accessible naming as the basis for agent-driven E2E.

None of these foundations has been applied, and the repository has no application code beyond `packages/specboot`.

## Goals / Non-Goals

**Goals:**
- One session read, returning a representation that consultation, resync and later stories all extend.
- A session page at an address containing the identifier.
- Make cross-session leakage structurally impossible rather than guarded by convention.
- A clear "not found" for unknown or malformed identifiers.

**Non-Goals:**
- Live updates on the open page — the subscription is US-18's, the mechanism JOS-183's. This page renders what the read returns and exposes the seam for US-18 to plug into.
- Per-phase sections and per-scene detail beyond state and available results (US-18, US-19).
- Downloads of images, clips or the final MP4 (US-31, US-32), and diagnostics (US-34).
- A project list, search, or any other way to find a session without its identifier.
- Authentication or authorisation of any kind.

## Decisions

**Decision 1 — The consultation read and the resync snapshot are the same endpoint.**
`GET /api/sessions/{sessionId}` returns the session and all of its scenes in the payload shapes `define-live-updates` defines. The page loads through it and reconnects through it.
*Alternatives:* a separate snapshot endpoint for resync (rejected: two representations of the same session drift, and a page that loads through one and resyncs through the other can show a field that later disappears or changes shape); leaving the read to whichever story first needs it (rejected: `generate-voice-over` already assumes this story owns it, and JOS-183 Decision 4 names it as load-bearing).

**Decision 2 — Scope every lookup by session identifier at the data-access boundary.**
Repository methods take the session identifier as a required argument; scenes are keyed by `(sessionId, sceneId)`; file paths are resolved against the session's recorded project folder (`define-persistence` Decision 4), and any resolved path outside that folder is refused.
*Alternatives:* filtering a broader query in the application layer (rejected: one missed filter shows another project's scenes, and §6 guarantees scene identifiers collide across sessions — it is the normal case, not an edge case); looking a session up by title (rejected: §3 and §12.2 make titles non-unique by design).

**Decision 3 — Return scenes sorted by scene identifier from the read.**
The server orders scenes ascending; the page renders them in the order received.
*Alternatives:* sorting in the page only (rejected: resync and consultation would each need to sort, and any other consumer of the read would inherit the obligation); ordering by completion or creation time (rejected: §6 and AC11 require identifier order regardless of completion order).

**Decision 4 — Treat unknown and malformed identifiers the same way: not found.**
Both return a not-found response with a stable error shape; neither reveals whether an identifier "looks valid".
*Alternatives:* 400 for malformed and 404 for unknown (not adopted: harmless for a local single-user install, but it adds a distinction the User cannot act on and the page would have to render two ways; the validation layer still rejects malformed input before it reaches the store).

**Decision 5 — The session page lives at an address containing the identifier, and registration navigates there.**
The start form, on success, takes the User to the session page; the address is the bookmark.
*Alternatives:* showing the identifier as text only (rejected: with no project list, an address the browser remembers is the most reliable way back the User has, and it costs nothing); storing recent sessions in the browser (rejected: it is a project list by another name — a product decision recorded as a gap, not one this story takes).

**Decision 6 — Show only what the read returns; never derive state on the page.**
State, the paused marker and scene states are displayed as received. Absent sections (no scenes yet, no voice-over yet) render as "not yet available", not as errors.
*Alternatives:* inferring progress from which fields are present (rejected: `define-live-updates` Decision 2 makes events and the snapshot state-carrying so the page never reconstructs state — the page should honour that from its first version).

**Decision 7 — Expose no locally-only artefact.**
The representation carries no path or URL for the MP3, timestamps or generated texts; relative paths stay server-side.
*Alternatives:* returning relative paths for completeness (rejected: §12.3 restricts downloads, and a path in the payload is an invitation for the next story to link it).

**Decision 8 — Validate the response shape as well as the request.**
The identifier is validated on the way in; the representation is validated on the way out with the approach the backend standards prescribe, so a field added by a later story without updating the contract fails a test rather than drifting silently.
*Alternatives:* request validation only (rejected: this representation is extended by at least five later stories, and the contract in `docs/api-spec.yml` is only trustworthy if the code is checked against it).

## Risks / Trade-offs

- **The snapshot is expensive at hundreds of scenes** → JOS-183 Decision 4 already measures it. This story reuses that measurement and does not add pagination unless the evidence demands it — pagination would break resync, which needs every scene.
- **Later stories add fields ad hoc** → Decision 8's response validation and the `docs/api-spec.yml` schema make every addition an explicit contract change.
- **A lost identifier means a lost session** → Decision 5 makes the address bookmarkable; the absence of a project list is recorded as a product gap for the owner.
- **Path traversal through a crafted file reference** → Decision 2 refuses any resolved path outside the session's folder. It is an integrity measure, not a security boundary, consistent with §12.3.
- **The payload shapes from JOS-183 change** → The read imports those shapes rather than restating them, so a change there surfaces as a compile or test failure here.

## Migration Plan

Nothing is deployed. The change adds a read endpoint, a page and the navigation from the start form; it adds no stored data. Rollback is removing them; registration keeps working and shows the identifier as text, as `start-video-project` specifies.

## Open Questions

1. **How does a User find a session without its identifier?** Still a product gap (recorded by `define-frontend-stack` and `start-video-project`). This story makes the identifier bookmarkable; the owner decides whether a list is needed.
2. **Does resync need the whole snapshot, or can it be narrowed?** Answered by JOS-183's measurement; if narrowed, this read keeps the full form for consultation and the narrowing is JOS-183's change to make.
3. **Is the script shown in full on the page, or collapsed?** A presentation choice for the frontend standards; the read always returns it in full.
