## ADDED Requirements

### Requirement: Every shipped adapter type is complete in each per-adapter table

Each table that holds per-adapter-type behaviour SHALL be keyed by the adapter types the application ships, as defined by their parameter rules. This covers the vendor name telemetry reports, the connection check and the `/admin` form description with its display name. Adding an adapter type without an entry in one of these tables SHALL fail the type check that CI runs, and the failure SHALL name the missing entry. Tables keyed by stage or by profile are not covered.

#### Scenario: A new adapter type without a connection check

- **GIVEN** a developer adds an adapter type to the parameter rules and gives it a vendor name and a form description but no connection check
- **WHEN** `npm run typecheck` runs
- **THEN** it fails with an error that names the new adapter type as missing from the connection checks

#### Scenario: A table widened back to any string

- **GIVEN** the connection checks, the vendor names or the form descriptions are retyped to accept any string as an adapter type
- **WHEN** `npm run typecheck` runs
- **THEN** it fails on the adapter-type table test

#### Scenario: Every table matches the shipped adapter types

- **WHEN** the unit tests run
- **THEN** the connection checks, the vendor names and the `/admin` adapter-type catalogue each list exactly the adapter types in the parameter rules, and the catalogue keeps its current order

#### Scenario: Existing behaviour is unchanged

- **WHEN** the Administrator lists the adapter types on `/admin` or tests a profile's connection
- **THEN** the response is the same as before this change, field for field and in the same order
