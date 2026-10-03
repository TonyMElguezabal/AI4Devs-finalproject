# Pause the session and continue explicitly

Linear-Issue: JOS-152

## Why

§9 and D01 (closed in v1.3) give the User one control over the pipeline: stop new provider calls for a whole session, and start them again only when the User says so. A request already sent finishes and its result is kept; everything not yet launched waits — a first generation, a whole phase, an automatic retry, a manual retry — in any scene and any phase.

The walking skeleton already has a pause, but it covers one thing: the scene image stage. Its `paused` marker, its two endpoints and its header button are right and stay. What it lacks is a rule that every launch must obey. Today the check `if (run.paused) return` is written three times in `orchestrator.ts` (`launchScene`, `launchImageStage`, `runImageAttempt`), and `continueSession` decides between the stub stage and the real image stage with an `if` that `manualRetry` and `applyOutcome` repeat. The voice, decomposition, video, retiming and assembly stories, and the retry policy of US-22, are each about to add a launch of their own. Each one that forgets the check makes §9's guarantee — "a pause means no new provider calls" — false, and nothing would notice. `generate-voice-over` (JOS-136) Decision 1 already reserved one phase-launch gate for exactly this ("US-20, US-37 and US-22 all need to hold or reorder launches"); this change builds the pause half of it.

The second gap is the continue half. "Every held generation, phase, and retry is launched" needs a definition of *held* that survives a restart and covers work that only became startable *during* the pause — a voice-over that finished while paused makes decomposition startable, but decomposition must not start.

## What Changes

- Introduce one **launch gate**, `admitLaunch(sessionId)`, that every provider launch asks at the last moment before the request is sent. While the session is paused it answers *held*; the caller sends nothing, consumes no attempt, starts no execution clock, and gives any request-cap slot it holds to the next waiter. It replaces the three scattered checks (§9, AC07).
- Make the moment of sending exact: the gate check and the persisted in-flight mark have no `await` between them, so a request is either sent before the pause and finishes, or held — never half of each (§9, AC07).
- Define **held work** as work that is startable but not started — derived from the stored records, not kept in a second list, so it survives a restart and cannot drift. Each phase registers a *launcher* that can report its held work and launch it; a test requires every phase to have one or to be listed explicitly as not yet launchable.
- Make **continue** the single paused-to-running transition, decided atomically in the store. Only the call that actually removes the marker launches the held work, in pipeline order and ascending scene index, so a double click cannot launch anything twice. Continue on a session that is not paused does nothing.
- Keep a **manual retry requested while paused** held: it is accepted, the cycle is opened, and the launch waits for continue; it is neither rejected nor sent (§9, D01).
- Keep **results of in-flight requests**: they are applied while paused, advance the stored state as usual, and the work they unlock is held. Nothing completed is reverted or removed by pause or by continue (§9, AC16).
- Show **held versus running**: the session representation gains `held` (the stages with held work, and how many scenes each) and each scene gains `held`, derived by the same function the continue sweep uses, so what the User sees held is exactly what continue will launch (§9).
- Route boot reconciliation through the gate, so a restart neither launches anything for a paused session nor loses its marker.

## Capabilities

### New Capabilities

- `session-pause`: what a pause holds and what it does not touch, how held work is defined, what continue launches and how it stays idempotent, how held work is told apart from running work, and the guarantees across restart and across sessions.

### Modified Capabilities

None. `live-updates-foundation` already requires the paused marker to be a field separate from the state; the new `held` fields are additive and specified here. `content-lock` already holds while paused and is unchanged.

## Impact

- **Depends on**: US-18 (JOS-168), which shows a section per phase — it renders the `held` information this change exposes, and the paused marker per phase; and US-22 (JOS-154, split into JOS-184 and JOS-185), whose scheduler and manual-retry endpoints send every attempt through this gate. Neither is implemented yet, so this change defines the gate and the launcher registry, wires every launch that exists today (image stage, stub stage, manual retry, correction, boot reconciliation, the decomposition entry point), and states in its specs what each later launcher must do.
- **Not yet launchable**: voice-over generation (JOS-136), video generation (JOS-146), retiming and assembly (JOS-149, JOS-150 and the launcher of US-16b) have no launcher in the code today. Each registers its launcher in its own story and removes its stage from the explicit not-yet-launchable list in the same change, which makes the omission visible instead of silent.
- **Interaction with US-22b (JOS-185)**: the execution clock starts at `sentAt`, so time held by a pause is never counted. A request already sent keeps its clock while the session is paused, because the provider does not pause (see the open question below).
- **Backend**: `orchestrator.ts` (gate, continue sweep, retry paths), a new `launchGate.ts`, `db.ts` (atomic continue, held-work queries), the session and scene payloads in `types.ts` and `routes.ts`.
- **Data model**: no new table and no new column. `runs.paused` already exists.
- **API contract**: `POST /sessions/{id}/pause` and `/continue` become idempotent and documented as such; the session and scene schemas gain `held` (response only). `docs/api-spec.yml` and `docs/data-model.md` are updated.
- **Frontend**: the session header and the scene rows show what is held, distinct from what is generating (§8.3, §9); the existing pause and continue buttons stay.
- **Product confirmation needed**: the assumption on the ticket says time spent paused is not counted toward per-phase maximum times. This change reads it as applying to work that has not been sent (which is true by construction) and keeps the clock running for a request already sent. The product owner should confirm that reading (design, Open Questions 1).
- **Not included**: cancelling or interrupting a sent request (§2.3, §9); a per-scene pause (§9); pausing automatically; the retry budget (JOS-184); the request cap itself (US-37).
