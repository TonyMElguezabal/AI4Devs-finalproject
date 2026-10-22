# Move a failed stage to the current active provider

Linear-Issue: JOS-172

## Why

A stage binds to a provider on its first attempt and keeps it for every retry (JOS-171). When that provider stays unavailable (an outage, a retired model, a key that no longer works), the stage fails and every retry goes to the same provider, so the session is blocked until the provider recovers, even though the Administrator has since chosen a working one (JOS-171) or added one (JOS-218). US-36 lets the Administrator move that failed stage to the current active provider from `/admin`, so the session can continue without regenerating anything that already succeeded.

## What Changes

- **Failed stages are listed on `/admin`.** A new section "Failed stages" lists every failed stage whose provider is not the current active provider of its stage type: the session, the stage (voice, reasoning, alignment, image, video) and the scene for image and video, the provider it is bound to, the active provider, and the cause of the failure.
- **A "Move to the active provider" action** rebinds that one stage instance to the provider that is active at that moment. It changes the binding only: it sends nothing and does not retry. The User then retries the stage with the existing retry controls, and the retry goes to the new provider.
- **Retries after a move use the new provider.** A manual retry of a session-level stage today copies the provider of the latest failed attempt; it now takes the stage's current binding, so a moved stage retries on the new provider.
- **A moved video stage re-chooses its clip duration.** The requested duration is chosen again from the new provider's admitted durations (the smallest speed change, PRD §7.2), and its duration warning, speed factor and speed-factor warning follow. The chunk and its narration interval stay unchanged. This is the one operation allowed to change those four stored values, and only for a failed clip with no committed result.
- **Completed results are kept:** the voice-over, the narration timestamps, the chunks, images and clips already produced are never regenerated or invalidated, and a stage that did not fail is never moved.
- **Admin API:** `GET /admin/failed-stages` and `POST /admin/failed-stages/to-active-provider`, behind the Administrator password from JOS-173.
- **Not changed:** no automatic switching, ever: a move is always an explicit Administrator action. A stage already on the active provider is not listed. A failure that offers no manual retry is not listed (see design Decision 3).
- **PRD change** (v1.15, after JOS-218's v1.14): §11.2 states the move (it replaces "keeps retrying that same provider until it recovers" for the Administrator's explicit action) and the exception to "a chunk's requested duration and speed factor never change"; §2.1 and §2.3 move this tool from "later stories" to built. Needs the product owner's approval before merge.

## Capabilities

### New Capabilities

- `failed-stage-move`: which failed stages are listed, who can move one, what a move changes (the binding, and for a clip the requested duration and what derives from it), what it never changes, and that the next retry uses the new provider.

### Modified Capabilities

- `active-provider-selection`: "Bound stages keep their provider for every retry" gains the one exception, an explicit move by the Administrator.
- `clip-duration-request`: "The requested duration is stored with the chunk and never changes" and "The speed-adjustment factor is stored with the chunk and never changes" gain the same exception, and their store-level refusal of any other update stays.

## Impact

- **Depends on JOS-171 and JOS-218** (merged): the active provider, the profiles and the admitted durations of the active video provider. PR #89 (archive of JOS-218) is not required.
- **Backend:**
  - A failed-stage finder and a move command (one module), and two routes in the `/admin` plugin.
  - A database function that rebinds a stage and, for a clip, replaces the four duration and speed values in one transaction that lifts and recreates the lock triggers, the way `resetAll` lifts the delete locks. No new column or migration.
  - `startNewCycle` takes the provider of the stage's binding when it has one.
- **Frontend:** the "Failed stages" section on `/admin`.
- **API docs:** `docs/api-spec.yml` gets the two routes. `docs/data-model.md` gets the exception to the locks. `docs/backend-standards.md` documents the single lock-lifting function.
- **No change** to completed results, recorded attempts (a moved stage's earlier attempts keep the provider they ran on) or sessions with no failed stage.
