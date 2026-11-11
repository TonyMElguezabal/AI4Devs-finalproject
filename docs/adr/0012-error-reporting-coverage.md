# ADR 0012 — How errors reach the telemetry (JOS-245)

- Status: Accepted (2026-11-04); the PRD text was approved by the product owner on 2026-11-11
- Date: 2026-11-04
- Change: `cover-error-reporting` (archived `2026-11-04-cover-error-reporting`; full design in its `design.md`)

## Context

Opt-in error reports (ADR 0007, `PRIVACY.md`) only covered uncaught errors and provider failures. A route that threw, a caught-and-forgotten error and a crash in the browser were never reported.

## Decision

- **Route errors**: a Fastify `onError` hook (not `setErrorHandler`, which would force rebuilding the 500 and Zod 400 bodies) reports every non-4xx error with `stage: "api"` and the route pattern (never the raw URL) as its own `route` attribute. The request body is never read.
- **Catch audit**: each `catch` is grouped as already reported, rethrown, swallowed by design, or lost; only the lost ones get a `recordError`. The telemetry module itself is never audited into reporting (it could loop). Transient provider errors stay out; they are retried and counted in metrics.
- **Frontend**: `POST /telemetry/frontend-errors` accepts `error`, `unhandledrejection` and `render` reports (message at most 1,000 characters, stack at most 8,000, strict schema), limited to 10 per 60 s and answered 204 past the limit. An error boundary shows a "Something went wrong" card.
- **Triggers and checks**: two routes behind `VID4YOU_ERROR_TRIGGERS=1` raise a backend error on purpose; a contract test uses the workflow harness with a fake receiver; the live check is manual and recorded in `reports/`.

## Consequences

- The relay drops the new `route` attribute until the next merge into `main` redeploys it; the record still arrives.
- A 5xx writes two lines to the local log (Fastify's and ours); accepted.
