# PRD — Vid4You

**Versión:** 1.5  
**Alcance:** MVP  
**Status (v1.5):** D11 closed — silence allocation decided (`decide-silence-allocation`, JOS-142). All product decisions now closed. Changes are listed in §16. The previous version is kept in `docs/PRD-v1.4.md`.

## 1. Objetivo del producto

Vid4You es una aplicación web que convierte un guion proporcionado por el usuario en un video narrado, en formato MP4 horizontal 16:9.

El sistema genera una narración completa, divide el guion en escenas o *chunks*, genera una imagen y un clip por escena, ajusta los clips a la narración y ensambla el video final. El procesamiento avanza automáticamente, salvo cuando existe una pausa solicitada por el usuario o un fallo que impide continuar.

El usuario puede consultar el progreso por fase y por escena, descargar resultados disponibles y recuperar generaciones fallidas sin modificar el contenido narrado.

## 2. Usuarios y alcance

### 2.1 Roles

| Rol | Responsabilidad |
|---|---|
| User (*Usuario*) | Enter a title, a script, and the script's language; follow progress and per-scene diagnostics; pause and continue the session; download results; retry failed stages. |

The MVP has a single role: the User. Providers and all generation parameters are hardcoded in the application (§11); the MVP has no configuration files, no administration interface, and no Administrator role. Provider credentials (API keys) are read from the machine's local environment or a local secrets file kept out of the code repository; they are never hardcoded. An Administrator role (configuration, diagnostics, provider changes, and reports on `/admin`) is deferred post-MVP.

### 2.2 Incluido en el MVP

- Creación de sesiones a partir de un título y un guion.
- Generación de un único voice-over por guion.
- Obtención de los intervalos de narración de cada fragmento dentro del audio completo.
- Descomposición automática en chunks y creación de sus instrucciones visuales.
- Generación de una imagen y un clip por chunk.
- Sincronización de los clips con el audio y montaje del MP4 final.
- Visualización del progreso, resultados y errores.
- Pausas antes del lanzamiento de una fase y continuación explícita.
- Partial downloads (per-scene images and clips, §12.3) and download of the final video.
- Reintentos automáticos y manuales ante fallos.
- Corrección del prompt visual correspondiente a una etapa fallida.
- Persistencia de sesiones, estados y resultados.

### 2.3 Fuera del MVP

- Interfaz de administración, incluida la ruta `/admin`.
- Cuentas de usuario, autenticación y exposición de la aplicación fuera de un entorno local.
- Reportes de uso o costos.
- Importación o edición libre de chunks.
- Reescritura del guion o regeneración de una narración ya completada.
- Regeneración de imágenes o clips exitosos por preferencia estética.
- Cancelación de solicitudes ya enviadas a un proveedor.
- Montajes que omitan escenas del guion.
- Configuration files or any runtime configuration of providers and parameters (hardcoded in the MVP, §11).
- Administrator role and any provider change, manual or automatic, including moving failed stages to another provider (§11.2).
- Session expiry (§12.2).
- Size or budget limits per session (§4.1).
- A product-level content policy; providers' own content filters apply (§4.1).

## 3. Conceptos y datos del proyecto

Una **sesión** representa un proyecto de video y tiene un identificador generado por el sistema. Contiene el título, el guion, la narración, los chunks, el progreso y los resultados. Los datos de sesiones diferentes permanecen separados, aunque sus títulos coincidan. The session also stores the script language selected by the User (§4.1).

El **guion** es el texto original del usuario. El sistema lo utiliza como contenido de la narración y como fuente de las escenas; no lo redacta de nuevo.

El **voice-over** es un único archivo MP3 que contiene la narración completa del guion. Los chunks se relacionan con intervalos de ese audio; no requieren generar voces independientes.

Las **marcas de tiempo** sitúan cada fragmento del guion dentro del voice-over. Su obtención se define en §11 y es condición previa a la descomposición.

Un **chunk** es una escena y contiene, como mínimo:

| Campo | Contenido | Edición por el usuario |
|---|---|---|
| `ID` | Número secuencial asignado por el sistema. | No permitida. |
| `PROMPT` | Fragmento del guion narrado en la escena. | No permitida. |
| `IMAGE` | Instrucción para generar la imagen. | Solo ante fallo de generación de esa imagen. |
| `VIDEO` | Instrucción para animar la imagen. | Solo ante fallo de generación de ese clip. |
| Intervalo de narración | Posición y duración de la escena en el audio completo, conforme a §6.1 y §7.3. | No permitida. |
| Duración solicitada y factor de ajuste | Duración pedida al proveedor y factor de velocidad resultante, conforme a §7.2 y §7.3. | No permitida. |
| Estado y resultados | Progreso, imagen, clip y error, cuando corresponda. | Actualizados por el sistema. |

Cada etapa conserva la identificación del proveedor utilizado y los intentos realizados. Esta información permite diagnosticar fallos sin exponer credenciales ni datos confidenciales. It is shown to the User in each scene's details (image and clip stages) and in each phase's section (session-level stages).

## 4. Entrada y conservación del contenido

### 4.1 Entrada del usuario

El usuario introduce un título y un guion no vacíos. No necesita proporcionar identificadores, etiquetas, delimitadores ni instrucciones de imagen o video.

The User also selects the script's language from the hardcoded list of supported languages (§11.3: **English, Spanish**). Only supported languages can be chosen, and a project cannot start without a selected language; no provider is called before that.

No existe un límite funcional de palabras establecido por el producto. Un guion de aproximadamente 1500 palabras es una referencia habitual, no una restricción ni una duración obligatoria. La duración del video depende de la narración real del guion. The MVP sets no limit on script words, number of scenes, or provider calls per session.

