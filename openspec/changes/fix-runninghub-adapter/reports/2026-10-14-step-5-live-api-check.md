# Step 5 — live API check of the fixed adapter (fix-runninghub-adapter, JOS-196)

- Date: 2026-10-13/14 (UTC evening)
- Script: a throwaway TypeScript file importing `createRunningHubVideoProvider` from this branch (not committed), the key read from a mode-0600 credentials file in the product's data folder, a 1920x1088 PNG made by ffmpeg. The key is not printed anywhere in this report.

## Before the fix (plain requests, same account, same minute)
| Request | Answer |
|---|---|
| upload, raw body (`application/octet-stream` or `image/png`) | HTTP 200, `errorCode "1000"`, "Unknown error, please retry or contact support" |
| upload, `multipart/form-data` field `file` | HTTP 200, `{code:0, msg:"success", data:{type, download_url, fileName, size}}` |
| upload, no `Authorization` header | HTTP 200, `{code:1602, msg:"HEADER_API_KEY_NOT_FOUND"}` |

## After the fix, through the adapter
| Check | Result |
|---|---|
| 5.1 one 5 s clip (`"Small boats rest by an old pier at dusk, a slow gentle camera pan"`, 2K) | `submitted` immediately; `pending` from t+1 s; **`success` at t+344 s**; download 1,584,951 B; `ffprobe`: h264 **2528x1440**, 24 fps, plus aac, **5.167 s** |
| 5.2 poll of a malformed task id (`0000000000000000000`) | `failed_transient`, reason "polling failed: must be greater than 0 (error 1007)" |
| 5.2 submit with a body that is not an image | **accepted**: RunningHub took the bytes and created a task (`submitted`, a request id). RunningHub does no content check at upload; the clip stage's own checks do not cover a corrupt first frame, which the product never produces (the image stage validates dimensions) |

## Findings
1. **Generation took 344 s for a 5 s clip at 2K.** `PER_PHASE_MAX_TIME_SECONDS.video` is **240 s** (measured 141-159 s when JOS-165 recorded it). With the current service, a clip would be timed out and retried, each retry creating another billable task; the late result of the first attempt is accepted only if it arrives before the cycle is exhausted. A single sample, but 43% over the limit. Raising or re-measuring the limit is a product decision (PRD §10.1) outside this change; it is recorded for the product owner.
2. The adapter's earlier failure reason was lost: attempts 1-4 ran back to back in about one second and the reason is not stored on the provider request row (out of scope here).
3. The `usage` field (cost) is returned by the query answer but is not part of the port; the cost of this clip was not recorded.
