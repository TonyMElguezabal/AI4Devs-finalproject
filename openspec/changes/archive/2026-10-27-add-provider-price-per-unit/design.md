## Context

JOS-218 made each provider a profile (`provider_profiles`: id, stage, adapter type, label, `parameters` as JSON). `backend/src/providerTypes.ts` holds, per adapter type, the zod shape of the parameters (`PARAMETER_SHAPES`, reused by `config/settings.ts` for the provider sections of the settings files) and the field descriptors the `/admin` form is generated from (`ADAPTER_TYPES`). `validateProviderParameters` validates a strict object and lists one problem per field. Adapters read named fields from the parameters (`model`, `endpoint`, `voiceId`, ...); none spreads the whole object into a request. `seedProviderProfiles` compares the first profile's parameters with the settings section and warns once when they differ.

ADR 0008 (JOS-175) decided: the price is an optional parameter of each profile, edited on `/admin`; any cost is an estimate; a provider with no price is unpriced, never zero. The billed units were fixed by the spike's catalogue.

The `/admin` form sends every field, empty ones as `""`, which fails validation for an optional field.

## Goals / Non-Goals

**Goals:** store, validate and show a price per unit and a currency per profile; name the unit per stage; keep the price out of the settings files, vendor requests and usability.

**Non-Goals:** computing any cost (JOS-227); currency conversion or a single app-wide currency; price history (an edit replaces the price; the estimate uses the current one); vendor billing rules.

## Decisions

### Decision 1 — Two flat optional parameters, both or neither

`pricePerUnit` (a finite number, zero or greater) and `priceCurrency` (three letters, a code in `Intl.supportedValuesOf("currency")`, stored upper-case) sit in the profile's `parameters` next to the adapter's own. One without the other is a problem on the missing field. Flat names match the JSON path the spike's R2 query already reads (`$.pricePerUnit`) and the form's one-path-per-field model.

Alternatives: a nested `price: {amount, currency}` (one more level for the form, no gain); a separate `provider_prices` table (a migration and a join for one optional pair); a price table in the settings files (rejected in ADR 0008).

### Decision 2 — One shape for prices, added only in the /admin validation

A `PRICE_SHAPE` is merged into the strict schema built by `validateProviderParameters`, not into `PARAMETER_SHAPES`. So the settings files keep rejecting a price as an unknown key, and the price has one source: `/admin`. `seedProviderProfiles` compares the parameters without the two price keys, so pricing the first profile raises no drift notice.

### Decision 3 — The billed unit per stage is a constant

`BILLED_UNITS: Record<ProviderStage, {id, label}>`: voice `voice_characters` "voice character", alignment `audio_seconds` "audio second", reasoning `requests` "request", image `images` "image", video `clip_seconds` "clip second". It is the vocabulary of the reports catalogue, and JOS-227 will reuse it. Every adapter type gets two more field descriptors, appended after its own: "Price per <unit>" (`kind: "number"`, not required) and "Currency" (`kind: "text"`, not required, help "A three-letter code such as USD").

### Decision 4 — The form leaves empty optional fields out

In `ProfileForm.handleSubmit`, a field that is not required and whose input is blank is not set in the parameters. Clearing both price inputs therefore saves an unpriced profile. Required fields behave as before (blank is sent and reported).

### Decision 5 — A price never changes how a provider works

Adapters already read named fields, so the price cannot reach a vendor; a test sends a request with a priced profile and checks the body. `usabilityProblems` gets no new rule: an unpriced profile is usable. Binding, retries and telemetry do not read the price.

## Risks / Trade-offs

- [Profiles of one stage priced in different currencies] → JOS-227 shows totals per currency; noted there. No conversion here.
- [A price is edited after work was done] → the estimate uses the current price (no history); ADR 0008 labels every amount an estimate. Price history would be its own story.
- [Floating-point prices such as 0.00003 per character] → stored as a JSON number; JOS-227 rounds at display.
- [The settings schema and the /admin schema diverge] → only by the two price keys, by design; a test asserts the settings file rejects them.

## Migration Plan

No migration: `parameters` is JSON and existing profiles are unpriced. Rollback: an older build would reject a stored priced profile's parameters as unknown keys (it validates the stored parameters for usability), so clear the prices before downgrading; noted in the release notes.

## Open Questions

- None blocking. A single app-wide currency instead of one per profile can be decided with JOS-227 without changing the stored shape.
