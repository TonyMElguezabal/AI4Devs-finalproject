# ADR 0011 — Every per-adapter-type table is keyed by the adapter type (JOS-262)

- Status: Accepted (2026-11-05)
- Date: 2026-11-05
- Change: `key-per-adapter-tables` (archived `2026-11-05-key-per-adapter-tables`)

## Context

`PARAMETER_SHAPES` lists the adapter types a build ships. Since JOS-213 `ADAPTER_VENDORS` was typed `Record<keyof typeof PARAMETER_SHAPES, string>`, so a new type did not compile without naming its vendor. Two other tables (the connection checks and the `/admin` form descriptions) were keyed by `string`, so a new type could ship with no connection check and no form.

## Decision

- One alias, `AdapterTypeId`, derived from `PARAMETER_SHAPES`, keys every table that holds per-adapter-type data: `CONNECTION_CHECKS`, the form descriptions and, with the connector (ADR 0009), `VIDEO_ADAPTERS`.
- `backend/test/adapter-type-tables.test.ts` holds a type-level test and a runtime test that every adapter type has an entry in each table.

## Consequences

- Adding an adapter type fails the type check until every table is filled in; the audit of the tables is in the change's `design.md`.
