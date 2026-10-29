## Context

`readBuildConfig` (`backend/src/config/build.ts`) already gives `BUILD.version` and `BUILD.channel`; `release.yml` sets them (`YYYY.MM.DD-<7 chars of the tree hash>`, ADR 0007), and a build from source reports `0.0.0-dev` / `development`. Only telemetry reads them. The three screens all render `TopBar`; `RegularApp` renders it in two different branches (start form and session page), so it unmounts and remounts when the user moves between them. `/app/update` is the model for a small build-identity route.

## Goals / Non-Goals

**Goals:** the version visible on every screen, from one source (the backend), with the existing format.
**Non-Goals:** a new version scheme or semver, an About dialog or changelog, the commit SHA in development builds, linking the label to the release page, any change to `release.yml` or `release.sh`.

## Decisions

### Decision 1: The version is loaded once in `App` and passed to `TopBar` as a prop

`App` (which never remounts) calls `getAppVersion()` in an effect and passes the result to the `/admin` `TopBar` and to `RegularApp`, which passes it to both its `TopBar`s. A request per `TopBar` mount would be sent again on every move between the start form and a session.

*Alternatives:* a promise cached at module level in `client.ts` (once per page load too, but state shared across tests); a React context (more code for one string).

### Decision 2: The label text is computed in `TopBar`

`channel === "development"` gives `Development build`; otherwise `v<version>`, plus ` · uat` for the `uat` channel so a pre-release is told apart in a bug report (the ticket names production and development only; this is the only addition). The element is a `<span className="app-version" title aria-label="Vid4You version <version>">`; it is plain text, so it can be selected and copied.

### Decision 3: The route returns only `version` and `channel`

`GET /app/version` is a synchronous read of `BUILD` with a Zod response schema `{ version: string, channel: enum }`; the schema also strips any other field, so the release tag and endpoints cannot leak by a later edit to the handler. It lives next to `/app/update` and needs no auth, like it.

### Decision 4: Layout

`.app-version` is small muted text (the muted-text token already used by the design system), pushed to the right end with `margin-left: auto`; the other controls keep their order. At about 400 px the bar already wraps; the label gets `white-space: nowrap` only if the bar can wrap around it, otherwise it may truncate with an ellipsis, with the full text kept in `title`. The exact rule is settled with the Playwright check at 400 px.

## Risks / Trade-offs

- [`uat` label is not in the ticket] → one extra suffix; easy to drop if the product owner prefers the bare version.
- [A failed request shows nothing] → matches the ticket; a missing label is itself a signal when reporting a problem.
- [The date in the version is the build date, not the commit date] → unchanged; documented in the README so users quote the string as is.

## Open Questions

- Development builds show no commit (ticket open question 1: no, YAGNI) and the label does not link to its release (open question 2: no). Both stay as proposed in the ticket.
