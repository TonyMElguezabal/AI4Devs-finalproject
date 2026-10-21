# Step 6.15 — B+ against the real R2 bucket, from a local container

> Files under `poc/` cited here for options A and B+ were removed on 2026-10-13 after Decision 14; they are in git history at commit `926f9a0` (`poc/RESOURCES.md`).

Date: 2026-10-13. Image `vid4you-poc-bplus` (linux/arm64, Colima), `--cap-add SYS_ADMIN --device /dev/fuse`, bucket `vid4you-poc-data` in the real account. **No Cloudflare compute was used**; Workers Paid is not active. Providers stubbed, assembly through real ffmpeg, `quick-scene` for the missing decomposition hand-off.

## Stand-ins
- `preload.ts` registers assembly and stubs (as in the A proof of concept).
- **New:** `preload.ts` replaces `fs.linkSync` with an exclusive copy when the mount answers `EPERM` (see finding 1).
- Local Docker FUSE capabilities stand in for Cloudflare's FUSE support (documented as supported, not verified here).

## Findings

| # | Finding | Evidence |
|---|---|---|
| 1 | **R2 FUSE has no hard links, and the backend publishes every project file with `linkSync(tmp, final)`.** Without a change, every file write fails: session creation returned `500` (`EPERM ... link '.../script.txt.<uuid>.tmp'`, tigrisfs `CreateLinkOp: function not implemented`). Sites: `db.ts:624`, `db.ts:675`. | container log |
| 2 | FUSE supports the alternatives: exclusive create (`wx`, second attempt `EEXIST`), `rename` (including over an existing file), and `ffmpeg` writing an MP4 straight onto the mount, with and without `+faststart` (64,096 B, 5.0 s, readable). | probe in container |
| 3 | With the stand-in, the whole stubbed pipeline ran on the mount: script, voice-over, timestamps, scene image and clip, `final-video.mp4` all appeared under `/mnt/r2/projects/...`; download `200`, 58,205 B. | run |
| 4 | Litestream replicates to R2: first snapshot 320 ms, WAL segments about 330 ms each, `lag` about -0.6 s while quiet. | log |
| 5 | **Graceful stop (SIGTERM, `docker stop`) loses nothing**: stopped in 0.6 s after the session reached `final-video`; a fresh container restored the database (snapshot and WAL about 1 s) and served the session and the MP4 (byte-identical to the original download). | run |
| 6 | **A hard kill (SIGKILL) immediately after a session finishes loses it entirely** (session `404`, download `404`); sessions older than a few seconds survived. Replication is asynchronous, so the recovery window is "the last few seconds". | run |
| 7 | The container became healthy 3-5 s after start including mount and restore, with a tiny database. Restore time scales with database size (not measured at scale). | run |

## What this answers
- **Unknown 2 (media durable at file close):** yes on the mount, with one code change (finding 1). Files written before a kill were present after it.
- **Unknown 3 (recovery window):** zero on graceful stops, a few seconds on a hard kill. Cloudflare's documented stop path (deploy rollout, inactivity, destroy) is SIGTERM then up to 15 minutes, so graceful is the normal case; SIGKILL happens on a crash or host loss, which the platform says can happen "on an irregular cadence".
- **Unknown 1 (unattended progress):** not answered here; it needs the Cloudflare instance (task 7.14).

## Not done
- Behaviour at scale (database size, many media objects, large MP4 uploads to R2).
- Real Cloudflare Containers FUSE and the Durable Object keep-alive.
