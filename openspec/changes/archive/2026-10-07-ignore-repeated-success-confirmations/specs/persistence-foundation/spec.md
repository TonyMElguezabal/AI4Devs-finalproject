## MODIFIED Requirements

### Requirement: Repeated confirmations rejected by the store

The store SHALL enforce uniqueness for a completed generation, so that a repeated success confirmation cannot create a second result, launch the next stage twice, or add a scene to the assembly set more than once. Uniqueness SHALL be enforced by the store itself rather than by a prior read in application code. A confirmation the store refuses SHALL change nothing else: no scene or session state, no stored result reference, and no launch. This applies to every generation stage: voice-over, narration timestamps, decomposition, scene image, scene clip and final assembly (§12.1, AC14).

#### Scenario: The same confirmation arrives twice

- **WHEN** a success confirmation for a generation that already completed is processed again
- **THEN** no second result is stored
- **AND** the next stage is not launched again

#### Scenario: Two confirmations arrive concurrently

- **WHEN** two confirmations for the same generation are processed at the same time
- **THEN** exactly one succeeds and the other is rejected by the store

#### Scenario: A refused image confirmation leaves the scene as it is

- **GIVEN** a scene whose image was confirmed and whose clip stage has started or completed
- **WHEN** another success confirmation for its image arrives
- **THEN** the scene keeps its state and its stored image reference
- **AND** no clip request is sent for it

#### Scenario: The final video is recorded once

- **GIVEN** a session whose final video is already recorded
- **WHEN** another assembly success is confirmed for it
- **THEN** the recorded final video is not replaced

#### Scenario: Assembly is not started twice

- **GIVEN** a session that already has a final video, or an assembly attempt in flight
- **WHEN** an assembly launch is requested for it, by a scene completion or by continue
- **THEN** no assembly attempt is recorded and the assembly tool is not run

#### Scenario: A scene is assembled once

- **GIVEN** a scene whose clip was confirmed more than once
- **WHEN** the final assembly runs
- **THEN** that scene contributes exactly one clip to the assembly input
