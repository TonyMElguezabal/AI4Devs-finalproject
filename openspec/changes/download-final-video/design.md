# Design — Download the final video

## Context

On `feature/entrega-2-JAME` (`5498360`):

- **The route** `GET /sessions/:sessionId/download/final-video` (`routes.ts`) reads the session, answers 404 for an unknown one, 409 when `runs.final_video_path` is null, resolves the path through `resolveArtefactPath` (project-folder confinement), answers 404 when the file is absent, then streams it with `Content-Disposition: attachment; filename="final-video.mp4"`, `Content-Length` and `video/mp4`. Its response schema declares `200: z.any().describe("The assembled MP4 file (video/mp4)")`.
- **The generated contract** (`docs/api-spec.yml`, produced from the running server's `/docs/json`) turns that into `200` with `content: application/json` and a schema carrying only the description. The document therefore contradicts the server, which sends `video/mp4` bytes.
- **The session read** (`toSnapshot`) sets `finalVideoUrl` to that route when `run.finalVideoPath != null`, and leaves it absent otherwise.
- **The page**: `SessionPage.tsx` renders `<FinalVideoDownload state={snapshot.session.state} url={downloadFinalVideoUrl(sessionId)} />`, and `FinalVideoDownload` returns nothing unless `state === "final-video"`. So the URL is rebuilt in `api/client.ts` and availability is re-derived from the state, while the read already carries both answers.
- **The invariant between the two**: `deriveSessionState` returns `final-video` when the assembly gate is open and a final video exists, and the gate check runs before the failure check, so a session holding a final video reads `final-video` even beside a recorded failure. A final video is only ever written while the gate is open, and a `chunk-complete` scene is never moved back (`manualRetry` and `correctAndRetry` both require `failed`). The two decisions therefore agree today, but only because of that chain.
- **Existing tests**: `assembly-api.test.ts` asserts `finalVideoUrl` is present after assembly and absent before; `scene-completion-api.test.ts` asserts 409 at `final-video-generating` and 404 for an unknown session; `components.test.tsx` asserts the link is absent at `chunks-processing` and `failed` and present at `final-video`. **No test downloads the file.**

## Goals / Non-Goals

**Goals:**
- Prove AC1 by actually downloading the file and checking its bytes and headers.
- Prove AC2 at both surfaces.
- Make the published contract match what the server sends.
- Leave one place deciding whether the download exists.

**Non-Goals:**
- Changing the route's path, status codes, headers or handler logic.
- Range requests, resumable or partial downloads.
- Downloads of the MP3, timestamps or generated texts (§12.3).
- Renaming the downloaded file (Decision 3).

## Decisions

**Decision 1 — Declare the response as binary in the route schema, not by hand-editing the contract.**
`docs/api-spec.yml` is generated and `docs/backend-standards.md` forbids hand-editing it, so the fix belongs in the Zod route schema. The 200 entry declares the `video/mp4` content type with a binary string schema, through whatever the project's `fastify-type-provider-zod` version supports for a non-JSON response (a `content`-shaped response entry, or a raw JSON-schema escape hatch). Task 2.1 settles which, by generating the document and reading it back. The handler is untouched, so the wire behaviour cannot change; only the description of it does.

*Alternative rejected:* editing the YAML directly. It would drift on the next regeneration, and the standards call the generated file the source of truth.

**Decision 2 — The page renders the URL the read publishes.**
`FinalVideoDownload` takes `url: string | undefined` and renders nothing when it is undefined; `SessionPage` passes `snapshot.session.finalVideoUrl` through `resolveResultUrl`, as the scene image already does; `downloadFinalVideoUrl` is deleted from `api/client.ts`. The state prop goes away. The page can then no longer offer a link the route would refuse, and the invariant in § Context stops being load-bearing.

This is the rule `download-scene-results` (JOS-163) states for per-scene downloads, applied to the same component tree. Neither change needs the other.

*Alternative rejected:* keeping the state gate and additionally checking the URL. Two conditions that must stay in step is the problem, not the fix.

**Decision 3 — The downloaded file keeps the name `final-video.mp4`.**
§12.2 identifies a *project folder* by the video title; §12.3 says nothing about the downloaded file's name. Several downloads therefore land as `final-video.mp4`, `final-video(1).mp4` and so on, with nothing to tell the projects apart. Naming the attachment after the title would need a sanitising rule for an arbitrary user title inside a header, which is a product decision with an injection surface, not a detail to settle inside this story. It is recorded as a finding for the product owner instead.

**Decision 4 — AC1's test downloads through the HTTP surface and compares bytes with the stored file.**
The test drives a session to `final-video` with the stub assembly tool, then injects the request and asserts the status, `content-type`, `content-disposition`, `content-length` and that the payload equals the bytes on disk in the project folder. Asserting only the status would not catch a stream that serves the wrong file.

## Risks / Trade-offs

- **[The Zod type provider may not express a binary response]** → Then the schema uses its raw-JSON-schema escape hatch, or the route declares the response outside Zod. If neither works in the installed version, task 2.1 records that and the change ships with a dated note in the contract header saying the 200 is `video/mp4` despite the generated `application/json`, rather than silently leaving a wrong contract.
- **[Dropping `downloadFinalVideoUrl` touches a file JOS-163 also edits]** → Both changes are small and in the same two files; whichever lands second rebases. Flagged in the proposal's coordination note.
- **[An old client that built the URL itself]** → Only this frontend did, and the route's URL is unchanged, so any existing link keeps working.

## Migration Plan

No migration. The contract document changes on regeneration; no stored data and no route behaviour changes. Rolling back restores the `z.any()` response and the state-gated component.

## Open Questions

None blocking. The download filename is recorded as a product finding (Decision 3), not a question for this change.
