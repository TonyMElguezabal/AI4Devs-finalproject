## Why

Since JOS-218 the Administrator enters providers, parameters and API keys on `/admin`, but a wrong key, a wrong model or a wrong voice only shows when a stage runs, after a session has already started and possibly spent money on earlier stages. JOS-218 deliberately left out a "test connection" button because a vendor call can cost money and adapters make exactly one request per call. This change adds that check per vendor, with the cost stated before anything is sent (JOS-220).

## What Changes

- Add a "Test connection" action on each saved provider profile on `/admin`. It makes exactly one request to that profile's vendor with the stored key and parameters, and shows the result in words: connected, key rejected, model (or voice) not found, vendor unreachable, or an unexpected vendor answer with its HTTP status. It never shows the key.
- Prefer a free request per adapter type (an account, voice or model lookup). Where no free request exists, the check is a minimal paid request: the page says so before it is sent, and the server refuses a paid check the Administrator has not confirmed.
- State what each check covers (for example: key only; key and model), so a pass is not read as more than it proves.
- The test reads the profile and changes nothing: no profile, key, binding, attempt or usage record is written.
- New endpoint `POST /admin/provider-profiles/:id/test`, behind the Administrator password; the adapter catalogue (`GET /admin/provider-types`) states per type whether its check is charged and what it covers.

Non-goals: testing unsaved form values, marking profiles as verified, periodic or automatic checks, showing the vendor balance, recording the check in the usage or cost reports.

## Capabilities

### New Capabilities

- `provider-connection-test`: an Administrator-only, single-request connection check of a saved provider profile, with its cost disclosed and its coverage stated.

### Modified Capabilities

None. The profile, key and active-provider requirements are unchanged; the test only reads them.

## Impact

- Backend: a new module with one check per adapter type (vendor host kept in code, as the adapters do), a route in `adminProviderRoutes.ts`, two fields added to the provider-type catalogue.
- Frontend: a button, a cost notice with confirmation for charged checks, and a result line in `ProviderProfilesSection.tsx`.
- Docs: `docs/api-spec.yml`, PRD §2.1 and §11.2 (new version), `docs/backend-standards.md` (provider profiles section).
- No database change. Free checks cost nothing; a charged check costs one minimal vendor request, only after confirmation.
