## Índice

0. [Ficha del proyecto](#0-ficha-del-proyecto)
1. [Descripción general del producto](#1-descripción-general-del-producto)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Modelo de datos](#3-modelo-de-datos)
4. [Especificación de la API](#4-especificación-de-la-api)
5. [Historias de usuario](#5-historias-de-usuario)
6. [Tickets de trabajo](#6-tickets-de-trabajo)
7. [Pull requests](#7-pull-requests)

---

## 0. Ficha del proyecto

### **0.1. Tu nombre completo:**

Jose Antonio Munoz Elguezabal

### **0.2. Nombre del proyecto:**

Vid4You

### **0.3. Descripción breve del proyecto:**

El sistema es una plataforma de generación de contenido End to End, la imagen y el video de cada chunk pueden ser entregables independientes, mientras procesa cada imagen y cada video se pueden descargar por partes, finalmente el video editado final contiene todos los chunks de video editados, unidos y narrados por el voice-over generado.

### **0.4. URL del proyecto:**

TBD

### 0.5. URL o archivo comprimido del repositorio

https://github.com/TonyMElguezabal/AI4Devs-finalproject


---

## 1. Descripción general del producto

Vid4You es una aplicación web que convierte un script de vídeo finalmente en un video completo pasando por una lista de escenas narradas (“chunks”) en un conjunto de imágenes y videos cortos generados por IA: una imagen y un video por cada chunk.

### **1.1. Objetivo:**

Vid4You es una aplicación web que convierte un guion de texto en un video narrado listo para publicar, en formato horizontal MP4 (16:9). El usuario solo aporta un título y un guion: el sistema genera automáticamente la narración en audio, las imágenes y los clips de cada escena, y monta el video final sincronizado con la voz. Así resuelve el problema de producir contenido narrado (por ejemplo, para YouTube) sin necesidad de grabar voz, editar video ni tener conocimientos de edición audiovisual.

### **1.2. Características y funcionalidades principales:**

- Creación de sesiones (proyectos de video) a partir de un título y un guion.
- Generación automática de un voice-over (narración en audio) completo por guion, en el idioma seleccionado por el usuario.
- Obtención de las marcas de tiempo que sitúan cada fragmento del guion dentro del audio narrado.
- División automática del guion en escenas (chunks) respetando fronteras de oración, y generación de las instrucciones visuales de imagen y video de cada escena.
- Generación de una imagen y un clip de video por escena, sincronizados con su fragmento narrado.
- Montaje del video final: sincronización de los clips con el audio completo y ensamblado en un único MP4 horizontal.
- Visualización en tiempo real del progreso por fase y por escena, incluyendo resultados disponibles y errores.
- Pausa de la generación antes del lanzamiento de una fase, y continuación explícita por parte del usuario.
- Descarga parcial de resultados (imágenes y clips de escenas individuales) durante el procesamiento, y descarga del video final al completarse.
- Reintentos automáticos (hasta 3 por etapa) y reintento manual ante fallos.
- Corrección del prompt visual (imagen o video) de una escena que haya fallado, sin alterar el guion ni el orden narrativo.
- Persistencia de sesiones, estados y resultados, incluso tras reinicios del sistema.

### **1.3. Diseño y experiencia de usuario:**

_Pendiente. Aún no existen mockups, wireframes ni capturas de la interfaz, ya que el frontend todavía no se ha implementado. Esta sección se completará con imágenes y/o un videotutorial de la experiencia de usuario una vez el frontend esté definido y construido. (TBD mockups after frontend)_

### **1.4. Instrucciones de instalación:**

_Borrador — pendiente de actualizar cuando se cierre la decisión de stack (backend y frontend) y de persistencia del proyecto._

```bash
# 1. Clonar el repositorio
git clone <URL_DEL_REPOSITORIO>
cd AI4Devs-finalproject

# 2. Instalar dependencias
# TBD — comando exacto pendiente de la decisión de stack (backend y frontend)

# 3. Configurar variables de entorno
# Crear un archivo .env local (no versionado) con, como mínimo, las credenciales de los
# proveedores de IA usados por cada etapa (razonamiento, voz, alineación, imagen y video).
# TBD — nombres exactos de las variables, pendientes de la decisión de stack

# 4. Base de datos (si aplica)
# TBD — pendiente de la decisión de persistencia

# 5. Arrancar el proyecto
# TBD — comando de arranque pendiente de la decisión de stack
```

---

## 2. Arquitectura del Sistema

### **2.1. Diagrama de arquitectura:**

> El stack concreto (backend, frontend, base de datos) todavía no está decidido — está pendiente de los spikes `define-backend-stack`, `define-frontend-stack` y `define-persistence` en `openspec/changes/`. Por eso el diagrama y la justificación describen el **patrón** de arquitectura y los componentes por su responsabilidad, no la tecnología concreta.

```mermaid
flowchart TD
    Usuario(["Usuario (navegador)"])

    subgraph Externos["Externos"]
        ProvRazonamiento["Proveedor de Razonamiento"]
        ProvVoz["Proveedor de Voz"]
        ProvAlignment["Proveedor de Alignment"]
        ProvImagen["Proveedor de Imagen"]
        ProvVideo["Proveedor de Video"]
    end

    subgraph Vid4You["Sistema Vid4You (host único — stack por decidir)"]
        Frontend["Frontend (SPA — stack TBD)"]
        Backend["Backend / Orquestador de etapas\n(API + máquina de estados — stack TBD)"]
        DB[("Base de datos / persistencia\n(motor TBD, ver define-persistence)")]
        Files[("Almacenamiento de archivos\nguion, MP3, marcas de tiempo,\nimágenes, clips, MP4 final")]
    end

    Usuario -->|HTTPS| Frontend
    Frontend <-->|API + actualizaciones en vivo| Backend
    Backend --> DB
    Backend --> Files
    Backend --> ProvRazonamiento
    Backend --> ProvVoz
    Backend --> ProvAlignment
    Backend --> ProvImagen
    Backend --> ProvVideo
```

**Patrón.** Arquitectura cliente-servidor en capas, con el backend actuando como orquestador de un pipeline de etapas con estado (una máquina de estados por sesión y por escena). Se elige por los propios requisitos funcionales del PRD: cada etapa tiene su propio presupuesto de reintentos y su límite de concurrencia compartido entre sesiones (`docs/PRD.md` §10.1, §11), una pausa afecta a la sesión completa deteniendo el lanzamiento de nuevas etapas (§9), y el progreso se refleja en vivo sin recargar la página (§8.3). Centralizar esa lógica en un backend orquestador es lo que permite cumplir esas reglas de forma consistente.

**Beneficios.** Separación clara de responsabilidades (interfaz / orquestación y reglas de negocio / persistencia y archivos / proveedores externos); encaja de forma natural con la máquina de estados de sesión y chunk ya definida en el PRD (§8); es una arquitectura simple de operar para una instalación de un único host, como es este MVP.

**Sacrificios.** Un solo backend concentra tanto la API como la orquestación de etapas (no hay separación en workers o colas de trabajo independientes); no está pensada para multiusuario ni para alta concurrencia entre sesiones de distintos usuarios.

**Evolución si creciera el uso** (mención orientativa, sin comprometerse a implementarla ahora): si el volumen de sesiones o escenas concurrentes creciera, el orquestador de etapas podría separarse del servidor de API en workers o colas de trabajo independientes, escalables por separado.

### **2.2. Descripción de componentes principales:**

| Componente | Responsabilidad |
|---|---|
| Frontend (SPA, stack por decidir) | Interfaz de usuario: alta de sesión, progreso por fase y por escena en vivo, descargas parciales y del video final, formularios de corrección de prompt ante fallo (`docs/PRD.md` §8.3, §10.3). |
| Backend / orquestador de etapas (stack por decidir) | Expone la API, aplica la máquina de estados de sesión y chunk, la política de reintentos y el límite de concurrencia por etapa, gestiona la pausa/continuación, y llama a los proveedores de IA (§8–§11). |
| Base de datos / persistencia (motor por decidir, ver `define-persistence`) | Persistencia de sesiones, chunks, estados y referencias a resultados, resiliente a reinicios (§12.1). |
| Almacenamiento de archivos | Guion, voice-over completo (MP3), marcas de tiempo, imágenes y clips por escena, y MP4 final, organizados por carpeta de proyecto (§12.2). |
| Integraciones con proveedores de IA (externos) | Un proveedor por etapa — razonamiento, voz, alignment, imagen y video — hardcodeado en el MVP, con credenciales vía entorno o fichero local de secretos (§11). |

### **2.3. Descripción de alto nivel del proyecto y estructura de ficheros**

Estructura **actual** del repositorio:

```
AI4Devs-finalproject/
├── docs/            # PRD, estándares (backend/frontend/documentación), spec de API y modelo de datos
├── ai-specs/        # Fuente canónica de skills y agentes reutilizables entre herramientas de IA
├── openspec/        # Propuestas, specs y cambios gestionados con OpenSpec (spec-driven development)
├── packages/
│   └── specboot/    # Tooling de arranque de OpenSpec para este y otros proyectos
├── AGENTS.md, CLAUDE.md, GEMINI.md, codex.md   # Symlinks → docs/base-standards.md
└── readme.md
```

Estructura **planeada**, aún no creada: carpetas `backend/` y `frontend/` en la raíz, cuyo contenido y convenciones concretas se fijarán al cerrar los spikes `define-backend-stack` y `define-frontend-stack`. En ese momento se reescribirán `docs/backend-standards.md` y `docs/frontend-standards.md` (hoy documentan el stack de un proyecto anterior, no aplicable a Vid4You) para que describan la estructura interna real de cada carpeta.

### **2.4. Infraestructura y despliegue**

> Borrador — varias piezas dependen de decisiones aún no tomadas (`define-backend-stack`, `define-frontend-stack`, `define-persistence`). No se ha decidido ningún pipeline de CI/CD; el despliegue actual, si lo hay, es manual.

- **Host**: una única instancia de servidor (por ejemplo, una EC2 o similar; el proveedor concreto está pendiente), accesible mediante una URL pública. En esta entrega no hay login: cualquiera con la URL puede acceder a la aplicación (ver §2.5, aclarado explícitamente por el propietario del producto).
- **Variables de entorno**: gestionadas vía un fichero `.env` no versionado en el host, con al menos las credenciales de los proveedores de IA de cada etapa (`docs/PRD.md` §11). Los nombres exactos de las variables quedan pendientes de la decisión de stack.
- **Base de datos y despliegue de la app**: pendientes de `define-persistence`, `define-backend-stack` y `define-frontend-stack`.

### **2.5. Seguridad**

- **Modelo de acceso del MVP actual**: sin cuentas ni autenticación; cualquiera que tenga la URL puede acceder a la aplicación (aclaración explícita del propietario del producto). El aislamiento entre sesiones es un requisito de integridad funcional, no un control de seguridad de acceso (`docs/PRD.md` §12.3): evita que una sesión sobrescriba o muestre datos de otra, pero no protege frente a terceros.
- **Gestión de secretos**: credenciales de los proveedores de IA gestionadas vía `.env` con permisos de fichero restringidos en el host; nunca hardcodeadas en el código (§11).
- **Transporte**: HTTPS en el host de despliegue, con certificados gestionados vía Certbot.
- **Evolución futura** (explícitamente fuera de esta entrega, aclarado por el propietario del producto): autenticación con Google OAuth y autorización por roles, gestionada por un rol Administrador — alineado con el rol Administrador que el PRD ya prevé como post-MVP (§2.1, §11.2: configuración, diagnóstico, cambio de proveedor y reportes en `/admin`).
- No se añaden controles de seguridad multiusuario (RBAC granular, límites de tasa por usuario, etc.) mientras el modelo de acceso siga siendo de instalación única sin cuentas.

### **2.6. Tests**

> En esta entrega todavía no hay código de aplicación, por lo que esto describe la **estrategia planificada**, no resultados de ejecución.

La estrategia sigue el principio de TDD ya fijado en los estándares del proyecto (`docs/base-standards.md` §1) y los pasos obligatorios que cada tarea OpenSpec debe cumplir, detallados en `docs/openspec-tasks-mandatory-steps.md` (no se duplican aquí):

- **Tests unitarios**, junto con verificación del estado de la base de datos, antes de dar una tarea por completada.
- **Pruebas manuales de los endpoints con curl**, ejecutadas por el propio agente antes de cerrar la tarea.
- **Tests E2E con Playwright MCP**, ejecutados por el propio agente sobre el flujo completo de usuario, cuando la tarea afecta a la interfaz.

La ejecución real de estos tests comenzará cuando exista código de aplicación, tras cerrarse las decisiones de `define-backend-stack` y `define-frontend-stack`.

---

## 3. Modelo de Datos

### **3.1. Diagrama del modelo de datos:**

> Recomendamos usar mermaid para el modelo de datos, y utilizar todos los parámetros que permite la sintaxis para dar el máximo detalle, por ejemplo las claves primarias y foráneas.


### **3.2. Descripción de entidades principales:**

> Recuerda incluir el máximo detalle de cada entidad, como el nombre y tipo de cada atributo, descripción breve si procede, claves primarias y foráneas, relaciones y tipo de relación, restricciones (unique, not null…), etc.

---

## 4. Especificación de la API

> Si tu backend se comunica a través de API, describe los endpoints principales (máximo 3) en formato OpenAPI. Opcionalmente puedes añadir un ejemplo de petición y de respuesta para mayor claridad

---

## 5. Historias de Usuario

> Documenta 3 de las historias de usuario principales utilizadas durante el desarrollo, teniendo en cuenta las buenas prácticas de producto al respecto.

**Historia de Usuario 1**

**Historia de Usuario 2**

**Historia de Usuario 3**

---

## 6. Tickets de Trabajo

> Documenta 3 de los tickets de trabajo principales del desarrollo, uno de backend, uno de frontend, y uno de bases de datos. Da todo el detalle requerido para desarrollar la tarea de inicio a fin teniendo en cuenta las buenas prácticas al respecto. 

**Ticket 1**

**Ticket 2**

**Ticket 3**

---

## 7. Pull Requests

> Documenta 3 de las Pull Requests realizadas durante la ejecución del proyecto

**Pull Request 1**

**Pull Request 2**

**Pull Request 3**

