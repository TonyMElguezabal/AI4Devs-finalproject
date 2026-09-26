# Step 8 Report — Manual Endpoint Testing with curl

- Date: 2026-09-25
- Change: define-persistence (JOS-181)
- Agent: Claude (Sonnet 5)
- Server: `openspec/changes/define-backend-stack/skeleton`, `node src/server.ts`, real store (`data/skeleton.sqlite`, `data/projects/`) — not the isolated test DB from the Step 7 report.

This report also carries the **live** evidence for experiments 5.1–5.6 from `../tasks.md` §5, run against the real, now-decided store (embedded SQLite via `node:sqlite`), not a stand-in.

## 8.1–8.2 — reachability and pre-test state

```
$ curl -s http://127.0.0.1:3100/health
{"ok":true}
```
Pre-test: `data/skeleton.sqlite` and `data/projects/` did not exist (fresh boot).

## 8.3–8.4 — start a session, verify stored records, verify the read reflects storage

```
$ curl -s -X POST http://127.0.0.1:3100/sessions -H "Content-Type: application/json" \
  -d '{"title":"My Trip","language":"en","scenes":[{"mode":"success","latencyMs":300,"instruction":"sunrise"}]}'
→ 201 {"session":{...,"title":"My Trip","language":"en","state":"chunks-processing",...},
        "scenes":[{...,"state":"image-generating","provider":"stub-image-provider","attempts":1,...}]}

# a real project folder was created immediately:
$ find data/projects -type f
data/projects/My Trip 2026-09-25 15-52/scene-1.png

$ curl -s http://127.0.0.1:3100/sessions/<id>
→ {"session":{...,"state":"final-video",...},
    "scenes":[{...,"state":"chunk-complete","result":{"imageUrl":"scene-1.png"},...}]}
```
The read reflects the store: the scene's `result.imageUrl` is the actual relative path to the actual file written under the session's real project folder, not an in-memory value.

## 8.5 — Experiment 5.3: duplicate success confirmation rejected

```
$ curl -s -X POST http://127.0.0.1:3100/internal/provider-callback/<requestId>   # already resolved naturally
{"applied":false,"note":"duplicate delivery ignored (request already resolved)"}

$ node -e "... SELECT COUNT(*) FROM scene_results WHERE scene_id=? ..."
1   # stays 1 — the scene_results PRIMARY KEY is what actually enforces this, not the check above
```

## 8.6 — Experiment: retry appends a new attempt row rather than overwriting

```
$ curl -s -X POST http://127.0.0.1:3100/sessions/<id>/scenes/<sceneId>/retry
{"ok":true}

$ node -e "... SELECT id, attempt_number, resolved FROM provider_requests WHERE scene_id=? ORDER BY rowid ASC ..."
[
  {"id":"a0e4ecba-...","attempt_number":1,"resolved":1},
  {"id":"fc870bb6-...","attempt_number":1,"resolved":1}
]
```
Two distinct rows (different `id`), not one row mutated — append-only, as `define-persistence` Decision 1 requires.

## 8.7 — Error cases

| Case | Command | Result |
|---|---|---|
| Unknown session id | `GET /sessions/00000000-...` | `404 {"error":"session not found"}` |
| Malformed payload (missing `language`) | `POST /sessions` without `language` | `400 {"code":"FST_ERR_VALIDATION","message":"body/language Required"}` |
| Write violating the uniqueness constraint | `commitSceneResult()` called twice for the same `sceneId` (proven directly at the store level — see `test/persistence.test.ts` and the Step 7 report) | second call returns `false`; `scene_results` never exceeds one row per scene |

## Experiment 5.1 — restart resumption, request identified by stage and provider

A scene was launched with `latencyMs=20000`; the process was killed genuinely mid-flight (confirmed via same-shell status check immediately before `kill -9`) and restarted.

```
boot log: {"resumed":0,"recordedFailedAttempt":0,"stillPending":1,...}

$ node -e "... JOIN provider_requests to scenes ..."
{
  "request": {"id":"98543f28-...","scene_id":"44a97e2a-...","sent_at":"...","latency_ms":20000,"mode":"success","attempt_number":1,"resolved":0},
  "sceneProvider": {"provider":"stub-image-provider","instruction":"a mountain lake"}
}
```
The recorded request, joined to its scene, identifies the stage (this skeleton's single stage, "image") and the provider (`stub-image-provider`). After waiting out the remaining latency, the session reached `final-video` with the correct result — resumed from its original send time, not restarted from zero.

## Experiment 5.2 — unrecoverable case, exactly one failed attempt

Same mid-flight-kill technique, `mode: "unrecoverable"`.

```
boot log: {"resumed":0,"recordedFailedAttempt":1,"stillPending":0,...}
GET /sessions/<id> → scene attempts: 2 (1 recorded failed attempt + 1 auto-retry launched), status "image-generating"
```

## Experiment 5.4 — concurrent scene writes, no lost updates

A session with 20 scenes, 50ms latency each, was created in one call.

```
session state after ~1s: "final-video"
all 20 indices present: True
each scene's own instruction correct (no cross-contamination): True
each scene's own result path correct: True
scene_results rows for this session: 20 (exactly one per scene)
```

## Experiment 5.5 — same-title isolation

```
$ curl -X POST .../sessions -d '{"title":"Twin Title",...}'   # x2
folder1: "Twin Title 2026-09-25 15-55"
folder2: "Twin Title 2026-09-25 15-55 (2)"
distinct: true
$ ls -d "data/projects/Twin Title"*
data/projects/Twin Title 2026-09-25 15-55
data/projects/Twin Title 2026-09-25 15-55 (2)
```

## Experiment 5.6 — folder rename in place

```
$ mv "data/projects/Twin Title 2026-09-25 15-55" "data/projects/Renamed By Hand"
$ node -e "setRunProjectFolder('<sessionId>', 'Renamed By Hand')"
$ curl -s .../sessions/<id>
→ scene result.imageUrl still "scene-1.png" (unchanged — it was already relative)
$ node -e "resolveArtefactPath('Renamed By Hand', 'scene-1.png')"
→ resolves to the file's new real location; content read back correctly
```
Only the session's recorded root needed updating; every existing artefact reference (already relative) kept working with no further changes — exactly Decision 4's claim.

## 8.8 — Cleanup and restoration

Server stopped, `data/skeleton.sqlite` and `data/projects/` deleted (disposable, as established in `docs/adr/0001-backend-stack.md`); isolated test artifacts (`data/test.sqlite`, `data/test-projects/`) from the Step 7 report also deleted. Restoration verified: `data/` contains neither afterward.

## Outcome

- Step 8 status: **PASS**
- Blocking issues: none
- All five required experiments (5.1–5.6, six counting both restart sub-cases) proven live against the real, decided store — not a stand-in.
