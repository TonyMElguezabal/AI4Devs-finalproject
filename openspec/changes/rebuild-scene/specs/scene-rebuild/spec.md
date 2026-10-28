## ADDED Requirements

### Requirement: The User can rebuild a generated scene

The system SHALL accept `POST /sessions/{sessionId}/scenes/{sceneId}/rebuild` for a scene whose state is `image-complete` or `chunk-complete`, in any session state, while no assembly of that session is running. The body MAY carry `imageInstruction` and/or `videoInstruction`, non-empty after trimming. An omitted field keeps the stored instruction.

An accepted rebuild SHALL, atomically, store the given instructions, clear the scene's image and clip results, and return the scene to `submitted`. It SHALL answer 202 and then generate the image and then the clip through the normal stages, with the scene's bound image and video providers (PRD §11.2), a fresh retry budget, the same time limits and the same concurrency slots.

A rebuild SHALL NOT change any other scene, the voice-over, the narration timestamps, the scene's `ID`, `PROMPT`, narration text, order, narration interval or requested clip duration, or the speed-factor limit. A failure during the rebuild SHALL be a normal scene failure, recovered with the existing retry and correction.

#### Scenario: A complete scene with a typo in its image
- **GIVEN** scene 4 of a session in `final-video` is `chunk-complete`
- **WHEN** the User rebuilds it with a corrected `imageInstruction`
- **THEN** the answer is 202 and scene 4 goes `submitted` → `image-generating` → `image-complete` → `video-generating` → `chunk-complete`
- **AND** the image request uses the corrected instruction and scene 4's bound image provider, even if the active image provider has changed

#### Scenario: Rebuild while other scenes are still processing
- **GIVEN** a session in `chunks-processing` whose scene 2 is `image-complete` and has not sent its clip request
- **WHEN** the User rebuilds scene 2
- **THEN** it is accepted, scene 2's image is generated again, and no clip is generated from the previous image

#### Scenario: Instructions omitted
- **WHEN** the User rebuilds a scene with an empty body
- **THEN** the stored `IMAGE` and `VIDEO` instructions are used unchanged

#### Scenario: Locked data is unchanged
- **WHEN** a scene is rebuilt
- **THEN** the voice-over file, the timestamps, every scene's narration interval and requested duration, and every other scene's results are unchanged

#### Scenario: A rebuild that fails
- **GIVEN** a rebuilt scene whose image attempts exhaust their retry budget
- **THEN** the scene is `failed` at the image stage and offers the existing Retry and Save correction

### Requirement: A rebuild is refused when it would interrupt work or the scene has nothing to rebuild

The command SHALL answer 404 `unknown-scene` for an unknown session or scene, or a scene of another session. It SHALL answer 409, changing nothing and sending nothing:
- `scene-not-ready` for a scene in `submitted`, `image-generating`, `video-generating` or `failed`. A request already sent is never cancelled, and a failed scene keeps its retry and correction.
- `assembly-in-progress` while an assembly attempt of the session is in flight or a final-video rebuild is requested.

An instruction that is empty after trimming SHALL be refused with 400.

#### Scenario: Clip still generating
- **GIVEN** scene 5 is `video-generating`
- **WHEN** the User rebuilds scene 5
- **THEN** the answer is 409 `scene-not-ready` and the clip request in flight continues

#### Scenario: During assembly
- **GIVEN** the session's final video is being assembled
- **WHEN** the User rebuilds any scene
- **THEN** the answer is 409 `assembly-in-progress`

#### Scenario: Another session's scene
- **WHEN** the User rebuilds a scene id with the id of a session it does not belong to
- **THEN** the answer is 404 `unknown-scene`

#### Scenario: Two quick clicks
- **WHEN** two rebuilds of the same scene arrive back to back
- **THEN** the first is accepted and the second answers 409 `scene-not-ready`

### Requirement: Nothing is overwritten