Si una restricción del servicio impide procesar el contenido, el sistema informa la causa. No recorta ni resume el guion para adaptarlo silenciosamente.

The MVP has no product-level content policy: providers' own content filters decide. A rejection is a not-retryable failure (§10.1). Because the script is locked at project start (§4.2), a rejected script requires starting a new project; rejected `IMAGE` or `VIDEO` instructions can be corrected (§10.3).

### 4.2 Fidelidad e inmutabilidad

- La narración debe corresponder al guion completo proporcionado por el usuario.
- The script is locked as soon as the User starts the project (from `submitted` onward), including while the session is paused and after a voice failure. Once the voice-over has been generated successfully, the audio cannot be regenerated within that session.
- La descomposición no puede agregar, eliminar, duplicar, resumir ni parafrasear contenido narrativo.
- Los fragmentos de los chunks, unidos en orden, deben reconstruir el guion original. Solo se permite normalizar espacios de separación sin alterar el contenido.
- Crear instrucciones visuales no constituye una modificación del guion.
- Reintentar una generación de voz fallida antes de obtener un audio válido no equivale a regenerar una narración completada.

## 5. Flujo funcional

1. El usuario proporciona el título y el guion e inicia el proyecto.
2. El sistema registra la sesión y genera el voice-over completo.
3. Con el audio disponible, obtiene sus marcas de tiempo conforme a §11.
4. Divide el guion en chunks aplicando la regla de §6.1 y asigna a cada fragmento su intervalo narrado.
5. Asigna los identificadores y genera las instrucciones `IMAGE` y `VIDEO`.
6. Genera la imagen de cada chunk.
7. Cuando la imagen está disponible, genera el clip utilizando esa imagen y la instrucción `VIDEO`.
8. Cuando todos los chunks están completos, ajusta los clips a sus intervalos de narración y los une en orden.
9. Incorpora el voice-over completo y produce el MP4 final.
10. Marca la sesión como `final-video` cuando el archivo final está terminado y disponible para descargar.

Los pasos 3 y 4 pertenecen a la misma fase de descomposición y comparten su estado y su política de reintentos.

La finalización de una escena no requiere que otras escenas hayan terminado. El inicio del montaje sí requiere que todas estén completas. Los resultados disponibles pueden descargarse durante el procesamiento.

## 6. Chunks y orden narrativo

El sistema asigna identificadores numéricos consecutivos del **1 al N**, según el orden de aparición de los fragmentos en el guion original.

Los identificadores son únicos dentro de la sesión y permanecen invariables durante el procesamiento y los reintentos. Un mismo identificador puede existir en sesiones diferentes.

La presentación y el montaje final siguen el orden numérico ascendente de los identificadores, independientemente del orden en que terminen las generaciones. Si termina el chunk 3 antes que el 2, el montaje conserva el orden 1, 2, 3.

Todos los chunks deben tener sus cuatro campos de contenido completos: `ID`, `PROMPT`, `IMAGE` y `VIDEO`. Una estructura inválida generada por el sistema constituye un fallo de descomposición, no un error de formato del guion introducido por el usuario.

Una vez establecidos, el usuario no puede dividir, combinar, eliminar ni reordenar chunks. Los reintentos conservan la identidad y el contenido narrativo de la escena.

### 6.1 Regla de segmentación

La segmentación se ejecuta después de disponer del voice-over y de sus marcas de tiempo, de modo que el sistema conoce la duración narrada de cada candidato antes de fijar los cortes.

- **Criterio de corte.** Los cortes coinciden con fronteras de oración. Un chunk agrupa una o más oraciones consecutivas completas.
- **Cota superior.** La duración narrada de un chunk no supera la duración máxima admitida por el proveedor de video activo.
- **Lower bound.** A chunk's narrated duration does not fall below the hardcoded lower bound. A sentence that does not reach it is grouped with the following sentence; if it is the script's last sentence, it is grouped with the previous one (see §6.1.1 for edge cases).
- **Excepción.** Una oración cuya narración supere por sí sola la cota superior se divide en frontera de cláusula, marcada por coma, punto y coma o conjunción. Es la única división permitida dentro de una oración.
- **Optimización.** Entre las agrupaciones que cumplen ambas cotas, el sistema prefiere aquellas cuya duración narrada quede más próxima a una duración admitida por el proveedor de video, para reducir el ajuste de velocidad de §7.3.

La regla no altera §4.2: los fragmentos unidos en orden siguen reconstruyendo el guion original.

La cota inferior existe porque el proveedor de video impone una duración mínima de clip. Sin ella, un fragmento muy breve obligaría a un factor de aceleración elevado. Its value is hardcoded (§11.3: **5 seconds**) and matches the shortest duration admitted by the video provider, by construction.

El incumplimiento de estas reglas por una descomposición generada por el sistema constituye un fallo de descomposición, no un error del guion introducido por el usuario.

#### 6.1.1 Edge cases (v1.3)

- **Script shorter than the lower bound.** If the whole script's narration is below the lower bound, it becomes a single chunk below the lower bound. Its clip is requested at the shortest admitted duration and sped up to fit (§7.2).
- **Short sentence whose grouping would exceed the maximum.** If a sentence below the lower bound would exceed the upper bound when grouped with the following sentence, the following sentence is split at a clause boundary (comma, semicolon, or conjunction) and its first part is grouped with the short sentence. This extends the clause-boundary exception to sentences that do not exceed the upper bound on their own.
- **Sentence that cannot be split.** If a sentence must be split (it exceeds the upper bound on its own, or it is the following sentence in the previous case) but has no comma, semicolon, or conjunction, it is kept whole in one chunk even if that chunk exceeds the upper bound. Its clip is requested at the maximum admitted duration and slowed down to fit, and a speed-factor warning is recorded; it is not a failure.

