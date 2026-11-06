## Why

Since JOS-218 the Administrator manages providers on `/admin`, but each stage ships one adapter type, so a video model hosted anywhere other than RunningHub cannot be added. The owner wants to try MiniMax H3 through Cloudflare Workers AI (`minimax/h3`), the same model family RunningHub runs today (`minimax/hailuo-h3`). JOS-219 is the follow-up JOS-218 named for exactly this: a second real adapter, verified against the live vendor.

## What Changes

- **A live verification spike comes first.** Cloudflare's model page leaves open what the adapter depends on: whether a call returns a task that can be followed later or blocks until the clip is ready, how a task is followed, whether the first frame can be sent as a `data:` URI (the page shows `https://` URLs only, and our scene images are local files), the failure answers, the rate limits and what one clip costs. The spike answers these with a few real 768P and 2K requests and records them in a report. If Cloudflare gives no way to follow a task after a restart, or no way to send a local image, the change stops and is re-planned before any code is written.
- **A new video adapter type, `cloudflare-video`** (vendor "Cloudflare"). It sends the scene's image as the first frame, the `VIDEO` instruction as the text, the requested duration and the 2K resolution to `https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/run`, then follows the task until it ends. Its parameters on `/admin`: the Cloudflare account id, the model (`minimax/h3` by default), and the shortest and longest admitted clip (Cloudflare documents 4 to 15 seconds). The host stays in code, so the token can only go to Cloudflare.
- **The API key is a Cloudflare API token** with the Workers AI permission, entered on `/admin` and stored encrypted like every other key. The account id is not a secret and is a parameter.
- **The video stage builds each profile with its own adapter type.** Today every video profile is built as a RunningHub adapter, whatever its type. After this change the profile's adapter type picks the adapter, through a table keyed by adapter type that does not compile without an entry for each shipped type.
- **The save-time duration rule applies to every video adapter type.** Today it applies only to `runninghub-video`, so the shortest clip of any video profile may not exceed the 5-second segmentation lower bound.
- **A free connection check for `cloudflare-video`**: Cloudflare's token verification. It covers the token, not the account id or the model, and the page says so.
- **Unchanged:** RunningHub stays the seeded and default video provider, the settings files still name only RunningHub, and Cloudflare profiles are added on `/admin` only. Binding, retries, moves, time limits, restart recovery and the reports work as they do for RunningHub.

Non-goals: a generic HTTP adapter described on `/admin`; Cloudflare for other stages; MiniMax's last frame, reference images, video or audio; a resolution or aspect-ratio choice per profile (the assembly expects the 2K frame); webhooks; Cloudflare's AI Gateway features (caching, gateway retries).

## Capabilities

### New Capabilities

- `cloudflare-video-adapter`: how a clip is requested from Cloudflare Workers AI and followed until it ends, how its answers are classified, the parameters and key it needs, and its connection check.

### Modified Capabilities

- `provider-profiles`: a stage builds each profile with the adapter of the profile's own type, and the shortest-duration rule applies to every video adapter type, not only RunningHub.

## Impact

- Backend: `videoProvider.ts` (the new adapter, and a factory per video adapter type in the registry), `providerTypes.ts` (parameter shape, vendor, form), `providerConnectionCheck.ts` (token check), `providerAdmin.ts` (duration rule), the shared adapter contract fixtures, and `stageDiagnostics.ts` (the model a Cloudflare profile shows).
- Frontend: none expected; the `/admin` form is built from `GET /admin/provider-types`.
- API: no new endpoint; `GET /admin/provider-types` lists one more video type.
- Database: none. Profiles already store any adapter type and parameter set.
- Docs: PRD §11.2 and §11.3 (new version), `docs/api-spec.yml` (the new type in the examples), `docs/backend-standards.md` (provider profiles section), the backend README.
- Cost: the spike spends a few clips at $0.08 (768P) to $0.13 (2K) per second on the owner's Cloudflare account, which needs Unified Billing credits loaded. After that, clips cost only when the Administrator makes a Cloudflare profile active.
