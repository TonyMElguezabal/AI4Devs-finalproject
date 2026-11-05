Linear-Issue: JOS-263

## Why

Every adapter must classify a vendor's answer the same way: a rejected key is not retryable, a 503 is transient, a vendor that never answers is transient and marked unresponsive, and a malformed body is a defined failure, never a throw. The retry policy and telemetry depend on it. Today each adapter's unit test checks this by hand, and `adapters-no-hidden-retries.test.ts` checks the one-request rule over a hand-written list. Nothing makes a new vendor's adapter pass the same cases. JOS-263 (epic JOS-261, E18) puts them in one table-driven suite keyed by `AdapterTypeId` (JOS-262), so a new adapter type can't merge until it behaves like the others.

## What Changes

- A new `backend/test/adapter-contract.test.ts` runs one failure table against every adapter type through an injected fake `fetch`. Each case makes exactly one request.
  - Not retryable: 400, 401, 402, 403, 404, 413, 422.
  - Transient: 408, 429, 500, 502, 503, 504.
  - Transient, marked unresponsive where the adapter ships the mark: a refused connection and a timeout.
  - A defined failure: a malformed 200 body.
  - A valid answer gives the stage's success result.
- The fixtures are a `Record<AdapterTypeId, AdapterContractFixture>`, so a new adapter type doesn't compile without one. A meta-test also fails under `npm test` and names any adapter type in `PARAMETER_SHAPES` that has no fixture.
- The classification cases this suite now covers are removed from the per-adapter unit tests and from `adapters-no-hidden-retries.test.ts`. Vendor-specific cases stay: request shape, queue, polling, reference image, `Retry-After`, error envelopes, credentials, reason wording, stubs. Script moderation is not an adapter type and keeps its one-request case.
- No production code changes. Observable behaviour is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `provider-profiles`: adds a requirement that every shipped adapter type passes the shared adapter contract, and that an adapter type without contract fixtures fails the build.

## Impact

- Tests:
  - New: `backend/test/adapter-contract.test.ts`.
  - Trimmed: `voice-provider.test.ts`, `alignment-provider.test.ts`, `visual-instructions.test.ts`, `image-provider.test.ts`, `image-provider-queue.test.ts`, `video-provider.test.ts` and `adapters-no-hidden-retries.test.ts`.
- Code, APIs, data model, frontend: none.
- The `*.contract.test.ts` files test the real vendors (opt-in, billed). They have no fake-vendor classification cases, so this change leaves them alone.
