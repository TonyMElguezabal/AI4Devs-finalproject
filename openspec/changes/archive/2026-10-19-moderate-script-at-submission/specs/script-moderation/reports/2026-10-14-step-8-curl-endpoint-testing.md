# Step 8 — Endpoint testing with curl

**Change:** moderate-script-at-submission (JOS-187)
**Date:** 2026-10-14
**Branch:** `feature/jos-187-moderate-script-at-submission`

Two backends ran from the worktree on isolated `DB_PATH` / `PROJECTS_ROOT` directories (not the
shared local store): one with the real `OPENAI_KEY` (port 3191), one with an invalid key
(port 3192). Neither had an ElevenLabs credential, so no downstream provider was reached or
billed. Credentials are not recorded here.

| # | Request | Result | `runs` after |
|---|---|---|---|
| 8.1 | baseline | — | 0 |
| 8.2 | clean English script | `201`, session in `submitted` | 1 (then deleted with its isolated DB) |
| 8.3 | step-7a device script | `422`, `reason`: "The script was refused by the provider's content policy (flagged: illicit, illicit/violent, violence). Edit the script and submit it again." | unchanged (1) |
| 8.4 | clean script, invalid `OPENAI_KEY` | `503`, `reason`: "The content check is temporarily unavailable. Submit the script again in a moment." | 0 |
| 8.5 | empty script | `400` as before ("body/script script must not be empty") | — |
| 8.6 | `GET /docs/json` → `/sessions` POST | responses `201`, `422`, `503` | — |

## DB state (8.7)

Each isolated store was removed after the run, so the shared local `DB_PATH` was never touched
and still matches its baseline (0 runs, per step 7).

## Notes

- The `422` reason names the categories the endpoint returned, including the slashed
  `illicit/violent`, and contains neither the script nor any credential.
