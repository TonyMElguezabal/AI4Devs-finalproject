## ADDED Requirements

### Requirement: Result recording holds at MVP session scale

The store SHALL record exactly one result per scene, and SHALL reject repeated confirmations, when 300 scenes of one session complete at the same time and every completion is delivered twice. No store error (such as a busy or locked database) SHALL reach the orchestrator.

#### Scenario: 300 scenes complete at once with duplicate deliveries

- **WHEN** a session with 300 registered scenes has every scene's result delivered twice, with all deliveries interleaved
- **THEN** every scene has exactly one recorded result
- **AND** every second delivery is ignored as a duplicate
- **AND** no delivery fails with a store error

#### Scenario: The session reaches its final state

- **WHEN** all 300 scenes' results have been recorded
- **THEN** the session's derived state is the same one it reaches when every scene is complete at small scale
- **AND** the state read back after the store is reopened matches the state before it was closed

### Requirement: Measured write capacity is recorded

How long the 300-scene scenario takes SHALL be measured and recorded in the change's verification report. The figure is evidence for ADR 0002's open scale risk, not a pass/fail threshold.

#### Scenario: The scale evidence is reviewed

- **WHEN** a reviewer opens ADR 0002 after this change
- **THEN** the "scale beyond ~20 concurrent scene writes" risk is marked resolved
- **AND** it links to the report that holds the measured time and the scene count
