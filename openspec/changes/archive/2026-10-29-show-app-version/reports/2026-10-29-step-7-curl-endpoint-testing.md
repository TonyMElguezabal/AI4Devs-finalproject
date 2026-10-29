# Step 7 Report - Manual Endpoint Testing with curl

- Date: 2026-10-29
- Change: show-app-version (JOS-238)
- Agent: Claude Sonnet 5.5
- Backend started from source with `node src/server.ts`, `PORT=3100`, scratch `DB_PATH` and `PROJECTS_ROOT`.

| Case | Command | Result |
|---|---|---|
| Build from source | `curl -i http://127.0.0.1:3100/app/version` | `200`, `{"version":"0.0.0-dev","channel":"development"}` |
| Release build (`VID4YOU_VERSION=2026.10.28-3d00e7b VID4YOU_CHANNEL=production VID4YOU_RELEASE_TAG=release-secret`) | `curl http://127.0.0.1:3100/app/version` | `{"version":"2026.10.28-3d00e7b","channel":"production"}`; the release tag is not in the answer |
| Foreign page | `curl -H "Origin: https://evil.example" .../app/version` | `403` |
| Foreign host | `curl -H "Host: evil.example" .../app/version` | `403` |

The request log shows a `200` in 5 ms and no outgoing call. The endpoint only reads; no data was created, so the scratch database needed no restoration. Outcome: PASS.
