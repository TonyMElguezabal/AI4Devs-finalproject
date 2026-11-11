## Context

`PARAMETER_SHAPES` (`backend/src/providerTypes.ts:40`) lists the adapter types this build ships. Since JOS-213, `ADAPTER_VENDORS` is `Record<keyof typeof PARAMETER_SHAPES, string>`, so a new type does not compile until it names its vendor. JOS-262 extends that pattern to every table that holds per-adapter behaviour.

### Audit (acceptance criterion 3)

I searched `backend/src` and `frontend/src` for the adapter type ids and for lookups indexed by an adapter type.

| Table | Where | Keyed by | Verdict |
|---|---|---|---|
| `ADAPTER_VENDORS` | `providerTypes.ts:56` | `keyof typeof PARAMETER_SHAPES` | Already complete. Switches to the new alias. |
| `CONNECTION_CHECKS` | `providerConnectionCheck.ts:55` | `string` | **In scope.** A new type can ship with no connection check. |
| `ADAPTER_TYPE_DEFINITIONS` (labels, form fields) | `providerTypes.ts:109` | array with `id: string` | **In scope.** A new type can ship with no `/admin` form or display name. |
| `SEEDED_PROFILES` | `providerTypes.ts:13` | stage | Out of scope: keyed by stage, one seeded profile per stage. |
| `BILLED_UNITS` | `providerTypes.ts:83` | stage | Out of scope: keyed by stage. |
| `ACCEPTED_PROVIDERS` and the settings schema | `config/settings.ts:14` | stage | Out of scope: keyed by stage. |
| Price (`PRICE_SHAPE`) | `providerTypes.ts:66` | profile | Out of scope: a profile parameter, not per adapter type. |
| `videoCrossCheck` | `providerAdmin.ts:47` | n/a | Not a table: one `if` for the video type's parameters. |
| Adapter construction (`decompositionDependencies.ts`, the voice, image and video registries) | several | stage | Not a table: each stage builds its one shipped adapter. See Risks. |
| Frontend | `frontend/src` | n/a | No adapter type ids outside tests. |

The existing test `provider-connection-check.test.ts` ("covers the whole catalogue and nothing else") compares `CONNECTION_CHECKS` with `ADAPTER_TYPES`. Both are hand-written, so a new key in `PARAMETER_SHAPES` that is missing from both still passes.

## Goals / Non-Goals

**Goals:**
- A new key in `PARAMETER_SHAPES` fails `npm run typecheck`, which CI already runs, until it has a vendor name, a connection check and a form description. The error names the missing key.
- A test fails if one of these tables is widened back to `string`.
- `GET /admin/provider-types`, the connection test route and every other behaviour stay unchanged.

**Non-Goals:**
- Narrowing `ProviderProfile.adapterType` (a stored string) to `AdapterTypeId`.
- A factory keyed by adapter type for building adapters. Today each stage builds its one shipped type.
- The shared contract suite (JOS-263) and output checks (JOS-265, JOS-266).

## Decisions

### 1. One alias, `AdapterTypeId`, derived from `PARAMETER_SHAPES`

`export type AdapterTypeId = keyof typeof PARAMETER_SHAPES` in `providerTypes.ts`. `ADAPTER_VENDORS` and the new keys use it. `PARAMETER_SHAPES` stays the one source of truth, because the settings schema already spreads its shapes.
*Alternative:* a separate `ADAPTER_TYPE_IDS` const tuple. Rejected because it would be a second list to keep in step with the shapes.

### 2. `CONNECTION_CHECKS: Record<AdapterTypeId, ConnectionCheck>`

Only the annotation changes. Its two lookups by a stored profile's `adapterType`, which is a `string`, are `runConnectionCheck` and the test route in `adminProviderRoutes.ts`. They widen the table at the read, as `db.ts:1902` already does for `ADAPTER_VENDORS`: `(CONNECTION_CHECKS as Record<string, ConnectionCheck | undefined>)[adapterType]!`. They keep their current `!`, because a stored profile's type was validated on save. The catalogue lookup in `GET /provider-types` needs no cast once `AdapterType.id` is typed (Decision 3).
*Alternative:* narrow `ProviderProfile.adapterType`. Rejected because it touches the store, the fixtures and every profile test, and this story must not mix with other changes.

### 3. The form descriptions become `Record<AdapterTypeId, Omit<AdapterType, "id">>`

`AdapterType.id` becomes `AdapterTypeId`. `ADAPTER_TYPES` is built with `Object.entries(…).map(([id, type]) => ({ id: id as AdapterTypeId, ...type, fields: […] }))`. The insertion order and the key order (`id`, `stage`, `label`, `fields`) stay as they are now, so the JSON response is identical. The `id as AdapterTypeId` cast is safe because the record's keys are exactly that type.
*Alternative:* keep the array and add `satisfies` with a helper type that checks it covers every key. Rejected because an array can't be checked for exhaustiveness without a tuple-permutation type that nobody could read.

### 4. A type-level test plus a runtime test, both in `backend/test/adapter-type-tables.test.ts`

- `expectTypeOf(CONNECTION_CHECKS).toEqualTypeOf<Record<AdapterTypeId, ConnectionCheck>>()`, the same for `ADAPTER_VENDORS`, and `expectTypeOf<AdapterType["id"]>().toEqualTypeOf<AdapterTypeId>()`. They fail `tsc`, which covers `test/`, if a table is widened.
- One `// @ts-expect-error` fixture of type `typeof CONNECTION_CHECKS` with one entry missing. This proves acceptance criterion 2 inside the suite: if the type stops rejecting it, the unused directive fails `tsc`.
- Runtime: the keys of `CONNECTION_CHECKS`, `ADAPTER_VENDORS` and the ids of `ADAPTER_TYPES` each equal `Object.keys(PARAMETER_SHAPES)`, in that order for `ADAPTER_TYPES`.

The type assertions run under `npm run typecheck`, not under `vitest run`, because vitest does not type-check. CI runs both.

## Risks / Trade-offs

- [The `@ts-expect-error` proves the `Record` type, not a real new adapter.] → A manual check: add a scratch key to `PARAMETER_SHAPES`, run `npm run typecheck`, record the errors that name `CONNECTION_CHECKS`, `ADAPTER_VENDORS` and the form table in the step report, then revert.
- [Adapter construction is per stage, so a second adapter type in one stage would compile but the pipeline would never build it.] → Out of this story. It becomes a real gap the day a stage ships two types, and belongs with the shared contract suite (JOS-263) or the story that adds that vendor. It is recorded here and in the PR.
- [The two widening casts at the lookups hide a stored type that is no longer shipped.] → Same behaviour as today (`!` on a `Record<string>`). Profiles are validated against `PARAMETER_SHAPES` on save.

## Migration Plan

None. These are type-only changes and one derived constant. Rollback is a revert.

## Open Questions

None.
