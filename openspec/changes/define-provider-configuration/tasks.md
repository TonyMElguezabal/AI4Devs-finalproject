# Tasks — Define the hardcoded providers and parameter values

Timebox: 3 working days (the ticket estimates M: five stages, each verified by calling it). Values not settled inside the timebox are recorded as provisional with the dependency that settles them, rather than guessed.

This change calls real providers with real credentials — the first in the project to do so. Task 1.1 sets the spend ceiling before any call is made, and task 2.1 verifies the credential path before any key is used.

## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Create feature branch `feature/jos-165-define-provider-configuration` from `main`
- [ ] 0.2 Verify branch creation and current branch status

## 1. Gate: Collect the inputs and set the limits

- [ ] 1.1 Set the spend ceiling for the spike and record it before any provider is called (Decision 10)
- [ ] 1.2 Take the image and video providers as decided — credentials are already held for both — and verify them against §11 rather than re-evaluating them (design open question 1)
- [ ] 1.2a Record whether the image and video keys belong to the same provider account, since stage rate limits are an account property and two stages sharing one account cannot have their caps derived independently (Decision 6)
- [ ] 1.3 Take the acceptable speed-factor limit from `define-media-assembly` (JOS-182), or record that it is unsettled and the value will be provisional (design open question 2)
- [ ] 1.4 Re-check the reasoning capability reference in §11 against the current model line, and record what it was compared against (design open question 3)
- [ ] 1.5 Record what is still undecided at this point, so later conclusions can be traced to what was known

## 2. Verify the credential path before using it

- [ ] 2.1 Confirm credentials load from the local environment or a local secrets file, and that the secrets file is excluded from version control (§2.1, §11)
- [ ] 2.2 Confirm no credential appears in source, and set up the redaction the evidence capture will use
- [ ] 2.3 Record the check as a task outcome, so the path is verified rather than assumed

## 3. Verify the video provider first, because other values derive from it

The provider is already chosen and its key is held, so this group extracts values rather than comparing candidates. It still gates: a capability §11 requires and this provider cannot meet is a finding, not something to work around.

- [ ] 3.1 Verify the §11 capability by calling it: animate a supplied 16:9 reference image at a requested duration
- [ ] 3.2 Record the admitted duration set and the maximum, as values rather than as a documented range (§7.2)
- [ ] 3.3 Record the output resolution and frame rate it actually returns, against D08's expected 1920×1080 at 30 fps
- [ ] 3.4 Record the version identifiers being hardcoded, and note the exposure if the provider retires them (§11.2)
- [ ] 3.5 Record what is known about its availability, since no failover exists and a stage retries the same provider indefinitely (Decision 9, D03)
- [ ] 3.6 If a required capability is unmet, record it as a finding and escalate rather than weakening the requirement (design open question 5)

## 4. Select the voice provider and settle the timestamp mechanism

- [ ] 4.1 Shortlist candidates against the §11 capability: complete narration as MP3 with preconfigured voice, quality and speed, plus timestamps granular enough to locate every fragment
- [ ] 4.2 Generate a narration from a script containing the structures §6.1 cuts on: multiple sentences, a sentence with clause boundaries, and a sentence with none
- [ ] 4.3 Inspect the returned timestamps and record their granularity (Decision 3)
- [ ] 4.4 Determine whether a sentence boundary can be located from them, and record whether native timestamps are usable in the sense §11.1 requires
- [ ] 4.5 State which of §11.1's two mechanisms applies in practice: native timestamps, or forced alignment as the standing mechanism
- [ ] 4.6 Record the chosen narration voice, quality and speed values
- [ ] 4.7 Select the provider

## 5. Select the alignment and reasoning providers, and verify the image provider

- [ ] 5.1 Alignment: shortlist candidates that derive timestamps by aligning the generated MP3 against the known script (§11.1)
- [ ] 5.2 Align a real MP3 from task 4.2 against its script and confirm the intervals are contiguous, non-overlapping and cover from second 0 to the full duration (§7.3, AC19)
- [ ] 5.3 Image: the provider is already chosen and its key is held, so verify it generates 16:9 images at a minimum of 1920 × 1080 from a text instruction (§7.1), and confirm its output feeds the video provider verified in group 3
- [ ] 5.4 Reasoning: confirm each candidate splits a script faithfully per §6.1 and produces the `IMAGE` and `VIDEO` instructions, without adding, removing, duplicating or paraphrasing narrative content (§4.2, AC03)
- [ ] 5.5 Confirm the reasoning candidate reconstructs the original script exactly when the fragments are rejoined in order (§4.2)
- [ ] 5.6 Select each provider and record the rejected candidates with the reason

