## Why

The estimated cost report (JOS-227) multiplies each provider's billed units by a price, and ADR 0008 decided that the price lives on the provider profile, entered by the Administrator on `/admin`. No profile can hold a price today, so this story (JOS-226, F5 of `define-admin-reports`) adds it first. It is small and stands alone: a price is stored and shown, and nothing else reads it until JOS-227.

## What Changes

- Every provider profile accepts two optional parameters together: a **price per unit** (a number zero or greater) and a **currency** (a three-letter ISO 4217 code). Both or neither; a profile with neither is **unpriced**. Zero is a valid price (a free provider) and is not the same as unpriced.
- Each stage names its billed unit: voice character (voice), audio second (alignment), request (reasoning), image (image), clip second (video). The `/admin` form labels the price field with that unit.
- The price is entered only on `/admin`: the settings files do not accept it, and a priced first profile does not raise the "settings differ from the stored provider" notice.
- The price never reaches a vendor request, never makes a profile unusable, and changes nothing about binding, retries or telemetry.
- An empty optional field on the `/admin` form is left out of the saved parameters, so clearing both price fields makes the profile unpriced again.
- PRD: the next version (expected v1.17) details the price entry in §11.4, **awaiting the product owner's approval**.

## Capabilities

### New Capabilities
- `provider-pricing`: the optional price per unit and currency on a provider profile, its billed unit per stage, its validation, and the rules that keep it out of the settings files and vendor requests.

### Modified Capabilities
- None. The `provider-profiles` requirements still hold: the price is one more parameter validated with the others.

## Impact

- Backend: `backend/src/providerTypes.ts` (price shape and unit per stage, outside `PARAMETER_SHAPES` so `config/settings.ts` does not take it; the field descriptors), `backend/src/providerProfiles.ts` (the drift notice ignores the price). No migration: parameters are already JSON. No new route; `GET /admin/provider-types` and `GET /admin/provider-profiles` carry the new fields.
- Frontend: `frontend/src/components/ProviderProfilesSection.tsx` (optional fields left out when empty).
- Docs: `docs/PRD.md`, `docs/api-spec.yml`, `docs/data-model.md`.
- Depends on JOS-218 (merged). Unblocks JOS-227.
