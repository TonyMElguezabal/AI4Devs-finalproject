## Why

Neither `backend/package.json` nor `frontend/package.json` has a lint script, and CI (`.github/workflows/ci.yml`) runs only `tsc --noEmit` and `vitest`. No static analysis has ever run on the code, so unused code, unhandled promises and unsafe casts can only be found by a human reviewer. This closes item I4 of the MVP closure (JOS-203) and the "no lint" limitation recorded in `readme.md` section 2.6 (JOS-208).

## What Changes

- Add ESLint (flat config, `typescript-eslint` with type-aware rules) to `backend/` and `frontend/`, each with its own `eslint.config.js` and an `npm run lint` script covering all TypeScript source and tests.
- Frontend only: add the React Hooks rules (`eslint-plugin-react-hooks`) to the rule set.
- Fix every existing violation, or suppress it with a one-line reason; no blanket disables and no behaviour change.
- Add a `npm run lint` step to the existing CI matrix job so a lint violation fails the pull request.
- Record the tool choice and the rule set, and list any finding that points to a real defect (unused code, unhandled promise, unsafe cast) with its disposition in the PR description.
- Update `readme.md` section 2.6: document `npm run lint` next to the typecheck and test commands and remove the "no lint" limitation.

## Capabilities

### New Capabilities
- `static-analysis`: the lint command each package exposes, the rule set it enforces (type-aware), its scope (source and tests), the suppression policy, and the CI gate that fails a pull request on a violation.

### Modified Capabilities

None. No product behaviour changes; existing specs are untouched.

## Impact

- **Code**: `backend/` and `frontend/` source and tests may receive small lint fixes (no functional change). New files: `backend/eslint.config.js`, `frontend/eslint.config.js`.
- **Dependencies**: dev-only (`eslint`, `typescript-eslint`, `@eslint/js`, and `eslint-plugin-react-hooks` in the frontend). Nothing enters the production bundle or the packaged app.
- **CI**: `.github/workflows/ci.yml` gains a lint step. Making the check *required* on the protected branches is a GitHub repository setting, outside the code change, and is noted in the PR.
- **Docs**: `readme.md` section 2.6.
- **Out of scope**: formatting (Prettier), linting the root-level packages, scripts or markdown, and any refactor beyond what a violation requires.
