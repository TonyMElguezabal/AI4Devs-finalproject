## MODIFIED Requirements

### Requirement: No image action once the image succeeded

An image-stage retry or correction SHALL be refused with 409 for a scene that is not `failed` (`not-failed`), and SHALL NOT change the image instruction or launch the image stage for a failed scene whose image has already succeeded. When such a scene is failed at the video stage, the shared retry and correction commands SHALL dispatch to clip recovery as specified by `clip-failure-recovery`; they SHALL NOT be refused as `image-already-generated` solely because the image exists. A refusal SHALL change nothing and launch nothing. The page SHALL NOT offer image retry or `IMAGE` correction for a video-stage failure (§3, AC09).

#### Scenario: Failed clip is routed to clip recovery
- **GIVEN** a scene whose image is stored and whose video stage failed
- **WHEN** the User requests retry or correction through the existing scene recovery command
- **THEN** the command is handled by clip recovery and does not change or regenerate the image

#### Scenario: Image generated, scene still processing
- **GIVEN** a scene in `image-complete`, `video-generating` or `chunk-complete`
- **WHEN** an image-stage retry or correction is requested
- **THEN** the command answers 409 with `not-failed`

#### Scenario: No image action on a clip failure
- **GIVEN** a scene failed at the video stage
- **WHEN** its details are shown
- **THEN** no image retry button and no `IMAGE` correction form are shown