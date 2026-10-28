## Context

`App.tsx` passes `onPause={() => pauseSession(sessionId)}` and `onContinue={() => continueSession(sessionId)}` to `SessionPage`, which hands them to `SessionHeader`, typed `() => void`. The client's `asJson` turns a non-OK response into `Error(reason)`; the backend's only refusal for both routes is 404 `{ ok: false, reason: "unknown session" }` (`orchestrator.ts`, `pauseSession`/`continueSession`). A request that never reaches the backend rejects with the browser's `TypeError` (`Failed to fetch`). Nothing catches either.

The pattern to follow already exists: `PhaseRetryButton` keeps `pending` and `refusal` state, disables the button while pending and shows the refusal as `<p role="status">` from a sentence lookup (`retryRefusalSentence`). `pauseRefusals.ts` holds the scene-pause dial's lookup (`pauseRefusalSentence`), which shows any reason containing a space as it came, because that server's 422 is already a sentence.

## Goals / Non-Goals

**Goals:**

- A failed pause or continue shows a plain-language sentence and the button is usable again (spec: A failed pause or continue is shown as a sentence…).
- Both `no-misused-promises` suppressions in `App.tsx` go away with lint still at 0.

**Non-Goals:**

- No backend or API change; no new refusal reason.
- No optimistic state change on success: the live update keeps driving `paused`.
- No retry or toast mechanism.

## Decisions

### Decision 1: The header owns the pending and refusal state

`SessionHeader` keeps `pending` and `refusal`, as `PhaseRetryButton` does; `onPause` and `onContinue` become `() => Promise<unknown>` in `SessionHeader` and `SessionPage`. One shared pair of state values is enough because the header never offers both buttons at once (paused-session-display: Continue is available whenever the session is paused).

*Alternative:* catch in `App.tsx` and pass an error prop down. Rejected: it splits one control's behaviour across three files and diverges from every other session action, which handle their own failure in the component.

*Alternative:* reuse `PhaseRetryButton` directly. Rejected: it hard-codes the retry icon and `retryRefusalSentence`; generalising it for two buttons costs more than the dozen lines in the header.

### Decision 2: A dedicated sentence lookup, not the space heuristic

Add `sessionPauseRefusalSentence(action: "pause" | "continue", reason: string)` to `pauseRefusals.ts`: `"unknown session"` maps to "This session could not be found."; everything else falls back to "The session could not be paused." or "The session could not be continued."

*Alternative:* reuse `pauseRefusalSentence` with a fallback. Rejected: its "a reason with a space is already a sentence" rule would show `unknown session` and `Failed to fetch` raw, which the spec forbids.

The function sits in `pauseRefusals.ts` beside the other pause lookup rather than in a new file; its doc comment says it is the session pause, not the scene pause.

### Decision 3: A new click clears the sentence; nothing else does

The sentence is cleared at the start of the next click, as in `PhaseRetryButton`. If a live update flips `paused` while a sentence is shown, the sentence stays until the next click. This keeps the header free of effects on `session`; the case needs a failure followed by a pause or continue from another tab.

## Risks / Trade-offs

- [A stale sentence after a live update from elsewhere (Decision 3)] → Accepted; the next click clears it. Clear it on a `paused` change only if it shows up in use.
- [The button stays disabled until the request settles, even though the state change arrives by live update] → Requests answer in milliseconds locally; a hung request leaves the button disabled until the browser gives up, which is the same as every other session action.
- [About twenty existing tests render `SessionHeader` or `SessionPage` with `onPause={() => {}}`, which no longer type-checks against `() => Promise<unknown>`] → Replace them with one shared `async () => {}` helper in the test file; their assertions do not change.
