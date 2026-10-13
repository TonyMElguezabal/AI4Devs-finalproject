# Step 10 — manual endpoint testing with curl (run-session-end-to-end, JOS-195)

- Date: 2026-10-13
- Server: `node src/server.ts` from this branch, port 3171, a temporary `DB_PATH`/`PROJECTS_ROOT` per run (removed afterwards)
- Flags: `USE_STUB_VOICE_PROVIDER` (`success`, or `success-after-limit` for the pause tests), `USE_STUB_VIDEO_PROVIDER=success`, `USE_STUB_ASSEMBLY_TOOL=success`; `ALLOW_TEST_ENDPOINTS` **unset**
- **No provider keys** were present (no environment keys, no `.secrets.json`): nothing was spent. This is the limited run of design Open Question 1; a run to `final-video` through the real OpenAI and fal providers is not part of this step and is left to the product owner's rebuilt-executable E2E.

| Task | Request / action | Observed |
|---|---|---|
| 10.1 | start; `GET /health`; sessions in the store before | `{"ok":true}`; 0 |
| 10.2 | `POST /sessions` (2-sentence script, `en`), then read `GET /sessions/:id` with no other request | created state `submitted`; **1 s later `failed`, phase `decomposition`**, cause "The narration's timestamps could not be obtained: missing credential 'ELEVENLABS_KEY'…"; server log: one `decomposition.launch`; attempts `voice-over: success`, `timestamps: not-retryable` — the session left `voice-over-complete` on its own and the decomposition ran |
| 10.3 | session reaching `final-video` | **not run** (needs real OpenAI and fal keys; covered with stubs by `session-end-to-end.test.ts`); recorded, not claimed |
| 10.4 | `POST /pause` while the (delayed) voice-over is in flight | at +13 s the narration was stored (`late-success`), state `voice-over-complete`, `paused: true`, `held: [{stage: decomposition, count: 1}]`; still the same 4 s later, no `timestamps` attempt |
| 10.4 | `POST /continue` | `{"ok":true}`; within 1 s the decomposition ran (`failed`, phase `decomposition`, no keys); one `decomposition.launch` event |
| 10.5 | `kill -9` with the narration stored and nothing started, `runs.paused` cleared in the store (the state a crash right after the narration leaves), restart | store before boot: `paused=0`, 0 `timestamps`/`decomposition` attempts; **1 s after boot the decomposition had run** (`failed`, no keys); one `decomposition.launch` event |
| 10.6 | on the failed session: restart the server; `POST /pause` then `POST /continue` | attempts unchanged (`voice-over: success`, `timestamps: not-retryable`), state still `failed`/`decomposition`; the log still shows one `decomposition.launch` |
| 10.7 | store after | temporary stores removed; the repository has no `backend/data` in this worktree |

## Notes
- With the stub voice, the alignment step was reached (the stub's native timestamps did not satisfy the usability check), so the failure names ELEVENLABS_KEY rather than OPENAI_KEY. With keys set, alignment succeeds and the visual-instruction step follows; that part is exercised by the unit tests with stub providers.
- The final video of a stubbed assembly is not downloadable (the assembly stub writes no file); the end-to-end test asserts the state, as the spec scenario does.
