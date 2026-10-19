## ADDED Requirements

### Requirement: Launch-time check for a newer build on the app's channel
On start-up, the backend SHALL ask the public GitHub Releases API for the newest build of its own channel:
- for `uat`, the newest pre-release;
- for `production`, the latest release.

The backend SHALL expose the result through `GET /app/update`, which returns `{ "available": false }` or `{ "available": true, "tag": "<release tag>", "url": "<release page URL>" }`. A build is newer when its release tag differs from the running build's tag. The check SHALL run at most once per launch and SHALL time out after 5 seconds. A failed check SHALL report `available: false` and be logged locally. It SHALL NOT be shown as an error.

#### Scenario: Newer release exists
- **WHEN** the app runs on the `production` channel with tag `t1` and the latest release has tag `t2`
- **THEN** `GET /app/update` returns `available: true` with tag `t2` and its release page URL

#### Scenario: Already up to date
- **WHEN** the newest release on the channel has the running build's tag
- **THEN** `GET /app/update` returns `available: false`

#### Scenario: Offline
- **WHEN** the GitHub API cannot be reached within 5 seconds
- **THEN** `GET /app/update` returns `available: false` and the app works normally

#### Scenario: Development build
- **WHEN** the channel is `development`
- **THEN** no request is sent to GitHub and `GET /app/update` returns `available: false`

### Requirement: Update banner on the page
When an update is available, the page SHALL show a dismissible banner reading "A new version of Vid4You is available" with a link to the release page. The update SHALL NOT be downloaded or installed automatically.

#### Scenario: Banner shown and dismissed
- **WHEN** the page loads and `GET /app/update` returns `available: true`
- **THEN** the banner with the release link is shown, and dismissing it hides it until the next launch
