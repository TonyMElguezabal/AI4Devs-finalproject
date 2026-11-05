# Step 4 Report: Unit Tests and Database Verification

- Date: 2026-11-05
- Change: shared-adapter-contract-suite
- Agent: Claude Code (Opus 5.5)

## Step 1: The suite

- **Red state (1.3).** With the fixture record empty:
  - `npm run typecheck` failed with one error naming all five types: `TS2739: Type '{}' is missing the following properties … "openai-reasoning", "elevenlabs-voice", "elevenlabs-alignment", "fal-image", "runninghub-video"`.
  - The meta-test "lists exactly the adapter types in PARAMETER_SHAPES" failed.
- **Green (1.4, 1.5).** With the five fixtures: 103 cases pass, typecheck and lint pass.
  - Every adapter matches the answer table, so step 1.5 found no gap.
- **The suite can fail.** To make sure it wasn't passing for the wrong reason:
  - I set alignment's `marksUnresponsive` to `true`. Exactly the two cases for a vendor that never answers failed ("a refused connection" and "a timeout"), and 101 passed.
  - The file was then restored. A first attempt edited the wrong line, because the lint fix had shifted line numbers, and changed nothing. It was redone by content.

## Step 2: The meta-test, by hand

- **Setup.** I added `"scratch-image"` to `PARAMETER_SHAPES`, with stub entries in `ADAPTER_VENDORS`, the form table and `CONNECTION_CHECKS`, so the contract fixtures were the only thing missing it.
- **`npm run typecheck`:** one error, `test/adapter-contract.test.ts(36,7): error TS2741: Property '"scratch-image"' is missing in type '{…}' but required in type 'Record<…, AdapterContractFixture>'`.
- **The suite:** the meta-test failed with `-   "scratch-image",` in its diff; the other 102 cases passed.
- **Revert:** `git checkout -- src/providerTypes.ts src/providerConnectionCheck.ts`. `git diff -- src` is empty, `scratch-image` appears nowhere, and typecheck passes.

## Step 3: Removed cases and their replacements

The rule (design Decision 4): a case is removed only if the suite asserts everything it asserts.

| File | Tests before | Tests after | Removed | Replaced by (`adapter-contract.test.ts`) |
|---|---|---|---|---|
| `adapters-no-hidden-retries` | 35 | 5 | The six adapter calls × five answers (503, 429 with `Retry-After`, 408, 400, network error) | Each operation's HTTP 503, 429 (now with `Retry-After`), 408 and 400 cases, and "a refused connection": all assert one request |
| `voice-provider` | 39 | 26 | HTTP 408, 429, 500, 502, 503, 504 transient; "not JSON is transient". The seven not-retryable statuses become one case that checks the reason names the status | `elevenlabs-voice synthesize`: HTTP 4xx and 5xx cases, "a malformed 200 body" |
| `alignment-provider` | 21 | 8 | HTTP 400, 401, 403, 404, 422 not retryable; 408, 429, 500, 502, 503 transient; network error transient; exactly one request; the "not JSON" invalid-output row | `elevenlabs-alignment align`: the status cases, "a refused connection" (transient, no mark), "a malformed 200 body" (invalid-output) |
| `visual-instructions` | 28 | 16 | The same two status lists; network error transient without the mark; exactly one request | `openai-reasoning generate`: the status cases, "a refused connection" (transient, no mark) |
| `image-provider` | 39 | 29 | HTTP 400, 401, 403, 404, 422; 408, 429; 500, 502, 503. Their reason wording stays covered by the status loop in `image-provider-queue.test.ts` | `fal-image submit`: the status cases |
| `video-provider` | 31 | 29 | "submit: 403 not retryable", "submit: 408 transient" | `runninghub-video submit`: HTTP 403 and 408 |
| `image-provider-queue` | 23 | 23 | none: every case checks more than the classification | n/a |

What stayed even though it involves classification:
- The network-error and time-limit cases that check reason wording (voice, alignment, reasoning, image, video).
- Wrong-shape JSON bodies, such as `{ unexpected: true }` and missing fields.
- The reference-image statuses, `Retry-After`, queue addresses and RunningHub error envelopes.

## Commands Executed

All runs used literal scratch paths, so `backend/data/` and the local `.secrets.json` were never used:

- `DB_PATH=<scratch>/full/db.sqlite PROJECTS_ROOT=<scratch>/full/projects SECRETS_PATH=<scratch>/full/secrets.json npx vitest run <the eight files above>`, with `secrets.json` set to `{}`
- The same environment with `npx vitest run` (the full suite)
- `npm run typecheck` and `npm run lint`
- `npx vitest list <file>` in this branch and in a temporary worktree at the commit before the removals, for the counts above. The worktree was removed afterwards.

## Unit Test Results

- **Targeted (8 files):** 239 passed, 0 failed.
- **Full suite:** 211 files passed and 6 skipped; 2716 passed, 12 skipped, 0 failed. Runtime 151 s.
  - The skipped files are the real-provider contract tests and `subtitles-real-ffmpeg`.
  - 2716 = 2693 (after JOS-262) + 103 new − 80 removed.
- **Typecheck and lint:** pass.
- **Coverage:** no coverage provider is installed. Every removed case has a suite case for the same adapter, operation, answer and classification (table above), so the adapter lines they ran are still run.

## Database State Verification

- **Pre-test (`backend/data/`):** `skeleton.sqlite` has 5 profiles and 1 run, profile rows sha256 `82f3ef424f3ac688…`; `store.sqlite` sha256 `e3b0c44298fc1c14…`; `projects/` has 1 entry.
- **Post-test:** identical.
- **State restored:** not needed.

## Outcome

- Steps 1–4 status: PASS
- Blocking issues: none
