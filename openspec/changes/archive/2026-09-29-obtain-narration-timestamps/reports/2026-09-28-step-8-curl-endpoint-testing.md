# Step 8 Report - Manual Endpoint Testing with real providers

- Date: 2026-09-28
- Change: obtain-narration-timestamps (JOS-139)
- Agent: Claude Sonnet 5
- Branch: `feature/jos-139-obtain-narration-timestamps` at `c171422`
- Runtime: Node v26.4.0, the real server (`node src/server.ts`, port 3199) on a **scratch** database and project folder

## How it was exercised

No route triggers the step, by decision, and the voice phase (JOS-136) does not exist yet. So the narrations were made with **two real ElevenLabs text-to-speech calls** (`/with-timestamps`, the recorded voice and model), stored as voice-overs in the scratch database by a script, and the timestamps step was run by a second script against the same database with the **real** forced-alignment adapter (or a stub that fails, for the failure case). The session read went through the real running server. `ffprobe` measured each MP3's duration, as JOS-136's design requires.

## Results

| # | Check | Result |
|---|---|---|
| 8.1 | Start the server; `GET /health` | PASS |
| 8.2 | Two sessions' worth of real audio: a 102-character script (7.34 s) and a 733-character script (56.98 s) | PASS: in both, the provider's native characters reproduced the script **exactly** |
| 8.2 | All four sessions before the step | PASS: `voice-over-complete` |
| 8.2 | S1, native timestamps (the real provider response) | PASS: `native`, 102 characters stored, one `elevenlabs-native` attempt completed as a success, **no alignment call**; the session reads `chunk-decomposing` |
| 8.3 | S2, real forced alignment on the 7.34 s clip | PASS: `alignment`, 102 characters, **826 ms**; `chunk-decomposing` |
| 8.3 | S4, real forced alignment on the 56.98 s clip | PASS: `alignment`, 733 characters, **484 ms**; `chunk-decomposing` |
| 8.3 | S5, native timestamps whose first character is wrong, then real alignment in the same attempt | PASS: `alignment` stored, one attempt with `error_code = native-unusable` and the reason in `error_message`; 363 ms |
| 8.4 | S3, alignment fails (stub, HTTP 503) | PASS: the session reads `failed`, failed phase `decomposition`, retryable; **no** timestamps record; the voice-over row identical before and after; cause: "The narration's timestamps could not be obtained: the alignment provider answered HTTP 503. The script and the narration are unchanged." |
| 8.4 | S3, a second attempt with the real provider | PASS: `alignment` stored, the failure cleared, attempts 1 (transient) and 2 (success), state back to `chunk-decomposing` |
| 8.5 | Raw SQL: update `mechanism`, update `path`, delete the record | PASS: each refused (`locked: narration_timestamps cannot be modified/deleted once obtained`) |
| 8.5 | Raw SQL: a second record for the same session; a mechanism of `guess` | PASS: refused by the primary key and by the CHECK |
| 8.6 | Cleanup | PASS: see below |

### Findings that matter for the next stories

- **The 5 s alignment limit holds well beyond the 9 s clip it was measured on.** A 57 s narration aligned in 0.48 s, a 7 s one in 0.83 s (the first call is slower: connection setup). The risk noted in the design did not materialise at this length. Still one sample per length; a narration of several minutes is untested.
- **Native timestamps are gapless; forced alignment is not.** On the same 102-character script: native starts at 0 s, ends at 7.338 s (the MP3 is 7.34 s) and has no gap between characters (max 0.0 s). Forced alignment starts at 0.1 s, ends at 7.08 s and has 4 gaps over 10 ms, the longest 0.74 s. On the 733-character narration, alignment starts at 0.1 s, ends at 56.64 s of 56.98 s, and has 36 gaps over 10 ms, the longest 1.08 s. So the timestamps stored by this step are **not** a partition of the audio, exactly as JOS-165 predicted: JOS-143 (intervals) and JOS-142 (D11, silence allocation) have to close the gaps.
- **The assumed raw native format was right.** The real `/with-timestamps` response (an `alignment` object with parallel arrays inside the whole response) parsed and passed the exact-text check with no adjustment, for a short and a long script. JOS-136 should store that whole response as the raw file.
- **An attempt's provider names the first mechanism tried.** In S5 the attempt reads `elevenlabs-native` although alignment produced the result; `error_code` and `error_message` record the fallback (design Decision 2). Anyone reading attempts (a future diagnostics view, JOS-166) should read those fields, not only the provider.
- **Cost:** two text-to-speech requests, 835 characters of the account's monthly character quota (about 0.6% of 137,109). Four forced-alignment requests, not itemised separately by the provider.

## Cleanup