## 7. Generación visual, duración y montaje

### 7.1 Imagen

Cada chunk utiliza su instrucción `IMAGE` para generar una imagen horizontal 16:9 con resolución mínima de 1920 × 1080. El clip no puede solicitarse sin una imagen disponible.

### 7.2 Clip

Cada clip utiliza la imagen generada y la instrucción `VIDEO`. La duración solicitada se calcula a partir de la duración del intervalo correspondiente en el voice-over, respetando los valores admitidos por el proveedor.

- El sistema solicita la duración admitida por el proveedor **más próxima** al intervalo narrado. Se admite que la duración solicitada sea menor que el intervalo, lo que implica ralentizar el clip durante el montaje. "Closest" means the admitted duration requiring the smallest speed change (speed-up or slow-down ratio) to match the interval, not the fewest seconds; an exact tie goes to the longer duration.
- Cuando el intervalo narrado es inferior a la menor duración admitida, se solicita esa menor duración.
- El sistema no debe asumir que todos los proveedores admiten las mismas duraciones ni cualquier valor intermedio. The set of admitted durations is hardcoded for the video provider (§11).
- El máximo habitual previsto es de 15 segundos; un proveedor que admita 20 segundos puede utilizar ese máximo. **Recorded (§11.3): the hardcoded video provider's measured admitted range is 5-15 seconds** — the "usual" 15-second expectation is exactly the measured maximum, not just a placeholder guess.

The §6.1 upper bound ensures that no narrated interval exceeds the video provider's maximum, except for a sentence that cannot be split (§6.1.1). That clip is requested at the maximum admitted duration and slowed down to fit, with a speed-factor warning. No trimming policy is required.

El factor de ajuste de velocidad no es un parámetro independiente: resulta de la regla de segmentación de §6.1 y de la selección de duración descrita arriba. The system records the resulting factor for each scene with its result and shows it, with the requested duration, in the scene details. The acceptable limit is hardcoded (§11); when a scene exceeds it, a diagnosable warning is recorded, not a failure.

### 7.3 Sincronización y montaje final

La duración de cada clip se ajusta a su intervalo de narración mediante ajuste de velocidad, que puede acelerar o ralentizar el clip. El audio y el texto no se modifican para acomodarse a los clips.

Los intervalos de narración de los chunks forman una **partición del eje temporal del voice-over**: son contiguos, no se solapan y cubren desde el segundo 0 hasta la duración total del MP3. Esta propiedad es un requisito del producto y se mantiene cualquiera que sea la regla adoptada en D11.

**D11 (closed, JOS-142, product owner decision 2026-09-29):** cada silencio de la narración se asigna a la escena anterior — el corte a la siguiente escena ocurre exactamente cuando comienza su narración, no a mitad del silencio. Un clip sostiene hasta 2 segundos de silencio de forma aceptable; a partir de 3 segundos empieza a sentirse lento. Ningún guion real medido en la comparación (inglés y español, marcas nativas y de alineación forzada) superó 1.26 segundos, por debajo del umbral, así que no se define una tercera regla. Evidencia completa: `docs/adr/0006-silence-allocation.md` y `openspec/changes/archive/2026-09-29-decide-silence-allocation/reports/`.

El montaje debe conservar todo el contenido narrado y la secuencia de escenas, sin omisiones, duplicaciones ni huecos visuales. Debe cubrir también las pausas existentes en la narración.

El video final solo puede generarse cuando todas las escenas estén en `chunk-complete`. Una sesión con una escena fallida o pendiente no puede alcanzar `final-video`.

**Final MP4 output (v1.3).** The audio track is the voice-over only; each clip's own sound is removed. Resolution and frame rate are hardcoded (expected 1920×1080 at 30 fps), with H.264 video and AAC audio.

Si falla el montaje, se conserva el audio y las escenas exitosas. El reintento se aplica al montaje, sin volver a generar los componentes ya completados.

## 8. Estados y progreso

Los estados de la sesión y de cada chunk se gestionan por separado. El nombre `complete` no se utiliza como estado final.

### 8.1 Estados de la sesión

| Estado | Significado |
|---|---|
| `submitted` | La sesión y el guion están registrados. |
| `voice-over-generating` | Se está generando la narración completa. |
| `voice-over-complete` | El MP3 completo está disponible. |
| `chunk-decomposing` | Se están obteniendo las marcas de tiempo y preparando los chunks y sus instrucciones. |
| `chunks-processing` | Se están generando las imágenes y los clips. |
| `final-video-generating` | Se está sincronizando y ensamblando el MP4 final. |
| `final-video` | El MP4 final está terminado y disponible para descargar. |
| `failed` | Una fase necesaria agotó sus reintentos o no pudo completarse; se muestra cuál falló. |

**State rules (v1.3):**
- While any scene is still generating, the session stays `chunks-processing` even if another scene is `failed`. It becomes `failed` only when no scene is still generating and at least one scene is `failed`, and it shows which scenes failed.
- A manual retry on a `failed` session returns it to the in-progress state of the retried phase: scene → `chunks-processing`, voice → `voice-over-generating`, decomposition → `chunk-decomposing`, assembly → `final-video-generating`. The earlier failure stays visible in diagnostics.
- A pause is a separate "paused" marker on top of the current session state, not a state of its own. Continuing removes the marker and leaves the state unchanged.

### 8.2 Estados del chunk

| Estado | Significado |
|---|---|
| `submitted` | El chunk está registrado y pendiente de generar su imagen. |
| `image-generating` | La generación de la imagen está en curso. |
| `image-complete` | La imagen está disponible; falta generar el clip. |
| `video-generating` | La generación del clip está en curso. |
| `chunk-complete` | La imagen y el clip están disponibles. Es el estado final de la escena. |
| `failed` | Falló la generación de imagen o video y se agotaron los reintentos automáticos. |

