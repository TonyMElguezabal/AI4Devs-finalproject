## Why

A scene can come out wrong even when every provider call succeeds: the wrong content, typos rendered inside the image, visual artefacts. The system cannot detect that, and today the User has no way to fix it. The retry and correction commands (JOS-157/158) only act on a `failed` scene, and the final video is built once (JOS-235). The product owner's decision (2026-10-28) is that a defect the User sees is a failure the system did not catch, so it is recovered under PRD §10.3. It is not a regeneration "por preferencia estética", which stays out of scope (§2.3).

## What Changes

- New **Rebuild scene** command: `POST /sessions/{sessionId}/scenes/{sceneId}/rebuild`, with body `{ imageInstruction?, videoInstruction? }`, answering 202.
  - It is accepted for a scene in `image-complete` (its clip request not yet sent) or `chunk-complete`, in any session state, unless an assembly is running.
  - It stores the edited instructions, if any, and regenerates the image and then the clip on the scene's bound providers.
  - Every other scene, the voice-over, the timestamps, the decomposition, the requested clip duration and the speed factor are unchanged.
- Nothing is overwritten. A rebuilt scene writes new image and clip files (a per-scene rebuild number in the file name), and the previous files stay on disk.
- **The final video is regenerated automatically.** When the rebuilt scene (or the last of several) reaches `chunk-complete`, the next assembly starts by itself:
  - a session still processing gets its normal first assembly;
  - a session failed at assembly assembles again;
  - a session with a final video gets a new final-video version, using the JOS-190 versioned build.
- **Changes to the existing "Rebuild final video" command (JOS-190):**
  - It is also offered when the final video is older than a rebuilt scene. That covers a failed or interrupted automatic rebuild.
  - It is now refused with `scenes-not-complete` while any scene is not complete.
- Image and clip URLs carry the rebuild number, so the page shows the new result rather than a cached one. Whether a scene can be rebuilt is derived on the page from its state and the session state, the way scene actions already are (`sceneActions.ts`).
- The final-video status gains `staleScenes`, which says a scene was rebuilt after the current final video.
- Page: an expanded scene shows "Rebuild scene" with its `IMAGE` and `VIDEO` instructions editable. A confirmation states that the image and the clip are generated again (paid provider calls).
- PRD v1.25, a clarification and not a reversal. §10.3 gains a "defect seen by the User" row. The §2.3 aesthetic-preference exclusion is kept, with a note that a defect the User sees is a failure.

## Capabilities

### New Capabilities
- `scene-rebuild`: the User rebuilds a generated scene (image, then clip) with optionally edited instructions, and the final video is regenerated automatically from the current clips.

### Modified Capabilities
- `scene-pause-adjustment`: the "Rebuilding applies the edits in a new final-video version" requirement changes in two ways. A rebuild is also allowed when a scene was rebuilt after the current final video. It is refused while a scene is not complete.

## Impact

- **Backend:**
  - new `backend/src/sceneRebuild.ts`;
  - `db.ts`: migration adding `scenes.rebuild_count` and `runs.final_video_stale`, the conditional rebuild transition, and cleared result-guard rows;
  - `orchestrator.ts`: file names, automatic reassembly in `triggerAssemblyIfReady`, versioned URLs and `staleScenes` in the snapshot;
  - `finalVideoRebuild.ts`;
  - `routes.ts` (route and Zod schemas) and `types.ts`.
- **Frontend:** `sceneActions.ts`, `SceneRow.tsx` (the Rebuild scene form), `FinalVideoDownload.tsx` (offering Rebuild when stale), `SessionPage.tsx`, `api/client.ts`, `types.ts`.
- **Docs:** PRD v1.25 (§2.3, §10.3, AC table, changelog), `docs/api-spec.yml`, `docs/data-model.md`, the README in Spanish.
- **Migration and cost:** one additive migration, with no backfill. Each scene rebuild costs one image and one clip call, plus one assembly.
