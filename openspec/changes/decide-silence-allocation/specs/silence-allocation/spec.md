# Silence allocation

Requirements for deciding and applying which scene each silence of the voice-over belongs to (JOS-142, US-09; PRD §7.3, §14 D11, §14.1, AC12, AC19). Assigning and storing each scene's interval belongs to JOS-143. Assembling the final video belongs to JOS-149. Fixing the speed-factor limit belongs to US-33.

## ADDED Requirements

### Requirement: One recorded rule allocates every silence

The project SHALL record in `docs/PRD.md` §7.3 and D11 exactly one rule that assigns every silence of the voice-over to a scene: the silence before the first spoken character, each pause between two adjacent units, and the silence after the last spoken character. The rule SHALL be stated precisely enough that two implementations derive the same boundaries from the same timestamps and MP3 duration.

#### Scenario: A pause between two scenes

- **GIVEN** two consecutive scenes separated by a pause in the narration
- **WHEN** the boundary between them is computed
- **THEN** its position follows from the recorded rule and the two scenes' speech spans alone

#### Scenario: Silence at the start of the narration

- **GIVEN** timestamps whose first spoken character starts after 0 s
- **WHEN** the boundaries are computed
- **THEN** the first scene's interval starts at 0 s

#### Scenario: Silence at the end of the narration

- **GIVEN** timestamps whose last spoken character ends before the MP3's end
- **WHEN** the boundaries are computed
- **THEN** the last scene's interval ends at the MP3's measured duration

### Requirement: Segmentation and narration intervals share one boundary computation

The system SHALL compute unit boundaries with a single implementation used both to measure candidate fragments during segmentation and to derive each scene's narration interval. A scene's interval length SHALL equal the narrated duration segmentation used to choose its clip duration.

#### Scenario: A scene's interval matches the duration it was segmented with

- **GIVEN** a script segmented into scenes
- **WHEN** each scene's narration interval is derived
- **THEN** its length equals the narrated duration segmentation recorded for that scene

### Requirement: The intervals partition the voice-over

Under the adopted rule, the scenes' intervals SHALL be contiguous and non-overlapping and SHALL cover the voice-over from 0 s to the MP3's measured duration. This SHALL hold for native and for forced-alignment timestamps, and when two units have no pause between them.

#### Scenario: Native timestamps

- **GIVEN** native timestamps, which start at 0 s and end at the audio's end
- **WHEN** the intervals are derived
- **THEN** they are contiguous, do not overlap, and run from 0 s to the MP3's duration

#### Scenario: Forced-alignment timestamps

- **GIVEN** forced-alignment timestamps that start after 0 s, end before the audio's end and leave gaps between units
- **WHEN** the intervals are derived
- **THEN** they are contiguous, do not overlap, and run from 0 s to the MP3's duration

#### Scenario: Units with no pause between them

- **GIVEN** two adjacent units where one ends exactly where the next begins
- **WHEN** the boundary between them is computed
- **THEN** it lies at that shared instant

### Requirement: The adopted rule keeps the bounds and the speed-factor limit

The comparison SHALL report, for each candidate rule and each surveyed narration, in both timestamp shapes: the fragments outside the §6.1 bounds, the largest speed factor in each direction, and whether a valid grouping exists. Under the adopted rule, every fragment not flagged `script-below-lower-bound` or `unsplittable-sentence` SHALL stay within the §6.1 bounds and SHALL need a speed factor within the recorded limit (JOS-182's recommendation, 0.5× to 2.0×, until US-33 fixes the constant).

#### Scenario: An ordinary fragment under the adopted rule

- **GIVEN** a surveyed narration segmented under the adopted rule
- **WHEN** an unflagged fragment's interval and admitted clip duration are compared
- **THEN** the interval is within 5-15 s and the speed factor is within 0.5× to 2.0×

#### Scenario: A flagged fragment

- **GIVEN** a fragment flagged `script-below-lower-bound` or `unsplittable-sentence`
- **WHEN** the comparison reports speed factors
- **THEN** that fragment is reported separately, as a case that already carries a speed-factor warning under §6.1.1

### Requirement: A silence threshold is stated

The decision SHALL state the longest silence that a single clip sustains acceptably under the adopted rule, taken from rendered videos with increasing pause lengths that the product owner has judged. When a pause measured in real narration exceeds that threshold, a rule for such pauses SHALL be defined and approved by the product owner before D11 closes. When none does, the threshold SHALL be recorded as the reason no further rule is needed.

#### Scenario: Every real pause is below the threshold

- **GIVEN** a threshold judged acceptable and a pause survey whose longest pause is below it
- **WHEN** the decision is recorded
- **THEN** the adopted rule applies to every pause, and the threshold and the longest measured pause are recorded together

#### Scenario: A real pause exceeds the threshold

- **GIVEN** a pause survey containing a pause longer than the threshold
- **WHEN** the decision is prepared
- **THEN** a rule for pauses above the threshold is proposed to the product owner
- **AND** D11 is not closed until the product owner approves it

### Requirement: The rule is chosen from compared, human-judged evidence

Both candidate rules SHALL be compared on the same narrations and, for the rendered comparison, on the same clips. The narrations SHALL be in English and Spanish, with native and forced-alignment timestamps. The product owner SHALL judge the rendered videos. The record SHALL state the evidence, the product owner's verdict, the agent's prior recommendation and the rule rejected.

#### Scenario: The rendered comparison is judged

- **GIVEN** the same clips assembled once under each candidate rule
- **WHEN** the product owner has watched both
- **THEN** their verdict is recorded verbatim, next to the agent's recommendation written before the renders were shared

#### Scenario: No human verdict

- **GIVEN** renders the product owner has not yet judged
- **WHEN** the change is reviewed for closure
- **THEN** D11 remains open

### Requirement: The PRD records the decision

`docs/PRD.md` SHALL be updated to v1.5, keeping v1.4 as `docs/PRD-v1.4.md`. In v1.5, §7.3 SHALL state the adopted rule and the threshold; AC12 SHALL state that each scene change falls at the adopted boundary; AC19 SHALL name the rule; D11 SHALL be closed with its resolution; §14.1 SHALL be marked done; and §16 SHALL list the change.

#### Scenario: A later story reads the PRD

- **GIVEN** a story that derives or uses narration intervals (for example JOS-143 or JOS-149)
- **WHEN** its author reads §7.3
- **THEN** the rule, the threshold and the handling of leading and trailing silence are stated there
- **AND** D11 is shown as closed