Un fallo conserva la identificación de la etapa afectada. Un reintento vuelve a esa etapa y no al inicio del proyecto.

### 8.3 Información visible

La interfaz presenta una sección o pestaña por fase y muestra el estado de las escenas, los resultados disponibles, los errores y las acciones aplicables. El progreso se actualiza durante el procesamiento. An open session page shows each state change, result, and error as soon as it happens, without reloading.

Una pausa se muestra como condición adicional de control, conservando la fase y el avance alcanzados. No equivale a éxito ni a fallo.

## 9. Pausa y continuación

El usuario puede impedir el lanzamiento de una fase antes de que esta haya comenzado. Una solicitud ya enviada a un proveedor continúa hasta terminar o fallar y no puede pausarse ni cancelarse desde el MVP.

Los resultados de solicitudes ya enviadas se conservan aunque exista una pausa. Una fase detenida antes de su lanzamiento permanece pendiente hasta que el usuario indique explícitamente que desea continuar.

La interfaz debe distinguir entre una generación que sigue en curso y una fase que está esperando la continuación del usuario. La pausa no revierte resultados ni elimina trabajo realizado.

A pause applies to the whole session: every not-yet-launched generation, phase, and retry (automatic or manual) is held until the User explicitly continues, so a pause means no new provider calls. Requests already sent finish. There is no per-scene pause.

## 10. Fallos, reintentos y correcciones

### 10.1 Reintentos automáticos

Ante un fallo transitorio, el sistema permite hasta **tres reintentos automáticos adicionales al intento inicial** de la etapa afectada. No realiza reintentos automáticos indefinidos.

A failure the provider reports as not retryable (for example, a content-filter rejection) skips automatic retries and goes directly to `failed` with its cause shown.

Each stage has a hardcoded maximum of simultaneous provider requests, shared across all sessions. Requests beyond it wait their turn and are sent first come, first served, regardless of session. Waiting counts neither as a failed attempt nor as execution time.

Al agotar el límite, la etapa queda en `failed`. La interfaz muestra un error comprensible y la opción de reintento manual cuando corresponda. La política debe evitar que mecanismos internos de recuperación multipliquen inadvertidamente el límite funcional.

La espera previa al inicio de una etapa no debe confundirse con el tiempo de ejecución ni provocar un fallo prematuro de escenas que comienzan más tarde. Per-phase maximum times are hardcoded (§11).

### 10.2 Reintentos manuales

El usuario puede reintentar la etapa fallida conservando los resultados exitosos anteriores. Agotar los reintentos automáticos bloquea el avance afectado, pero no elimina el proyecto ni sus archivos.

When a scene ends in `failed`, all other scenes keep generating until they reach `chunk-complete` or fail themselves; only the final video waits. Each manual retry starts a new cycle of up to three automatic retries.

### 10.3 Edición permitida

| Fallo | Acción permitida |
|---|---|
| Generación de imagen | Reintentar con la misma instrucción o corregir únicamente `IMAGE`. |
| Generación de video | Reintentar con la misma instrucción o corregir únicamente `VIDEO`, conservando la imagen exitosa. |
| Generación de voz | Reintentar la generación fallida con el mismo guion, sin sustituir un audio ya completado. |
| Obtención de marcas de tiempo | Retry on the same audio. If native timestamps were returned but are unusable, automatic and manual retries switch directly to the alignment stage (§11.1); the voice provider is not asked again. |
| Descomposición | Reintentar la división del mismo guion sin reescribirlo ni regenerar el audio. |
| Montaje final | Reintentar el montaje con los componentes ya generados. |

Ninguna recuperación permite cambiar `ID`, `PROMPT`, el orden narrativo o un voice-over completado. Las correcciones visuales son la única excepción a la regla de chunks no editables.

## 11. Proveedores y operación

In the MVP, the provider for each stage (reasoning, voice, alignment, image, video) and all generation parameters are hardcoded in the application. Hardcoded parameters: narration voice, quality, and speed; video admitted durations and maximum; segmentation lower bound; acceptable speed-factor limit; per-phase maximum times; output resolution and frame rate; supported script languages; and maximum simultaneous requests per stage. Their concrete values were defined by `define-provider-configuration` (JOS-165) and are recorded in §11.3. Provider credentials are read from the local environment or a local secrets file, never hardcoded. There is one provider per stage.

| Etapa | Capacidad requerida |
|---|---|
| Razonamiento | Dividir el guion con fidelidad conforme a §6.1 y generar instrucciones visuales. La referencia de capacidad establecida para el proyecto es equivalente a Sonnet 4.6 o superior. Verified: OpenAI `gpt-6-astra` (§11.3). |
| Voz | Producir la narración completa en MP3 con voz, calidad y velocidad preconfiguradas, y entregar marcas de tiempo del audio generado con granularidad suficiente para situar cada fragmento del guion. Verified: ElevenLabs, character-level native timestamps (§11.3). |
| Alignment | Derive the timestamps by aligning the generated MP3 against the script when the voice provider's native timestamps are not available or are unusable (§11.1). Verified: ElevenLabs Forced Alignment, same account as Voice (§11.3). |
| Imagen | Generar imágenes desde texto en 16:9 y con resolución mínima de 1920 × 1080. Verified: Fal.ai `fal-ai/flux/dev` (§11.3). |
| Video | Animate a reference image with a requested duration within its capabilities. Its admitted durations and maximum are hardcoded (§11.3: 5-15 seconds). Verified: RunningHub, MiniMax-H3 "Hailuo-03" (§11.3). |

### 11.1 Marcas de tiempo y mecanismo de respaldo

