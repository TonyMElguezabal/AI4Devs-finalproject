# app-version-display Specification

## Purpose
TBD - created by archiving change show-app-version. Update Purpose after archive.
## Requirements
### Requirement: The backend reports the running build's version and channel
The backend SHALL expose `GET /app/version`, returning `200 { "version": string, "channel": "development" | "uat" | "production" }` read from the build identity. The response SHALL contain no other field (not the release tag, the repository, the telemetry endpoint or any path). The endpoint SHALL need no authentication beyond the existing loopback, `Origin` and `Host` guard, SHALL make no network call and SHALL NOT fail.

#### Scenario: Release build
- **WHEN** the build was made with version `2026.10.28-3d00e7b` and channel `production`
- **THEN** `GET /app/version` returns `{ "version": "2026.10.28-3d00e7b", "channel": "production" }`

#### Scenario: Build run from source
- **WHEN** no version was set at build time
- **THEN** `GET /app/version` returns `{ "version": "0.0.0-dev", "channel": "development" }`

### Requirement: Every screen shows the version in the top bar
The top bar of every screen (start form, session page and `/admin`) SHALL show the version at its right end, in small muted text that can be selected: `v<version>` for the `production` and `uat` channels (a `uat` build adds ` · uat`), and `Development build` for the `development` channel. The label SHALL carry the accessible name `Vid4You version <version>`. The top bar is sticky, so the label SHALL stay visible while the page scrolls.

#### Scenario: Release build on each screen
- **WHEN** the backend reports version `2026.10.28-3d00e7b` on channel `production` and the start form, a session page or `/admin` is open
- **THEN** the top bar shows `v2026.10.28-3d00e7b`

#### Scenario: Development build
- **WHEN** the backend reports channel `development`
- **THEN** the top bar shows `Development build`

#### Scenario: Long page
- **WHEN** the user scrolls down a long session page
- **THEN** the version label stays visible in the top bar

#### Scenario: Narrow window
- **WHEN** the window is about 400 px wide
- **THEN** the label does not push the other top-bar controls off screen, and it stays fully readable (it moves to its own line under the controls, right-aligned, instead of shrinking)

### Requirement: The version is read from the backend once per page load
The frontend SHALL request `GET /app/version` once per page load, SHALL keep no copy of the version of its own (no build-time constant), and SHALL show no label, and no error, when the request fails.

#### Scenario: Request fails
- **WHEN** `GET /app/version` fails
- **THEN** the top bar renders without the label and nothing else on the page changes

#### Scenario: Moving between screens
- **WHEN** the user moves from the start form to a session page without reloading
- **THEN** no second request to `GET /app/version` is sent

