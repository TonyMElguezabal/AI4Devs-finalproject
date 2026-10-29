## Why

Three of the five per-stage request caps rest on no measured limit. The ElevenLabs caps (voice 3, alignment 2) add up to the Creator-tier limit of 5 concurrent requests from ElevenLabs' documentation, which nobody has checked against the real account. The RunningHub cap (video 3) is the highest concurrency tried in JOS-165 step 8.2, not the account's ceiling. JOS-188 asks for real numbers and, if they differ, caps derived from them.

JOS-188 was written when these caps were still `undetermined`. JOS-167 (`limit-provider-requests-per-stage`, archived 2026-10-19) has since given them numbers, so this spike checks those numbers instead of filling a gap.

## What Changes

- Probe ElevenLabs with short concurrent text-to-speech and forced-alignment calls (5, 6 and 7 at once, then mixed voice + alignment), and record where `429` responses start and what the concurrency headers report.
- Probe RunningHub with concurrent 5-second image-to-video jobs, stepping 4 → 6 → 8 and stopping at the first queueing, error or slowdown, with a spend ceiling.
- Write one report per provider with the raw results, the derivation of each cap and a recommendation (keep / raise / lower). Record time spent and money spent.
- If a measured number changes a cap, update `maxSimultaneousRequests` in `backend/config/settings.default.json`, the source comment in `backend/src/config/providers.ts`, `backend/test/providerConfig.test.ts` and the `provider-request-limit` spec. If no number changes, no code changes.
- Amend ADR 0005 with the measured limits (DoD: "ADR created if applicable").

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `provider-request-limit`: the voice, alignment and video caps must be backed by a recorded measurement, not only by documentation or the highest level tried. The cap values change only if the probes show they should.

## Impact

- **Code**: `backend/config/settings.default.json`, `backend/src/config/providers.ts` (comment only) and `backend/test/providerConfig.test.ts`, each only if a cap changes. No new module, no new dependency. The probe scripts are throwaway files under the change folder, not product code.
- **APIs**: none. `GET /admin/settings` shows whatever the defaults become.
- **Docs**: ADR 0005 (request-cap section), `docs/development_guide.md` if a default it quotes changes.
- **Cost**: RunningHub ≈ $0.39 per call (JOS-165 price; re-check before probing), at most 18 calls, hard ceiling $10. ElevenLabs uses a few hundred characters of the Creator quota.
- **Limit of the result**: the numbers hold for the tested accounts (ElevenLabs Creator, RunningHub `SHARED`). Installs on other tiers keep the existing `maxSimultaneousRequests` override in `settings.json`.