Las marcas de tiempo son una capacidad requerida de la etapa de voz. Se obtienen por uno de dos mecanismos, en este orden de preferencia:

1. **Marcas de tiempo nativas.** El proveedor de voz las entrega junto al MP3.
2. **Alineación forzada.** Si el proveedor activo no las entrega, el sistema las deriva alineando el MP3 generado contra el guion conocido. Forced alignment is performed by the alignment stage and its own provider; it is also used when native timestamps are returned but unusable.

La alineación forzada es el mecanismo de respaldo declarado del producto y no sustituye la preferencia por marcas de tiempo nativas. Verifying which of the two applies to the hardcoded voice provider is a task prior to implementing the decomposition phase.

La imposibilidad de obtener los intervalos por cualquiera de los dos mecanismos constituye un fallo de descomposición, se refleja en `chunk-decomposing` y sigue la política de reintentos de §10.1.

### 11.2 Vinculación y cambio de proveedor

In the MVP there is no provider change of any kind: providers are hardcoded, and there is no manual or automatic switching. Manual provider changes and moving failed stages to another provider are deferred post-MVP.

La etapa conserva el proveedor utilizado para sus reintentos automáticos y manuales. En voz, esta asociación pertenece a la sesión; en imagen y video, al chunk y a la etapa correspondiente.

A stage tied to a provider that is unavailable keeps retrying that same provider until it recovers. Completed results are never regenerated.

A change to the hardcoded admitted durations in a later version of the application does not alter the intervals or chunks already established in existing sessions.

### 11.3 Recorded providers and parameter values (JOS-165)

Defined by `define-provider-configuration` (JOS-165), verified against real calls per Decision 2 of its design (never from documentation alone). Full evidence and provenance: `docs/adr/0005-provider-selection.md` and `openspec/changes/define-provider-configuration/reports/`.

| Stage | Provider | Identifier |
|---|---|---|
| Reasoning | OpenAI | `gpt-6-astra` |
| Voice | ElevenLabs | `eleven_multilingual_v2`, voice "Burt Reynolds™" |
| Alignment | ElevenLabs | Forced Alignment API — same account as Voice |
| Image | Fal.ai | `fal-ai/flux/dev` |
| Video | RunningHub | MiniMax-H3 "Hailuo-03" |

| Parameter | Value | Notes |
|---|---|---|
| Video admitted durations | 5-15 seconds | Both ends measured with real calls |
| Segmentation lower bound (§6.1) | 5 seconds | = video provider's measured minimum |
| Output resolution and frame rate (final MP4, §7.3, D08) | 1920×1080 @ 30fps, H.264/AAC | Neither the image nor video provider natively produces this; the assembly stage normalizes down from higher-than-target generation settings (2560×1440@24fps video, 1920×1088 image) |
| Supported script languages (§4.1, D09) | English, Spanish | Each verified independently across voice, alignment and reasoning |
| Acceptable speed-factor limit | **Provisional** | `define-media-assembly` (JOS-182) recommends 0.5x-2.0x (its ADR, Decision 5); `decide-silence-allocation` (JOS-142) verified D11's adopted rule against that recommendation (max 1.08x observed). Not yet the fixed constant: US-33 records it, and JOS-182's own PR is not yet merged into this branch's history. |
| Per-phase maximum times | Reasoning 20s, Image 25s, Voice 10s, Alignment 5s, Video 240s, Assembly provisional | Set above the observed slow tail of 4-7 real samples per stage; assembly depends on JOS-182 |
| Maximum simultaneous requests per stage | Reasoning 50, Image 200 (provisional), Voice/Alignment/Video undetermined | No invented numbers where no real rate limit was found |

**Not-retryable failure signal**: tested against all four provider-calling stages with disallowed instructional content — **none produced a distinguishable rejection**. This is an open finding for the product owner (`docs/adr/0005-provider-selection.md`, Decision 5), not yet resolved: §10.1's not-retryable branch currently has nothing to trigger on for this content class on any of these providers.

## 12. Persistencia, archivos y descargas

### 12.1 Conservación del proyecto

El sistema conserva sesiones, chunks, estados, referencias a resultados y errores de forma persistente. El avance debe sobrevivir a reinicios y poder recuperarse en consultas posteriores.

After a restart, a request already sent to a provider is resumed: the system waits for its original result if the provider still holds it. If it cannot be recovered, it counts as a failed attempt and follows §10.1.

Recibir más de una confirmación de éxito para una misma generación no debe duplicar resultados, iniciar dos veces la etapa siguiente ni incorporar una escena varias veces al montaje.

### 12.2 Archivos

Los archivos locales se organizan en carpetas identificadas por el título del video y **no se eliminan automáticamente ni caducan**. Los proyectos con títulos iguales deben permanecer separados y no sobrescribir sus resultados. Each project folder is named with the video title plus the project's creation date and time to the minute (e.g. `My Trip 2026-09-15 10-42`); if a folder with that name already exists, a counter is appended (e.g. `My Trip 2026-09-15 10-42 (2)`).

Se conservan localmente el guion y los textos generados, el MP3 completo, sus marcas de tiempo, los clips y el MP4 final. Every result delivered only as a temporary provider link, images included, is saved into the project folder before the link expires.

La conservación de archivos es independiente de la vigencia de la sesión. Sessions do not expire in the MVP; they remain consultable, downloadable, and resumable indefinitely.

### 12.3 Modelo de acceso, descargas y aislamiento

El MVP se ejecuta como una **instalación local destinada a un único usuario**. No existen cuentas, autenticación ni reglas de autorización.

El usuario puede descargar imágenes y clips exitosos individualmente mientras otras escenas siguen procesándose o presentan fallos. El MP4 final solo está disponible después de completarse el montaje. In-app downloads are limited to per-scene images, per-scene clips, and the final MP4; the MP3, timestamps, script, and generated texts are stored locally (§12.2) but cannot be downloaded from the app.

