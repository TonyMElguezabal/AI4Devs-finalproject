# Step 1: narration-edit spike and gate (JOS-190, adjust-scene-pause)

Date: 2026-10-15. Base `9c78fe0` (`origin/feature/entrega-2-JAME`). ffmpeg/ffprobe 8.1.2 (Homebrew), macOS.

## 1.1 Gate: the base still matches design.md § Context

| Assumption | Where | Result |
|---|---|---|
| Assembly maps stored intervals to clips and refuses when a final video is recorded | `orchestrator.ts` `runAssemblyAttempt` (`const interval = scene.narrationInterval!`; `if (run.finalVideoPath \|\| … in-flight)`) | holds |
| The adapter muxes the narration with `-c:a copy` | `ffmpegAssemblyTool.ts` | holds |
| Interval, requested-duration and speed-factor columns have lock triggers | `db.ts` `LOCKED_SCENE_INTERVAL_COLUMNS`, `…DURATION_REQUEST_COLUMNS`, `…SPEED_FACTOR_COLUMNS` | holds |
| Speech spans can be recomputed from stored data | `sentenceTimings.ts` `sentenceSpeechSpans`, `unitBoundaries` exported | holds |

`origin/feature/entrega-2-JAME` had not moved (0 commits behind).

## 1.2 Spike: cut and insert silence in the narration, encode once

### Deviations from the task text (recorded, not hidden)

- **No real voice-over was available.** There is no ElevenLabs audio on disk (the stored project folders hold only stub or empty files) and no provider credential in this worktree. The input is **speech synthesized by macOS `say`** with deliberate pauses (`[[slnc 2600]]`, `[[slnc 400]]`, `[[slnc 1200]]`), encoded as **44.1 kHz mono 128 kbps MP3**, the format the narration is stored in. Pauses were located with `silencedetect` (`-40 dB`, 0.3 s), not from provider timestamps.
- The committed JOS-182 fixture voice-over (`voice-over.m4a`, AAC, 14.4 s) is a tone with no silences, so it was used only for the AAC→AAC duration check.

### Method

One `ffmpeg` filtergraph per case: `atrim`/`asetpts` for each kept segment, `anullsrc` (same rate and layout) for each insertion, `concat`, encoded once with `-c:a aac -b:a 192k`. Cuts and insertions sit at the pause's midpoint. Duration was read from the stream; pause positions were re-detected on the edited file; the file was muxed with a frame-exact H.264 track (`-frames:v round(duration × 30)`).

### Results

| Case | Expected | Measured | Error |
|---|---|---|---|
| Source MP3, three pauses at 4.32-7.12 s, 9.34-9.94 s, 15.23-16.66 s | | | |
| – trim 1.5 s, insert 1.0 s, trim 0.6 s (net −1.1 s): duration | 17.0546 s | 17.0540 s | 0.6 ms |
| – next speech starts after pause 1 / 2 / 3 | 5.6249 / 9.4430 / 15.5576 s | 5.6249 / 9.4430 / 15.5576 s | < 1 ms |
| – edited audio vs 512-frame video (17.0667 s) | within 1 frame (33.3 ms) | 12.7 ms | pass |
| – baseline, no edits, MP3 `-c:a copy` vs 545-frame video | within 1 frame | 12.1 ms | pass |
| Extreme edit: pause 2.805 s trimmed to 0.2 s (cut 2.605 s) | 15.5495 s total, 0.2 s pause kept | 15.5490 s, pause 0.200 s | 0.5 ms |
| 20 separate 0.1 s cuts | 16.1546 s | 16.1540 s | 0.6 ms (constant, not growing with cut count) |
| AAC fixture, one 0.7 s cut (AAC → AAC) | 13.7000 s | 13.7000 s | 0 |
| AAC fixture re-encoded with no edit (ADR 0005 Decision 4b's case) | 14.4000 s | 14.4000 s | 0 |

### Conclusion

The AAC path passes the gate: edited narration stays within 1 ms of its expected duration, edited and baseline audio-versus-video differences are the same (12-13 ms, the frame-rounding remainder), and error does not grow with the number of cuts. **Design Decision 5 stands (AAC path); the MP3 frame-snapped splice fallback is not needed.**

### Caveats

- ADR 0005 Decision 4b reported a 7-11 ms drift from re-encoding an AAC source. That did **not** reproduce here on ffmpeg 8.1.2, even AAC→AAC with no edit. Possibly version-specific, or a `format=duration` container artefact (the ADR's own methodological note). The build-time measurement guard (fail when audio and video differ by more than one frame) is kept regardless, and the ffmpeg version used by the packaged app should be recorded with the ADR amendment (task 13.3).
- Pauses came from `silencedetect`, not from provider timestamps. In the product the cut is placed from the stored timestamps' pause midpoint; the spike shows only that cutting and inserting at a silence midpoint is sample-accurate and in sync.
- The synthetic speech is not ElevenLabs output. The encode of real speech is expected to behave the same (the filtergraph is content-independent), but it was not observed.

## 1.3 Real-narration pauses (from JOS-142's recorded survey)

No new real session was available, so this uses JOS-142's survey of real ElevenLabs narration (`openspec/changes/archive/2026-10-02-decide-silence-allocation/reports/2026-09-29-step-2-pause-survey.md`: four scripts, English and Spanish, native and forced-alignment timestamps, 26 pauses).

- **Pauses: 0.04-1.26 s**, average 0.59 s (native) / 0.78 s (alignment). The longest was 1.26 s, well under the 3.0 s cap.
- **Speed-factor clamp: binds on none of them.** A scene's floor is raised above 0.2 s only when `C/2 − S > 0.2`, i.e. when its pause exceeds its own speech by more than 0.4 s (with `C` ≈ `S + pause`). Segmentation guarantees every interval is at least 5 s and these pauses are ≤ 1.26 s, so the clamp does not narrow a real scene; it is a safeguard for unusually long pauses (JOS-142's "3 s starts dragging" cases) and for the last scene.
- **Consequence for sizing:** on real data the dial is a rarely needed fine-tune with the full 0.2-3.0 s range available. No change to the range rule is needed; the clamp stays because it is what keeps the limit guaranteed rather than assumed.
