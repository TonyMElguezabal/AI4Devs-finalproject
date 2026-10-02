# Define the backend stack

Linear-Issue: JOS-179

## Why

Vid4You has no application code and no decided backend technology. PRD v1.3 deliberately specifies behaviour rather than implementation, and `docs/backend-standards.md` still describes an inherited template stack belonging to a different application. Without a decision, every implementation story either stalls or picks its own technology. This change chooses the backend language, runtime and framework, and proves the choice against the runtime behaviours that are hardest to retrofit later: a bounded retry budget, a concurrency cap shared across sessions, restart-safe resumption of in-flight provider calls, and idempotent success confirmations.

## What Changes

- Score candidate backend stacks against must-pass gates and weighted criteria derived from PRD v1.3 (§5, §9, §10.1, §10.2, §12.1, §12.3).
- Build a throwaway walking skeleton against a **stubbed provider** proving five behaviours: resume after restart, shared per-stage concurrency cap with first-come-first-served ordering, the 1 + 3 retry budget with not-retryable failures skipping retries, idempotent repeated success confirmations, and a live push reaching an open page.
- Record the decision as an ADR, with the rejected alternatives and the evidence behind each.
- Rewrite `docs/backend-standards.md` so it describes Vid4You: stack, project structure, layering, naming, error handling, validation approach, API and OpenAPI conventions, testing approach and commands, and the logging conventions that carry per-stage provider and attempt records.
- Settle the open question blocking US-42c: whether the database and TypeScript expectations implied by this repository's own rules are binding for Vid4You, or inherited alongside the stale standards docs.
- Decide explicitly whether the skeleton becomes the project seed or is discarded.
- No product behaviour ships, and no user-facing capability changes.

## Capabilities

### New Capabilities

None. This change produces a technology decision, an ADR and a standards rewrite — it ships no user-facing behaviour.

The runtime behaviours the skeleton exercises are already owned by their own stories and will be specified when those are implemented on the chosen stack: US-22 (retry budget), US-37 (per-stage request limit), US-28 (restart survival and in-flight resumption), US-29 (idempotent confirmations), US-18 and US-19 (live progress).

### Modified Capabilities

None. `openspec/specs/` is empty — this is the project's first change, so there are no existing requirements to modify.

## Impact

- **Documentation**: `docs/backend-standards.md` rewritten end to end; a new ADR added. `openspec/config.yaml` currently names `docs/api-spec.yml` and `docs/data-model.md` as the API contract and data model, and both still describe an unrelated inherited domain — the rewrite must not treat them as authoritative.
- **Repository**: today it holds only the `packages/specboot` tooling, with no root `package.json` and no application code. If the skeleton is kept, this change introduces the first application code and its toolchain.
- **Downstream tickets**: unblocks US-42c (persistence), and constrains US-42b (frontend interop) and US-42e (live updates). Every implementation story inherits the standards produced here.
- **Process**: `docs/openspec-tasks-mandatory-steps.md` assumes a database, curl-testable endpoints and Playwright E2E. The chosen stack must support those steps, or the document needs revising — the ruling belongs to US-42c and is recorded there.
- **No deployed systems, external APIs or user data are affected.** The stubbed provider means no third-party calls and no API keys are exercised.
