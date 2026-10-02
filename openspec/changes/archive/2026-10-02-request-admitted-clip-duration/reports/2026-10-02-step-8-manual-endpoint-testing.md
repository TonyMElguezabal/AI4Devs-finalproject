# Step 8 Report — Manual Endpoint Testing

- Date: 2026-10-02
- Change: request-admitted-clip-duration (JOS-147)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-147-request-admitted-clip-duration`

## Setup (task 8.1)

The real server on a scratch database and scratch projects folder, so the shared default store was never opened by the server:

```
DB_PATH=/tmp/jos147-manual/manual.sqlite PROJECTS_ROOT=/tmp/jos147-manual/projects PORT=3197 node src/server.ts
curl -s -i localhost:3197/health   ->   HTTP/1.1 200 OK   {"ok":true}
```

The scratch database was created at migration 10 by the server itself (migrations 2-10 applied, including this change's own).

## Real narration and ordinary durations (task 8.2)

Reused the real ElevenLabs narration of `english-exclamation-paragraph` recorded for JOS-142 (same narration JOS-143's own step 10 manual test used), via two throwaway helper scripts kept out of the repo and deleted after use:

1. `POST /sessions` with the script reconstructed from the native timestamps' characters → `201`, session `01M3WZSBXMA2M1WJ12EEV90P99`.
2. A helper script stored the MP3 and native timestamps directly (`insertVoiceOver`, `insertNarrationTimestamps`, `writeArtefact`) and ran `runDecompositionPhase` with a stub instruction generator — no route triggers decomposition, by design. Printed `{"ok":true,"sceneIds":[...4 ids...]}`.
3. `curl -s localhost:3197/sessions/01M3WZSBXMA2M1WJ12EEV90P99` returned 4 scenes. Intervals matched JOS-143's own recorded report for this same narration exactly:

| Scene | `narrationInterval` (s) | Duration | §7.2 rule | `requestedDurationSeconds` | `durationWarning` |
|---|---|---|---|---|---|
| 1 | 0 → 12.005 | 12.005 | ratio to 12 = 1.00042, to 13 = 1.0829 → 12 | 12 | absent |
| 2 | 12.005 → 25.518 | 13.513 | ratio to 13 = 1.0395, to 14 = 1.0360 → 14 | 14 | absent |
| 3 | 25.518 → 33.402 | 7.884 | ratio to 7 = 1.1263, to 8 = 1.0147 → 8 | 8 | absent |
| 4 | 33.402 → 46.254 | 12.852 | ratio to 12 = 1.071, to 13 = 1.0115 → 13 | 13 | absent |

Every value matches a hand-computed smallest-speed-change selection; none is the fewest-seconds answer by coincidence alone (scene 2's 14 s happens to also be fewest-seconds, scenes 1/3/4 would be fewest-seconds too in this narration, which is expected since 12.005/7.884/12.852 are all much closer to one side — the trap case (closest-by-ratio but not fewest-seconds) is covered by the unit tests, e.g. 5.49 s → 6 s, not re-derivable from this one real narration).

## Over-maximum case (task 8.3)

A second session, script `"Ordinary first chunk. A sentence narrated far too long to fit any admitted clip duration without splitting it."`, registered directly (a second throwaway helper script) with a crafted 17.4 s-equivalent interval (6 s → 23.4 s, 17.4 s narrated, flagged `unsplittable-sentence`), through the real `registerDecomposition`:

```json
{"ok":true,"sceneIds":["35c18870-...","f6ffd65e-..."]}
```

`curl -s localhost:3197/sessions/01M3WZSTP1JC965TT5NMYHH5YN`:

- Scene 1 (ordinary, 6 s): `requestedDurationSeconds: 6`, no `durationWarning`.
- Scene 2 (17.4 s, unsplittable): `requestedDurationSeconds: 15`, `durationWarning: "exceeds-maximum"`, `state: "submitted"`.
- Session `state: "chunks-processing"` — not failed.

## Trying to change the values (task 8.4)

Against session B, every scene-writing route was sent extra `requestedDurationSeconds`/`durationWarning` fields in its body:

| Request | Response |
|---|---|
| `POST .../scenes/:sceneId/retry` | `409` `cannot retry a scene in status 'submitted'` |
| `POST .../scenes/:sceneId/correct` (with `instruction`) | `409` `correction is only offered on a failed stage, not 'submitted'` |
| `POST .../pause` | `200` `{"ok":true}` |
| `POST .../continue` | `200` `{"ok":true}` |

Re-reading the session afterwards: scene 1 still `6`/no warning, scene 2 still `15`/`exceeds-maximum`. The two 409s come from the scene's status, not the extra fields; neither field is in any request schema and no handler reads them.

Direct `UPDATE` on the scratch database (through `node:sqlite`, which shares the file with the server):

```
UPDATE scenes SET requested_duration_seconds = 10 WHERE id='f6ffd65e-...';
  -> locked: scenes.requested_duration_seconds cannot be modified once the chunk is established
UPDATE scenes SET duration_warning = NULL WHERE id='f6ffd65e-...';
  -> locked: scenes.duration_warning cannot be modified once the chunk is established
```

Row read back unchanged: `{requested_duration_seconds: 15, duration_warning: 'exceeds-maximum'}`.

## OpenAPI (task 8.5)

`curl -s localhost:3197/docs/json` and a walk of the whole document:

- `requestedDurationSeconds`: 2 occurrences — `POST /sessions` 201 response and `GET /sessions/{sessionId}` 200 response, both under `scenes.items.properties`. Type `number`, described citing PRD §7.2, read-only/immutable, absent for a skeleton scene.
- `durationWarning`: 2 occurrences, same two locations. Type `string`, `enum: ["exceeds-maximum"]`, described citing PRD §6.1.1, "Not a failure", read-only/immutable.
- 0 occurrences under any `requestBody`.

## Cleanup (task 8.6)

The scratch store was reset with the test-only `resetAll()`:

| | Rows before reset | Rows after reset |
|---|---|---|
| runs | 2 | 0 |
| scenes | 6 | 0 |
| narration_timestamps / voice_overs | 1 / 1 | 0 / 0 |
| provider_requests / scene_results | 2 / 2 | 0 / 0 |
| stage_attempts | 0 | 0 |
| `schema_migrations` | 9 (2-10) | 9 (2-10) |
| triggers | 15 | 15 |

(`provider_requests`/`scene_results` at 2 each before reset: the image stage auto-launches on registration — JOS-145 — and the stub provider completed 2 of the 6 chunks by the time this check ran; unrelated to this change.) The scratch projects folder is empty after the reset.

The server was stopped (port 3197 freed, `curl` then connection-refused). Default store (`data/skeleton.sqlite`), inspected read-only after the run: every table at 0 rows, 15 triggers, migrations 2-10, `data/projects` empty — identical to the step 7 baseline. `git status` shows no tracked file modified; the two throwaway helper scripts were deleted (never committed).

## Result

PASS. The requested duration matches the §7.2 smallest-speed-change rule against a real narration's intervals exactly as predicted by hand, the over-maximum case produces `requestedDurationSeconds: 15` / `durationWarning: "exceeds-maximum"` without failing the chunk or session, both fields are read-only in the API and documented on responses only, and the database refuses both direct updates with the `locked:` message.
