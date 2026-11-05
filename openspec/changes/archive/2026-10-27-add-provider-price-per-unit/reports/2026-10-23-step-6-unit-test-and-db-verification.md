# Step 6 — Unit tests and database verification (JOS-226)

- Targeted tests: `backend/test/provider-price.test.ts` (validation, `BILLED_UNITS`, field descriptors, settings rejection, drift notice), `backend/test/provider-price-route.test.ts` (routes, usability, vendor request body), `frontend/test/provider-profiles-section.test.tsx` (optional price fields). All pass.
- Full suites: backend 158 files / 2164 tests passed (4 files, 5 tests skipped); frontend 9 files / 328 tests passed. `npm run typecheck` is clean in both.
- Lint: no error in the files of this change. Two existing errors remain in `ReportsSection.tsx` and `reports-section.test.tsx` (JOS-223), untouched here.
- Database: no migration. The tests use the in-memory/scratch store; the default store was not opened.

## Scenario to test mapping
- Price and currency saved (upper-case) — `provider-price.test.ts` "accepts a price with a currency", `provider-price-route.test.ts` "POST saves the price" · AC1
- Unpriced profile — "accepts no price", "an edit without the price fields removes it" · AC2
- Zero is a price — "accepts zero as a price", "stores zero as a price"
- Invalid prices listed — "refuses a negative price…", "refuses an invalid price with every problem" · AC1
- Clearing makes unpriced — route PUT test and frontend "clearing both fields saves without price keys"
- Form names the unit / adapter types list the unit — "ends with the optional price and currency fields", "lists the optional price and currency fields", frontend "shows 'Price per <unit>'" · AC3
- Settings reject a price; priced first profile raises no notice — `provider-price.test.ts` "the settings files and the drift notice"
- Vendor request carries no price; priced active provider stays usable; 401 — `provider-price-route.test.ts`

Coverage was not measured with a tool (none is configured); every new branch has a test.
