# Design — Keep project files locally without overwriting or expiry

## Context

On `feature/entrega-2-JAME` (`5498360`), against each acceptance criterion:

| AC | What exists | Where |
|---|---|---|
| AC1 files kept | full MP3 `voice-over.mp3`, native `voice-over-timestamps.json`, `narration-timestamps.json`, images `scene-N-attempt-K.<ext>`, clips `scene-N.mp4`, `final-video.mp4`, all written into the project folder through `writeArtefactOnce` or the assembly tool's output path | `voiceOverPhase.ts`, `narrationTimestampsPhase.ts`, `orchestrator.ts`, `ffmpegAssemblyTool.ts` |
| AC1 script and generated texts | **only in the store** (`runs.script`; `scenes.prompt`, `image_instruction`, `video_instruction`, narration interval) | `db.ts`, `sceneRegistration.ts` |
| AC2 no deletion | the only `rmSync` calls remove temporary work folders (voice probe, ffmpeg work dir, `writeArtefactOnce`'s temp file) and the test-only `resetAll` | `voiceOverPhase.ts`, `ffmpegAssemblyTool.ts`, `db.ts` |
| AC3 same title | `deriveAndCreateProjectFolder`: `<title> <YYYY-MM-DD HH-mm>`, then ` (2)`, ` (3)`… while the folder exists; every write goes through `assertWithinProjectFolder` | `db.ts` |
| AC4 no expiry | no expiry field or job; `GET /sessions/:id` reads any stored session | `routes.ts` |
| AC5 temporary links | `downloadGeneratedImage` and `downloadGeneratedClip` fetch the link in the same flow that receives it and write the bytes before completing the stage; a failed download is a transient failure | `orchestrator.ts`, `imageProvider.ts`, `videoProvider.ts` |

## Goals / Non-Goals

**Goals:**
- The script and the generated texts are in the project folder (AC1).
- At least one test per acceptance criterion, pinning what already holds.

**Non-Goals:**
- Downloading the script or texts from the app (§12.3 keeps them local only).
- Keeping corrected instructions; the correction stories own that (see Risks).
- Backups, cleanup or archiving of old projects.

## Decisions

**Decision 1 — The script is written once at session creation, inside `createRun`.**
`createRun` already creates the project folder. It writes `script.txt` (UTF-8, exactly as submitted) with `writeArtefactOnce` straight after, before the session row is inserted. The script is locked by the store (JOS-137), so a write-once file matches it.

*Alternative rejected:* writing it in the `POST /sessions` route. Every other creation path, such as the test endpoints and fixtures, would then make sessions without it.

**Decision 2 — The generated texts are written once at chunk registration, as one JSON file.**
After `insertRegisteredScenes` commits, `registerDecomposition` writes `generated-texts.json` with `writeArtefactOnce`. It holds `{ chunks: [{ id, prompt, imageInstruction, videoInstruction, narrationInterval }] }` in identifier order, from the same values it just stored. One file matches the single registration event, and JSON keeps the four fields per chunk unambiguous.

*Alternatives rejected:* one text file per chunk (many files for one event, no gain); regenerating the file from the store on every change (an overwrite, and the only change today, the visual correction, does not touch these fields).

**Decision 3 — A write failure fails the step, it is not skipped.**
If writing either file throws, the creation or registration fails the way any other store error does today. A missing file would break AC1 silently. `writeArtefactOnce` refuses an existing file, which cannot happen on a fresh folder or a first registration (registration is itself refused when chunks exist).

**Decision 4 — Pin the rest with tests, one per AC.**
- **AC1 media**: run a session through the stub providers and assert each file is under its folder.
- **AC2**: a test that seeds a session with results, advances nothing but the clock (an injected `now` years later), runs boot recovery, and checks the files and the read are unchanged. Plus a source check that `rmSync` is used only on the known temporary paths.
- **AC3**: the counter and different-minute cases, writing results for both.
- **AC4**: consult an old session through the API.
- **AC5**: the existing download tests are referenced, plus one asserting that the stored reference is the local file, not the link.

## Risks / Trade-offs

- **[Corrected instructions are not in the file]** → Today's correction writes only the skeleton's `instruction` column, so nothing visible changes. The stories that add real `IMAGE` and `VIDEO` corrections (JOS-157, JOS-158) must record the corrected text in the folder. That goes in the coordination comment.
- **[The source check for `rmSync` is brittle]** → It is a guard against an accidental deletion path, and the test names the allowed call sites so a reviewer sees when one is added.
- **[Sessions created before this change have no `script.txt` or `generated-texts.json`]** → Acceptable for the MVP's local data. A backfill would be a one-off script and is not planned.

## Migration Plan

No migration. New sessions get both files; existing ones keep what they have.

## Open Questions

None.
