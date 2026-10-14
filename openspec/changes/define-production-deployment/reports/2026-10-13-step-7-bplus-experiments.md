# Step 7 — B+ experiments on Cloudflare Containers

> Files under `poc/` cited here for options A and B+ were removed on 2026-10-13 after Decision 14; they are in git history at commit `926f9a0` (`poc/RESOURCES.md`).

Date: 2026-10-13. `poc-cf.vid4you.download` behind Access (Google identity provider, service token for the experiments), Worker `vid4you-poc`, container `standard-1`, R2 bucket `vid4you-poc-data`. Providers stubbed, real ffmpeg on the FUSE mount, `quick-scene` for the missing decomposition hand-off. `POC_STUB_VIDEO_DELAY_MS` keeps the stub video request pending so a session sits in the video stage.

## Stand-ins
- `preload.ts`: real assembly plus stub providers; **`fs.linkSync` replaced by an exclusive copy on `EPERM`** (R2 FUSE has no hard links; story S14); a probe port 8081 (uptime, log tail) for the experiments.
- Worker `/__poc/{state,stop,kill,uptime,logs}` control routes (behind Access) to drive the instance.
- `sleepAfter` shortened to 2 minutes for the keep-alive pair; 10 minutes otherwise.
- The experiment driver is a laptop whose timers paused while it slept; `caffeinate` was used from the keep-alive pair on, and results are read from the container's own boot time and uptime, not from the laptop's clock.

## Results

| # | Experiment | Result |
|---|---|---|
| 1 | Stubbed session through the gate | `final-video`, download `200`, 56,523 B |
| 2 | SIGTERM stop, then 7 hard kills (`destroy()`) the moment a session finished | 0 of 8 sessions lost, back healthy in 11-20 s |
| 3 | `SIGKILL` / `SIGTERM` while a session is in the video stage (45 s stub delay) | both: the session finished after restart (`reconcileOnBoot`), download `200` |
| 4 | **Keep-alive.** Instance with no request for 11 minutes, `sleepAfter` 2 min, keep-alive on | same process throughout (`uptimeSeconds` 662); log shows `activity expired; renewing instead of stopping` about every 2 min |
| 5 | Control: same, keep-alive off | the instance was restarted (new pid and boot time) |
| 6 | SSE through the edge and the Worker proxy | heartbeat every 15 s held for 170 s (> 125 s read timeout) |
| 7 | **Rollout** (`wrangler deploy` with a changed image) while a session is in the video stage | 3 of 4 valid runs finished (about 188 s each, the instance restarted once or twice during the run); **1 run stayed `chunks-processing` for 15+ minutes and then ended `failed` after 4 attempts; no container log was captured for that run and a plain restart did not recover it.** Cause unknown |

## Findings
1. **The library's `schedule()` chain is not a reliable keep-alive**: `onStart` did not seed it on a fetch-triggered start, chains from earlier boots multiplied, and an instance with the chain on was found restarted after about 46 minutes of idle. Overriding `onActivityExpired()` to renew instead of stop (the library's own hook) kept the instance up with no schedule at all (experiments 4 and 5).
2. **Cloudflare routes only `EXPOSE`d ports**; the probe port needed `EXPOSE 8081`.
3. **Container start is a pipeline**: the instance reaches healthy 11-20 s after a kill or stop.
4. **The sleep timer lags the configured value**: with a 10 minute `sleepAfter`, an idle instance without a keep-alive went inactive about 14.5 minutes after its last request.
5. **The video stage's maximum time is 240 s** (`PER_PHASE_MAX_TIME_SECONDS.video`); a stub delay at or above it turns an experiment into a timeout-retry (this invalidated the first rollout run).
6. The instance list's `STATE` column read `inactive` for a running instance; it is not a sleep indicator.
7. This Mac's resolver cached the hostname's earlier NXDOMAIN; experiments used `curl --resolve`.

## Not done
- A rollout failure cause (experiment 7, one run).
- Behaviour at scale (database size, many media objects, large uploads).
- Real providers on B+ (needs keys), and the allowed-identity browser login.
