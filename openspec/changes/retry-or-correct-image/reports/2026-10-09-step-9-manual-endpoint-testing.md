# Step 9 Report - Manual Endpoint Testing with curl

- Date: 2026-10-09
- Change: retry-or-correct-image (JOS-157)
- Agent: Claude Sonnet 5

## Environment

```
DB_PATH=/tmp/jos157-manual/db/skeleton.sqlite
PROJECTS_ROOT=/tmp/jos157-manual/projects
ALLOW_TEST_ENDPOINTS=1
USE_STUB_VOICE_PROVIDER=hang
PORT=3188
```

No `backend/.secrets.json` and no `FAL_API_KEY` in this environment. `GET /health` → `{"ok":true}`.

**No HTTP-level stub exists for the image provider** (unlike voice and video, which take `USE_STUB_VOICE_PROVIDER`/`USE_STUB_VIDEO_PROVIDER`) — a real server always calls the real Fal.ai adapter for the image stage. This is the same limitation `see-provider-and-attempts` (JOS-166)'s step-10 report records. With no `FAL_API_KEY` present, `loadCredential` fails **not-retryably** before any network call, which gave a free, repeatable way to drive a real `failed` image scene without a real request or any cost: a scene inserted directly into the store (`insertRegisteredScenes`, the same function `registerDecomposition` calls, run via a one-off `node --experimental-strip-types -e '...'` script against the same `DB_PATH` the server uses — the scratch-store technique JOS-166's reports also use) and then launched with `launchImageStage` fails with `"missing credential 'FAL_API_KEY': ..."`, going through the **real** image-stage code path, not a stub.

## 9.2 — Retry

```
POST /sessions/:id/scenes/:sceneId/retry → {"ok": true}
```

`GET /sessions/:id` afterward shows the scene back at `failed` with the same credential-missing cause — confirming the retry went through the real adapter again (a stub path would have behaved differently), not that it succeeded (it cannot, with no credential). AC1 (same instruction) and AC4 (same bound provider) are proven at the unit level instead (step 8 report: `image-stage.test.ts`'s two new byte-for-byte / binding-stays tests, run against the stub registry, which curl cannot reach).

## 9.3 — Correction

```
POST /sessions/:id/scenes/:sceneId/correct -d '{"instruction":"  a corrected lighthouse scene, warmer light  "}' → {"ok": true}
```

`GET` afterward:

```json
"prompt": "A lighthouse beams across the bay.",          // unchanged
"imageInstruction": "a corrected lighthouse scene, warmer light",  // trimmed, set
"videoInstruction": "Slow pan across the water"           // unchanged
```

## 9.4 — Error cases

| Request | Result |
|---|---|
| Retry on an unknown session | 404 |
| Correct with `{"instruction":"   "}` | 400 (`body/instruction String must contain at least 1 character(s)`) |
| Retry on the scene through a second, unrelated session's URL | 404 |
| Retry on a scene marked `image-complete` (via `markImageComplete`) | 409 `{"reason":"not-failed"}` |
| Retry on a scene marked `failed` with a stored image (clip failure, via `markSceneFailed` after `markImageComplete`) | 409 `{"reason":"image-already-generated"}` |
| Correct on the same clip-failed scene | 409 `{"reason":"image-already-generated"}` |

`GET /docs/json`: both routes document `200`, `404` and `409` responses, and the correction body schema requires `instruction` with `minLength: 1`. The generated schema also shows `additionalProperties: false` — this is a pre-existing artifact of this project's zod-to-OpenAPI doc generation (confirmed the same on `POST /sessions`'s schema, which was never made `.strict()`), not a runtime behavior: the actual Zod validator this route uses is not `.strict()` (design.md Decision 5), and the earlier curl-equivalent unit test (`scene-api-surface.test.ts` > "ignores an extra field…") and this session's own component test both confirm an extra field is silently dropped, not rejected.

## Cleanup

```
pkill -f "node src/server.ts"
rm -rf /tmp/jos157-manual
stat -f "%Sm" /Users/josemunoz/Software/Vid4You/AI4Devs-finalproject/backend/data/skeleton.sqlite
# Oct 4 22:39:07 2026 — unchanged
```

## Outcome

- Step 9 status: PASS
- Blocking issues: none
