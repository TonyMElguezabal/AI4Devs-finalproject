# Step 9 Report: Manual Endpoint Testing with curl

- Date: 2026-11-04
- Change: cover-error-reporting
- Agent: Claude Code (Opus 5.5)

## Setup (9.1)

- **Fake OTLP receiver:** a Python `http.server` on `127.0.0.1:4319` that appends each `POST /v1/logs` body to a file.
  - The first version read `Content-Length` only and got empty bodies, because the JavaScript exporter sends `Transfer-Encoding: chunked`. The receiver was fixed to read chunked bodies.
  - The test receiver (`backend/test/fakeOtlpReceiver.ts`) reads the stream to its end, so it was never affected.
- **Backend:** started with every variable written literally:
  ```
  NODE_ENV=development PORT=3199 DB_PATH=<scratch>/curl/db.sqlite PROJECTS_ROOT=<scratch>/curl/projects \
  SETTINGS_PATH=<scratch>/curl/settings.json SECRETS_PATH=<scratch>/curl/secrets.json \
  VID4YOU_TELEMETRY_ENDPOINT=http://127.0.0.1:4319 VID4YOU_ERROR_TRIGGERS=1 node src/server.ts
  ```
- **Guard:**
  - the log file appeared in `<scratch>/curl/logs/`;
  - `backend/data/logs/vid4you.log` stayed at 465 lines, and `data/skeleton.sqlite` stayed at `runs=1`, before and after.
- **Consent:** the scratch store starts with every signal off.

## 9.2 Valid report (consent off)

```
curl -X POST :3199/telemetry/frontend-errors -H "Content-Type: application/json" \
  -d '{"kind":"render","message":"x is undefined","stack":"TypeError: x is undefined\n    at App"}'
→ 204
```

Log file: `error`-level lines went from 0 to 1:

```json
{"level":50,"stage":"frontend","errorCode":"render","stack":"TypeError: x is undefined\n    at App","msg":"x is undefined"}
```

Nothing reached the receiver, because consent was off.

## 9.3 Error cases and the rate limit

| Request | Answer |
|---|---|
| `message` of 1001 characters | 400 `body/message String must contain at most 1000 character(s)` |
| `kind: "crash"` | 400 `body/kind Invalid enum value. Expected 'error' \| 'unhandledrejection' \| 'render', received 'crash'` |
| extra field `script` | 400 `body/ Unrecognized key(s) in object: 'script'` |
| `Origin: https://evil.example` | 403 `{"error":"origin not allowed"}` |

None of these added an `error` line.

**Rate limit:** 15 more reports in the same minute, on top of the one from 9.2.
- All 15 answered 204.
- 10 `frontend` lines in total: the 9.2 report plus 9 from the loop.
- One warning: `{"level":40,"msg":"more than 10 frontend error reports in a minute; the rest are dropped"}`.

## 9.4 Route crash with consent on

```
curl -X PUT :3199/telemetry/consent -d '{"errors":true,"providerUsage":false,"productUsage":false}'
→ {"errors":true,"providerUsage":false,"productUsage":false,"answered":true}

curl -X POST :3199/dev/errors/route-crash -H "Content-Type: application/json" -d '{"tag":"curl-9-4b"}'
→ 500 {"statusCode":500,"code":"SYNTHETIC_ERROR","error":"Internal Server Error","message":"synthetic route crash curl-9-4b"}
```

The body is the one Fastify's default handler builds.

**Log file:** the `recordError` line:

```
{stage: "api", route: "POST /dev/errors/route-crash", errorCode: "SYNTHETIC_ERROR", msg: "synthetic route crash curl-9-4b"}
```

Fastify's own `request errored` line is also there (design D1: two lines per 5xx).

**Receiver:** one record at severity `ERROR`:

```
{"exception.message": "synthetic route crash curl-9-4b", "stage": "api", "route": "POST /dev/errors/route-crash", "error.code": "SYNTHETIC_ERROR"}
```

- The stack was scrubbed.
- Resource keys: `deployment.environment`, `host.arch`, `os.type`, `service.instance.id`, `service.name`, `service.version`.
- Every key is on the allowlist.

## 9.5 Without `VID4YOU_ERROR_TRIGGERS`

The server was restarted on the same scratch store without the variable.

```
POST /dev/errors/route-crash        → 404 Route POST:/dev/errors/route-crash not found
POST /dev/errors/unhandled-rejection → 404
GET /docs/json → /telemetry/frontend-errors present; no /dev/ path
```

## 9.6 Restore

- Consent was put back to all off: `PUT /telemetry/consent` answered `{"errors":false,...}`.
- The server and the receiver were stopped.
- The scratch folder `<scratch>/curl` was removed.
- The Developer's `data/` store was never used (guard above).

## Observation (not changed)

- Fastify's own 5xx log line, which existed before this change, writes the raw stack with absolute paths to the local log.
- That file never leaves the machine (`PRIVACY.md`), and it is outside this change's scope.
- What is exported goes through `recordError`, which scrubs.

## Outcome

- Step 9 status: PASS
