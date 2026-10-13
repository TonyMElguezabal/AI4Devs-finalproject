# PRD change draft v1.7 — local packaged application

- Status: **DRAFT, not approved.** `docs/PRD.md` stays at v1.6 until the product owner approves this text (task 2.4).
- Origin: `define-production-deployment` (JOS-194), design Decision 14 (2026-10-13), ADR 0007.
- Why: v1.6 admitted a hosted deployment behind an edge access gate. The product owner has since chosen to ship Vid4You as an application that runs on the user's own computer (macOS or Windows) and calls the cloud AI providers. v1.6's hosted wording no longer describes the product.

## Proposed text

### §2.3 Fuera del MVP — replace the bullet v1.6 introduced

v1.6:

> - Cuentas de usuario, autenticación y autorización dentro de la aplicación, y cualquier acceso multiusuario. The hosted deployment (§12.3) is reachable only through an edge access gate that admits an explicit list of identities.

Proposed:

> - User accounts, authentication and authorization, any multi-user access, and any hosted (server) deployment. The MVP is a desktop application that runs on the user's own computer (§12.3).

### §12.3 Modelo de acceso, descargas y aislamiento — replace the first and last paragraphs

Proposed, first paragraph:

> The MVP is a **single-user application installed on the user's own computer**, on macOS or Windows. It is delivered as one executable per platform that needs no other software installed; it runs the interface and all processing locally and calls the cloud AI providers (§11) over the internet. The application has no accounts, authentication or authorization rules.

Proposed, last paragraph:

> The application accepts requests only from its own interface on the same computer: it listens on the local loopback address and rejects requests coming from other web pages open in the user's browser. Admitting more than one person, or reaching the application from another computer, is outside the MVP (§2.3).

Unchanged: the second and third paragraphs (downloads, and session isolation as functional integrity).

### §12.2 Archivos — replace the sentence v1.6 added

v1.6:

> In a hosted environment, project folders live on the host's persistent storage and are backed up off-host; they are still never deleted or expired automatically.

Proposed:

> The store and the project folders live in the user's application-data folder on their computer (for example `~/Library/Application Support/Vid4You` on macOS, `%APPDATA%\Vid4You` on Windows), never in the installation folder, so updating or reinstalling the application keeps them. They are never deleted or expired automatically; copying them elsewhere is the user's choice.

### §2.1 / §11 credentials — adjust the wording

Proposed: "Provider credentials are read from the process environment or from a credentials file in the user's application-data folder; they are never hardcoded, never part of the application download, and never shown in the interface or logs."

### §12.1 (persistence and resumption) — add one sentence

> Processing happens only while the application is running; if the computer sleeps or the application is closed, in-progress sessions resume from their saved state the next time it starts.

### D07 row in §14

Proposed:

> | D07 | Autorización y acceso a las sesiones. | **Cerrada (revisada en v1.7)** | Aplicación monousuario instalada en el equipo del usuario (macOS o Windows); sin cuentas ni autorización; solo la propia interfaz local puede usar la aplicación. La separación entre sesiones es integridad funcional, no seguridad (§12.3). |

### §16 Registro de cambios — new section

> ### From version 1.6 to 1.7
>
> Origin: `define-production-deployment` (JOS-194), design Decision 14, ADR 0007.
>
> | Change | Origin |
> |---|---|
> | The MVP is a desktop application on the user's computer (macOS, Windows) calling the cloud AI providers; the hosted deployment admitted in v1.6 is withdrawn (§2.3, §12.3, D07). | Product owner, JOS-194 |
> | Store, project folders and credentials live in the user's application-data folder (§2.1, §11, §12.2). | JOS-194 |
> | Only the application's own local interface may use it (§12.3). | JOS-194 |
> | Processing pauses while the application is not running and resumes on the next start (§12.1). | JOS-194 |

## Deliberately not changed
- Acceptance criteria (§13), providers and parameters (§11.3), and every functional rule.
- UAT and production are release channels of the delivery process, not product behaviour, so they are not in the PRD; they are in ADR 0007 and the development guide.

## Questions for the product owner
1. Should "macOS or Windows" be in the PRD, or only "the user's computer", leaving the platform list to ADR 0007?
2. Should the PRD say anything about backups, or is "copying them elsewhere is the user's choice" enough?
