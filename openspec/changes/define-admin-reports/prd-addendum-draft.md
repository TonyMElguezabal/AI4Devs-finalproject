# PRD addendum draft — the /admin reports (JOS-175)

**Status: awaiting the product owner's approval.** This text becomes `docs/PRD.md` at task 5.3, as the version after the last one merged (v1.15 is JOS-172's, awaiting merge, so this is expected to be v1.16; the number follows merge order). The previous version is kept as `docs/PRD-v<prev>.md`. The status line and change-log entry say "awaiting the product owner's approval", and the change must not be merged before the approval is recorded.

## Proposed text

### 2.1 Roles — Administrator row

Append: "and see the reports of §11.4 (usage, failures and sessions in the first release; cost, pipeline time and provider changes in a later one)."

### 2.3 Fuera del MVP

In "Administrator tools on `/admin` other than managing the providers and moving a failed stage: reports, and editing an operational setting." remove "reports, and". The sentence becomes "... other than managing the providers and moving a failed stage: editing an operational setting."

Replace the line "- Reportes de uso o costos." with:

"- Reportes de uso, fallos, sesiones, costos, tiempos y cambios de proveedor: fuera del MVP; están en alcance de la versión que los construya, descritos en §11.4."

### 11.4 Administrator reports (new section, after §11.3)

"The Administrator sees read-only reports on `/admin`, computed from what the application stores on the user's own computer. A report writes nothing, sends nothing off the device, requires the Administrator password, and never shows an API key, a script, a prompt or instruction, narration text, or a provider's own words in a failure message. Aggregate reports take a period (the last 7 days, the last 30 days by default, all time, or a custom range) applied to the instant each attempt was sent; times are shown in the computer's time zone. There is no download.

The first release has three reports:

1. **Provider usage**, per stage (voice, alignment, reasoning, image, video) and provider: attempts, successes, transient and not-retryable failures, timed-out attempts, success rate, median and 95th-percentile request latency, and the billed units of the successful attempts (voice characters, audio seconds for alignment, images, clip seconds, reasoning requests).
2. **Failures and retries**, per stage: failed attempts by outcome, retry budgets exhausted, manual retries, the most frequent failure wordings of the session-level stages, and the scenes that are failed now by stage.
3. **Sessions**: one row per session created in the period (title, created, state, scenes, failed scenes, attempts, time to the voice-over and to the final video) with a drill-down to its scenes (providers, attempts, requested duration, speed factor and warnings).

A later release adds an **estimated cost** (billed units times a price per unit that the Administrator enters on each provider; every amount is an estimate, and a provider with no price is shown as unpriced, never as zero), **pipeline time** (elapsed time per phase and time-limit hits) and **provider changes** (when the active provider changed or a failed stage was moved). Each of these needs the application to record something it does not record today.

Until the provider is recorded on each scene attempt, the per-provider figures of the image and video stages attribute an attempt to the provider its scene is bound to now; after a provider move, earlier failed attempts are counted for the provider the scene was moved to. The reports say so."

### 16. Registro de cambios

**From version 1.15 to 1.16** (the number follows the last merged version). Origin: `define-admin-reports` (JOS-175), 2026-10-22. **Awaiting the product owner's approval.**

| Change | Origin |
|---|---|
| §2.1, §2.3: the reports move from "out of the MVP, no contents" to in scope for the release that builds them; §11.4 describes the agreed reports. | Product owner, JOS-175 |
| §11.4: release 1 is provider usage, failures and retries, and sessions; cost, pipeline time and provider changes are for a later release. | Product owner decision, 2026-10-22 |
| §11.4: reports are read-only, local, behind the Administrator password, free of secrets and content, with an estimate label on any cost; the default period is the last 30 days and there is no download. | Product owner decision, 2026-10-22 |
