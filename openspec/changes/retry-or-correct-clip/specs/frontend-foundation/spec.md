## MODIFIED Requirements

### Requirement: Editing surface derived from stage state

The correction form for a visual instruction SHALL be rendered only when its corresponding stage is failed, and SHALL be absent—not merely disabled—otherwise. An image-stage failure SHALL expose only `IMAGE` correction; a video-stage failure SHALL expose only `VIDEO` correction. The scene identifier, narration prompt and scene order SHALL NOT be rendered as editable inputs in any state.

#### Scenario: A visual stage succeeded
- **WHEN** a scene's image or video stage has completed successfully
- **THEN** no correction form for that successful stage's instruction is present

#### Scenario: The image stage failed
- **WHEN** a scene's image stage is failed
- **THEN** a form for correcting its image instruction is present
- **AND** no form for correcting its video instruction is present
- **AND** no input for the scene identifier, narration prompt or scene order is present

#### Scenario: The video stage failed
- **WHEN** a scene's video stage is failed
- **THEN** a form for correcting its video instruction is present
- **AND** no form for correcting its image instruction is present
- **AND** no input for the scene identifier, narration prompt or scene order is present