## 6. Establish the supported language list

- [ ] 6.1 Draw up the candidate languages, then verify each rather than adopting an advertised list (Decision 4)
- [ ] 6.2 For each candidate language, narrate a real script in it with the chosen voice provider
- [ ] 6.3 For each candidate language, align that narration with the chosen alignment provider
- [ ] 6.4 For each candidate language, confirm the reasoning provider segments it on sentence boundaries correctly
- [ ] 6.5 Record the supported list as the languages that passed all three, and record the languages that failed and where

## 7. Record the failure signals and the rate limits

- [ ] 7.1 For each chosen provider, trigger or observe a rejection that will not succeed on retry, such as a content-filter refusal (§4.1, §10.1)
- [ ] 7.2 Record its exact shape, and what the system will match on to identify it as not retryable (Decision 5)
- [ ] 7.3 Record how a transient failure differs from it, so the two are separable in code
- [ ] 7.4 Record each provider's rate limit and the account tier it belongs to (Decision 6)
- [ ] 7.5 Derive the maximum simultaneous requests per stage, leaving headroom so the 1 + 3 retry budget cannot breach the limit (§10.1)
- [ ] 7.5a Where two stages share one provider account (task 1.2a), derive their caps jointly against the shared limit rather than each against the full limit
- [ ] 7.6 Record the derivation, not only the resulting number, so the value can be re-checked when a tier changes

## 8. Measure the timing values

- [ ] 8.1 Run each stage enough times to see the spread of its latency, rather than timing a single call (Decision 7)
- [ ] 8.2 Measure at least one stage under concurrent load at the request cap from task 7.5, so the limit is not set from the quiet case
- [ ] 8.3 Set each per-phase maximum time above the slow tail, and record the distribution it came from
- [ ] 8.4 Confirm the clock starts when the request is sent, since queue waiting counts neither as a failed attempt nor as execution time (§10.1)
- [ ] 8.5 Take the assembly phase's maximum time from `define-media-assembly`'s measured cost rather than measuring it again here
- [ ] 8.6 Record spend to date against the ceiling from task 1.1

## 9. Derive the remaining values

- [ ] 9.1 Derive the segmentation lower bound from the shortest admitted duration of the chosen video provider (§6.1) — available as soon as group 3 completes, since the video provider is already decided
- [ ] 9.2 Confirm the bound is workable against §6.1.1's edge cases: a whole script below the bound, and a sentence that cannot be split
- [ ] 9.3 Fix the output resolution and frame rate, confirming the image and video providers can feed them (§7.3, D08)
- [ ] 9.4 Fix the acceptable speed-factor limit from task 1.3, marking it provisional if `define-media-assembly` has not landed
- [ ] 9.5 Cross-check the complete set for internal consistency, and resolve any contradiction rather than recording both values

## 10. Write the constants into source

- [ ] 10.1 Create one typed constants module holding every value, with no configuration file and no runtime configuration (Decision 8, §2.3)
- [ ] 10.2 Include the provider and version identifiers for each stage
- [ ] 10.3 Confirm no credential is present in the module

## 11. Review and Update Existing Unit Tests (MANDATORY)

- [ ] 11.1 Confirm which test suites exist at this point, including any added by the sibling changes; record the finding rather than assuming it
- [ ] 11.2 Write the test asserting the constants module matches the values recorded in `docs/PRD.md` §11 (Decision 8)
- [ ] 11.3 Write a test asserting the segmentation lower bound is consistent with the shortest admitted duration
- [ ] 11.4 Write a test asserting the per-stage request maximum plus the full retry budget stays within the recorded rate limit
- [ ] 11.5 Write a test asserting every supported language is one the recorded evidence verified
- [ ] 11.6 Document the test command that runs them

## 12. Run Unit Tests and Verify Database State (MANDATORY)

