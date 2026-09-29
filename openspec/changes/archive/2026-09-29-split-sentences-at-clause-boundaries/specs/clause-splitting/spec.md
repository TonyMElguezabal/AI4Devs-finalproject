# Clause splitting

Requirements for dividing a sentence inside, at a clause boundary, when the duration bounds cannot otherwise be met (JOS-141, US-08; PRD §6.1 exception, §6.1.1, §7.2, AC17, AC18). Sentence detection, the duration rule and the grouping search belong to `script-segmentation` (JOS-140).

## ADDED Requirements

### Requirement: Clause boundaries are found by a fixed rule

A clause boundary SHALL lie right after a comma or semicolon followed by whitespace, and right before a listed conjunction of the script's language that follows whitespace and is not the sentence's first word. A comma or semicolon directly followed by a conjunction SHALL count as one boundary, after the punctuation. No other position inside a sentence SHALL ever be a cut.

#### Scenario: Commas, semicolons and conjunctions

- **GIVEN** the English sentence "The boats came in, the gulls rose; and the town woke because the bells rang"
- **WHEN** its clause boundaries are found
- **THEN** they lie after "in,", after "rose;" and before "because", and "; and" counts once

#### Scenario: A comma inside a number

- **GIVEN** a sentence containing "1,000 boats"
- **WHEN** its clause boundaries are found
- **THEN** there is no boundary inside the number

#### Scenario: Spanish conjunctions

- **GIVEN** the Spanish sentence "Los barcos volvieron y las gaviotas volaron porque sonaron las campanas"
- **WHEN** its clause boundaries are found
- **THEN** they lie before "y" and before "porque"

### Requirement: A sentence over the maximum is split at clause boundaries

When a sentence's narration alone exceeds the maximum (15 s), the system SHALL split it at one or more clause boundaries, choosing the cuts, together with the rest of the grouping, in `script-segmentation`'s preference order (fewest fragments ending on a sentence or piece under the lower bound, then the least total speed change) while keeping every piece's chunk within the bounds where possible.

#### Scenario: A long sentence with boundaries

- **GIVEN** a sentence narrated in 22 s with clause boundaries
- **WHEN** the script is segmented
- **THEN** it is divided at clause boundaries into pieces whose chunks each last at most 15 s

#### Scenario: The best of several split points is chosen

- **GIVEN** a long sentence with several clause boundaries
- **WHEN** the script is segmented
- **THEN** the cuts chosen are those of the grouping preferred by `script-segmentation`'s order: fewest fragments ending on a short sentence or piece, then the least total speed change

### Requirement: A short sentence borrows the next sentence's first clause

When a sentence below the lower bound would exceed the maximum if grouped with the whole next sentence, the system SHALL split the next sentence at a clause boundary and group the short sentence with that sentence's first part; the remainder SHALL follow the normal grouping rules.

#### Scenario: A short sentence before a long one

- **GIVEN** a 3 s sentence followed by a 14 s sentence with clause boundaries
- **WHEN** the script is segmented
- **THEN** the 3 s sentence is in one fragment with the first part of the 14 s sentence
- **AND** the rest of that sentence is in the following fragment or fragments

### Requirement: No other sentence is split

A sentence that neither exceeds the maximum on its own nor is the next sentence in the short-sentence case SHALL NOT be split internally, even if it contains clause boundaries.

#### Scenario: A sentence within the bounds keeps its commas

- **GIVEN** a 9 s sentence containing commas and conjunctions, in a script whose other sentences group normally
- **WHEN** the script is segmented
- **THEN** that sentence is whole in one fragment

### Requirement: A sentence without clause boundaries is kept whole

When a sentence must be split but has no clause boundary, the system SHALL keep it whole in one fragment (together with the short sentence, in the short-sentence case), even if that fragment exceeds the maximum, and SHALL flag the fragment `unsplittable-sentence`. It SHALL NOT be a failure. The flag SHALL appear on no other fragment.

#### Scenario: A long sentence without boundaries

- **GIVEN** a sentence narrated in 18 s with no comma, semicolon or listed conjunction
- **WHEN** the script is segmented
- **THEN** it is one fragment flagged `unsplittable-sentence`, and segmentation succeeds

#### Scenario: A short sentence before a long sentence without boundaries

- **GIVEN** a 3 s sentence followed by a 14 s sentence without boundaries
- **WHEN** the script is segmented
- **THEN** both are one fragment flagged `unsplittable-sentence`

#### Scenario: A split sentence is not flagged

- **GIVEN** a long sentence that was split at a clause boundary
- **WHEN** its fragments are inspected
- **THEN** none of them carries the `unsplittable-sentence` flag, unless a piece itself still exceeds the maximum with no inner boundary

### Requirement: A short clause piece follows the short-sentence rule

A clause piece whose narration is below the lower bound SHALL be grouped with what follows it, or with what precedes it if it ends the script, exactly like a short sentence.

#### Scenario: A split leaves a short last piece

- **GIVEN** a split whose last piece is narrated in 2 s
- **WHEN** the script is segmented
- **THEN** that piece is grouped with the unit that follows it, or with the one before it if it ends the script

### Requirement: Split pieces reproduce the sentence

The pieces of a split sentence SHALL be its own text, cut at whitespace, and joined in order SHALL reproduce the sentence apart from separator whitespace.

#### Scenario: A split sentence is joined back

- **GIVEN** a sentence split into pieces, in English or in Spanish with accents
- **WHEN** the pieces are joined in order
- **THEN** they equal the sentence apart from whitespace
