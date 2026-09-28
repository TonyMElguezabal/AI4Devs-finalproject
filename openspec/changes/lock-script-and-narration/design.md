# Design — Lock the script at project start and the narration once complete (JOS-137)

## Context

§4.2 and D10 make two things immutable: the script, from `submitted` onward (including while paused and after a voice failure), and the narration, once the voice-over has been generated successfully. §10.3 is the counterpart: a voice attempt that failed before producing valid audio can be retried, and that retry is not a regeneration.

What exists today:

- **Script, title, language** — `start-video-project` (JOS-134) Decision 2 says the lock is "enforced where the data lives". In the code it is a convention: `db.ts` has no statement that updates these columns, and no route offers it, but the SQLite store would accept `UPDATE runs SET script = …` from any future caller.
- **Narration** — `generate-voice-over` (JOS-136) migration 4 created `voice_overs`, keyed on `run_id`, so a second insert is refused. Nothing refuses an `UPDATE` or `DELETE` of the existing row, and the MP3 file on disk can be overwritten by any write to the same path.
- **Launch** — `generate-voice-over`'s phase (its group 5) is not built yet. Its task 5.12 already says "requesting generation for a session in `voice-over-complete` sends nothing"; this story supplies the check it must use.

The retry stories (JOS-154, JOS-155) are next to touch failed sessions. `define-persistence` Decision 3 already set the house rule this design follows: invariants that matter are enforced by the store, not by a prior read in application code.

## Goals / Non-Goals

**Goals:**
- Make the script, title and language unchangeable by the store itself (AC1).
- Make a completed voice-over record and its MP3 unreplaceable (AC2).
- Give every caller one answer to "may voice generation launch for this session?", which is yes after a failed attempt and no once a voice-over exists (AC2, AC3).
- Prove no API route modifies the locked content or regenerates the narration.

**Non-Goals:**
- The manual retry endpoint (JOS-155) and the automatic retry loop (JOS-154). They call the guard; they are not built here.
- Deleting sessions. The MVP has no such feature (§12.2: sessions never expire), so the store refusing to delete a voice-over costs nothing in product behaviour.
- Any frontend change.

## Decisions

**Decision 1 — The script, title and language are locked by SQLite triggers.**
One `BEFORE UPDATE OF <column> ON runs` trigger per column (`title`, `script`, `language`) aborts with `RAISE(ABORT, 'locked: runs.<column> …')`, so the message names the field that was touched (SQLite cannot build a message dynamically inside a single trigger). `UPDATE OF` fires only when that column appears in the `SET` list, so the existing updates of `paused`, `project_folder`, `voice_provider_id` and `failure` are unaffected. It aborts unconditionally, even when the new value equals the old one: nothing legitimately writes these columns after the `INSERT`, so a write at all is a bug worth failing loudly.
*Alternatives rejected:*
- A check in each repository function: that is today's convention, and it is exactly what a new caller forgets.
- Moving the three fields into a separate insert-only table: the same guarantee, with a join on every read and a data migration for existing sessions.

**Decision 2 — A completed voice-over is locked by triggers, and the test-only reset works around them in the open.**
`BEFORE UPDATE ON voice_overs` and `BEFORE DELETE ON voice_overs` both abort. Together with the existing primary key (no second insert), the record cannot change once written.
`resetAll()` is test-only and already documented to run only against an isolated `DB_PATH`. It needs to empty `voice_overs`. Inside one transaction it drops the delete trigger, deletes all rows, and recreates the trigger from the **same DDL constant** the migration uses, so the two cannot drift.
*Alternatives rejected:*
- No delete trigger: then "never replaced" rests on nobody writing `DELETE` followed by `INSERT`, the same convention Decision 1 removes.
- A fresh database file per test: a large change to how the whole suite and `db.ts`'s module-level connection work, for a test-only concern.
- A session-level "unlocked for tests" flag in the schema: a production code path whose only purpose is to bypass the rule.

**Decision 3 — The MP3 file is written once, with a link that fails if the target exists.**
The voice-over file goes to a temporary name and is then hard-linked (`fs.linkSync`) to its final name, which fails with `EEXIST` if a file is already there, and the temporary name is removed. Linking is atomic and does not overwrite, unlike `rename`, which replaces an existing target silently on POSIX. A `writeArtefactOnce` helper in `db.ts` provides this, keeping the existing project-folder scoping check (`assertWithinProjectFolder`).
*Alternative rejected:* checking `existsSync` before `rename`, which is a read-then-write race, the pattern `define-persistence` Decision 3 rejects.

**Decision 4 — One guard decides whether voice generation may launch, and it reads the voice-over record, not the session state.**
`canLaunchVoiceOver(runId)` returns `{ allowed: true }` when the session has no voice-over record, and `{ allowed: false, reason: "narration-complete" }` when it has one. A failed attempt, including one whose audio came back undecodable (JOS-136 Decision 7), never creates the record, so the session stays launchable (AC3).
*Alternative rejected:* deciding from the derived session state (`failed` means retry allowed). The state is derived and has more inputs; the record is the fact that matters. A session could be `failed` for a later phase while its voice-over exists, and a state-based guard would then allow regenerating it.

**Decision 5 — The API surface is proven by tests, not by new code.**
There is no route to add. Tests assert, against the built Fastify app, that no `PUT`/`PATCH`/`DELETE` route exists on a session or its voice-over, and that the one body-taking scene route (`/correct`) ignores a `script` field and leaves the script unchanged.

## Risks / Trade-offs

- **A future story needs to delete sessions** → It would have to drop the voice-over delete trigger deliberately in its own migration, which is the point: removing the rule becomes a visible decision, not an accident.
- **A trigger error reaches a caller as a raw SQLite error** → No legitimate path writes these columns, so the only callers that can hit it are bugs. The message names the locked field, and the tests assert it.
- **`resetAll()` weakens the rule while it runs** → Only inside one transaction, only in the test-only helper, and recreated from the same constant. A test asserts the trigger is present again after a reset.
- **Stacked on an unmerged branch** → This change depends on JOS-136's migration 4. It branches from `feature/jos-136-generate-voice-over` and merges into `feature/entrega-2-JAME` after it.

## Migration Plan

- One migration (version 5) creates the five triggers (three on `runs`, two on `voice_overs`). It changes no data, so existing sessions keep their content and simply become protected.
- Rollback: a migration that drops the triggers. No data changes either way.

## Open Questions

None blocking.
