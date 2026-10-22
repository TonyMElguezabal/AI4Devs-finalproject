# Lint findings that point to real defects (for the PR description)

| Finding | Where | Disposition |
|---|---|---|
| Dead code: unused `providerModeSchema` (and its import) | `backend/src/routes.ts` | Removed |
| Unused imports and variables (about 35) | `backend/test/**` | Removed |
| Untyped SQLite rows (`row: any`, `as any`, 270+ unsafe accesses) | `backend/src/db.ts` | Fixed: row interfaces plus `getRow`/`allRows` helpers keep the single cast in one place |
| `catch (err: any)` on error codes | `backend/src/db.ts`, `sceneRegistration.ts` | Fixed: `errorCode()` / `isUniqueConstraintError()` helpers on `unknown` |
| `any` from `response.json()` | `backend/src/telemetry/updateCheck.ts`, `frontend/src/api/client.ts` | Fixed: response shape typed |
| Unused catch variable | `backend/src/orchestrator.ts` | Fixed: optional catch binding |
| `await` of a non-promise | `backend/test/image-stage.test.ts` (`launchImageStage` is synchronous) | Removed the `await` |
| Floating promise | `frontend/src/components/SceneRow.tsx` | Fixed with `void` (the action catches its own errors) |
| Promise handed to a void callback, with no error handling | `frontend/src/App.tsx` `onPause`/`onContinue` | **Deferred**: a failed pause or continue rejects unhandled and shows nothing to the user. Suppressed with a reason; a follow-up ticket should surface the failure |
| Promise handed to a void callback, error handled inside | `App.tsx` (2), `PhaseRetryButton`, `TelemetryConsentDialog`, `SceneRow` | Suppressed per line with the reason |
| `setState` inside an effect (React Hooks) | `SceneRow`, `PauseDial`, `TelemetryConsentDialog`, `useLiveSession` | Suppressed per line: each resets state when a prop changes; a refactor to keyed components is out of scope |
| Promise rejected with a non-Error | `backend/src/retry/retryScheduler.ts` | Suppressed per line: forwards whatever the sender threw, unchanged |
| `async` method with no `await` | provider and assembly stubs, Fastify handlers | Suppressed per line: the signature is async by contract |
