## Context

Epic JOS-245 (stories JOS-252 to JOS-256). Facts found in the code that shape this design:

1. **One reporter already exists.** `recordError` (`backend/src/telemetry/index.ts:119`) writes the local log line first (JOS-243 D5, through `setErrorLog(app.log)` in `bootstrap.ts:85`), then returns when error consent is off, else emits one OTLP log record. It scrubs the message and stack with `redactPaths`. Every new path in this change calls it; none touches the SDK.
2. **Three callers today:** `reportStageAttempt` (`db.ts:1904`), `reportProviderRequest` (`db.ts:2388`) and `installProcessErrorHandlers` (`telemetry/processHandlers.ts`).
3. **No route error is reported.** There is no `setErrorHandler` or `onError` hook in `server.ts` or `routes.ts`. Fastify's default error handler answers 500 for an error with no status (or one below 400) and logs it at `error` level, so a 5xx reaches only the log file.
4. **Attribute allowlist.** The relay drops any attribute not in `infra/telemetry-relay/src/allowlist.ts`, and `backend/test/telemetry.test.ts` imports that list. There is no `route` key. Adding one means a relay deploy, which runs on a merge into `main`; until then the relay drops the key and keeps the rest of the record.
10. **The scrubber redacts any `/`.** `redactPaths` (`util/redactPaths.ts`) replaces every `/\S+` with `[path]`, so a route pattern put in the message would arrive as `POST [path]`. Found by the first test run of task 1.1.
5. **`catch` blocks.** `grep catch backend/src` finds 105 lines in 29 files (the ticket counted 82 blocks; the difference is `.catch(` handlers and comments). The largest are `db.ts` (18), `imageProvider.ts` (13), `videoProvider.ts` (11) and `orchestrator.ts` (11). Many turn a provider error into an attempt outcome that is already reported when not retryable.
6. **The frontend reports nothing.** `frontend/src/main.tsx` renders `<App />` with no boundary and no `window` listeners. React is 18.3, so there are no `createRoot` error options; an error boundary is a class component.
7. **The OTLP endpoint is an environment variable.** `VID4YOU_TELEMETRY_ENDPOINT` (`config/build.ts`) sets it. `@opentelemetry/exporter-logs-otlp-http` sends JSON, so a fake receiver can be a few lines of `node:http`.
8. **A spawned-server harness exists.** `backend/test/workflowServer.ts` runs `node src/server.ts` with scratch folders, `NODE_ENV=development` (logging on) and every `USE_STUB_*` variable from the caller. The log file is `logs/` beside `DB_PATH`. `USE_STUB_IMAGE_PROVIDER=not-retryable-failure` already makes a stage fail permanently (`workflow-stage-failure.test.ts`).
9. **The process handlers flush, then exit 1** (`shutdownTelemetry(2000)`), so an unhandled rejection's record can leave before the process dies.

## Goals / Non-Goals

**Goals:**
- Every error the app throws, backend and frontend, reaches the local log file, and Grafana with consent.
- The response of every route stays exactly as it is today.
- A CI test fails when any of the four error classes stops reaching the log file or the OTLP export.
- One manual check proves the labels and the `release-health` dashboard on the live stack.

**Non-Goals:**
- Source maps for frontend stacks (ticket JOS-254 notes).
- Any relay change beyond adding `route` to the allowlist (fact 4).
- Reporting transient provider failures (they are already counted in the provider metrics).
- Changing what is reported for the three existing paths.
- A Grafana token in CI (JOS-256 notes).

## Decisions

### D1. Route errors: an `onError` hook, not `setErrorHandler`

`buildApp` adds `app.addHook("onError", …)` before registering the routes. The hook reads `error.statusCode ?? 500`; unless it is a 4xx, it calls `recordError({ stage: "api", route: \`${request.method} ${request.routeOptions.url ?? "unknown"}\`, errorCode: error.code ?? error.name, message: error.message, stack: error.stack })`. `recordError` gains an optional `route`, written to the local log as `route` and exported as the OTLP attribute `route`, without the path scrubber (fact 10): it is a pattern from the code. The relay allowlist gains `route`. Fastify runs `onError` before the error handler and does not let it change the answer, so the default handler still builds the same status and body (JOS-252 AC3) by construction. Fastify's default handler also maps a status below 400 to 500; the hook mirrors that: `status < 400 ? 500 : status`.

The route is the pattern (`/sessions/:id`), never the raw URL, so session ids and query values stay out. The request body is never read (JOS-252 AC4).

