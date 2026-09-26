# Step 8 Report — curl vs. Rendered UI Shape Comparison

- Date: 2026-09-25
- Change: define-frontend-stack (JOS-180)
- Agent: Claude (Sonnet 5)
- Server: `openspec/changes/define-backend-stack/skeleton`, `node src/server.ts`

## 8.1 — Reachability

```
$ curl -s http://127.0.0.1:3100/health
{"ok":true}
```

## 8.2 — Every endpoint the prototype consumes, with its exact response shape

`POST /sessions` (create):
```json
{"session":{"type":"session","sessionId":"b89e19dd-...","title":"Curl vs UI","language":"en",
  "state":"chunks-processing","paused":false,"updatedAt":"..."},
 "scenes":[{"type":"scene","sessionId":"b89e19dd-...","sceneId":"33eb07f8-...","index":1,
  "state":"image-generating","provider":"stub-image-provider","attempts":1,"instruction":"x","updatedAt":"..."}, ...]}
```

`GET /sessions/:id` (read, same shape as the SSE payload):
```json
{"session":{...,"state":"failed","failedPhase":"image",...},
 "scenes":[{"index":1,"state":"failed","affectedStage":"image","errorCause":"stub: content-filter rejection",...},
           {"index":2,"state":"chunk-complete","result":{"imageUrl":"scene-2.png"},...}]}
```

`POST /sessions/:id/{pause,continue}`, `POST /sessions/:id/scenes/:sceneId/{retry,correct}` — already exercised extensively in `openspec/changes/define-persistence/reports/2026-09-25-step-8-curl-endpoint-testing.md` and `openspec/changes/define-live-updates/reports/2026-09-25-step-10-curl-endpoint-testing.md`; not repeated here.

## 8.3 — Field-by-field: what the backend returns vs. what the UI actually reads

Enumerated directly from the prototype's source (`grep` for `scene.`/`session.`/`snapshot.` across `src/components/*.tsx` and `src/App.tsx`):

| Backend field | Read by the UI? | Where |
|---|---|---|
| `session.state` | Yes | `SessionHeader`, `FinalVideoDownload` |
| `session.paused` | Yes | `SessionHeader` |
| `session.failedPhase` | Yes | `SessionHeader` |
| `session.sessionId` | Yes | `App.tsx` (routing, after creating a session) |
| `scene.index` | Yes | `SceneList` (sort), `SceneRow` (display) |
| `scene.state` | Yes | `SceneRow` |
| `scene.errorCause` | Yes | `SceneRow` |
| `scene.provider` | Yes | `SceneRow` |
| `scene.attempts` | Yes | `SceneRow` |
| `scene.instruction` | Yes | `SceneRow` |
| `scene.sceneId` | Yes | `SceneList` (key), `SceneRow` (actions) |
| `session.title`, `session.language`, `session.updatedAt` | **No** | not rendered anywhere yet |
| `scene.result`, `scene.affectedStage`, `scene.updatedAt` | **No** | not rendered anywhere yet |

**Confirmed: the UI invents no field the backend does not return** — every field the components read exists verbatim in the backend response, with matching types (checked directly against `src/types.ts`, which mirrors `skeleton/src/types.ts` field for field).

**Honest gap found, not a bug:** `scene.result` (the artefact path) is returned by the backend but never read by the frontend — the per-scene download links are built from `sessionId`/`sceneId` alone (`downloadSceneUrl`), not from the path the backend already computed. Functionally harmless (the download endpoint re-validates scene state server-side regardless of what the client sends), but it means the artefact path itself is dead data as far as this prototype's UI is concerned. Worth using directly (e.g., for a thumbnail) if this becomes real. `session.title`/`language` are collected at creation but never displayed back to the user on the session page itself — a minor, easily-fixed prototype gap, not a contract problem.

## 8.4 — A state change reaches the open page without a reload

Already proven extensively and instrumented (not re-demonstrated by eye) in `openspec/changes/define-live-updates/reports/2026-09-25-step-7-live-experiments.md` and `2026-09-25-step-11-e2e-playwright.md`, using this exact prototype.

## 8.5 — Cleanup

Server stopped, `data/skeleton.sqlite` and `data/projects/` deleted, restoration verified.

## Outcome

- Step 8 status: **PASS**
- Blocking issues: none (one minor, non-blocking gap noted above)
