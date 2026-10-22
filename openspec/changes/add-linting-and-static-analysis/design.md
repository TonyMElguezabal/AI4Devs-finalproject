## Context

Both packages are TypeScript, ESM, `strict` with `noUncheckedIndexedAccess`, and already typecheck cleanly. The backend runs TypeScript natively on Node 24 (strip-only, `erasableSyntaxOnly`); the frontend is React 18 on Vite. CI runs one matrix job (`backend`, `frontend`) with `npm ci`, `npm run typecheck`, `npm test`. The packages are independent (no workspace root `package.json`), each with its own lockfile. `tsconfig.json` in each package includes `src` and `test` (frontend also `vite.config.ts` and `vitest.config.ts`; backend does not include `vitest.config.ts`).

## Goals / Non-Goals

**Goals:**
- `npm run lint` in each package checks all TypeScript source and tests with type-aware rules and exits 0 on the current code.
- CI fails a pull request that introduces a violation.
- Findings that point to real defects are surfaced and dispositioned, not silently suppressed.
- No change in behaviour; no production dependency added.

**Non-Goals:**
- Formatting (Prettier), import sorting or style opinions.
- Stylistic or "strict" rule presets beyond what finds defects.
- A shared root config or npm workspaces.
- Marking the check as *required* in GitHub branch protection (a repository setting, done by a human).

## Decisions

1. **ESLint 9 flat config with `typescript-eslint`.** It is the standard TypeScript linter, supports type-aware rules, and the frontend plugin ecosystem (React Hooks) targets it. Alternatives: Biome (fast, but type-aware rules are limited and no hooks parity yet), `tsc` flags alone (`noUnusedLocals`, which cannot see unhandled promises or unsafe `any` flow). Choice recorded here per the ticket's DoD.
2. **Rule set: `tseslint.configs.recommendedTypeChecked`** plus `@eslint/js` recommended. It includes `no-floating-promises`, `no-misused-promises`, `await-thenable`, `no-unsafe-*`, `no-unused-vars` and `no-unnecessary-type-assertion`, i.e. exactly the defect classes the ticket names. The frontend adds `eslint-plugin-react-hooks` (`rules-of-hooks`, `exhaustive-deps`). `strict` and `stylistic` presets are rejected: they raise opinion-level noise unrelated to defects.
3. **Type information through `projectService`** with `tsconfigRootDir: import.meta.dirname`, so lint uses each package's existing `tsconfig.json` and cannot drift from the typecheck. Config files not covered by the tsconfig (`eslint.config.js`, and the backend's `vitest.config.ts`) are handled with `allowDefaultProject` for those files or an ignore entry, not by widening the tsconfig `include` (which would change `typecheck`).
4. **Scope: `src` and `test`** (and the frontend's Vite/Vitest configs), ignoring `dist`, `node_modules`, `data` and `public`.
5. **Existing violations: fix by default; suppress only per line** with `// eslint-disable-next-line <rule> -- <reason>`. Enable `linterOptions.reportUnusedDisableDirectives` so stale suppressions fail. The first run found 831 backend findings (313 in `src`, 518 in `test`), mostly `no-unsafe-*` and `no-explicit-any`. In `src` the root cause is untyped SQLite rows (`row: any` in the `db.ts` mappers): it is fixed by typing the rows, not by suppression. In `test/**`, the `no-unsafe-*` family (`member-access`, `assignment`, `argument`, `call`, `return`) and `no-explicit-any` fire on untyped mocks and parsed response bodies; they are turned off for `test/**` only, in a single override that carries the reason as a comment. The same override also turns off `require-await` (stubs and callbacks are async to match provider and vitest signatures), `no-base-to-string` (fetch stubs stringify the string URL or body they are given) and `prefer-promise-reject-errors` (tests reject with non-Errors on purpose); in `src` these stay enforced, with per-line suppressions where an async method implements an async contract. This scoped, reasoned override is a rule-set decision, not a blanket disable: the rules stay enforced in `src` and all other rules stay enforced in tests.
6. **Fixes are separated from the config in history**: one commit adds the tooling and CI step with the rule set, the next commits apply lint fixes per package, and any change that is not a pure lint fix is called out in the PR. This keeps "no behaviour change" reviewable.
7. **CI: add `- run: npm run lint` after `npm run typecheck`** in the existing matrix job. It reuses `npm ci` and the cached dependencies; no new job. Fast checks run before the slow test step so a violation fails early.
8. **Local dev-only dependencies** in each package's `devDependencies`. Vite builds only the imported module graph and the backend packaging bundles runtime code, so lint tooling never reaches the bundle; this is verified by building the frontend and comparing the output size.

## Risks / Trade-offs

- **Large number of type-aware findings on first run** (1,700+ backend tests) → triage by rule; auto-fix only the mechanical ones; list real-defect findings in the PR; if one rule produces mostly noise in tests, scope a documented `test/**` override rather than disabling it globally.
- **A fix changes behaviour** (e.g. adding `await` to a floating promise changes timing) → treat each such fix as a functional change: review it individually, keep it in a separate commit, and run the full suites before and after.
- **Lint time in CI** (type-aware linting is slower) → typically seconds to well under a minute at this size; measure on the PR and revisit only if it is material.
- **ESLint or plugin peer-dependency conflicts with TypeScript or Node versions** → pin the versions that resolve cleanly with `npm ci` on Node 24; lockfiles are committed.
- **Gate is advisory until branch protection requires it** → noted in the PR for the repository owner.

## Migration Plan

1. Add dependencies, configs and scripts in both packages; run lint to size the findings.
2. Fix or suppress findings per package; keep tests green.
3. Add the CI step; confirm it is green on the PR and that a deliberately introduced violation (in a throwaway commit or a local run of the same command) fails it.
4. Update `readme.md` section 2.6.
5. Rollback: revert the CI step and the configs; no data or runtime state is involved.

## Open Questions

- Should the `lint` check be made a required status check on `main` and `feature/entrega-2-JAME`? (Repository setting; owner decides after the first green run.)
