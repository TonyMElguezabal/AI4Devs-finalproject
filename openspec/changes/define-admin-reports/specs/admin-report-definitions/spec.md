## ADDED Requirements

### Requirement: Each agreed report is fully defined

The report catalogue SHALL define every agreed report with its purpose and the decision it supports, its fields, its granularity, its period, its data source (the tables and columns it reads), and an example. A report SHALL NOT be agreed when any of these is missing.

#### Scenario: A report with all its parts

- **GIVEN** the catalogue entry for the provider-usage report
- **WHEN** a story writer reads it
- **THEN** it states what it measures, each field, the granularity (provider and stage), the period, and the tables and columns it reads

#### Scenario: A report missing its data source

- **GIVEN** a candidate report whose data source is not named
- **WHEN** the catalogue is reviewed
- **THEN** the report is not agreed until its source is named

### Requirement: Each report is traceable to recorded data or to a named gap

For every agreed report the change SHALL record whether it can be computed from what the application stores today, by running its query on a scratch store that holds known sessions and comparing the result with the known counts. A report that cannot be computed as defined SHALL name the missing data and the follow-up story that adds it.

#### Scenario: A computable report

- **GIVEN** a scratch store with a known number of successful and failed attempts per provider
- **WHEN** the provider-usage query runs on it
- **THEN** its counts equal the known counts

#### Scenario: A report that needs data the store lacks

- **GIVEN** the money cost of a session, which the store does not record
- **WHEN** the estimated-cost report is defined
- **THEN** it names the missing price per unit and the follow-up story that adds it

### Requirement: Reports are read-only views behind the Administrator gate

Every agreed report SHALL be a read-only view over the local store. It SHALL require the Administrator password, SHALL write nothing and SHALL send nothing off the device.

#### Scenario: Without the password

- **GIVEN** a person who has not entered the Administrator password
- **WHEN** a report is requested
- **THEN** it is refused as unauthorized

### Requirement: No report exposes a secret or the Users' content

No report SHALL contain an API key, a script, a prompt or instruction, narration text, or a failure message a provider returned verbatim. Failure causes SHALL be the application's own wording and the stored error code.

#### Scenario: The failures report

- **GIVEN** a failed attempt whose provider answered with a body containing text from the request
- **WHEN** the failures report is produced
- **THEN** it shows the application's cause and the error code, and none of the provider's text

### Requirement: An estimated cost is labelled an estimate

If a cost report is agreed, every amount in it SHALL be labelled as an estimate computed from recorded units and a price per unit the Administrator entered, and a provider with no price SHALL be shown as unpriced, not as zero.

#### Scenario: A provider without a price

- **GIVEN** a provider with recorded usage and no price per unit
- **WHEN** the cost report is shown
- **THEN** the provider's cost is shown as unpriced and is not added to the total as zero

### Requirement: The agreed set is in the PRD and has follow-up stories

The product owner SHALL review the report list before it is final. The agreed reports SHALL be added to the PRD (reports in scope for the release that builds them), and each SHALL have a follow-up story with acceptance criteria, as SHALL each recording gap the agreed reports need.

#### Scenario: Completion

- **GIVEN** the product owner has agreed the report list
- **WHEN** the change is completed
- **THEN** the PRD describes the agreed reports and a story with acceptance criteria exists for each report and each gap
