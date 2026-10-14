# PRD change draft — hosted single-user install behind an edge access gate

- Status: **APPROVED as drafted by the product owner on 2026-10-12** (stated in the JOS-194 session). Applied to `docs/PRD.md` as v1.6 on 2026-10-13 (task 2.3); the previous version is `docs/PRD-v1.5.md`. The questions at the end were not answered separately, so the draft's defaults stand (no new acceptance criterion; the admitted identities live in infrastructure code).
- Origin: `define-production-deployment` (JOS-194), requirement "No exposure without an approved access gate" in `specs/deployment-foundation/spec.md`.
- Proposed version: 1.6.

## What is being decided

PRD §2.3, §12.3 and D07 say the MVP is a local single-user install with no accounts, and that exposure outside a local environment requires defining authentication and authorization first. The product owner now wants the MVP reachable at `vid4you.download` (production) and `uat.vid4you.download` (UAT).

The proposal keeps the MVP's "no accounts, no authorization rules inside the application" model and adds one thing in front of it: an **edge access gate** that decides who may reach the hosted application at all. The application is still a single-user product. The gate decides who that one user is.

## Proposed text

### §2.3 Fuera del MVP — replace the bullet

Current:

> - Cuentas de usuario, autenticación y exposición de la aplicación fuera de un entorno local.

Proposed:

> - Cuentas de usuario, autenticación y autorización dentro de la aplicación, y cualquier acceso multiusuario. The hosted deployment (§12.3) is reachable only through an edge access gate that admits an explicit list of identities.

### §12.3 Modelo de acceso, descargas y aislamiento — replace the first and last paragraphs

Current, first paragraph:

> El MVP se ejecuta como una **instalación local destinada a un único usuario**. No existen cuentas, autenticación ni reglas de autorización.

Proposed:

> The MVP is a **single-user installation**. It runs either locally or as a hosted deployment with exactly two environments, UAT and production. The application itself has no accounts, authentication or authorization rules. In a hosted environment, an edge access gate sits in front of both the page and the API and admits only an explicit list of identities; a request from any other identity never reaches the application. The list initially contains one identity, the product owner's.

Current, last paragraph:

> Exponer la aplicación fuera de un entorno local exige definir previamente autenticación y reglas de autorización. Esa exposición queda fuera del MVP, conforme a §2.3.

Proposed:

> A hosted environment is acceptable only while the access gate is in place. Anyone the gate admits can see and change every session: session identifiers separate data for functional integrity and are not a security control (above). Admitting more than one person, or giving different people different rights, is outside the MVP and requires its own decision (§2.3).

Unchanged: the second and third paragraphs (downloads, and session isolation as functional integrity).

### §12.2 Archivos — add one sentence

> In a hosted environment, project folders live on the host's persistent storage and are backed up off-host; they are still never deleted or expired automatically.

### §11 / §2.1 credentials — adjust the wording

Current (§2.1, §11): credentials are read "from the machine's local environment or a local secrets file".

Proposed: "from the process environment or a local secrets file kept out of the repository; in a hosted environment they are injected as per-environment secrets". No behavioural change: `loadCredential` already prefers the environment.

### D07 row in §14

Current:

> | D07 | Autorización y acceso a las sesiones. | **Cerrada** | Instalación local monousuario, sin cuentas ni autorización. La separación entre sesiones es integridad funcional, no seguridad (§12.3). |

Proposed:

> | D07 | Autorización y acceso a las sesiones. | **Cerrada (revisada en v1.6)** | Instalación monousuario, local o alojada en dos entornos (UAT y producción). Sin cuentas ni autorización dentro de la aplicación; en un entorno alojado, una puerta de acceso en el borde admite solo una lista explícita de identidades. La separación entre sesiones es integridad funcional, no seguridad (§12.3). |

### §16 Registro de cambios — new section

> ### From version 1.5 to 1.6
>
> Origin: `define-production-deployment` (JOS-194).
>
> | Change | Origin |
> |---|---|
> | Hosted deployment admitted: two environments (UAT, production), single-user, behind an edge access gate with an explicit identity list (§2.3, §12.3, D07). | Product owner, JOS-194 |
> | Credentials may be injected as per-environment secrets (§2.1, §11). | JOS-194 |
> | Project files live on the host's persistent storage with off-host backups; retention rules unchanged (§12.2). | JOS-194 |
> | No accounts, authorization or multi-user access in the MVP; the gate is not a user model. | JOS-194 |

## What this draft deliberately does not change

- **AC22** (a session shows only its own chunks, files and results): unchanged. It remains functional integrity.
- **AC15** (files are not deleted automatically): unchanged.
- No new acceptance criterion about the gate. Its verification belongs to `deployment-foundation` and to the proof of concept (tasks 7.1 and 10.2), not to a product acceptance criterion, unless the product owner wants one.

## Questions for the product owner

1. Is "single user, edge-gated, two environments" the intended model, or should the gate be described as a stepping stone to accounts?
2. Should the list of admitted identities be a PRD-level concept, or an operational detail kept in infrastructure code?
3. Should an acceptance criterion for the gate be added to §13?