Las sesiones se consultan mediante su identificador. La separación de datos entre sesiones es un **requisito funcional de integridad, no un control de seguridad**: impide que un proyecto muestre o sobrescriba resultados de otro, y no protege frente a accesos de terceros.

Exponer la aplicación fuera de un entorno local exige definir previamente autenticación y reglas de autorización. Esa exposición queda fuera del MVP, conforme a §2.3.

## 13. Criterios de aceptación del MVP

| ID | Resultado verificable |
|---|---|
| AC01 | A valid title, a valid script, and a language selected from the supported list start a session without tags or chunk delimiters. |
| AC02 | A single MP3 is produced per script; the script cannot be changed once the project starts, and the voice cannot be regenerated after success. |
| AC03 | Los fragmentos narrados reconstruyen el guion completo en orden, sin omisiones, duplicaciones ni reescritura. |
| AC04 | Los chunks tienen identificadores consecutivos e invariables y sus cuatro campos de contenido completos. |
| AC05 | No se solicita un video si la imagen de su chunk no está disponible. |
| AC06 | Each video request uses the admitted duration requiring the smallest speed change to match the narrated interval, and never exceeds the provider's maximum. |
| AC07 | Una fase pausada antes del lanzamiento no comienza hasta continuar; una solicitud ya enviada no se interrumpe. |
| AC08 | After three automatic retries are exhausted, the failure is reported and no indefinite automatic cycle continues; a not-retryable failure is reported without automatic retries. |
| AC09 | Un fallo visual permite corregir únicamente el prompt de su etapa y conserva el contenido narrativo. |
| AC10 | Una escena fallida impide generar el video final; sus resultados exitosos y los de otras escenas siguen disponibles. |
| AC11 | El montaje respeta el orden numérico, aunque las escenas hayan terminado en otro orden. |
| AC12 | `final-video` solo se alcanza con todas las escenas completas y un MP4 16:9 narrado, sincronizado y descargable. El cambio de escena ocurre exactamente cuando comienza la narración de la siguiente, conforme a la regla de D11 (§7.3). |
| AC13 | Un fallo de montaje permite reintentar sin regenerar voz, imágenes ni clips exitosos. |
| AC14 | Un reinicio no pierde el avance; confirmaciones repetidas no duplican escenas ni lanzamientos. |
| AC15 | Los archivos locales no se eliminan automáticamente y dos proyectos con el mismo título no sobrescriben sus resultados. |
| AC16 | El MVP permite pausas y descargas parciales sin requerir una interfaz de administración o reportes. |
| AC17 | Los cortes entre chunks coinciden con fronteras de oración, salvo la excepción de oración larga prevista en §6.1. |
| AC18 | No chunk exceeds the video provider's maximum or falls below the hardcoded lower bound, except for a whole script shorter than the lower bound and a sentence that cannot be split (§6.1.1). |
| AC19 | Los intervalos de los chunks son contiguos, no se solapan y cubren el voice-over desde el segundo 0 hasta su duración total, con cada silencio asignado a la escena anterior (D11, §7.3). |
| AC20 | El sistema obtiene los intervalos mediante marcas de tiempo nativas o, en su ausencia, mediante alineación forzada; la imposibilidad de obtenerlos se reporta como fallo de descomposición y no como fallo de voz. |
| AC21 | La interfaz muestra, por fase y por escena, el estado vigente, los resultados disponibles, los errores y las acciones aplicables, y refleja el avance durante el procesamiento. |
| AC22 | Una sesión consultada por su identificador muestra únicamente sus propios chunks, archivos y resultados. |
| AC23 | Each scene records the requested duration and the applied speed factor, and shows them in its scene details. |

Los criterios afectados por la sección siguiente deberán completarse al cerrar esas decisiones. AC12 y AC19 reflejan ya la regla adoptada en D11 (silencios asignados a la escena anterior).

## 14. Decisiones de producto

Las decisiones marcadas como abiertas no están aprobadas y deben cerrarse antes de implementar el comportamiento correspondiente. No modifican las reglas confirmadas de las secciones anteriores.

| ID | Decisión requerida | Estado | Resolución adoptada o alternativa propuesta |
|---|---|---|---|
| D01 | Alcance de la pausa y tratamiento de reintentos pendientes. | **Closed (v1.3)** | Pause applies to the whole session; requests already sent finish; new phases and automatic and manual retries are held until continue (§9). |
| D02 | Duraciones discretas, escenas que superan el máximo y calidad del ajuste visual. | **Cerrada** | Regla de segmentación de §6.1 con cota superior e inferior, y selección de la duración admitida más próxima en §7.2. El factor de ajuste deja de ser un parámetro independiente. |
| D03 | Recuperación de etapas vinculadas a un proveedor no disponible. | **Closed (v1.3)** | No reassignment in the MVP (providers are hardcoded): the stage keeps retrying the same provider until it recovers. Manual reassignment is deferred post-MVP (§11.2). |
| D04 | Efecto de la expiración de la sesión a los dos días. | **Closed (v1.3)** | No session expiry in the MVP (§12.2). |
| D05 | Dependencia de enlaces temporales del proveedor. | **Closed (v1.3)** | Every temporary-link result, images included, is saved locally before its link expires (§12.2). |
| D06 | Continuación de otras escenas tras un fallo y reintentos posteriores a una acción manual. | **Closed (v1.3)** | Other scenes keep generating; each manual retry starts a new cycle of up to three automatic retries (§10.2). |
| D07 | Autorización y acceso a las sesiones. | **Cerrada** | Instalación local monousuario, sin cuentas ni autorización. La separación entre sesiones es integridad funcional, no seguridad (§12.3). |
| D08 | Parámetros de salida del MP4 final. | **Closed (v1.3)** | Voice-over-only audio (clip sound removed); hardcoded resolution and frame rate (expected 1920×1080 at 30 fps); H.264 video and AAC audio (§7.3). |
| D09 | Idiomas admitidos. | **Closed (v1.3)** | Hardcoded list of supported languages; the User selects the script language from that list when starting a project, and no provider is called before that (§4.1). |
| D10 | Momento exacto del bloqueo del guion durante la generación de voz. | **Closed (v1.3)** | The script is locked when the User starts the project (§4.2). |
| D11 | Asignación de los silencios de la narración a una escena. | **Cerrada (JOS-142, 2026-09-29)** | La escena previa absorbe el silencio posterior (comparada frente a repartir el silencio entre escenas contiguas, la regla interina de JOS-140, ahora descartada). Umbral: hasta 2 s aceptable, 3 s empieza a sentirse lento; ningún guion real supera 1.26 s. Verificado según §14.1. |

