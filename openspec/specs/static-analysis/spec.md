# static-analysis Specification

## Purpose
TBD - created by archiving change add-linting-and-static-analysis. Update Purpose after archive.
## Requirements
### Requirement: Lint command in each package

The backend and the frontend SHALL each expose `npm run lint`, which checks all TypeScript source and test files of the package with type-aware rules and exits with code 0 when no violation exists. The command SHALL NOT modify files.

#### Scenario: Lint runs on the current code

- **WHEN** a contributor runs `npm run lint` in `backend/` or in `frontend/` on the main branch
- **THEN** the command checks the source and test files with type information
- **AND** it exits with code 0

#### Scenario: A violation is introduced

- **WHEN** a file in the package contains a violation of the rule set, such as a floating promise
- **THEN** `npm run lint` reports the file, line and rule
- **AND** it exits with a non-zero code

### Requirement: Documented rule set

The rule set SHALL be defined in a versioned configuration file in each package and SHALL include rules that detect unused code, unhandled promises and unsafe type usage. The frontend rule set SHALL also include the React Hooks rules. The choice of tool and the rule set SHALL be recorded in the change design and in `readme.md`.

#### Scenario: Reviewing the rule set

- **WHEN** a contributor reads the package configuration and the change design
- **THEN** the tool, the rule presets and every deliberate override are listed with their reasons

### Requirement: Justified suppressions only

A violation present when the rule set is introduced SHALL be fixed or suppressed on the affected line with a one-line reason. Whole-file or whole-package disabling of a rule SHALL NOT be used; the only exception is a single configuration override that relaxes named type-safety rules for test files, with its reason stated in the configuration, while the same rules stay enforced in source files. and a suppression that no longer suppresses anything SHALL be reported as a violation. Fixing a violation SHALL NOT change the behaviour of the application.

#### Scenario: A violation cannot be fixed

- **WHEN** a violation is suppressed
- **THEN** the suppression is limited to the affected line and states its reason in the same comment

#### Scenario: Type-safety rules in test files

- **WHEN** a test file uses an untyped mock or parsed response body
- **THEN** the relaxed type-safety rules named in the configuration override do not report it
- **AND** the same usage in a source file is still reported

#### Scenario: A suppression becomes stale

- **WHEN** a suppression comment no longer matches any violation
- **THEN** `npm run lint` fails and reports the unused directive

#### Scenario: Behaviour after the fixes

- **WHEN** the backend and frontend test suites run after the lint fixes
- **THEN** every test that passed before still passes

### Requirement: Lint gate in continuous integration

The CI workflow SHALL run `npm run lint` for both packages on every pull request and on every push to the protected branches, and SHALL fail the run when lint fails.

#### Scenario: A pull request adds a violation

- **WHEN** a pull request adds a lint violation to either package
- **THEN** the lint step of the CI run fails for that package
- **AND** the pull request check is reported as failed

#### Scenario: A clean pull request

- **WHEN** a pull request adds no violation
- **THEN** the lint step passes together with the typecheck and test steps

### Requirement: Lint findings that indicate defects are reported

Findings that point to a real defect, such as unused code, an unhandled promise or an unsafe cast, SHALL be listed with their disposition (fixed, suppressed with reason, or deferred with a follow-up) in the pull request that introduces the rule set.

#### Scenario: Reviewing the introduction pull request

- **WHEN** a reviewer opens the pull request that adds the lint rule set
- **THEN** each defect-indicating finding appears with its disposition

### Requirement: Lint command documented for contributors

`readme.md` SHALL list `npm run lint` next to the typecheck and test commands and SHALL NOT state that lint or static analysis is missing.

#### Scenario: A contributor looks for the commands

- **WHEN** a contributor reads section 2.6 of `readme.md`
- **THEN** the lint command is listed with the typecheck and test commands

