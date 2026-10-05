# Backend stack walking skeleton (throwaway)

Built for `define-backend-stack` (JOS-179) to prove the leading candidate — **TypeScript + Node.js + Fastify + Zod** — against the five PRD behaviours hardest to retrofit later. See `../design.md` § Candidate Evaluation for why this stack was chosen and `../tasks.md` §3–§8 for the experiment plan.

## What this is not

- **Not the product.** It models one generic provider-backed stage ("IMAGE") instead of the PRD's five stages, and one flat list of scenes instead of the full session/chunk lifecycle. It exists to prove mechanisms, not to implement US-42's product stories.
- **Not a persistence decision.** The SQLite store here is a disposable stand-in (Decision 4, `../design.md`). US-42c (JOS-181) chooses the real persistence engine and schema independently; nothing here should be read as pre-empting that choice. Every experiment report states which observations depend on this stand-in.
- **Not exercising any real provider.** `src/provider.ts` is a deterministic, in-process stub with configurable latency and outcomes. No API keys, no network calls, no cost.

## Architecture

- `src/db.ts` — SQLite schema (`better-sqlite3`) for `runs`, `scenes`, `provider_requests`. This is the persistence stand-in.
- `src/provider.ts` — the stubbed provider. `send()` persists a `provider_requests` row with a deterministic completion time (`sent_at + latency_ms`) instead of relying on an in-memory timer, so that **restarting this process does not lose the provider's own state** — exactly like a real external provider would keep working across our restarts. `pollResult()` recomputes the outcome from persisted data at any time (used for restart reconciliation). `scheduleDelivery()` additionally fires an in-process callback close to completion time, to model a provider that pushes its result (used for the normal, non-restart path and for the idempotency experiment).
- `src/concurrency.ts` — a FIFO semaphore keyed by stage name, shared across all runs (proves C3).
- `src/orchestrator.ts` — the state machine: launching a scene, applying the 1+3 retry budget, routing not-retryable failures straight to `failed`, handling (possibly duplicate) provider results idempotently, and reconciling in-flight scenes on boot (proves C1, C2, C6, C7).
- `src/routes.ts` — the minimal HTTP surface: start a run, read state, manual retry, an SSE stream for live push, and an internal endpoint the provider stub uses to deliver results (also used directly by the idempotency experiment to send a duplicate).
- `public/index.html` — a minimal page that opens the SSE stream and renders scene states without reloading (proves C8).
- `test/orchestrator.test.ts` — automated tests covering experiments 4.1 (restart resumption, simulated in-process), 4.3 (retry budget) and 4.5 (idempotency), per tasks.md §5.2.

## Running it

```bash
cd openspec/changes/define-backend-stack/skeleton
npm install
npm run typecheck   # tsc --noEmit, fully-typed check
npm test            # vitest run
npm start           # starts the server on PORT (default 3100)
```

Voice-over tests (JOS-136, no real provider is ever called; `test/setup.ts` installs a stub before every test):

```bash
npx vitest run test/voice-over-phase.test.ts test/voice-over-session-state.test.ts test/voice-over-session-read.test.ts test/voice-provider.test.ts
RUN_PROVIDER_CONTRACT_TESTS=1 npx vitest run test/voice-provider.contract.test.ts   # opt-in, calls the real ElevenLabs API with the key from the environment or .secrets.json
```

Voice-over generation needs `ffprobe` on the `PATH` (it measures the returned MP3). To run the server without a real voice provider, start it with `USE_STUB_VOICE_PROVIDER=<mode>` (`success`, `success-without-timestamps`, `transient-failure`, `not-retryable-failure`, `undecodable-audio`, `empty-audio`, `hang`).

Data lives in `data/skeleton.sqlite`, gitignored. Delete it to reset.

## Environment

- `PORT` — HTTP port (default `3100`)
- `STAGE_CONCURRENCY_LIMIT` — max simultaneous provider requests for the `IMAGE` stage, shared across all runs (default `2`) — proves C3
- `DB_PATH` — SQLite file path (default `data/skeleton.sqlite`)

## Disposition

Undecided until tasks.md §11.1. This directory is discarded (deleted) if the skeleton is not kept as the project seed.
