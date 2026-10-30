## Why

The running build has a version (`YYYY.MM.DD-<tree hash>`, set by `release.yml` and exposed as `BUILD.version`) but nobody can see it: only telemetry reads it. A user or the product owner reporting a problem cannot say which build they are on, nor whether it is the latest release (JOS-238).

## What Changes

- New `GET /app/version` returning `{ version, channel }` from the build identity, with no network call and no authentication (same guard as `/app/update`).
- The top bar shows the version on every screen (start form, session page, `/admin`): `v2026.10.28-3d00e7b` on a release build, `Development build` on a build run from source. The bar is sticky, so the label stays visible while the page scrolls.
- The frontend asks the backend once per page load and stores nothing itself. If the request fails, the label is simply absent.
- The version format is not changed: it already maps to the asset names and the `release-<tree hash>` tag of one GitHub release (ADR 0007). Nothing changes in `release.yml` or `release.sh`.

## Capabilities

### New Capabilities
- `app-version-display`: the endpoint that reports the running build's version and channel, and the label that shows it in the top bar of every screen.

### Modified Capabilities
<!-- None: `update-notice` keeps its requirements; the version label is independent of the update banner. -->

## Impact

- Backend: `backend/src/routes.ts` (route and response schema); `backend/src/config/build.ts` is only read.
- Frontend: `frontend/src/api/client.ts`, `frontend/src/types.ts`, `frontend/src/components/TopBar.tsx`, `frontend/src/App.tsx`, `frontend/src/styles/app.css`.
- Docs: `docs/api-spec.yml`, `readme.md` (release section, Spanish).
- No new dependency, no data model change, no change to packaging or CI.
