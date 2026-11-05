## Why

Only three paths report an error today: not-retryable stage attempts, not-retryable image and clip requests, and uncaught exceptions or unhandled rejections. A route that crashes with a 5xx reaches only the local log file, some backend `catch` blocks swallow errors without a word, the frontend reports nothing, and the Grafana labels were never checked against the live stack. Epic JOS-245 closes these gaps so every error reaches the local log file and, with consent, Grafana.

## What Changes

- **Route errors (JOS-252):** a Fastify `onError` hook reports every route error that answers 5xx through `recordError`, with `stage` `api`, a new `route` field (method and route pattern) and the error code. 4xx answers are not reported. The response body stays as it is today.
- **Catch audit (JOS-253):** each `catch` block in `backend/src` either reports its error, rethrows to a path that reports it, or carries a one-line comment saying why it does not. Control flow is unchanged. The list of changed blocks goes to `reports/`.
- **Frontend capture (JOS-254):** a new `POST /telemetry/frontend-errors` endpoint calls `recordError` with `stage` `frontend`. The frontend sends uncaught errors, unhandled rejections and React render errors to it. A new error boundary shows a fallback instead of a blank page. Messages and stacks are size-capped, and the endpoint is rate-limited.
- **Error triggers for testing:** with `VID4YOU_ERROR_TRIGGERS=1`, the backend registers a route that throws on purpose and a route that causes an unhandled rejection. Without the variable, neither exists. Both carry a tag in the message, so one error can be found in Loki.
- **Contract test (JOS-255):** a CI test spawns the backend with its OTLP endpoint pointed at a local fake receiver. It triggers a route crash, a not-retryable stage failure, a frontend error report and an unhandled rejection, then checks the log file and the receiver, with consent on and with consent off.
- **Live check (JOS-256):** one tagged synthetic error from a `development` run is found in Loki and on the `release-health` dashboard. Then either `infra/grafana/README.md` or task 8.3 of the archived observability change is corrected.

The relay allowlist gains one key, `route`. Until the relay is redeployed (a merge into `main`), the relay drops it and everything else still arrives.

## Capabilities

### New Capabilities
- `frontend-error-capture`: the frontend catches uncaught errors, unhandled rejections and render errors, shows a fallback on a render error, and sends a size-capped report to the backend.

### Modified Capabilities
- `app-telemetry`: the "Error reports" and "Reported errors reach the local log file" requirements now also cover 5xx route errors and frontend reports. New requirements cover the catch audit rule, the rate limit on frontend reports, the env-gated error triggers, and the CI contract test.

## Impact

- Backend: `backend/src/server.ts` (the `onError` hook, the trigger routes), `backend/src/routes.ts` (the frontend error endpoint), the `catch` blocks across `backend/src`, and new tests in `backend/test`, including a fake OTLP receiver.
- Frontend: `frontend/src/main.tsx`, a new error boundary component, and a new wrapper in `frontend/src/api/client.ts`.
- Docs: `docs/api-spec.yml` (the new endpoint), `PRIVACY.md` (frontend errors are reported), `infra/grafana/README.md`, `docs/backend-standards.md` (the catch rule), `docs/frontend-standards.md` (the error boundary).
- Relay: `infra/telemetry-relay/src/allowlist.ts` gains `route` (deployed by the existing workflow on a merge into `main`).
- No new dependency, no database migration.
