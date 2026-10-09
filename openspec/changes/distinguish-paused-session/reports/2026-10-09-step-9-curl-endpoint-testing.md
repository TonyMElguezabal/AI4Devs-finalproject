# Step 9 Report - Manual Endpoint Testing with curl

- Date: 2026-10-09
- Change: distinguish-paused-session (JOS-153)
- Agent: Claude Sonnet 5

## Environment

Isolated scratch store, never the default `backend/data/`:

```
DB_PATH=/tmp/jos153-manual/db/skeleton.sqlite
PROJECTS_ROOT=/tmp/jos153-manual/projects
ALLOW_TEST_ENDPOINTS=1
USE_STUB_VOICE_PROVIDER=hang
USE_STUB_VIDEO_PROVIDER=pending   (then success-bytes after the restart in 9.4)
PORT=3177
```

`GET /health` → `{"ok":true}`.

## 9.2 — `running` on a fresh session

`POST /sessions` with `{title, script, language}` → 201 body's `session.running` is `[]` (nothing sent yet). A `GET` ~0.3s later, once the automatic voice-over launch (`generate-voice-over`, JOS-136) had sent its request, shows:

```json
"state": "voice-over-generating", "held": [], "running": [{ "stage": "voice-over", "count": 1 }]
```

Matches spec "A session-level phase in flight".

## 9.3 — running and held beside each other, disjoint

1. `POST /internal/test/quick-scene` (scene 0, duration 5s) → `image-complete` → `launchVideoStage` sends under `pending` mode → `video-generating`.
2. `POST /sessions/:id/pause`.
3. `POST /internal/test/quick-scene` (scene 1, duration 6s) → `image-complete`; `launchVideoStage` is called but `admitLaunch` refuses (session paused) → scene stays `image-complete`, `held: true`.
4. `GET /sessions/:id`:

```json
"paused": true,
"held": [{ "stage": "video", "count": 1 }],
"running": [{ "stage": "voice-over", "count": 1 }, { "stage": "video", "count": 1 }],
"scenes": [
  { "index": 0, "state": "video-generating" },                 // not held
  { "index": 1, "state": "image-complete", "held": true }       // held, not running
]
```

Matches spec "Running and held beside each other" exactly: the two sets are disjoint across the two scenes.

Side observation, not a JOS-153 defect: `phases[].status` for `voice-over` and `decomposition` read `complete` at this point even though no `VoiceOver` or decomposition attempt was ever recorded — `quick-scene` is a test-only shortcut that inserts scenes directly and these two phases' derivation (`view-progress-by-phase`, JOS-168) infers completeness from scene existence. `running`/`held` are unaffected because `sessionRunningWork`/`sessionHeldWork` read scene status and `stage_attempts` directly (design Decision 2), never the phase derivation — this is exactly the robustness Decision 2 argues for.

## 9.4 — continue, then the stub completing empties running

`POST /sessions/:id/continue` → `GET`:

```json
"paused": false, "held": [], "running": [{ "stage": "video", "count": 2 }]
```

(`voice-over` had already dropped out of `running` on its own — both automatic attempts hit the 10s JOS-185 timeout under `hang` mode before this step, confirmed in the server log's `voice-over.attempt.timed-out` events; `running` correctly reflects only attempts actually `in-flight`.)

To show `running` emptying once the stub completes: restarted the process with `USE_STUB_VIDEO_PROVIDER=success-bytes`. Its boot-recovery pass (`restart-safe-concurrency`, JOS-186) re-polled the two still-pending requests against the new mode and resolved them before the process exited on a port conflict with a stray old instance (job control did not carry the `kill` across separate tool invocations; `pkill -f` cleared it for good afterward). The DB write happened regardless of the port conflict, since boot recovery runs before `app.listen()`. A clean restart's `GET` then showed:

```json
"state": "final-video-generating", "running": [], "scenes": [{"state":"chunk-complete"}, {"state":"chunk-complete"}]
```

`running` emptied for the video stage once both clips completed, matching spec "Running is reported when not paused" and the general "waiting/running reaches an open page" intent (here via restart rather than a live SSE event, which the frontend hook test already covers — step 8 report, `useLiveSession.test.tsx`).

## 9.5 — error cases

- `GET /sessions/00000000000000000000000000` (well-formed but unknown) → `404`.
- `GET /sessions/not-a-valid-id!!` (malformed) → `404`.

Both unchanged from before this change (no route or validation touched).

## 9.6 — Cleanup

```
pkill -f "node src/server.ts"
rm -rf /tmp/jos153-manual
stat -f "%Sm" /Users/josemunoz/Software/Vid4You/AI4Devs-finalproject/backend/data/skeleton.sqlite
# Oct 4 22:39:07 2026 — unchanged throughout
```

The default store (main checkout) was never touched; this worktree's own `backend/data/` (gitignored, untracked) was not used for this manual test since `DB_PATH`/`PROJECTS_ROOT` pointed at the scratch directory throughout.

## Outcome

- Step 9 status: PASS
- Blocking issues: none
