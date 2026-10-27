# provider-pricing Specification

## Purpose
TBD - created by archiving change add-provider-price-per-unit. Update Purpose after archive.
## Requirements
### Requirement: A provider can carry an optional price per unit and currency

A provider profile SHALL accept two optional parameters, a price per unit and a currency, entered together. The price per unit MUST be a finite number zero or greater. The currency MUST be a three-letter ISO 4217 code, stored upper-case. A profile with neither SHALL be unpriced. A price of zero SHALL be stored as zero and SHALL NOT be treated as unpriced.

#### Scenario: A price and a currency are saved
- **WHEN** the Administrator saves a voice profile with price per unit 0.00003 and currency `usd`
- **THEN** the profile is stored with price per unit 0.00003 and currency `USD`, and reading it back returns both

#### Scenario: A profile without a price is unpriced
- **WHEN** the Administrator saves a profile without a price per unit and without a currency
- **THEN** it is stored with neither, it is unpriced, and it is usable

#### Scenario: Zero is a price
- **WHEN** the Administrator saves a profile with price per unit 0 and currency `EUR`
- **THEN** the profile is stored with price 0 and currency `EUR`

#### Scenario: Invalid prices are refused with every problem listed
- **WHEN** the Administrator saves a profile with a negative price, a price that is not a number, an unknown currency code, a price without a currency, or a currency without a price
- **THEN** the save is refused, each problem is listed on its field (`pricePerUnit` or `priceCurrency`) together with any other parameter problem, and nothing is stored

#### Scenario: Clearing the price makes the profile unpriced again
- **WHEN** the Administrator edits a priced profile and leaves both price fields empty
- **THEN** the profile is saved without a price and the other parameters are unchanged

### Requirement: The price is entered per stage's billed unit

Each stage SHALL name the unit its price applies to: voice character for voice, audio second for alignment, request for reasoning, image for image, clip second for video. The `/admin` form SHALL label the price field with that unit.

#### Scenario: The form names the unit
- **WHEN** the Administrator opens the form to add or edit a video provider
- **THEN** it shows an optional field "Price per clip second" and an optional field "Currency"

#### Scenario: The adapter types list the unit
- **WHEN** `GET /admin/provider-types` is called with Administrator access
- **THEN** every adapter type lists the price and currency fields as not required, and the price field's label names its stage's unit

### Requirement: The price is managed only on /admin

The settings files SHALL NOT accept a price or a currency in a provider section. A price stored on the first profile of a stage SHALL NOT be reported as a difference from the settings files.

#### Scenario: The settings files reject a price
- **WHEN** a settings file's voice section contains `pricePerUnit`
- **THEN** the settings are invalid and the problem names the unknown key, as for any other unknown key

#### Scenario: A priced first profile raises no settings notice
- **WHEN** the first voice profile is priced on `/admin` and its other parameters equal the settings section, and the application starts
- **THEN** no notice says the settings differ from the stored provider

### Requirement: A price never changes how a provider works

A price SHALL NOT be sent to the provider, SHALL NOT make a profile unusable, and SHALL NOT change binding, retries, the active provider or telemetry.

#### Scenario: The vendor request carries no price
- **WHEN** a request is sent through a priced image profile
- **THEN** the request carries the profile's model and no price or currency

#### Scenario: Pricing the active provider keeps it active and usable
- **WHEN** the Administrator adds a price to the active voice provider
- **THEN** it stays active and usable, and the next session binds to it as before

#### Scenario: Pricing requires Administrator access
- **WHEN** a request without Administrator access tries to save a price
- **THEN** it is refused with 401 and nothing is stored

