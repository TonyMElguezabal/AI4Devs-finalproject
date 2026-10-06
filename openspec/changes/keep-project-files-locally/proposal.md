# Keep project files locally without overwriting or expiry

Linear-Issue: JOS-162 (US-30)

## Why

§12.2, AC15, D04 and D05 require each project's files to be kept locally, in a folder named after the video title, never deleted, never expiring, never overwriting another project, and with every temporary-link result saved before its link expires. Checked on `feature/entrega-2-JAME` (`5498360`), all of that holds except one item: **the script and the generated texts exist only in the store, not in the project folder.**

## What Changes

- **Script file**: when a session is created, its script is written once to `script.txt` in the project folder, exactly as submitted.
- **Generated texts file**: when a session's chunks are registered, their generated texts (each chunk's identifier, narrated fragment `PROMPT`, `IMAGE` and `VIDEO` instructions and narration interval) are written once to `generated-texts.json` in the project folder.
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
  - No migration, no new dependency.
- **Frontend**: no change.
- **API contract**: no change. §12.3 keeps the script and generated texts local and not downloadable, so no route is added.
- **Depends on**: US-01 (JOS-134), merged.
- **Coordination**: the stories that let the User correct an `IMAGE` or `VIDEO` instruction (§10.3, JOS-157/JOS-158) must also keep the corrected text in the project folder. Today's `correctAndRetry` only updates the skeleton's `instruction` column.
- **Out of scope**: downloads of the script or texts (§12.3); backups; removing old projects.
