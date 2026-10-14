## Context

PRD §4.1 has no product-level content policy: the providers' own filters decide, a rejection is not retryable (§10.1), and because the script is locked at registration (§4.2), a rejected script means starting a new project. The JOS-165 spike showed this chain never fires (ADR 0005, Decision 5; reports step 7a/7b). The reasoning provider replaces only the IMAGE/VIDEO instructions and answers a normal `200`, and the other three stages generate whatever they receive. `NOT_RETRYABLE_FAILURE_SIGNAL_CONFIRMED = false` in `backend/src/config/providers.ts` records this.

`POST /sessions` (`backend/src/routes.ts`) currently validates the body with zod, calls `createRun` and launches voice-over with `setImmediate`, and makes no provider call. Provider adapters make one `fetch` per call with no SDK and no hidden retry, return an already-classified result, and are installed through a get/set/reset holder that tests swap (`decompositionDependencies.ts`, `voiceProvider.ts`). On a non-OK response, `frontend/src/api/client.ts` already throws the body's `reason`, and `App.tsx` shows it as `startError`.

The product owner chose option 2 of JOS-187: refuse a disallowed script at submission, with a visible cause.

## Goals / Non-Goals

**Goals:**
- A disallowed script never becomes a session; the User sees why at once.
- The verdict is the provider's own filter (§4.1 stays "no product-level policy").
- A script is never registered without a verdict.
- No change for clean scripts beyond one extra request.

**Non-Goals:**
- Moderating corrected IMAGE/VIDEO instructions (§10.3) or provider outputs.
- Giving downstream stages a not-retryable content signal; they still have none.
- An override, appeal or threshold tuning for false positives.
- Counting moderation in stage diagnostics, attempts or the per-stage request caps.

## Decisions

### 1. Gate inside `POST /sessions`, before `createRun`

Moderation runs synchronously in the handler after zod validation. A flagged or unavailable result returns before anything is persisted.

*Alternative: a first pipeline stage after registration.* That would register a session only to fail it, and §4.2's lock means the User must start over anyway. It also adds a stage, a state path and restart recovery for nothing. Refusing before persistence needs no cleanup and has nothing to recover.

### 2. OpenAI's Moderation endpoint is the verdict

`POST https://api.openai.com/v1/moderations` with the decomposition provider's `OPENAI_KEY`. The verdict is the endpoint's own `results[*].flagged`, and the categories shown are the keys whose `categories` value is `true`. We apply no thresholds or category list of our own, so the decision stays the provider's filter, as §4.1 requires.

*Alternatives rejected:*
- **Asking the chat model to classify.** That is the component that silently sanitized, and it is non-deterministic and paid.
- **A different moderation vendor.** It adds a sixth provider and a new credential to the hardcoded set.
- **A keyword list.** That would be a product-level content policy, which §2.3/§4.1 exclude.

### 3. Model id pinned in `providers.ts`

Add `SCRIPT_MODERATION = { name: "OpenAI", model: "<pinned snapshot id>" }` and `MODERATION_MAX_TIME_SECONDS`. Both values come from the verification step (task group 1). The model id is pinned to a dated snapshot, not `-latest`, following ADR 0005 Decision 6, which hardcodes every provider version identifier. The time limit is provisional: the measured latency with headroom, flagged the same way as `PER_PHASE_MAX_TIME_SECONDS`. `providerConfig.test.ts` asserts both.

### 4. Fail closed: no verdict → `503`

Timeout, network error, any non-`2xx`, a shape mismatch and a missing credential all count as "unavailable". The response is `503 { ok: false, reason }`, and nothing is created.

*Alternative: fail open (register unchecked).* That brings back exactly the silent gap this change closes. The cost of failing closed is that an OpenAI outage blocks submission. That is acceptable because decomposition needs OpenAI anyway, so the session could not finish during that outage either.

### 5. One request, no automatic retry, no attempt record

The User is waiting on the HTTP response, so a backoff loop would show up as a hang. Resubmitting is the retry. No session exists yet, so there is nothing to attach a `StageAttempt` to, and §10.1's retry budget is about stages of a session.

### 6. Port, adapter and holder, like the decomposition dependencies

```ts
type ModerationVerdict =
  | { kind: "clean" }
  | { kind: "flagged"; categories: string[] }
  | { kind: "unavailable"; reason: string };
interface ScriptModerator { moderate(script: string): Promise<ModerationVerdict>; }
```

The new file `backend/src/scriptModeration.ts` holds the OpenAI adapter and `get/set/resetScriptModerator`. The adapter is built like `createOpenAiVisualInstructionGenerator`: injectable `fetchFn`, `loadKey` and `timeoutMs`; the response body is validated with zod; the raw body never goes into `reason`. `test/setup.ts` installs a `clean` stub in `beforeEach`, as it already does for voice, so no test reaches the network.

### 7. Response shapes

- `422 { ok: false, reason }` with `reason` = "The script was refused by the provider's content policy (flagged: illicit, violence). Edit the script and submit it again."
- `503 { ok: false, reason }` with `reason` = "The content check is temporarily unavailable. Submit the script again in a moment."

`{ ok, reason }` is the shape `conflictSchema` already uses, and `asJson` reads `reason` first, so the frontend needs no change. Both statuses are declared in the route's zod `response` map, so `/docs/json` and `docs/api-spec.yml` pick them up.

### 8. Long scripts

The script is sent as a single `input` string. The verification step submits the ~2,200-word script that `session-creation.test.ts` uses for AC04. If the endpoint refuses that length, the adapter sends `input` as an array of paragraph-sized parts, and any flagged part flags the script. This branch is written only if the step shows it is needed.

### 9. The finding is resolved by documentation, not by flipping the flag

`NOT_RETRYABLE_FAILURE_SIGNAL_CONFIRMED` stays `false`, because downstream stages still have no signal. Its comment and ADR 0005 Decision 5 point to this gate as the resolution. PRD §4.1 says scripts are checked at submission by the reasoning provider's moderation endpoint. §10.1 notes that a content refusal now happens before the pipeline starts. The §11.3 open finding and the related gap-table row are marked resolved by JOS-187.

## Risks / Trade-offs

- [The moderation endpoint does not flag the content the chat model sanitized] → Task group 1 checks this first with the step-7a inputs in English and Spanish. If either is not flagged, implementation stops and the finding goes back to the product owner.
- [False positives block a legitimate script (for example, a war-history narration)] → Accepted for the MVP: §4.1 lets the provider decide, and there is no override. The cause names the categories so the User knows what to rephrase.
- [Corrected IMAGE/VIDEO instructions bypass the gate] → Out of scope. Those are written by the reasoning provider from an already-moderated script, and §10.3 corrections remain an open exposure, recorded in the ADR.
- [Added latency on every submission] → One small request, measured in task group 1 and bounded by `MODERATION_MAX_TIME_SECONDS`.
- [Moderation snapshot retired] → Calls fail and submissions get `503`, the same exposure as every pinned id in ADR 0005 Decision 6.

## Migration Plan

No data model change and no stored-state change. Deploying adds the gate. Reverting the route change removes it. Existing sessions are unaffected.

## Open Questions

- The exact snapshot id, time limit and long-script behavior are settled by task group 1 and recorded in its report before any code is written.
