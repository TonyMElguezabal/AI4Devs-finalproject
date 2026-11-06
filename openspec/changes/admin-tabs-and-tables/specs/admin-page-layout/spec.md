## ADDED Requirements

### Requirement: The Administrator tools are shown in tabs
Once unlocked, `/admin` SHALL show four tabs, "Settings", "Providers", "Failed stages" and "Reports", and SHALL show only the tool group of the selected tab. "Settings" SHALL hold the visual style and the active providers. The selected tab SHALL be kept in the address hash (`#settings`, `#providers`, `#failed-stages`, `#reports`); an empty or unknown hash SHALL select "Settings". The tabs SHALL be operable with the keyboard (arrow keys move between tabs). Locking the page again on a 401 SHALL work from any tab.

#### Scenario: First tab
- **WHEN** the Administrator unlocks `/admin` with no hash
- **THEN** "Settings" is selected and shows the visual style and the active providers

#### Scenario: Choosing a tab
- **WHEN** the Administrator selects "Reports"
- **THEN** the address hash is `#reports`, the reports are shown and the other tools are not

#### Scenario: Reloading keeps the tab
- **WHEN** the page is opened at `/admin#providers` and unlocked
- **THEN** "Providers" is selected

#### Scenario: Unknown hash
- **WHEN** the page is opened at `/admin#unknown` and unlocked
- **THEN** "Settings" is selected

#### Scenario: Reports load on demand
- **WHEN** the Administrator unlocks the page on "Settings"
- **THEN** no report request is sent until "Reports" is selected

#### Scenario: Locked from another tab
- **WHEN** an Administrator request made from the "Providers" tab is answered 401
- **THEN** the password form is shown again

### Requirement: Active providers are one compact row per stage
The "Active providers" section SHALL show one row per stage with the stage's select (named `{Stage} provider`) and its source badge, "from settings files" or "set on /admin".

#### Scenario: One row per stage
- **WHEN** the Settings tab is shown
- **THEN** the Reasoning, Voice, Alignment, Image and Video providers each have one row with a select and a source badge

### Requirement: Provider profiles are compact rows with an overflow menu
The "Providers" section SHALL show one card per stage with one row per profile: its name once, an "Active" badge when it is the active one, and its key source. "Edit {name}" SHALL be a visible button; "Test connection {name}" and "Delete {name}" SHALL be inside a "More actions for {name}" disclosure that closes when an item is chosen or Escape is pressed. "Delete" and the charged test SHALL still ask for confirmation in the row. "Add {stage} provider" SHALL be in the card header.

#### Scenario: Row content
- **WHEN** a stage has one active profile named "OpenAI" with its key from the environment
- **THEN** its row shows "OpenAI" once, an "Active" badge and the key source, and an "Edit OpenAI" button

#### Scenario: Actions in the menu
- **WHEN** the Administrator opens "More actions for OpenAI"
- **THEN** "Test connection OpenAI" and "Delete OpenAI" are offered

#### Scenario: Delete still confirms
- **WHEN** the Administrator chooses "Delete OpenAI"
- **THEN** the row asks for confirmation and nothing is deleted until it is confirmed

### Requirement: No content spills out of its card
At widths from 375 px to 1280 px, no `/admin` content SHALL extend beyond its card, except inside a table's own horizontal scroll wrapper. Radio buttons SHALL NOT take the full-width input style.

#### Scenario: Wide table
- **WHEN** the provider-usage table is wider than the card
- **THEN** the table scrolls horizontally inside its wrapper and the card keeps its width

#### Scenario: Period radios
- **WHEN** the period selector is shown
- **THEN** each radio sits next to its label
