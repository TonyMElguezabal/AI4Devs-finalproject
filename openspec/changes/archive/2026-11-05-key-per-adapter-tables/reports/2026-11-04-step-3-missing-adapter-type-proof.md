# Step 3 Report: A missing adapter type fails the type check

- Date: 2026-11-04
- Change: key-per-adapter-tables
- Agent: Claude Code (Opus 5.5)

## 3.1 Scratch key

Added `"scratch-image": { model: modelId }` to `PARAMETER_SHAPES` in `backend/src/providerTypes.ts`, with no other change, and ran `npm run typecheck`. It failed with one error per per-adapter table, and each error names the missing key (type text shortened):

```
src/providerConnectionCheck.ts(58,14): error TS2741: Property '"scratch-image"' is missing in type '{…}' but required in type 'Record<AdapterTypeId, ConnectionCheck>'.
src/providerTypes.ts(60,14): error TS2741: Property '"scratch-image"' is missing in type '{…}' but required in type 'Record<AdapterTypeId, string>'.
src/providerTypes.ts(114,7): error TS2741: Property '"scratch-image"' is missing in type '{…}' but required in type 'Record<AdapterTypeId, Omit<AdapterType, "id">>'.
```

| Line | Table |
|---|---|
| `providerConnectionCheck.ts:58` | `CONNECTION_CHECKS` |
| `providerTypes.ts:60` | `ADAPTER_VENDORS` |
| `providerTypes.ts:114` | `ADAPTER_TYPE_DEFINITIONS` (the `/admin` form) |

## 3.2 Revert

- `git checkout -- backend/src/providerTypes.ts`.
- `git diff -- backend/src backend/test` is empty, and `grep -rn scratch-image backend/src backend/test` finds nothing.
- `npm run typecheck` passes again.

## Outcome

- Step 3 status: PASS. Acceptance criterion 2 holds for all three tables.
