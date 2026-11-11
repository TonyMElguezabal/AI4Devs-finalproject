# ADR 0009 — Admin-configured video connector (JOS-219)

- Status: Accepted (product-owner decisions, 2026-11-06); the PRD text (v1.32) is awaiting approval
- Date: 2026-11-06
- Change: `configurable-video-connector` (archived `2026-11-06-configurable-video-connector`; full design in its `design.md`)

## Context

Provider profiles (JOS-218, ADR 0005 "provider-selection") let the Administrator add and edit providers, but every video model needed a coded adapter. Adding a video model of another vendor meant a code change and a release. Free-form request definitions were first refused in JOS-218 for two reasons: a typed definition could send an API key to any host, and a guessed error classification could retry what must not be retried.

## Decision

- **One adapter type, `configured-video`, runs a definition kept in the profile's parameters**: `baseUrl`, `model`, `resolution`, admitted durations, and a `requests` object with an optional `upload`, a `submit`, a `poll` and an optional `check` step. Placeholders (`{instruction}`, `{duration}`, `{key}`, `{task_id}`, …) and dotted paths into answers (`results[0].url`) are the whole template language; nothing is evaluated and the connector sends only what the template names.
- **The connector implements the existing `VideoProvider` port**, one HTTP request per call and no retry of its own. HTTP and vendor-error classification use the shared rule; a task the vendor reports as failed stays transient because no not-retryable signal is confirmed.
- **The key is bound to the host.** `baseUrl` is `https://<host>` only, `{key}` may appear only in header values, and saving a profile with another host clears its stored key. Error reasons name the step and HTTP status, never the response body (Runway's 401 body repeats part of the key).
- **One profile is one definition plus one model.** A second model is a duplicated profile ("Duplicate", with `copyKeyFrom` that copies the encrypted key only between connector profiles of the same host).
- **Proven on two vendors**: Runway and RunningHub (and later MiniMax H3), kept in `docs/video-connector-definitions.md`, which are also the test fixtures, so the documentation cannot drift from what passes. The connector passes the shared adapter contract suite (JOS-263).
- **Video quality is capped at 1080p** (owner decision, to keep cost down): the final video accepts only 1280×720 or 1920×1080, RunningHub requests `768P`, and a connector `resolution` naming 2K or 4K is refused (a name check, not a measurement).

## Alternatives considered

- **A separate connector table that profiles point to.** Rejected for now: a migration, a second admin list and delete rules, to avoid copying a definition.
- **One form field per step value.** Rejected: about twenty fields with nested lists; the form gets a JSON field kind instead.
- **A longer coded-adapter list.** Rejected: it keeps every new model behind a release.

## Consequences

- The Administrator can add a video model without a code change; a wrong definition fails at the first request, and the optional `check` step reports key problems for free.
- A vendor whose protocol does not fit upload, submit and poll still needs a coded adapter.
- Treating vendor safety refusals as not retryable is a follow-up.
