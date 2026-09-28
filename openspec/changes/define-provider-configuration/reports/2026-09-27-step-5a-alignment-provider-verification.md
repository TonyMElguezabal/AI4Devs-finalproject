# Step 5a — Select the Alignment Provider

**Change:** define-provider-configuration (JOS-165)
**Date:** 2026-09-27
**Branch:** `feature/jos-165-define-provider-configuration`

## 5.1 — Shortlist

ElevenLabs also offers a Forced Alignment API (`POST /v1/forced-alignment`), which needs
no new credential and keeps voice + alignment on a single vendor. Shortlisted as the sole
candidate for the same reason voice was: no other alignment credential is held, and this
one is directly available under the already-verified `ELEVENLABS_KEY`.

## 5.2 — Real alignment run

Aligned the task-4.2 MP3 (George voice, 9.43s, 142-char script) against its known script
text via `POST /v1/forced-alignment` (`file` + `text` multipart fields). Returns
per-character and per-word timings plus a per-word confidence (`loss`) score.

**Partition check (§7.3, AC19 — contiguous, non-overlapping, second 0 to full
duration):**

| Check | Result |
|---|---|
| Starts at second 0 | **No** — first character starts at 0.10s |
| Ends at full duration | **No** — last character ends at 9.16s; audio duration is 9.43s |
| Non-overlapping | Yes |
| Contiguous (each char's start == previous char's end) | **No** — small gaps exist between some adjacent characters |

**Finding**: raw forced-alignment output is **not** already the partition §7.3/AC19
requires. This is consistent with — not a contradiction of — the PRD's own §7.3 note
that silence allocation is pending D11's POC: the decomposition stage is expected to
extend the first interval back to 0, the last interval forward to the full duration, and
allocate internal silence gaps between chunks per whatever rule D11 settles, rather than
treating raw provider timestamps (native or forced-alignment) as already partitioned.
Recorded here so D11 and the decomposition story build against a real observed gap
shape, not an assumption that alignment output arrives pre-partitioned.

## 5.6 (partial) — Alignment provider selected

**ElevenLabs** (`POST /v1/forced-alignment`). No rejected candidates — no other
credential held. $0 incremental spend (Creator subscription already covers usage;
forced-alignment billing was not separately itemized in this test but consumed no
additional character quota beyond what TTS already tracks).