A 401 on `/admin/` is sent with `reply.code(401).send(...)`, not thrown, so it never reaches the hook. Validation errors carry `statusCode` 400. Both are not reported (AC2).

- *Alternative: `setErrorHandler`.* Rejected: it replaces Fastify's handler, so we would have to rebuild today's 500 body and the Zod 400 body ourselves, and risk changing them.
- *Alternative: the route in the message.* Tried first and rejected: the scrubber turns it into `[path]` (fact 10), and loosening the scrubber for one caller weakens it for all.
- *Alternative: the route in `stage` (`api /sessions/:id`).* Rejected: it mixes about 60 route values into the label the dashboards group by.
- *Chosen: a `route` attribute* (owner's choice, 2026-11-04). The cost is one allowlist key and a relay redeploy on the next merge into `main`; before that, the relay drops it and the record still arrives.

The local log gets two lines for a 5xx: Fastify's own `request errored` line and the `recordError` line with `stage` `api`. Accepted; removing Fastify's line would change its logging config for every route.

### D2. Catch audit: report only what would be lost

Each block falls into one of four groups, recorded in `reports/YYYY-MM-DD-catch-audit.md` (file, line, group, what changed):

| Group | Example | Action |
|---|---|---|
| A. Becomes an outcome already reported | a provider adapter returning `not_retryable_failure` | none; one-line comment only if the path is not obvious |
| B. Rethrows or answers HTTP | a route answering 4xx/5xx with a reason | none (5xx thrown errors are covered by D1) |
| C. Swallows by design | `writeErrorLog`, telemetry guards, best-effort file cleanup | one-line comment when it has none |
| D. Lost | catches, logs nothing or only `warn`, and goes on | add `recordError` with the stage when known |

`telemetry/index.ts` is group C entirely: reporting from inside the reporter could loop. Transient provider errors stay out (they are retried and counted in metrics). The audit adds no `try` and moves no `return`. Each block changed in group D gets a test only when its module already has tests for that path; the rest are covered by the report and by review.

- *Alternative: a lint rule forbidding empty catches.* Rejected for now: the codebase has no custom ESLint rules, and the audit is a one-off. `docs/backend-standards.md` gets the rule in prose.

### D3. Frontend reports: one endpoint, capped by Zod, limited in the backend

`POST /telemetry/frontend-errors` in `routes.ts`, next to `/telemetry/consent`. Body schema: `z.object({ kind: z.enum(["error", "unhandledrejection", "render"]), message: z.string().max(1000), stack: z.string().max(8000).optional() }).strict()`. It calls `recordError({ stage: "frontend", errorCode: kind, message, stack })` and answers 204. Consent is handled inside `recordError` (fact 1), so the endpoint has no consent code (JOS-254 AC3).

Rate limit: a module-level window in `routes.ts`, 10 reports per 60 seconds; past the limit the report is answered 204 and dropped, with one `warn` per window. `// ponytail: one global window; per-kind or per-message limits if one noisy error hides others.` The answer stays 204 so the frontend never retries.

- *Alternative: `@fastify/rate-limit`.* Rejected: a new dependency for one counter.
- *Alternative: limit in the frontend.* Rejected: the backend limit is the one that protects the log file and the export, whatever the client does.

The frontend side:
- `reportFrontendError(kind, error)` in `frontend/src/api/client.ts` cuts the message and stack (so a long message is truncated, not rejected with 400), posts with `keepalive: true`, and swallows any failure with `.catch(() => {})`. It never reports its own failure, so it cannot loop.
- `main.tsx` adds the `error` and `unhandledrejection` listeners on `window`, once, before `createRoot`.
- A new `ErrorBoundary` class component in `frontend/src/components/ErrorBoundary.tsx` wraps `<App />` inside `StrictMode`. `componentDidCatch` reports `render`; the fallback is a short message and a "Reload" button calling `window.location.reload()`, styled with the existing tokens.

React 18 rethrows render errors in development, so they also reach the `window` `error` listener there. In a production build they do not. Accepted: in development a render error may be reported twice; the backend limit caps it.

### D4. Error triggers: two routes behind `VID4YOU_ERROR_TRIGGERS=1`

`buildApp` registers, only when `process.env.VID4YOU_ERROR_TRIGGERS === "1"`:
- `POST /dev/errors/route-crash` → throws `new Error(\`synthetic route crash ${tag}\`)` with `code` `SYNTHETIC_ERROR`;
- `POST /dev/errors/unhandled-rejection` → answers 202, then `setImmediate(() => void Promise.reject(new Error(\`synthetic unhandled rejection ${tag}\`)))`.

`tag` is an optional body field, `z.string().regex(/^[A-Za-z0-9-]{1,40}$/)`. Both serve JOS-255 (CI) and JOS-256 (live check). The api-spec is generated from an app without the variable, so they never appear in `docs/api-spec.yml`. The variable is not `USE_STUB_*`: nothing is stubbed. The spawned-server harness passes it explicitly. Because of that, the packaged entry's `sanitizeEnvironment` (`packaging/runtimeEnv.ts`), which removes `ALLOW_TEST_ENDPOINTS` and every `USE_STUB_*`, would not have caught it; it gains the variable by name (found while writing task 12.3, 2026-11-04). The JOS-256 check runs from `npm run dev`, not a packaged build, so it is not affected.

- *Alternative: make a real route crash.* Rejected: no route crashes on demand without corrupting the store, and an unhandled rejection cannot be caused from outside at all.

### D5. Contract test: the workflow harness plus a fake receiver

`backend/test/error-reporting-contract.test.ts`. A fake receiver in `backend/test/fakeOtlpReceiver.ts` (`node:http` on port 0, collects parsed JSON bodies of `POST /v1/logs`, answers 200 to everything). `startWorkflowServer` takes an extra env map, so the test passes `VID4YOU_TELEMETRY_ENDPOINT` (the receiver), `VID4YOU_ERROR_TRIGGERS=1` and `USE_STUB_IMAGE_PROVIDER=not-retryable-failure`.

Per consent case (on, off), one spawned server:
1. `PUT /telemetry/consent` with `errors` on or off.
2. `POST /dev/errors/route-crash`; create a session and wait for the image stage to fail; `POST /telemetry/frontend-errors`.
3. Last, `POST /dev/errors/unhandled-rejection`; wait for the process to exit (fact 9 flushes first).
4. Read `logs/` in the scratch folder: one `error` line per class, matched on `stage` (`api`, `image`, `frontend`) and the rejection's message.
5. Read the receiver: with consent on, at least one log record per class (a not-retryable image failure is reported as both an attempt and a request), with `stage` (absent for the rejection, as today), `error.code`, and `provider` `stub` for the image failure; with consent off, none.

The OTLP batch processor exports every 1 s by default; the test polls the receiver with `waitFor` (no fixed sleep). `stop()` must tolerate a process that already exited.

- *Alternative: in-process with `setTelemetryExportersForTest`.* Rejected: it skips the real exporter, the real env wiring and the real process handlers, which is what the story wants to pin.

### D6. Live check: manual, recorded in `reports/`

A `development` run (`npm run dev` in `backend`) with `VID4YOU_ERROR_TRIGGERS=1`, error consent on and the real endpoint. `POST /dev/errors/route-crash` with tag `jos-256-<date>`. Then in Grafana: Explore → Loki, `{service_name="vid4you", detected_level="error"} |= "jos-256-<date>"`, checking `stage`, `error_code`, `service_version` (and `provider` from a second, stage-failure error, since a route crash has none). Then `release-health` with Environment = `development`. The report states what was checked. If the labels match, `infra/grafana/README.md` loses its "not yet checked" note; if not, the dashboard queries and the README are fixed, and task 8.3 of the archived observability change gets a note.

The Grafana part needs the Developer's logged-in browser. The agent drives the trigger and reads Grafana through the browser only with the Developer's go-ahead.

## Risks / Trade-offs

- [A frontend error message holds user text, for example a thrown message that quotes an input] → Messages are capped and path-scrubbed; the frontend code never builds error messages from the script; reviewed in the audit of `client.ts` callers. Residual risk noted in `PRIVACY.md`.
- [A crash loop floods the log file] → The 10-per-minute limit on frontend reports. Backend 5xx loops are bounded by request volume, which is local and single-user.
- [The contract test is slow or flaky (two spawns, a process exit)] → One server per consent case, `waitFor` with bounds, the rejection last. Budget about 20 s, in line with the workflow tests.
- [Fastify changes `onError` timing in a later major] → The JOS-252 AC3 test pins the 500 body.
- [The audit changes control flow by accident] → Rule: add a call, never move a `return` or `throw`; the full backend suite runs after each file group.

## Migration Plan

No data migration. The triggers are off unless the variable is set. Rollback is a revert.

## Open Questions

None blocking. Base branch: `feature/entrega-3-JAME`, which holds JOS-243's error log (fact 1); `main` does not yet.
