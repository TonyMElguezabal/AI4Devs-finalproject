# Step 5 — short real-provider run (JOS-203 B4)

- Date: 2026-10-20 (15:20–15:30 UTC)
- Build: `origin/feature/entrega-2-JAME` at `d8a16aa1` plus the B5 commit, backend run with `node src/server.ts` (development mode), real providers (OpenAI, ElevenLabs, Fal.ai, RunningHub), isolated `DB_PATH` and `PROJECTS_ROOT`.
- Driven through the API (`POST /sessions`, then polling `GET /sessions/{id}`). **No browser was used**, so this run does not replace the UI check the original tasks mention.
- Script: three sentences, 40 words, English ("A lighthouse keeper climbs…"). Session `01M5CYCAHPAWMG7SY4QYS7APJE`.

## Result

The session reached `final-video` with **one attempt per stage and no retry, timeout or failure**.

| Stage | Provider | Time | Attempts |
|---|---|---|---|
| Voice-over | ElevenLabs | 2.8 s for 17.46 s of narration | 1 |
| Timestamps | native | instant | 1 |
| Decomposition | OpenAI `gpt-6-astra` | 21.4 s, 2 scenes | 1 (the session reports 1; the attempts table numbers it sequence 2, not investigated) |
| Images | Fal.ai | 9.2 s each, in parallel | 1 each |
| Clips | RunningHub | **scene 1: 300.8 s (6 s requested); scene 2: 538.1 s (11 s requested)** | 1 each |
| Assembly | ffmpeg | 10.3 s | 1 |

Whole session: 9 min 50 s, almost all of it the video stage (cap 3 in flight; both clips ran in parallel).

Clip times against the earlier samples: 11 s took 538 s here and 538 s / 485 s on 2026-10-14; a 6 s clip took 301 s (5 s took 344 s on 2026-10-14). Both are under the 600 s limit. **Not sampled again: 14 s clips**, which exceeded 600 s on 8 of 8 uncut attempts on 2026-10-14. The 600 s limit still does not cover them, and 15 s is admitted.

## Output checks

- `final-video.mp4`: H.264, 1920×1080, 30 fps, duration 17.477 s against a 17.461 s narration.
- Scene speed factors 1.031 and 1.025; no duration warnings.
- Narration intervals partition the audio (0–6.188 s, 6.188–17.461 s).
- Credentials were read from `backend/.secrets.json`; nothing was written to the repository.

## Findings

1. **The final MP4 carries MP3 audio, not AAC.** PRD §7.3 says "H.264 video and AAC audio"; the unedited build muxes the voice-over with `-c:a copy` (`ffmpegAssemblyTool.ts`, ADR 0005 Decision 4b: never re-encode), so the audio stream is `mp3` at 44.1 kHz mono. Only the edited-narration path (JOS-190 rebuilds) re-encodes to AAC 192k. One of the two needs a decision: change the PRD wording or re-encode. Not changed here.
2. The 600 s video limit stays provisional until a 14–15 s clip has been timed.
3. Follow-up story (task 9.3): a timed-out clip keeps being polled instead of being resubmitted, so one scene costs one task. See the task list.
