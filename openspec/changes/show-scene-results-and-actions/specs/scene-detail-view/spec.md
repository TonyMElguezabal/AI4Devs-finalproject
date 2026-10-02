## ADDED Requirements

### Requirement: Scenes are listed in ascending order with their live state

The session page SHALL list scenes in ascending index order regardless of the order they complete or their updates arrive, and SHALL show each scene's current state, updating it when a live update arrives, without a reload (§6, §8.3, AC21).

#### Scenario: Out-of-order completion

- **GIVEN** scene 3 completes before scene 2
- **WHEN** the page renders
- **THEN** the rows are in the order 1, 2, 3

#### Scenario: A state change arrives

- **GIVEN** the page is open and scene 2 is `image-generating`
- **WHEN** a live update reports scene 2 `image-complete`
- **THEN** scene 2's row shows `image-complete` without a reload

### Requirement: A scene's stored image is served read-only, scoped to its session

`GET /sessions/:sessionId/scenes/:sceneId/image` SHALL return the scene's stored image inline, with `image/png` or `image/jpeg` according to the stored file's extension. It SHALL answer 404 when the scene does not belong to that session, or has no stored image, or the file is missing. A stored path that resolves outside the session's project folder SHALL be refused and never read. The route SHALL accept no body and change nothing.

#### Scenario: A scene with a stored image

- **GIVEN** a scene in `image-complete` whose stored image is `scene-1-attempt-1.png`
- **WHEN** its image is requested
- **THEN** the response is 200, `image/png`, with the file's exact bytes

#### Scenario: A scene of another session

- **GIVEN** a scene that belongs to session A
- **WHEN** its image is requested under session B's identifier
- **THEN** the response is 404 and no file is read

#### Scenario: A scene with no image yet

- **GIVEN** a scene in `submitted`
- **WHEN** its image is requested
- **THEN** the response is 404

#### Scenario: A stored path escaping the project folder

- **GIVEN** a scene whose stored result is `../other-session/scene-1.png`
- **WHEN** its image is requested
- **THEN** the request is refused and the file outside the folder is not read

### Requirement: The session read points at a scene's viewable results

Each scene on the session read and in live updates SHALL carry `result.imageUrl`, the image route's path for that scene, exactly when the scene has a stored image, including a `failed` scene whose image was stored before it failed. It SHALL carry `result.videoUrl` only when a clip is stored, which no stage produces until JOS-146.

#### Scenario: Image stored

- **GIVEN** a scene with a stored image
- **WHEN** the session is read
- **THEN** its `result.imageUrl` is `/sessions/{sessionId}/scenes/{sceneId}/image`

#### Scenario: Failed after its image was stored

- **GIVEN** a scene that stored its image and then failed
- **WHEN** the session is read
- **THEN** it still carries `result.imageUrl`

#### Scenario: Nothing stored

- **GIVEN** a scene with no stored image
- **WHEN** the session is read
- **THEN** it has no `result`

### Requirement: Scene details show the available results

The scene-details panel SHALL show the scene's image when `result.imageUrl` is present and a playable clip when `result.videoUrl` is present, resolved against the API base. It SHALL show neither when absent (AC3).

#### Scenario: Image available

- **GIVEN** a scene with `result.imageUrl`
- **WHEN** its details are expanded
- **THEN** an image of scene N is shown from that URL

#### Scenario: Clip available

- **GIVEN** a scene with `result.videoUrl`
- **WHEN** its details are expanded
- **THEN** a video player for scene N is shown from that URL

#### Scenario: Nothing available

- **GIVEN** a scene with no `result`
- **WHEN** its details are expanded
- **THEN** neither an image nor a video player is shown

### Requirement: A failed scene shows its error, affected stage and only the actions for that stage

A `failed` scene SHALL show its error and its affected stage (AC4). Its actions SHALL follow its affected stage:

- an `image` failure SHALL offer retry and the image-instruction correction form;
- a `video` failure SHALL offer no retry or correction until clip retry and correction exist (JOS-158), because the backend refuses them (JOS-146).

A scene that is not `failed` SHALL offer neither.

#### Scenario: Image failure

- **GIVEN** a `failed` scene with `affectedStage: "image"` and error "content filter rejection"
- **WHEN** its details are expanded
- **THEN** the error, the affected stage "image", a retry button and the image-instruction correction form are shown

#### Scenario: Clip failure

- **GIVEN** a `failed` scene with `affectedStage: "video"`
- **WHEN** its details are expanded
- **THEN** the error and the affected stage "video" are shown
- **AND** no retry button and no correction form are present
