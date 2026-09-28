# Step 3 — Verify the Video Provider (RunningHub)

**Change:** define-provider-configuration (JOS-165)
**Date:** 2026-09-27
**Branch:** `feature/jos-165-define-provider-configuration`

Resumed per the step-1 report's instruction, once `backend/.secrets.json` held real
credentials for Fal.ai, RunningHub, ElevenLabs and OpenAI. This report covers task group
3 only: the video provider, verified first because other values (segmentation lower
bound, §7.2) derive from it.

## Provider and model selected for this test

RunningHub was already the chosen video provider (step-1 report, task 1.2). RunningHub
hosts many third-party models; no specific one had been chosen yet. Selected **MiniMax-H3
(Hailuo-03)** via `POST /openapi/v2/minimax/hailuo-h3/image-to-video` — a documented,
general-purpose image-to-video model with a clear parameter schema (`prompt`,
`resolution`, `duration`, `firstFrameUrl`), as opposed to RunningHub's older
ComfyUI-webapp flow (`ai-app/run` + `nodeInfoList`) which needs a pre-published custom
workflow this project doesn't have. Confirmed empirically, per Decision 2, rather than
assumed from documentation, since third-party docs for this API were inconsistent (mixing
the legacy `.cn` webapp flow with the newer `.ai` Bearer-auth model flow).

Test image: a locally generated 640×360 (16:9) gradient PNG, uploaded via
`POST /openapi/v2/media/upload/binary`, not sourced from the (not-yet-verified) image
provider — video capability does not depend on where the reference image came from.

## 3.1 — Capability call

Called successfully at both tested durations (5s and 15s, see 3.2). Task flow confirmed:
submit (`POST .../image-to-video` → `taskId`, `status: QUEUED`) → poll
(`POST /openapi/v2/query` with `taskId`) → `status: SUCCESS` with a `results[0].url` to
the MP4. Bearer auth with `RUNNINGHUB_API_KEY` worked for both the upload and model
endpoints — the "Enterprise-Shared API Keys" restriction some docs mention did not block
this key.

## 3.2 — Admitted duration set and maximum

Tested both ends of the range the (third-party) docs claimed:

| Requested | Result | Output duration (ffprobe) |
|---|---|---|
| 5s | accepted | 5.17s |
| 15s | accepted | 15.08s |

Both honored almost exactly (a small ~0.1s tail is normal encoder padding). **Recorded
as tested values, not the documented range**: 5s and 15s both work; intermediate values
were not individually tested (integers in between were not probed — the docs claim any
integer 5–15 is valid, but that specific claim is unverified). No rejection response was
observed at either boundary, so this call does not by itself prove 4s or 16s are
rejected — only that 5 and 15 are accepted.

## 3.3 — Output resolution and frame rate vs. D08

| Setting | Resolution | Frame rate | Codec |
|---|---|---|---|
| `768P` | 1344×768 | 24 fps | H.264 / AAC |
| `2K` | 2560×1440 | 24 fps | H.264 / AAC |

**Neither resolution tier is D08's expected 1920×1080, and frame rate is fixed at 24 fps
regardless of tier** (D08 expects 30 fps). Codec matches (H.264/AAC).

This is recorded as a finding for `define-media-assembly` (JOS-182), not as a §11
video-stage capability failure (task 3.6): §11's table states the video stage's required
capability is "animate a reference image with a requested duration within its
capabilities" — resolution and frame rate are not part of that stage's capability
statement. D08's 1920×1080@30fps is a property of the **final assembled MP4** (§7.3),
which the assembly pipeline already normalizes to a hardcoded target (it applies
speed-adjustment per clip regardless of the source clip's native duration). This spike
records that assembly must also normalize resolution and frame rate — RunningHub's
Hailuo-H3 clips arrive at neither — since nothing upstream of assembly will produce
1920×1080@30fps natively.

## 3.4 — Version identifiers and retirement exposure

Hardcoded identifier: the endpoint path itself, `/openapi/v2/minimax/hailuo-h3/image-to-video`.
RunningHub's v2 Model API versions models by path rather than a separate version
parameter — there is no version query param or field observed in the request or response
schema to pin independently of the path.

**Exposure**: if RunningHub retires or renames this path (e.g. superseded by a
`hailuo-h4` equivalent), calls fail outright with no fallback — §11.2 confirms no
provider switching exists in the MVP. Review trigger: periodically check RunningHub's
model catalog for a deprecation notice on this path before it starts failing in
production.

## 3.5 — Availability

Three real calls made this session (5s/768P, 5s/2K, 15s/768P), all succeeded with no
transient errors, no queueing delays beyond generation time, and no rate-limit responses.
This sample (n=3) is too small to characterize uptime and no public SLA was found in
RunningHub's documentation. Per Decision 9, availability matters heavily here because
§11.2/D03 keep a stage retrying the same provider indefinitely with no failover — this
spike surfaces no evidence of a problem, but also cannot rule one out from three calls.

## 3.6 — Capability conclusion

**Met.** The §11 video-stage capability (animate a reference image at a requested
duration, within hardcoded admitted values) is demonstrated at both tested boundaries.
No escalation needed for task group 3; the resolution/frame-rate mismatch from 3.3 is
handed off as a finding for the assembly pipeline, not a rejection of this provider.

## Spend

| Call | Setting | Cost |
|---|---|---|
| 1 | 5s / 768P | $0.385 |
| 2 | 5s / 2K | $0.600 |
| 3 | 15s / 768P | $1.155 |
| **Total** | | **$2.140** of the $20 ceiling |

Evidence videos and the uploaded reference image are kept in the session scratchpad, not
committed to the repository (they are throwaway test artifacts, not project assets).
