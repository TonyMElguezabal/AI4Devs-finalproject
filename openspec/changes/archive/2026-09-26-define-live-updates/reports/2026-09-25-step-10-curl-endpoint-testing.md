# Step 10 Report — Manual Endpoint Testing with curl (held-open stream)

- Date: 2026-09-25
- Change: define-live-updates (JOS-183)
- Agent: Claude (Sonnet 5)
- Server: `openspec/changes/define-backend-stack/skeleton`, `node src/server.ts`

This endpoint is a held-open stream, not a request-that-returns. The exact invocation that works — `curl -s -N --max-time <seconds> "http://127.0.0.1:3100/events?sessionId=<id>"` — is recorded here so later stories inherit it (`docs/backend-standards.md`'s persistence/live-updates section also carries it).

## 10.1 — Reachability

```
$ curl -s http://127.0.0.1:3100/health
{"ok":true}
```

## 10.2–10.3 — Hold the stream open, capture raw frames, confirm the payload shape

**A genuine procedural finding first:** the naive approach — create a session, *then* start the `curl -N` hold in a separate command — missed everything, because by the time the second command ran, the scenes had already finished (an artifact of this session's own tool-call round-trip latency, not the product). The fix: create the session **and** start the held-open curl capture in the *same* shell script, so the connection is provably open before any state change occurs.

```bash
R=$(curl -s -X POST http://127.0.0.1:3100/sessions -H "Content-Type: application/json" \
    -d '{"title":"Curl Stream Test 2","language":"en","scenes":[{"mode":"success","latencyMs":3000,...},{"mode":"success","latencyMs":5000,...}]}')
SID=$(...)
curl -s -N --max-time 8 "http://127.0.0.1:3100/events?sessionId=$SID"
```

Captured, verbatim:
```
: connected

data: {"session":{"type":"session","sessionId":"1eae6385-...","title":"Curl Stream Test 2","language":"en","state":"chunks-processing","paused":false,"updatedAt":"..."},"scenes":[{"type":"scene",...,"state":"chunk-complete","result":{"imageUrl":"scene-1.png"},...},{"type":"scene",...,"state":"image-generating",...}]}

data: {"session":{...,"state":"final-video",...},"scenes":[{...,"state":"chunk-complete",...},{...,"state":"chunk-complete","result":{"imageUrl":"scene-2.png"},...}]}
```
Field for field, this matches the contract in `design.md` § Execution Record §4: `SessionEventPayload` (`type`, `sessionId`, `title`, `language`, `state`, `paused`, `updatedAt`) and `SceneEventPayload` (`type`, `sessionId`, `sceneId`, `index`, `state`, `provider`, `attempts`, `result`, `instruction`, `updatedAt`) — each message is the **full current state** (Decision 2), never a delta.

## 10.4 — Snapshot read

```
$ curl -s http://127.0.0.1:3100/sessions/<id>
→ {"session":{...,"state":...,"paused":false,...},"scenes":[{...}]}
```
Returns session state, the paused marker, and every scene's current state in one request, as Decision 4 requires — already exercised repeatedly in `openspec/changes/define-persistence/reports/2026-09-25-step-8-curl-endpoint-testing.md` and the Step 7 live-experiments report of this change.

## 10.5 — A triggered state change appears on the held-open stream

Demonstrated by the same capture as 10.2–10.3: both scene completions and the final session-state transition to `final-video` appeared on the already-open stream with no reconnection needed.

## 10.6 — Cross-session isolation

Session A's stream was held open (`curl -N --max-time 6`) while session B was created and completed *during* that window, in the same shell script:
```bash
curl -s -N --max-time 6 ".../events?sessionId=$SIDA" > capture.txt &
sleep 0.3
curl -s -X POST .../sessions -d '{"title":"Curl Isolation B",...}'   # completes within the window
wait
grep -c "$SIDB" capture.txt   # 0
```
Session A's captured stream contains exactly one data frame — session A's own completion — and **zero** occurrences of session B's identifier anywhere in the capture.

## 10.7 — Unknown session identifier rejected, not silently streamed

**A real bug found and fixed here.** Before this check, `GET /events?sessionId=<unknown>` returned `200 text/event-stream` and opened a live connection that would simply never emit anything — indistinguishable from a slow/quiet session rather than a clear error. Fixed: the route now checks `getRun(sessionId)` before upgrading to a stream.
```
$ curl -s -m 2 -D - "http://127.0.0.1:3100/events?sessionId=00000000-0000-0000-0000-000000000000"
HTTP/1.1 404 Not Found
{"error":"session not found"}
```

## 10.8 — Cleanup and restoration

Server stopped, `data/skeleton.sqlite` and `data/projects/` deleted (disposable, per `docs/adr/0001-backend-stack.md`). Restoration verified: `data/` does not exist afterward.

## Outcome

- Step 10 status: **PASS**
- Blocking issues: none remaining (one found and fixed — see 10.7)