D08, D09 y D10 proceden de la división de la antigua D07 de la versión 1.1, que agrupaba decisiones heterogéneas bajo un solo identificador y no cubría las reglas de autorización que §12.3 le asignaba.

### 14.1 POC de asignación de silencios (D11) — Cerrada

La POC (`decide-silence-allocation`, JOS-142, 2026-09-29) comparó las dos reglas candidatas y produjo una decisión cerrada:

- Comparadas sobre cuatro guiones reales (inglés y español) con marcas de tiempo nativas y de alineación forzada: ninguna regla queda descartada por las cotas de §6.1 ni por el factor de ajuste (máximo observado 1.08x, muy por debajo de la recomendación de `define-media-assembly`, JOS-182: 0.5x-2.0x).
- Comparación audiovisual: el mismo guion real, ensamblado una vez con cada regla y con un barrido de silencios crecientes (1, 1.5, 2, 3 y 4 s) mostrado al product owner.
- Veredicto (product owner, 2026-09-29): la regla A (la escena previa absorbe el silencio) se lee mejor en pausas naturales; un clip sostiene hasta 2 s de silencio de forma aceptable, 3 s empieza a sentirse lento.
- El silencio real más largo medido (1.26 s) queda por debajo del umbral, así que no se define una tercera regla.
- Regla adoptada, umbral y actualización de §7.3, AC12 y AC19: hecha. Evidencia completa: `docs/adr/0006-silence-allocation.md` y `openspec/changes/archive/2026-09-29-decide-silence-allocation/reports/`.

**Idea derivada, no incluida en el alcance de esta decisión**: un control manual para que el usuario ajuste una escena que se sienta lenta y regenere su clip, registrado como JOS-190, pendiente de alcance propio.

## 15. Gaps abiertos no bloqueantes

Registrados para priorización. No impiden definir el MVP ni iniciar su refinamiento.

