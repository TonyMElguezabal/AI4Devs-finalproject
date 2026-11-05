Linear-Issue: JOS-262

## Why

A new vendor always arrives as a new adapter type in code (JOS-261, epic E18). `ADAPTER_VENDORS` is keyed by the adapter types in `PARAMETER_SHAPES`, so a new type does not compile until it names its vendor. The other per-adapter tables are not keyed that way. `CONNECTION_CHECKS` is a `Record<string, …>`, and the `/admin` form descriptions are a plain array, so a new type can ship with no connection test and no form. The runtime test that guards them compares them with each other, not with `PARAMETER_SHAPES`, so it still passes when both miss the same type. JOS-262 makes the compiler catch these gaps before the shared contract suite (JOS-263) builds on the same list.

## What Changes

- Name the shipped adapter types once: `AdapterTypeId = keyof typeof PARAMETER_SHAPES`, exported from `backend/src/providerTypes.ts`. `ADAPTER_VENDORS` uses it.
- Key `CONNECTION_CHECKS` (`backend/src/providerConnectionCheck.ts`) by `AdapterTypeId`. A new key in `PARAMETER_SHAPES` without a connection check then fails `npm run typecheck`, and the error names the missing key.
- Turn the `/admin` form descriptions (`ADAPTER_TYPE_DEFINITIONS`) into a table keyed by `AdapterTypeId`. `ADAPTER_TYPES` is derived from it in the same order and shape, so `GET /admin/provider-types` answers byte for byte as before.
- Add a type-level test (`expectTypeOf` and `// @ts-expect-error`) so these tables can't be widened back to `string` without CI noticing. Add a runtime test that checks every table against `PARAMETER_SHAPES`.
- No endpoint, response, database or UI changes. Observable behaviour is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `provider-profiles`: adds a requirement that every adapter type the application ships has an entry in each per-adapter table (vendor name, connection check, form description), and that the build fails if one is missing.

## Impact

- Code: `backend/src/providerTypes.ts`, `backend/src/providerConnectionCheck.ts`, `backend/src/adminProviderRoutes.ts` (the two `CONNECTION_CHECKS` lookups by a stored `adapterType` string).
- Tests: a new `backend/test/adapter-type-tables.test.ts`. The existing `provider-types` and `provider-connection-check` tests stay as they are.
- APIs, data model, frontend: none.
- Audit (acceptance criterion 3): recorded in design.md § Context and repeated in the PR.
