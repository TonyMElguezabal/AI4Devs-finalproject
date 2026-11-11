## Context

There are five shipped adapter types, one per stage. Each factory accepts an injected `fetchFn` and `loadKey`:

| Adapter type | Factory | Operations the stage calls | Success result | Malformed 200 body | Unresponsive mark |
|---|---|---|---|---|---|
| `openai-reasoning` | `createOpenAiVisualInstructionGenerator` | `generate` | `success` | `invalid_output` | none (JOS-260) |
| `elevenlabs-voice` | `createElevenLabsVoiceProvider` | `synthesize` | `success` | `failed_transient` | yes |
| `elevenlabs-alignment` | `createElevenLabsAlignmentProvider` | `align` | `success` | `invalid_output` | none (JOS-260) |
| `fal-image` | `createFalAiImageProvider` | `submit` (then `poll`, `cancel`) | `submitted` | `failed_transient` | yes |
| `runninghub-video` | `createRunningHubVideoProvider` | `submit` (upload, then task), `poll` | `submitted`; `poll`: `success` | `failed_transient` | yes |

What exists today:
- **The status rule is copied into each adapter.** Every adapter maps an HTTP status with its own private `classifyHttpStatus`, and the five copies are identical: 4xx except 408 and 429 is `failed_not_retryable`, anything else is `failed_transient`.
- **Each adapter's unit test re-checks it with its own status list:**
  - `voice-provider.test.ts:142-180`
  - `alignment-provider.test.ts:88-114` and `:135`
  - `visual-instructions.test.ts:99-129` and `:150`
  - `image-provider.test.ts:97-140`
  - `image-provider-queue.test.ts:87`, `:97` and `:133`
  - `video-provider.test.ts:303-347`
- **`adapters-no-hidden-retries.test.ts`** checks the one-request rule over a hand-written list of six calls plus script moderation.
- **The `*.contract.test.ts` files call the real vendors.** They are opt-in and some are billed. They hold no fake-vendor classification case, so acceptance criterion 4 has nothing to remove from them.

## Goals / Non-Goals

**Goals:**
- One table of vendor answers, run against every operation of every adapter type that sends a request, with one request per case.
- A new key in `PARAMETER_SHAPES` without fixtures fails `npm run typecheck`. Under `npm test`, a meta-test fails and names the missing type.
- The classification cases now in the suite are removed from the per-adapter tests. The adapter source lines they run stay covered.

**Non-Goals:**
- Extracting the five identical `classifyHttpStatus` copies into one helper. That is a production change, and this story must not mix with one. The suite is what makes that refactor safe later; it's proposed as a follow-up.
- Adding the unresponsive mark to alignment and reasoning (JOS-260). The suite asserts what has shipped.
- Image `poll` and `cancel`. Their answers mean something else: a failed status check is `check-failed`, not a failed attempt, and a cancel answers `cancelled`, `already-completed` or `unknown`. They stay in `image-provider-queue.test.ts`.
- Script moderation. It is not an adapter type and keeps its case in `adapters-no-hidden-retries.test.ts`.

## Decisions

### 1. One fixture per adapter type, typed `Record<AdapterTypeId, AdapterContractFixture>`

```ts
type Classified = "success" | "not-retryable" | "transient" | "transient-unresponsive" | "invalid-output";

interface ContractOperation {
  name: string;                                         // "submit", "poll", …
  call(fetchFn: typeof fetch): Promise<{ kind: string; unresponsive?: true }>;
  validAnswer(url: string): Response;                   // routes by URL when success takes more than one request
  successKind: string;                                  // "success" or "submitted"
  malformed: "transient" | "invalid-output";
  marksUnresponsive: boolean;
  /** The request a failure is answered on: video submit's upload is its first request. */
  requestsOnSuccess: number;
}

interface AdapterContractFixture { operations: ContractOperation[] }
```

