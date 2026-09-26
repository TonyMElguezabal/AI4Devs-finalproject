# Media assembly foundation

Requirements established by choosing the video and audio assembly tooling. These govern the project's media foundation, not user-facing product behaviour — the behaviours this change's pipeline serves are specified by their own stories: US-16 (assembling the final MP4), US-15 (speed factor recorded per scene), US-27 (assembly retry from existing components).

## Requirements

### Requirement: Single documented assembly pipeline

The project SHALL record exactly one chosen assembly tool and its exact command pipeline — filters, encoder settings and container flags — in `docs/backend-standards.md`, together with an ADR stating the rejected alternatives and the evidence. Implementation work SHALL follow that pipeline rather than composing its own.

#### Scenario: Assembly implementation begins

- **WHEN** work starts on the final-assembly story
- **THEN** `docs/backend-standards.md` names the tool and the command pipeline to use
- **AND** the story does not compose its own filter chain or encoder settings

#### Scenario: The tool is rejected

- **WHEN** the evaluated tool fails any PRD constraint
- **THEN** the documented fallback and the failing constraint are recorded

### Requirement: Measured speed-factor threshold

The project SHALL hold a recorded measurement of the speed-factor range within which retimed output remains acceptable, covering both speeding up and slowing down, and SHALL recommend a limit value with its supporting samples. The recommendation SHALL state that the quality judgement is subjective, and the samples SHALL be retained so a reviewer can confirm or overrule it.

#### Scenario: The hardcoded limit is being set

- **WHEN** the hardcoded speed-factor limit is chosen
- **THEN** the recommendation and its evidence from this change are available as its input

#### Scenario: The two directions degrade differently

- **WHEN** speeding up and slowing down reach unacceptable quality at different factors
- **THEN** each direction's threshold is reported separately rather than merged into one symmetric limit

### Requirement: Duration accuracy held per clip and across a session

Each assembled clip SHALL land within a stated tolerance of its target narration interval, and cumulative drift across a full-length session SHALL stay within that stated tolerance. Both SHALL be measured; total output duration alone SHALL NOT be accepted as evidence.

#### Scenario: A single clip is retimed

- **WHEN** a clip is retimed to its narration interval
- **THEN** its assembled duration is within the stated tolerance of that interval

#### Scenario: Many scenes are assembled in sequence

- **WHEN** a session of many scenes is assembled
- **THEN** the accumulated offset at the final scene is within the stated tolerance
- **AND** the measurement is taken per scene, not only on the total duration

### Requirement: Voice-over is the only audio and is never retimed

The pipeline SHALL produce output whose only audio is the complete voice-over, at its original rate and duration, with every clip's own audio excluded rather than silenced. Audio and video SHALL remain in sync from the first scene to the last.

#### Scenario: Clips carry their own audio

- **WHEN** source clips contain audio
- **THEN** no clip audio is present in the output

#### Scenario: Video is retimed

- **WHEN** clips are sped up or slowed down to match their intervals
- **THEN** the voice-over duration and rate are unchanged
- **AND** audio and video remain in sync at the final scene

### Requirement: Mismatched sources normalised before joining

The pipeline SHALL normalise each clip to the target resolution and frame rate before concatenation, so that clips differing in duration, resolution or frame rate join without artefacts and produce a single compliant file.

#### Scenario: Sources differ in shape

- **WHEN** clips of differing resolutions and frame rates are assembled
- **THEN** the output is one 16:9 MP4 at the target resolution and frame rate, with H.264 video and AAC audio
- **AND** no artefact is present at the joins

### Requirement: Committed fixture for assembly tests

The project SHALL commit sample media and the script that produced the verified output, so that assembly behaviour is tested against real media rather than confirmed by inspection alone. The fixture SHALL be the minimum that still exercises mismatched joins, and its size SHALL be recorded.

#### Scenario: Assembly tests are written

- **WHEN** tests are written for the final-assembly story
- **THEN** the committed fixture provides real source media and a voice-over to run against
