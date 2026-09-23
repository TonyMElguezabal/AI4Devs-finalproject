# Define the hardcoded providers and parameter values

Linear-Issue: JOS-165

## Why

PRD v1.3 §11 states that the provider for each of the five stages and every generation parameter are hardcoded, then says their concrete values "are defined by a dedicated spike and recorded in this section". The section is a list of which values exist, not the values themselves. Until they are filled in, §6.1's segmentation lower bound, §7.2's nearest-admitted-duration rule, §7.3's output format, §10.1's retry and request limits and §4.1's language list are all rules with no numbers, and the stories that apply them cannot be implemented.

Most of these values are not free choices. The lower bound must be consistent with the shortest duration the chosen video provider admits; the language list is constrained by what the voice provider *and* the forced-alignment provider both support; the per-stage request cap must sit below the provider's real rate limit with headroom for the retry budget. Choosing a provider fixes several parameters at once, which is why they belong in one decision rather than five.

## What Changes

- Select one provider per stage — reasoning, voice, alignment, image, video — each checked against its §11 capability requirement, with the rejected candidates recorded. Stages already decided enter as inputs to be verified, not as questions re-opened.
- **Verify the timestamp mechanism empirically** (§11.1): whether the chosen voice provider returns native timestamps, and at what granularity. §6.1 cuts on sentence boundaries, so a granularity too coarse to locate a sentence makes forced alignment mandatory rather than a fallback. §11.1 already names this as a task prior to implementing decomposition.
- **Record how each provider signals a not-retryable failure** distinguishably from a transient one. §10.1 requires that distinction and §4.1 makes a content-filter rejection the canonical case, but no provider's actual error shape has been checked against it.
- Fix the values in dependency order, since several are derived rather than chosen: video admitted durations and maximum → segmentation lower bound; measured provider latency → per-phase maximum times; real rate limits → maximum simultaneous requests per stage.
- Fix narration voice, quality and speed; output resolution and frame rate against D08's expected 1920×1080 at 30 fps with H.264/AAC; and the supported script language list.
- Take the acceptable speed-factor limit from `define-media-assembly` (JOS-182), which measures it; this change fixes the number, that change recommends it.
- Decide **where the constants live in source** and how they are kept from drifting out of step with the PRD, given that §2.3 excludes configuration files and any runtime configuration.
- Verify credentials load from the local environment or a local secrets file and never from the repository (§2.1, §11).
- **Update `docs/PRD.md` §11** with the recorded values, as a PRD version bump rather than an edit in place, and record the spike's own spend.
- No product behaviour ships, and no user-facing capability changes.

## Capabilities

### New Capabilities

- `provider-configuration-foundation`: the guarantees this change establishes about the hardcoded providers and values — one recorded provider per stage verified against its capability requirement, a complete and internally consistent parameter set, credentials that never enter the repository, and a single place in source those values live so the PRD and the code cannot drift apart.

The product behaviours these values govern remain owned by their own stories and will be specified there: US-09 and the segmentation rule, US-15 (recording the speed factor), US-16 (assembly), US-22 (retry budget and per-phase limits), US-37 (the per-stage request limit).

### Modified Capabilities

None. `openspec/specs/` is still empty. The `backend-foundation`, `persistence-foundation`, `frontend-foundation`, `media-assembly-foundation` and `live-updates-foundation` capabilities introduced by the sibling changes are not yet archived, so they are not existing specs this change can modify; all must stay consistent.

## Impact

- **Documentation**: `docs/PRD.md` §11 filled in, which makes this a PRD version bump (§16 change log) rather than a silent edit — the PRD is the product's source of truth and this change alters what it commits to. A new ADR records the provider selection and its evidence.
- **First change to spend real money and use real credentials.** Every sibling change runs against the stubbed provider from `define-backend-stack`. This one cannot: timestamp granularity, failure signalling, latency and rate limits are properties of the real service. The spike's own spend is capped and recorded.
- **Security**: API keys are exercised for the first time. §2.1 requires them to come from the local environment or a local secrets file kept out of the repository. This change verifies that path and confirms no key reaches version control, logs or the recorded evidence.
- **Dependency on `define-media-assembly` (JOS-182)**: its Decision 5 explicitly leaves the speed-factor limit for this change to fix, and warns that two changes fixing the same constant is how they drift. If it has not landed, the limit is recorded as provisional and the dependency stated.
- **Feeds `define-media-assembly`**: its open question 4 asks what resolution and frame rate this change settles on, and its pipeline is proven at that target.
- **Feeds `define-backend-stack` (JOS-179)**: its retry, concurrency-cap and idempotency experiments used invented numbers. Once these land, the cap and the per-phase limits are real.
- **Relationship to D11**: silence allocation is still pending its POC (§14.1), and one of its acceptance checks is that the chosen rule does not push the speed factor above this limit. That check consumes the value fixed here; it does not block fixing it.
- **Downstream tickets**: unblocks every story that applies a bound, a duration, a limit or a language list — the values stop being placeholders.
- **No deployed systems or user data are affected.** Third-party APIs are called for the first time, with scripts written for the spike rather than user content.
