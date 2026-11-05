# Step 7 — Manual endpoint testing (JOS-226)

Real server on a scratch store, projects folder and `PROVIDER_KEY_PATH` (deleted afterwards; the default store was not touched).

- `PUT /admin/provider-profiles/ElevenLabs` without access: **401**.
- `GET /admin/provider-types`: every adapter type ends with "Price per <unit>" and "Currency" (request, voice character, audio second, image, clip second).
- Voice profile priced `0.00003` / `usd`: **200**, read back as `USD`.
- Invalid cases, each **400** with one problem on its field: `-1`, `"x"`, currency `ZZZ`, price without currency, currency without price.
- Price `0` / `EUR` saved; clearing both keys saved. In SQLite, `parameters` held only the adapter's own keys after the clear.
- Restart with a priced first profile: no "differs" notice in the log.
- Not run by hand: a settings file with a price (the check printed nothing in this run; the unit test `rejects a price in a provider section of the settings` covers it) and a full session on priced providers (covered by the usability and request-body tests).
