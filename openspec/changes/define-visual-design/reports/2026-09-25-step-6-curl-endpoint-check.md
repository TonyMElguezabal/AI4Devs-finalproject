# Step 6 Report - Manual Endpoint Check (curl)

- Date: 2026-09-25
- Change: define-visual-design
- Agent: Claude Sonnet 5

## Scope

This change adds no backend endpoints — it is a CSS/styling-only change consuming the same wire contract `define-frontend-stack` already verified against the backend harness. This step confirms that premise still holds after the restyle: the shapes the UI reads did not shift.

## Commands Executed

```
cd openspec/changes/define-backend-stack/skeleton
npm start &

curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3100/sessions/nonexistent
# -> 400 (invalid uuid) — server reachable

curl -s -X POST http://127.0.0.1:3100/sessions -H "Content-Type: application/json" \
  -d '{"title":"Visual design check","language":"en","scenes":[{"mode":"success","latencyMs":200,"instruction":"A wide shot of a harbor at dusk."}]}'

curl -s http://127.0.0.1:3100/sessions/113a8137-94e9-440f-85d3-aef262610702
```

## Responses

`POST /sessions`:
```json
{"session":{"type":"session","sessionId":"113a8137-94e9-440f-85d3-aef262610702","title":"Visual design check","language":"en","state":"chunks-processing","paused":false,"updatedAt":"2026-09-26T01:28:38.392Z"},"scenes":[{"type":"scene","sessionId":"113a8137-94e9-440f-85d3-aef262610702","sceneId":"21ad3105-f2f6-4b6f-bf18-cc5ea0c0ba05","index":1,"state":"image-generating","provider":"stub-image-provider","attempts":1,"instruction":"A wide shot of a harbor at dusk.","updatedAt":"2026-09-26T01:28:38.392Z"}]}
```

`GET /sessions/:id` (a moment later, stub provider had progressed it):
```json
{"session":{"type":"session","sessionId":"113a8137-94e9-440f-85d3-aef262610702","title":"Visual design check","language":"en","state":"final-video","paused":false,"updatedAt":"2026-09-26T01:28:42.910Z"},"scenes":[{"type":"scene","sessionId":"113a8137-94e9-440f-85d3-aef262610702","sceneId":"21ad3105-f2f6-4b6f-bf18-cc5ea0c0ba05","index":1,"state":"chunk-complete","provider":"stub-image-provider","attempts":1,"result":{"imageUrl":"scene-1.png"},"instruction":"A wide shot of a harbor at dusk.","updatedAt":"2026-09-26T01:28:38.596Z"}]}
```

## Comparison against what the UI renders

Field-by-field match against `src/types.ts`'s `SessionEventPayload`/`SceneEventPayload`/`SessionSnapshot` — identical to what `define-frontend-stack` already verified in its own step-8 report; this change did not add, remove, or rename any field the UI reads. `sceneStatusClass`/`sessionStatusClass` (added by this change) key off `state`, a field already present and unchanged.

## Cleanup

- Backend process stopped (`pkill -f "node src/server.ts"`)
- `data/` directory (created by the harness: `projects/`, `skeleton.sqlite*`) deleted
- Verified absent with `ls data` after deletion

## Outcome

- Step 6 status: PASS
- Blocking issues: none