A rebuilt scene's image and clip SHALL be written to new files whose names carry the scene's rebuild number. A scene's first generation keeps the current names. Earlier images, clips and final videos SHALL stay on disk and SHALL NOT be listed on the page. The scene's image and clip URLs SHALL change with the rebuild number, so the page shows the new result and not a cached one.

#### Scenario: Files after a rebuild
- **GIVEN** scene 4 was generated as `scene-4-attempt-1.png` and `scene-4.mp4`
- **WHEN** scene 4 is rebuilt once and succeeds on the first attempt of each stage
- **THEN** the project folder also holds `scene-4-r1-attempt-1.png` and `scene-4-r1.mp4`, and the two earlier files are unchanged
- **AND** the scene's image and clip URLs differ from the ones before the rebuild

### Requirement: The final video is regenerated automatically after a rebuild

When a scene reaches `chunk-complete` and every scene of the session is `chunk-complete`, the assembly SHALL start by itself with every scene's current clip:
- In a session without a final video, still processing or failed at assembly, this is the normal assembly. On success it clears the assembly failure.
- In a session with a final video and at least one scene rebuilt since it was built, this is a final-video rebuild that opens a new cycle. It writes a new version `final-video-<version>.mp4` with the stored pause edits applied. The previous version stays current and downloadable until the new one succeeds.

Several scenes rebuilt close together SHALL lead to one assembly, after the last of them completes. While any scene is failed or still generating, no assembly SHALL start. A failed or interrupted automatic rebuild SHALL leave the previous final video current, and SHALL keep "Rebuild final video" offered until a rebuild succeeds.

#### Scenario: One scene rebuilt after the final video
- **GIVEN** a session in `final-video` with version 1
- **WHEN** scene 4 is rebuilt and reaches `chunk-complete`
- **THEN** a rebuild starts without any action by the User and, on success, `final-video-2.mp4` is the current final video and includes scene 4's new clip
- **AND** the other scenes' clips in version 2 are the same files as in version 1

#### Scenario: Two scenes rebuilt
- **GIVEN** scenes 2 and 7 are rebuilt one after the other
- **WHEN** scene 2 completes while scene 7 is still generating
- **THEN** no assembly starts until scene 7 completes, and then exactly one starts

#### Scenario: A session failed at assembly
- **GIVEN** a session whose assembly failed
- **WHEN** a scene is rebuilt and completes
- **THEN** the assembly runs again by itself and, on success, the session is `final-video`

#### Scenario: The automatic rebuild fails
- **WHEN** the automatic rebuild fails after its retry budget
- **THEN** the previous final video stays current and downloadable, the read carries the rebuild's failure cause, and "Rebuild final video" is offered

#### Scenario: Restart before the automatic rebuild ran
- **GIVEN** a rebuilt scene completed but its final-video rebuild was interrupted by a restart
- **WHEN** the User opens the session after the restart
- **THEN** the previous final video is current and "Rebuild final video" is offered

### Requirement: The page offers Rebuild scene

The expanded details of a scene in `image-complete` or `chunk-complete` SHALL show a "Rebuild scene" action while the session is not assembling its final video. The action SHALL show the scene's `IMAGE` and `VIDEO` instructions in editable fields, prefilled with the stored values. Its confirmation SHALL state that the image and the clip are generated again by the providers, and that the final video is then rebuilt. A refusal SHALL be shown as a sentence, not a code. Scenes in other states SHALL NOT show the action.

#### Scenario: Rebuild from the page
- **GIVEN** scene 4 is `chunk-complete`
- **WHEN** the User expands it, edits `IMAGE`, and confirms Rebuild scene
- **THEN** the command is sent with the edited `imageInstruction`, and scene 4's state updates live to `image-generating`

#### Scenario: No action while generating or assembling
- **GIVEN** scene 5 is `video-generating`, or the session's final video is being assembled
- **THEN** scene 5 (or every scene) shows no Rebuild scene action