- Left by the run: 5 sessions, 5 voice-overs, 5 timestamps records, 6 attempts, 5 project folders, 11 triggers.
- Server stopped (no response afterwards).
- Cleaned through the test-only reset: `resetAll()` printed all counts at 0; afterwards 0 rows, **all 11 triggers present**, 0 project folders.
- The default test store was not touched: 0 rows, 11 triggers, 0 project folders.
- The secrets file was only read through `loadCredential`; its key names are unchanged and no value was printed or written.
- The scratch folder was deleted after this report was written.

## Outcome

- Step 8 status: PASS
- Blocking issues: none

## Transcript

Paths shortened: `$SCRATCH` is the scratch folder, `$B` the server URL. The two text-to-speech lines come from the preparation script's output.

```text
### 8.2 prepare: two real text-to-speech calls (short and long script), four sessions with a stored narration
{"step":"tts-short","ms":2009,"chars":102,"textChars":102,"bytes":118326,"durationSeconds":7.337506,"sameText":true}
{"step":"tts-long","ms":10783,"chars":733,"textChars":733,"bytes":912866,"durationSeconds":56.981769,"sameText":true}
{"step":"sessions","S1_native":"01M3MBEYPKYHJZPT3BF1NCNTC4","S2_alignment":"01M3MBEYPR3N5HFWAD85VR6G5Y","S3_failure":"01M3MBEYPS9VY2T22Q6HSWWNS0","S4_long_alignment":"01M3MBEYPT0EFYKW82FXRJ9CJW"}
### 8.2 the sessions before anything is obtained (voice-over complete, no timestamps)
01M3MBEYPKYHJZPT3BF1NCNTC4
  state: voice-over-complete | failedPhase: None
01M3MBEYPR3N5HFWAD85VR6G5Y
  state: voice-over-complete | failedPhase: None
01M3MBEYPS9VY2T22Q6HSWWNS0
  state: voice-over-complete | failedPhase: None
01M3MBEYPT0EFYKW82FXRJ9CJW
  state: voice-over-complete | failedPhase: None
### 8.2 S1: native timestamps (the real ElevenLabs /with-timestamps response)
{"result":{"ok":true,"mechanism":"native"},"ms":6,"record":{"runId":"01M3MBEYPKYHJZPT3BF1NCNTC4","mechanism":"native","path":"narration-timestamps.json","characterCount":102,"obtainedAt":"2026-09-28T15:52:56.476Z"},"attempts":[{"n":1,"provider":"elevenlabs-native","outcome":"success","errorCode":null}]}
  state: chunk-decomposing | failedPhase: None
stored file (first 3 characters + count):
Curl native 2026-09-28 09-52 -> native 102 [{'text': 'T', 'start': 0, 'end': 0.093}, {'text': 'h', 'start': 0.093, 'end': 0.139}, {'text': 'e', 'start': 0.139, 'end': 0.163}]
### 8.3 S2: real forced alignment, 7.3 s clip, no native timestamps
{"result":{"ok":true,"mechanism":"alignment"},"ms":826,"record":{"runId":"01M3MBEYPR3N5HFWAD85VR6G5Y","mechanism":"alignment","path":"narration-timestamps.json","characterCount":102,"obtainedAt":"2026-09-28T15:54:23.357Z"},"attempts":[{"n":1,"provider":"elevenlabs-forced-alignment","outcome":"success","errorCode":null}]}
  state: chunk-decomposing | failedPhase: None
### 8.3 S4: real forced alignment, 57 s clip (the case the 5 s limit was not measured on)
{"result":{"ok":true,"mechanism":"alignment"},"ms":484,"record":{"runId":"01M3MBEYPT0EFYKW82FXRJ9CJW","mechanism":"alignment","path":"narration-timestamps.json","characterCount":733,"obtainedAt":"2026-09-28T15:54:24.009Z"},"attempts":[{"n":1,"provider":"elevenlabs-forced-alignment","outcome":"success","errorCode":null}]}
  state: chunk-decomposing | failedPhase: None
### comparison of the stored files (same 102-character script, 7.34 s MP3)
native  {'mechanism': 'native', 'chars': 102, 'first_start': 0, 'last_end': 7.338, 'max_gap': 0.0, 'gaps_over_0_01': 0, 'negative_gaps': 0}
aligned {'mechanism': 'alignment', 'chars': 102, 'first_start': 0.1, 'last_end': 7.08, 'max_gap': 0.74, 'gaps_over_0_01': 4, 'negative_gaps': 0}
long    {'mechanism': 'alignment', 'chars': 733, 'first_start': 0.1, 'last_end': 56.64, 'max_gap': 1.08, 'gaps_over_0_01': 36, 'negative_gaps': 0}
### 8.4 S3: alignment fails (stub answering HTTP 503): a decomposition failure, voice-over untouched
voice-over before:|voice-over.mp3|7.337506|118326
{"result":{"ok":false,"reason":"decomposition-failed","failure":{"phase":"decomposition","retryable":true}},"ms":2,"attempts":[{"n":1,"provider":"elevenlabs-forced-alignment","outcome":"transient","errorCode":null}]}
  state: failed | failedPhase: decomposition
voice-over after: |voice-over.mp3|7.337506|118326
timestamps records for S3:|0
failure phase:|decomposition|| retryable:|1
cause:|The narration's timestamps could not be obtained: the alignment provider answered HTTP 503. The script and the narration are unchanged.
### 8.4 S3: retry with the real provider (native timestamps never existed, so it goes to alignment anyway)
{"result":{"ok":true,"mechanism":"alignment"},"ms":354,"record":{"runId":"01M3MBEYPS9VY2T22Q6HSWWNS0","mechanism":"alignment","path":"narration-timestamps.json","characterCount":102,"obtainedAt":"2026-09-28T15:54:40.885Z"},"attempts":[{"n":1,"provider":"elevenlabs-forced-alignment","outcome":"transient","errorCode":null},{"n":2,"provider":"elevenlabs-forced-alignment","outcome":"success","errorCode":null}]}
  state: chunk-decomposing | failedPhase: None
failure after the retry:|NULL
### 8.3 S5: native timestamps that do not match the script, then real forced alignment in the same attempt
session 01M3MBN7G9B6M98JA2KKAD4S8A
{"result":{"ok":true,"mechanism":"alignment"},"ms":363,"record":{"runId":"01M3MBN7G9B6M98JA2KKAD4S8A","mechanism":"alignment","path":"narration-timestamps.json","characterCount":102,"obtainedAt":"2026-09-28T15:55:39.871Z"},"attempts":[{"n":1,"provider":"elevenlabs-native","outcome":"success","errorCode":"native-unusable"}]}
  state: chunk-decomposing | failedPhase: None
attempt:|1|elevenlabs-native|success|native-unusable
error_message:|native timestamps unusable: the timestamps' characters do not reproduce the script
### 8.5 raw SQL against the running database: the stored timestamps record
$ sqlite3 curl.sqlite "UPDATE narration_timestamps SET mechanism = 'native' WHERE run_id = '01M3MBEYPR3N5HFWAD85VR6G5Y';"
Error: stepping, locked: narration_timestamps cannot be modified once obtained (19)
$ sqlite3 curl.sqlite "UPDATE narration_timestamps SET path = 'other.json' WHERE run_id = '01M3MBEYPR3N5HFWAD85VR6G5Y';"
Error: stepping, locked: narration_timestamps cannot be modified once obtained (19)
$ sqlite3 curl.sqlite "DELETE FROM narration_timestamps WHERE run_id = '01M3MBEYPR3N5HFWAD85VR6G5Y';"
Error: stepping, locked: narration_timestamps cannot be deleted once obtained (19)
$ sqlite3 curl.sqlite "INSERT INTO narration_timestamps (run_id, mechanism, path, character_count, obtained_at) VALUES ('01M3MBEYPR3N5HFWAD85VR6G5Y', 'native', 'p', 1, 'now');"
Error: stepping, UNIQUE constraint failed: narration_timestamps.run_id (19)
$ sqlite3 curl.sqlite "INSERT INTO narration_timestamps (run_id, mechanism, path, character_count, obtained_at) VALUES ('01M3MBEYPKYHJZPT3BF1NCNTC4', 'guess', 'p', 1, 'now');"
Error: stepping, CHECK constraint failed: mechanism IN ('native', 'alignment') (19)
$ sqlite3 curl.sqlite "select 'records:', count(*), group_concat(mechanism) from narration_timestamps;"
records:|5|native,alignment,alignment,alignment,alignment
{"ok":true}
server log: warn/error lines 0; requests 12
### 8.6 cleanup
left by the run: runs 5, voice_overs 5, timestamps 5, attempts 6, triggers 11, project folders 5
server after stop: no response
after resetAll: {"runs":0,"scenes":0,"providerRequests":0,"sceneResults":0,"voiceOvers":0,"stageAttempts":0}
after reset: runs 0, voice_overs 0, timestamps 0, attempts 0, triggers 11, project folders 0
default store: runs 0, voice_overs 0, timestamps 0, attempts 0, triggers 11, project folders 0
key names in the secrets file are unchanged: ['ELEVENLABS_KEY', 'FAL_API_KEY', 'OPENAI_KEY', 'RUNNINGHUB_API_KEY']
```