- [ ] 12.1 Capture the pre-test state of the store used by the harness (counts and key records)
- [ ] 12.2 Run the targeted tests from group 11 and capture the pass/fail summary
- [ ] 12.3 Run the full suite and record totals, failures and runtime
- [ ] 12.4 Verify the post-test state matches the baseline, restoring it if the tests mutated it
- [ ] 12.5 Confirm the tests make no real provider call, so running the suite costs nothing
- [ ] 12.6 Create the report `openspec/changes/define-provider-configuration/reports/YYYY-MM-DD-step-12-unit-test-and-db-verification.md` with commands executed, results, pre/post comparison and cleanup actions
- [ ] 12.7 Mark this step complete only after the tests pass and the report file exists

## 13. Manual Endpoint Testing with curl (MANDATORY - AGENT MUST EXECUTE)

Applicable but pointed outward: this change adds no endpoint of its own, and the surfaces that matter are the providers'. The purpose is to capture each provider's real request and response shape, which is what the recorded values rest on.

- [ ] 13.1 Load credentials from the local environment or secrets file, never inline in a command that would land in shell history or the transcript
- [ ] 13.2 Call each chosen provider with curl and capture the request and response for the capability it was selected for
- [ ] 13.3 Capture the response of a not-retryable rejection and of a transient failure, confirming they are distinguishable as recorded in task 7.2
- [ ] 13.4 Capture the voice provider's timestamp payload, confirming the granularity recorded in task 4.3
- [ ] 13.5 Confirm every captured artefact is redacted of credential material before it is written down
- [ ] 13.6 Record spend for this step against the ceiling
- [ ] 13.7 Save the transcript as `openspec/changes/define-provider-configuration/reports/YYYY-MM-DD-step-13-curl-endpoint-testing.md`

## 14. E2E Testing with Playwright MCP (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 14.1 Record why this step does not apply: this change produces a decision record, a PRD section and a constants module, and adds no user-facing behaviour or screen
- [ ] 14.2 Confirm no UI consumes these values yet, so there is no workflow to drive; the stories that consume them carry their own E2E obligation

## 15. Record the decision

- [ ] 15.1 Write the ADR: the five chosen providers, the rejected candidates with reasons, and the evidence behind each capability claim
- [ ] 15.2 Record the complete parameter set with the provenance of each value — measured, derived, or taken from another change
- [ ] 15.3 Record which timestamp mechanism applies in practice, and what it implies for the decomposition phase (§11.1)
- [ ] 15.4 Record the not-retryable failure signal per provider
- [ ] 15.5 Record the hardcoded version identifiers and the exposure if a provider retires one
- [ ] 15.6 Record any value left provisional, with the dependency that settles it
- [ ] 15.7 Record actual spend per stage against the ceiling

## 16. Update Technical Documentation (MANDATORY)

- [ ] 16.1 Fill in `docs/PRD.md` §11 with the providers and the values, replacing the statement that a spike will define them
- [ ] 16.2 Add the entry to the PRD change log (§16) as a version bump, since the PRD now commits to values it previously deferred
- [ ] 16.3 Update §6.1's lower-bound text and §7.2's admitted-duration text to point at the recorded values rather than at a pending spike
- [ ] 16.4 Confirm §4.1's language list and §14.1's speed-factor check now reference real values
- [ ] 16.5 Note in `docs/backend-standards.md` where the constants module lives and that values are read from it rather than redefined
- [ ] 16.6 Confirm the result stays consistent with what the sibling changes wrote to their standards files, resolving any contradiction rather than layering over it

## 17. Close out

- [ ] 17.1 Notify `define-media-assembly` (JOS-182) of the fixed resolution and frame rate, closing its open question 4
- [ ] 17.2 Notify `define-backend-stack` (JOS-179) that its retry, concurrency and timing experiments can now use real values instead of invented ones
- [ ] 17.3 Record which provider accounts were created for the spike, so any belonging to a rejected candidate can be closed
- [ ] 17.4 Create follow-up items for anything the spike revealed, linked to its epic (JOS-133)
- [ ] 17.5 Record the decision on next steps: proceed, pivot or cancel
- [ ] 17.6 Record time spent, to calibrate future spikes
- [ ] 17.7 Obtain review by at least one human, not only AI agents