| # | Gap | Sección afectada |
|---|---|---|
| 1 | No se declaran las transiciones permitidas entre estados, en particular la salida de `failed` tras un reintento manual. **Closed in v1.3** (§8.1 state rules). | §8, §10.2 |
| 2 | No se distingue fallo transitorio de fallo permanente. Un rechazo por filtro de contenido del proveedor consumiría el presupuesto de reintentos sin posibilidad de éxito. **Closed in v1.3** (not-retryable failures skip automatic retries, §10.1). | §10.1 |
| 3 | La pausa no está representada en el modelo de datos ni en las máquinas de estado. Depende de D01. **Closed in v1.3** (pause marker, §8.1). | §3, §8 |
| 4 | La reasignación manual de proveedor prevista en D03 no tiene canal definido al no existir interfaz de administración. **Closed in v1.3** (no reassignment in the MVP; deferred, §11.2). | §2.3, §11.2 |
| 5 | No existe límite de escala por sesión: ni cota de palabras, ni de número de chunks, ni presupuesto de generaciones. **Closed in v1.3** (no limits in the MVP, §4.1). | §4.1, §10.1 |
| 6 | No se trata la concurrencia entre sesiones ni los límites de tasa del proveedor activo. **Closed in v1.3** (hardcoded request limit per stage, first come first served, §10.1). | §11 |
| 7 | No se define el mecanismo de actualización del progreso en la interfaz. **Closed in v1.3** (live updates without reloading, §8.3). | §8.3 |
| 8 | No se define la regla de desambiguación de carpetas con títulos iguales. **Closed in v1.3** (title + creation date/time + counter, §12.2). | §12.2, AC15 |
| 9 | No hay requisitos no funcionales, objetivo de negocio ni métricas de éxito. **Still open in v1.3** (known gap). | Documento completo |
| 10 | No hay política de contenido para guiones enviados a proveedores de terceros. **Closed in v1.3** (providers' own content filters only, §4.1). | §4.1, §11 |

## 16. Registro de cambios

### From version 1.4 to 1.5

Origin: `decide-silence-allocation` (JOS-142), 2026-09-29.

| Change | Origin |
|---|---|
| D11 closed: the previous scene absorbs the silence that follows it (the cut to the next scene falls exactly when its narration starts), chosen over splitting the silence between adjacent scenes (JOS-140's interim rule) from a product-owner-judged rendered comparison of real narration (§7.3, §14.1). | JOS-142 |
| Silence threshold recorded: a clip sustains up to 2 s of silence acceptably; 3 s starts dragging. No real surveyed pause (max 1.26 s) exceeds it, so no third rule was defined (§14.1). | JOS-142 |
| AC12 and AC19 updated to state the adopted rule. | JOS-142 |
| §11.3's speed-factor row now references `define-media-assembly`'s (JOS-182) recommended 0.5x-2.0x range, verified against D11's adopted rule (max 1.08x observed); still provisional pending US-33 and JOS-182's own merge. | JOS-142 |
| All product decisions now closed. | JOS-142 |
| **Idea raised, not in this change's scope**: a manual dial for the user to adjust a scene that feels like it drags and regenerate its clip, filed as JOS-190. | Product owner, JOS-142 |

### From version 1.3 to 1.4

Origin: `define-provider-configuration` (JOS-165), 2026-09-27.

| Change | Origin |
|---|---|
| §11's five providers selected and verified against real calls (reasoning: OpenAI `gpt-6-astra`; voice: ElevenLabs; alignment: ElevenLabs, same account as voice; image: Fal.ai; video: RunningHub); new §11.3 records the full parameter set (§11.3). | JOS-165 |
| Video admitted durations fixed at 5-15 seconds, measured; segmentation lower bound (§6.1) now matches it by construction. | JOS-165 |
| Final MP4 resolution/frame rate confirmed as a normalization the assembly stage must perform — neither the image nor video provider natively produces 1920×1080@30fps (§11.3). New requirement handed to `define-media-assembly` (JOS-182). | JOS-165 |
| Supported language list fixed at English and Spanish, each verified across all three chain stages (§4.1, §11.3). | JOS-165, D09 |
| **Open finding, not yet resolved**: no provider tested produces a distinguishable not-retryable failure signal for disallowed content; §10.1's not-retryable branch has nothing to trigger on for this content class currently (§11.3). | JOS-165 |
| Speed-factor limit and assembly's per-phase maximum time remain provisional, pending `define-media-assembly` (JOS-182). | JOS-165 |

### From version 1.2 to 1.3

Origin: backlog decomposition clarification session, 2026-09-15.

| Change | Origin |
|---|---|
| Single MVP role (User). Providers and all generation parameters are hardcoded; credentials come from the local environment. `/admin`, the Administrator role, configuration files, and reports are out of the MVP (§2.1, §2.3, §11, §11.2). | Scope clarification |
| Script language selected from a hardcoded list (§3, §4.1, AC01). | D09 |
| Script locked at project start (§4.2, AC02). | D10 |
| Segmentation edge cases: short whole script, clause split of the following sentence, sentence that cannot be split (§6.1.1, §7.2, AC18). | Clarification |
| "Closest" admitted duration defined as smallest speed change; ties go to the longer duration (§7.2, AC06). | Clarification |
| Alignment added as a fifth stage; retries switch to it when native timestamps are unusable (§10.3, §11, §11.1). | Clarification |
| Final MP4 output: voice-over-only audio, hardcoded resolution and frame rate, H.264/AAC (§7.3). | D08 |
| Session state rules: `failed` only after other scenes finish, return to phase state on manual retry, pause as a marker (§8.1). | Gaps 1 and 3 |
| Live progress updates without reloading; diagnostics shown in scene details and phase sections (§3, §7.2, §8.3, AC23). | Gap 7, clarification |
| Session-wide pause that also holds retries (§9). | D01 |
| Not-retryable failures skip automatic retries; hardcoded per-stage request limit, first come first served; hardcoded per-phase maximum times (§10.1, AC08). | Gaps 2 and 6 |
| Other scenes continue after a failure; each manual retry starts a new automatic cycle (§10.2). | D06 |
| No provider changes in the MVP; stages retry the same provider (§11.2). | D03 |
| In-flight requests resumed after a restart (§12.1). | Clarification |
| Project folder naming, local saving of temporary-link results, no session expiry (§12.2). | Gap 8, D05, D04 |
| In-app downloads limited to per-scene images and clips and the final MP4 (§2.2, §12.3). | Clarification |
| No per-session size limits; no product-level content policy (§2.3, §4.1). | Gaps 5 and 10 |
| D01, D03, D04, D05, D06, D08, D09, D10 closed; gaps 1–8 and 10 closed; gap 9 still open; D11 still pending POC. | Clarification session |

### De la versión 1.1 a la 1.2

| Cambio | Origen |
|---|---|
| Marcas de tiempo declaradas capacidad requerida de la etapa de voz, con alineación forzada como respaldo (§11.1). Añadidas al flujo (§5), a los conceptos (§3), a la edición permitida (§10.3) y a los archivos conservados (§12.2). | Acuerdo B1 |
| Nueva regla de segmentación con criterio de corte, cotas y excepción (§6.1). | Recomendación B3 |
| Selección de duración de clip cambiada de "menor duración admitida igual o superior" a "duración admitida más próxima", admitiendo ralentización (§7.2). | Recomendación B3 |
| Factor de ajuste de velocidad redefinido como consecuencia registrable de §6.1 y §7.2, no como parámetro independiente (§7.2, §3). | Recomendación B3 |
| Partición del eje temporal del voice-over declarada requisito verificable (§7.3). | Acuerdo B2, parte cerrada |
| Modelo de acceso definido como instalación local monousuario sin cuentas; separación entre sesiones reclasificada como integridad funcional (§12.3, §2.1, §2.3). | Acuerdo B4 |
| D02 y D07 cerradas. | Acuerdos B3 y B4 |
| Antigua D07 dividida en D07 (autorización), D08 (parámetros de salida), D09 (idiomas) y D10 (bloqueo del guion). | Defecto de trazabilidad §12.3 ↔ D07 |
| Nueva D11 y POC asociada para la asignación de silencios (§14.1). | Acuerdo B2, parte abierta |
| Añadidos AC17 a AC23: segmentación, cotas, partición, obtención de intervalos, visibilidad del progreso, aislamiento de sesiones y registro del factor de ajuste. | Cobertura de §2.2 sin criterio de aceptación |
| Nueva sección 15 con los gaps abiertos no bloqueantes. | Registro de priorización |
