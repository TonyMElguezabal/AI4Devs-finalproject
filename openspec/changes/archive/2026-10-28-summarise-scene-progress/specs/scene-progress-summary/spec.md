## ADDED Requirements

### Requirement: The project panel summarises scenes by stage

Once a session has at least one scene, the project panel SHALL show a read-only scene progress summary below the `Scenes done` progress bar. The summary SHALL count the session's scenes by their `state`:

- Done: `chunk-complete`, shown as "N of total".
- Queued for image: `submitted`.
- Generating image: `image-generating`.
- Image ready, waiting for a clip slot: `image-complete`.
- Generating clip: `video-generating`.
- Failed at image: `failed` with `affectedStage` `image`.
- Failed at clip: `failed` with `affectedStage` `video`.
- Images left: Queued for image + Generating image + Failed at image.
- Clips left: total − Done.

A line whose count is zero SHALL be omitted, except Done, which SHALL always be shown. The labels for scene states SHALL use the same wording as the scene cards. A session with no scenes SHALL show no summary.

#### Scenario: Scenes in several stages
- **WHEN** a session has 10 scenes: 3 done, 2 queued, 1 generating an image, 2 with an image ready, 1 generating a clip and 1 failed at image
- **THEN** the summary shows Done "3 of 10", Queued for image 2, Generating image 1, Image ready 2, Generating clip 1, Failed at image 1, Images left 4 and Clips left 7
- **AND** it shows no Failed at clip line

#### Scenario: Every scene is done
- **WHEN** every scene of a 12-scene session is `chunk-complete`
- **THEN** the summary shows only Done "12 of 12"

#### Scenario: No scenes yet
- **WHEN** the session has no scenes (before decomposition)
- **THEN** no summary is shown

#### Scenario: A paused session
- **WHEN** the session is paused and its scenes are held
- **THEN** the summary counts each scene by its own state, as for a running session

### Requirement: In-progress and failed lines list their scene numbers

The Generating image, Image ready, Generating clip, Failed at image and Failed at clip lines SHALL list the scene numbers in that line, in ascending order. A scene number SHALL be the scene's 1-based `index`, as shown on its card, never its identifier. Two or more consecutive numbers SHALL be shown as a range (`3–5`), and ranges and single numbers SHALL be separated by commas.

#### Scenario: Consecutive and isolated numbers
- **WHEN** scenes 3, 4, 5, 8 and 12 are generating a clip
- **THEN** the Generating clip line shows the count 5 and the numbers "3–5, 8, 12"

#### Scenario: A single scene
- **WHEN** only scene 7 has an image ready
- **THEN** the Image ready line shows the count 1 and the number "7"

#### Scenario: Out-of-order input
- **WHEN** the scenes arrive in the order 9, 2, 3
- **THEN** their numbers are shown as "2–3, 9"

### Requirement: The summary updates live and is information only

The summary SHALL be recomputed from every snapshot the session page receives, so a scene that changes state through the live session stream SHALL move to its new line without a reload. The summary SHALL contain no buttons or inputs, SHALL NOT be an `aria-live` region and SHALL NOT use `role="alert"`.

#### Scenario: A clip starts
- **WHEN** a scene with an image ready changes to `video-generating` through the live stream
- **THEN** the Image ready count drops by one, the Generating clip count rises by one and the scene's number moves between the two lines

#### Scenario: No controls and no announcements
- **WHEN** the summary is shown
- **THEN** it contains no button, link or input
- **AND** neither it nor any ancestor inside the panel has `aria-live` or `role="alert"`
