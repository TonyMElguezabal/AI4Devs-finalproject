# Keep project files locally without overwriting or expiry

Linear-Issue: JOS-162 (US-30)

## Why

§12.2, AC15, D04 and D05 require each project's files to be kept locally, in a folder named after the video title, never deleted, never expiring, never overwriting another project, and with every temporary-link result saved before its link expires. Checked on `feature/entrega-2-JAME` (`5498360`), all of that holds except one item: **the script and the generated texts exist only in the store, not in the project folder.**

## What Changes

- **Script file**: when a session is created, its script is written once to `script.txt` in the project folder, exactly as submitted.
- **Generated texts file**: when a session's chunks are registered, their generated texts (each chunk's identifier, narrated fragment `PROMPT`, `IMAGE` and `VIDEO` instructions and narration interval) are written once to `generated-texts.json` in the project folder.
- **Corrected instructions file**: when a User corrects a scene's `IMAGE` or `VIDEO` instruction (§10.3, now implemented by JOS-157/JOS-158, both merged since this change was proposed), the corrected text is also recorded in `corrected-instructions.json` in the project folder, keyed by scene identifier. The gate check (task 1.1) found both stories merged on `feature/entrega-2-JAME` and their corrections still only reach the store, not the project folder, so this is added to this change's scope rather than left to a coordination comment.
- **Pinning tests** for what already holds, one per acceptance criterion:
  - the full MP3, its timestamps, images, clips and final MP4 land in the project folder;
  - nothing in the running app deletes a project file or expires a session;
  - two projects with the same title get separate folders (title plus creation minute, then a counter);
  - a session of any age is still consultable with its results;
  - an image or clip delivered as a temporary link is saved into the folder when the result is received.

## Capabilities

### New Capabilities

- `project-files`: what is kept in a project folder, the folder naming and same-title separation, no deletion or expiry, and saving temporary-link results locally.

### Modified Capabilities

None. `persistence-foundation`'s "File references bound to the owning project folder" stays as it is; this change relies on it.

## Impact

- **Backend**:
  - `db.ts` (`createRun`): writes `script.txt` with `writeArtefactOnce` after creating the folder.
  - `sceneRegistration.ts`: writes `generated-texts.json` with `writeArtefactOnce` after the chunks are stored.
  - `db.ts` (`correctImageInstruction`, `correctLegacyInstruction`, `correctVideoInstruction`): each, after its `UPDATE` actually changes a row, writes the corrected instruction into `corrected-instructions.json` with `writeArtefact` (not write-once; a scene can be corrected more than once).
  - No migration, no new dependency.
- **Frontend**: no change.
- **API contract**: no change. §12.3 keeps the script, generated texts and corrected instructions local and not downloadable, so no route is added.
- **Depends on**: US-01 (JOS-134), merged.
- **Coordination**: JOS-157 and JOS-158 have both merged into `feature/entrega-2-JAME`; this change now implements the corrected-instructions file itself (see design.md Decision 5) instead of leaving a coordination comment on those tickets.
- **Out of scope**: downloads of the script, texts or corrections (§12.3); backups; removing old projects; a history of every correction (only the latest per scene/field is kept, matching the store).
