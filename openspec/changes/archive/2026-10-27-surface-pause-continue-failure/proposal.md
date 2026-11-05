## Why

When `Pause session` or `Continue session` fails (the backend answers 404 `unknown session`, or the request never reaches it), the promise rejects with no handler: the browser logs an unhandled rejection and the person sees nothing, so the button seems to do nothing (JOS-217). Every other session action already catches its failure and shows a plain-language sentence. JOS-208's type-aware lint (`@typescript-eslint/no-misused-promises`) found the gap; its PR suppressed the two lines in `frontend/src/App.tsx` pending this fix.

## What Changes

- The session header disables the Pause or Continue button while its request is outstanding, re-enables it when the request settles, and shows a plain-language sentence when the request fails.
- The failure sentence comes from a lookup in the existing refusal-sentence style: a missing session reads "This session could not be found."; anything else (a network error included) reads "The session could not be paused." or "The session could not be continued.", never the raw error text.
- `onPause` and `onContinue` in `SessionHeader` and `SessionPage` become promise-returning callbacks, so `App.tsx` drops both `eslint-disable-next-line @typescript-eslint/no-misused-promises` comments.
- A successful pause or continue behaves as today: the live update still drives the displayed state.
- No backend or API change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `paused-session-display`: adds a requirement that a failed pause or continue is shown as a sentence and leaves its button usable.

## Impact

- Frontend: `frontend/src/components/SessionHeader.tsx`, `frontend/src/components/SessionPage.tsx` (prop types only), `frontend/src/App.tsx` (suppressions removed), `frontend/src/pauseRefusals.ts` (new sentence lookup), `frontend/test/components.test.tsx`.
- Backend, API contract (`docs/api-spec.yml`) and data model: unchanged.
- Linear: JOS-217 (bug, `module:pause`), related to JOS-208.
