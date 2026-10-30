# estimated-cost-report Specification

## Purpose
Estimate what the providers cost: billed units times each provider profile's current price, per stage and provider, per session and per currency, without ever counting an unpriced provider as zero (JOS-227).
## Requirements
### Requirement: Estimated-cost report per stage and provider
`GET /admin/reports/estimated-cost` SHALL return one row per stage (voice, alignment, reasoning, image, video) and provider that has at least one counted attempt in the period, each with: the provider id and display name, the billed units and their unit, the failed units, the price per unit and its currency, and the estimated cost. Counted attempts, billed units and the period SHALL be those of the provider-usage report. The estimated cost SHALL be the billed units times the provider profile's current price per unit, in the profile's currency. The Reports section on `/admin` SHALL show these rows in a table under the same period selector, and SHALL label every amount as an estimate and show it with its currency.

#### Scenario: Priced provider
- **WHEN** a video provider priced at 0.05 USD per clip second billed 34 clip seconds in the period
- **THEN** its row shows 34 clip seconds, a price of 0.05 USD and an estimated cost of 1.70 USD, labelled an estimate

#### Scenario: Price of zero
- **WHEN** a provider priced at 0 EUR billed units in the period
- **THEN** its estimated cost is 0 EUR and it is priced

#### Scenario: Current price is used
- **WHEN** a provider's price was changed after its attempts were made
- **THEN** the estimated cost uses the price stored now

#### Scenario: Empty period
- **WHEN** no attempt was sent in the period
- **THEN** the report has no rows and no totals, and the section says there was no provider activity in the period

### Requirement: Unpriced providers are never counted as zero
A provider whose profile has no price, or whose id matches no profile, SHALL be shown as unpriced, with no price and no estimated cost. It SHALL NOT be added to any total.

#### Scenario: Provider without a price
- **WHEN** an image provider with no price billed 12 images in the period
- **THEN** its row shows 12 images and "unpriced", and no amount

#### Scenario: Attempt on a provider with no profile
- **WHEN** attempts are attributed to a provider id that matches no provider profile
- **THEN** that row is unpriced

### Requirement: Totals per currency that state what they exclude
The report SHALL give one total per currency, the sum of the estimated costs of the priced rows in that currency. When any row in the period is unpriced, the response and the section SHALL say that the totals exclude unpriced providers. No total SHALL add amounts of different currencies.

#### Scenario: Total with an unpriced provider
- **WHEN** the period has a voice provider costing 2.00 USD, a video provider costing 1.70 USD and an unpriced image provider
- **THEN** the USD total is 3.70, and the section says the total excludes unpriced providers

#### Scenario: Two currencies
- **WHEN** one provider is priced in USD and another in EUR
- **THEN** there is one USD total and one EUR total, and neither includes the other

#### Scenario: Every provider priced
- **WHEN** every row in the period is priced
- **THEN** no exclusion note is shown

### Requirement: Only successful attempts are billed; failed units are shown separately
The estimated cost SHALL be computed from the units of successful attempts only (a late success counts as a success). Each row SHALL also show the failed units: the units its transient, not-retryable and timed-out attempts would have billed, by the same unit rule. Failed units SHALL NOT be priced or added to any total.

#### Scenario: Failed and successful clip attempts
- **WHEN** a scene's clip of 5 requested seconds failed twice and then succeeded on a provider priced at 0.05 USD per clip second
- **THEN** the row shows 5 billed clip seconds, 10 failed clip seconds, and an estimated cost of 0.25 USD

### Requirement: Estimated cost per session in the Sessions report
Each row of the Sessions report SHALL show the session's estimated cost: per currency, the sum of the estimated costs of the session's successful attempts on priced providers, over all of the session's attempts. When one of the session's successful attempts ran on an unpriced provider, the row SHALL note that the cost excludes unpriced providers. A session with no successful attempt on a priced provider SHALL show no amount.

#### Scenario: Session with priced and unpriced providers
- **WHEN** a session's voice-over succeeded on a voice provider priced in USD and its images on an unpriced provider
- **THEN** its row shows the voice cost in USD, labelled an estimate, and notes that the cost excludes an unpriced provider

#### Scenario: Failed attempts add nothing to a session
- **WHEN** a session's clip attempts failed twice and then succeeded
- **THEN** only the successful attempt adds to the session's estimated cost

### Requirement: The estimated-cost report follows the report rules
The estimated-cost report SHALL be refused without the Administrator password, SHALL write nothing and send nothing off the device, and SHALL NOT contain an API key, a script, a prompt or instruction, narration text, or a provider's own words in a failure message.

#### Scenario: Requested without the Administrator password
- **WHEN** a request for `GET /admin/reports/estimated-cost` arrives without the Administrator password, or with a wrong one
- **THEN** it is answered 401 and no report data is returned

#### Scenario: No secret and no content
- **WHEN** the report is produced from sessions whose scripts, prompts, narration and failure messages hold known marker texts, and whose providers have stored keys
- **THEN** none of those texts or keys appears in the response

#### Scenario: Invalid period
- **WHEN** the report is requested with `from` after `to`, or with a value that is not an ISO 8601 date-time
- **THEN** it is answered 400 naming the parameter

