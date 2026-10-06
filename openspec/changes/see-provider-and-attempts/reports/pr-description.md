## JOS-166: See the provider and attempts of each stage

Linear: JOS-166 (US-34). Target: `feature/entrega-2-JAME`.

### What changed

- **Scenes report their stages.** Each scene gained `stages`: an `image` and a `video` key, present once that stage has at least one attempt, each with the provider (`name` and `model`) and `attempts` across every retry. The scene's old top-level `provider` and `attempts` are removed: they described only the image stage, and the attempts counter restarted when the clip began.
- **Phases report theirs.** Each phase entry (from JOS-168) gained `stages`: voice-over, then timestamps and scene instructions (the decomposition's reasoning call), then assembly (local assembly, no external provider).
- **Derived on read, never stored.** Counts come from the append-only `provider_requests` and `stage_attempts` records, the clip-stage count in one grouped query per session. A first version with a query per scene made the 300-scene capacity scenario about ten times slower, which the JOS-186 test caught.
- **Readable providers.** `stageDiagnostics.ts` maps each stored identifier to a name and model (Fal.ai, RunningHub, ElevenLabs, OpenAI, local assembly, stubs). An identifier with no entry shows as `Unknown provider` and is never echoed.
- **Nothing confidential leaves the backend.** A diagnostic is exactly stage, provider name and model, and count, in closed (`.strict()`) schemas. Tests put sentinels in every free-text column and in the credential environment and assert none appears in the read or the live snapshot; a deliberate leak made 8 tests fail.
- **The page shows them.** Scene details list `Image: Fal.ai (fal-ai/flux/dev), 2 attempts` and `Clip: ...` under accessible names; each phase section lists its stages; counts update from a live snapshot without a reload. One formatter, no actions.
- **Docs:** `docs/api-spec.yml` regenerated from `GET /docs/json`, `docs/data-model.md`, `docs/backend-standards.md`, `docs/frontend-standards.md`.
- No migration.

### Reconciled with what has merged

The proposal assumed the decomposition recorded no attempts and that this PR would stack on JOS-168. Both changed: `retry-decomposition` (JOS-156) already records the reasoning call as attempts of stage `decomposition`, so the planned new `instructions` stage and its recording were dropped, and JOS-168, JOS-136, JOS-149 and JOS-184 are merged, so this targets the integration branch directly. The branch merged the integration branch; the one conflict was JOS-168's stale propose-time `tasks.md`, resolved with the integration version.

### Verification

- Type check clean in both packages; backend 1295 passed and 4 skipped, frontend 101 passed; the backend suite also passes in a fresh worktree with no `backend/.secrets.json` apart from one case of the known 5 ms-latency flake in `orchestrator.test.ts`.
- Coverage (backend): lines 91.88% to 92.04%, branches 92.36% to 92.47%, functions 98.60% to 98.64%.
- A real server run with sentinels in the attempt records: no sentinel and no endpoint path in the response; unknown session still 404; the generated OpenAPI documents `stages` and no scene `provider` or `attempts`.
- A browser run (Playwright CLI): the scene lines and the phase lists appear, a third image attempt shows without a reload, and nothing sensitive is on the page.
- Reports and a screenshot: `openspec/changes/see-provider-and-attempts/reports/`.

### Worth a look

- A breaking change to the session representation: the scene's `provider` and `attempts` are gone. No consumer outside this repository reads it.
- Voice-over diagnostics show the provider of the *latest* attempt and the count of *all* attempts.
- The Chrome automation tool failed on the page (not on the app); the browser check was done with the Playwright CLI instead.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01TGwptE7bqcPbkvrLaDgN6y
