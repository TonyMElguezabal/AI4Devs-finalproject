## Context

`createRunningHubVideoProvider` makes three HTTP calls. The service moved (or the adapter never matched it): the checks below were made on 2026-10-13 with the account's key and a 1920x1088 PNG, outside the application.

| Call | Live behaviour |
|---|---|
| `POST /openapi/v2/media/upload/binary`, raw body | HTTP 200, `{taskId:"", status:"", errorCode:"1000", errorMessage:"Unknown error…"}` |
| same, multipart `file` | HTTP 200, `{code:0, msg:"success", errorMessages, data:{type, download_url, fileName, size}}` |
| submit to the recorded model endpoint, query `POST /openapi/v2/query` | as in the archived render script `decide-silence-allocation/scripts/render.ts` that produced real clips (taskId at the top level; `status`, `results[0].url`, `usage`) and RunningHub's API page for `hailuo-h3` (`resolution` `2K` or `768P`, `status` `QUEUED`/`RUNNING`/`SUCCESS`/`FAILED`, `results[].url`) |

## Goals / Non-Goals

**Goals:** the adapter sends what the live API accepts and reads what it returns; provider errors become readable transient failures.
**Non-Goals:** retry timing or backoff, storing failure reasons on `provider_requests`, changes to the port, the stage, the configuration or the PRD.

## Decisions

**Decision 1 — Keep the `fetchFn` seam and the response parsing in the adapter; change only shapes.**
The tests already inject `fetchFn`; they are rewritten to the live shapes, so they keep proving the mapping without a network. *Alternative:* a separate RunningHub client module (rejected: one adapter, three calls).

**Decision 2 — Parse with permissive zod schemas and report the provider's own error.**
The submit and query answers are one flat envelope (`taskId`, `status`, `errorCode`, `errorMessage`, `results`); the upload answer is `{code, msg, data}`. A non-empty `errorCode` (string) or a non-zero `code` is a transient failure whose reason is `<step> failed: <errorMessage or code> (error <code>)`. The reason never includes headers or the key. *Alternative:* classify some codes as not retryable (rejected: JOS-165 found no distinguishable signal; keep transient).

**Decision 3 — `taskId` is read from the top level, falling back to `data.taskId`.**
The live answer has it at the top level; the working script tolerated both, so the adapter does too.

**Decision 4 — The duration stays a number in the JSON body.**
The known-good script sent a number and it was accepted, although the API page documents a string; the adapter keeps the proven form.

## Risks / Trade-offs

- [The live API changes again] → the contract test (needs a key, skipped without it) catches it; a failed answer is a readable transient failure naming the step.
- [`FAILED` carries no reason in the port] → unchanged here; the reason is kept in the log line of the stage, and a store column is a separate story.
- [The first real clip costs money] → one 5-second clip in the verification step.

## Open Questions

None blocking; whether `duration` should be sent as a string is left as observed (Decision 4).