The suite maps each result to one `Classified` value through a single `classify(result)` function. That gives every adapter the same table and the same expectations. The fixtures live in the suite file. Splitting them into a separate module would add a file with only one user.
*Alternative:* one fixture per stage interface. Rejected: a stage may ship two adapter types later (the JOS-262 gap), and the meta-test must be per adapter type.

### 2. The vendor answer table

| Vendor answer | Expected |
|---|---|
| A valid answer | `successKind`; `requestsOnSuccess` requests |
| 400, 401, 402, 403, 404, 413, 422 | `not-retryable`, 1 request |
| 408, 429, 500, 502, 503, 504 | `transient`, 1 request |
| A refused connection (`fetch` rejects with `TypeError("fetch failed")`) | `transient-unresponsive` if `marksUnresponsive`, else `transient`; 1 request |
| A timeout (`fetch` rejects with a `DOMException` named `TimeoutError`, as an aborted signal does) | same as the refused connection; 1 request |
| A malformed 200 body (`not json`) | `malformed`, 1 request; never a throw |

- **The status lists** are the union of the lists the per-adapter tests use today, so no status loses coverage.
- **The timeout is simulated by the rejection, not a real timer.** The video adapter has no time-limit option, and a real timer would slow the suite. Each adapter's real time-limit path, and the reason it names, stays in its own tests. Only the classification moves.
- **Video `submit` fails on its upload request.** So the failure cases have exactly one request, and no task is created: the property `adapters-no-hidden-retries.test.ts` checks today.

### 3. The meta-test

The fixture record's type makes a missing adapter type a compile error. The runtime test `expect(Object.keys(FIXTURES).sort()).toEqual(Object.keys(PARAMETER_SHAPES).sort())` makes `npm test` fail too, and the diff names the missing type (acceptance criterion 3). Like JOS-262, it's checked by hand once with a temporary key.

### 4. What is removed and what stays

- **The rule:** a case is removed only if the suite asserts everything it asserts: the same adapter, operation and vendor answer, with the same classification and request count. A case that also checks something else stays: reason wording, request body, a different malformed body, or headers.
- **Removed:**
  - `voice-provider`: the transient status list and "not JSON is transient". The not-retryable status list becomes one case that checks the reason names the status.
  - `alignment-provider`: both status lists, "network error is transient", "exactly one request", and the "not JSON" row of the invalid-output table.
  - `visual-instructions`: both status lists, "network error is transient (no unresponsive mark)" and "exactly one request".
  - `image-provider`: the three status lists. Their reason wording is still asserted by the status loop in `image-provider-queue.test.ts`.
  - `video-provider`: "403 is not retryable" and "408 is transient".
  - `adapters-no-hidden-retries`: the six adapter cases. The suite's 429 answer carries `Retry-After`, as that table's did, so the replacement is exact.
- **Stays:**
  - Request shape and success payload details.
  - The network-error and time-limit cases that check reason wording.
  - Malformed bodies other than "not JSON" (wrong JSON shape, missing fields).
  - The reference-image statuses and `Retry-After`.
  - Queue addresses and status checks.
  - RunningHub error envelopes, error codes and the "refused task answer carries no unresponsive mark" case.
  - Credentials, "never copies the body", downloads and stubs.
  - The script moderation case.
  - `image-provider-queue.test.ts`, which is unchanged: every case there checks more than the classification.

## Risks / Trade-offs

- **Coverage could drop when cases are removed.** → Remove only cases the suite repeats exactly (same adapter, operation, answer and classification). Compare the per-file case lists before and after in the report. No coverage provider is installed, so the comparison is by case, not by line.
- **A simulated timeout doesn't run the abort timer.** → The adapters' own time-limit tests (real `timeoutMs`) stay in place.
- **The success fixtures must match each vendor's real answer shape.** → Reuse the success bodies the per-adapter tests already use. Those were checked against the real APIs by the opt-in contract tests.

## Migration Plan

None. This change only touches tests.

## Open Questions

None.
