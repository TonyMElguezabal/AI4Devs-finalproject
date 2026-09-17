# PRD — Vid4You

**Versión:** 1.2  
**Alcance:** MVP  
**Estado:** Requisitos funcionales con las decisiones bloqueantes de segmentación, temporización y acceso cerradas. Una decisión pendiente de POC (D11) y ocho decisiones de producto abiertas (§14).

## 1. Objetivo del producto

Vid4You es una aplicación web que convierte un guion proporcionado por el usuario en un video narrado, en formato MP4 horizontal 16:9.

El sistema genera una narración completa, divide el guion en escenas o *chunks*, genera una imagen y un clip por escena, ajusta los clips a la narración y ensambla el video final. El procesamiento avanza automáticamente, salvo cuando existe una pausa solicitada por el usuario o un fallo que impide continuar.

El usuario puede consultar el progreso por fase y por escena, descargar resultados disponibles y recuperar generaciones fallidas sin modificar el contenido narrado.

## 2. Usuarios y alcance

### 2.1 Roles

| Rol | Responsabilidad |
|---|---|
| Usuario | Introducir título y guion, consultar el progreso, pausar antes de una fase, continuar, descargar resultados y reintentar etapas fallidas. |
| Responsable operativo | Configurar previamente proveedores y parámetros, diagnosticar fallos y cambiar manualmente el proveedor activo cuando sea necesario. |

La configuración operativa es necesaria para ejecutar el producto. El MVP no incluye una interfaz de administración para realizarla: se efectúa sobre los archivos de configuración de la instalación local. Ambos roles pueden corresponder a la misma persona, conforme al modelo de despliegue de §12.3.

### 2.2 Incluido en el MVP

- Creación de sesiones a partir de un título y un guion.
- Generación de un único voice-over por guion.
- Obtención de los intervalos de narración de cada fragmento dentro del audio completo.
- Descomposición automática en chunks y creación de sus instrucciones visuales.
- Generación de una imagen y un clip por chunk.
- Sincronización de los clips con el audio y montaje del MP4 final.
- Visualización del progreso, resultados y errores.
- Pausas antes del lanzamiento de una fase y continuación explícita.
- Descargas parciales y descarga del video final.
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

## 3. Conceptos y datos del proyecto

Una **sesión** representa un proyecto de video y tiene un identificador generado por el sistema. Contiene el título, el guion, la narración, los chunks, el progreso y los resultados. Los datos de sesiones diferentes permanecen separados, aunque sus títulos coincidan.

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

Cada etapa conserva la identificación del proveedor utilizado y los intentos realizados. Esta información permite diagnosticar fallos sin exponer credenciales ni datos confidenciales.

## 4. Entrada y conservación del contenido

### 4.1 Entrada del usuario

El usuario introduce un título y un guion no vacíos. No necesita proporcionar identificadores, etiquetas, delimitadores ni instrucciones de imagen o video.

No existe un límite funcional de palabras establecido por el producto. Un guion de aproximadamente 1500 palabras es una referencia habitual, no una restricción ni una duración obligatoria. La duración del video depende de la narración real del guion.

Si una restricción del servicio impide procesar el contenido, el sistema informa la causa. No recorta ni resume el guion para adaptarlo silenciosamente.

### 4.2 Fidelidad e inmutabilidad

- La narración debe corresponder al guion completo proporcionado por el usuario.
- Una vez generado correctamente el voice-over, el guion y el audio no pueden modificarse ni regenerarse dentro de esa sesión.
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
- **Cota inferior.** La duración narrada de un chunk no queda por debajo de la cota inferior configurada. Una oración que no la alcance se agrupa con la siguiente; si es la última del guion, se agrupa con la anterior.
- **Excepción.** Una oración cuya narración supere por sí sola la cota superior se divide en frontera de cláusula, marcada por coma, punto y coma o conjunción. Es la única división permitida dentro de una oración.
- **Optimización.** Entre las agrupaciones que cumplen ambas cotas, el sistema prefiere aquellas cuya duración narrada quede más próxima a una duración admitida por el proveedor de video, para reducir el ajuste de velocidad de §7.3.

La regla no altera §4.2: los fragmentos unidos en orden siguen reconstruyendo el guion original.

La cota inferior existe porque el proveedor de video impone una duración mínima de clip. Sin ella, un fragmento muy breve obligaría a un factor de aceleración elevado. Su valor forma parte de la configuración operativa y debe ser coherente con la menor duración admitida por el proveedor activo.

El incumplimiento de estas reglas por una descomposición generada por el sistema constituye un fallo de descomposición, no un error del guion introducido por el usuario.

## 7. Generación visual, duración y montaje

### 7.1 Imagen

Cada chunk utiliza su instrucción `IMAGE` para generar una imagen horizontal 16:9 con resolución mínima de 1920 × 1080. El clip no puede solicitarse sin una imagen disponible.

### 7.2 Clip

Cada clip utiliza la imagen generada y la instrucción `VIDEO`. La duración solicitada se calcula a partir de la duración del intervalo correspondiente en el voice-over, respetando los valores admitidos por el proveedor.

- El sistema solicita la duración admitida por el proveedor **más próxima** al intervalo narrado. Se admite que la duración solicitada sea menor que el intervalo, lo que implica ralentizar el clip durante el montaje.
- Cuando el intervalo narrado es inferior a la menor duración admitida, se solicita esa menor duración.
- El sistema no debe asumir que todos los proveedores admiten las mismas duraciones ni cualquier valor intermedio. El conjunto de duraciones admitidas forma parte de la configuración del proveedor activo.
- El máximo habitual previsto es de 15 segundos; un proveedor que admita 20 segundos puede utilizar ese máximo.

La cota superior de §6.1 garantiza que ningún intervalo narrado supere el máximo del proveedor activo. No se requiere, por tanto, una política de recorte o de escenas que excedan el máximo.

El factor de ajuste de velocidad no es un parámetro independiente: resulta de la regla de segmentación de §6.1 y de la selección de duración descrita arriba. El sistema registra el factor obtenido en cada escena junto a su resultado. El límite aceptable forma parte de la configuración operativa; cuando una escena lo supera, se registra como advertencia diagnosticable y no como fallo.

### 7.3 Sincronización y montaje final

La duración de cada clip se ajusta a su intervalo de narración mediante ajuste de velocidad, que puede acelerar o ralentizar el clip. El audio y el texto no se modifican para acomodarse a los clips.

Los intervalos de narración de los chunks forman una **partición del eje temporal del voice-over**: son contiguos, no se solapan y cubren desde el segundo 0 hasta la duración total del MP3. Esta propiedad es un requisito del producto y se mantiene cualquiera que sea la regla adoptada en D11.

La asignación de los silencios de la narración a una escena concreta está pendiente de D11 y se validará mediante la POC descrita en §14.1.

El montaje debe conservar todo el contenido narrado y la secuencia de escenas, sin omisiones, duplicaciones ni huecos visuales. Debe cubrir también las pausas existentes en la narración.

El video final solo puede generarse cuando todas las escenas estén en `chunk-complete`. Una sesión con una escena fallida o pendiente no puede alcanzar `final-video`.

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

La interfaz presenta una sección o pestaña por fase y muestra el estado de las escenas, los resultados disponibles, los errores y las acciones aplicables. El progreso se actualiza durante el procesamiento.

Una pausa se muestra como condición adicional de control, conservando la fase y el avance alcanzados. No equivale a éxito ni a fallo.

## 9. Pausa y continuación

El usuario puede impedir el lanzamiento de una fase antes de que esta haya comenzado. Una solicitud ya enviada a un proveedor continúa hasta terminar o fallar y no puede pausarse ni cancelarse desde el MVP.

Los resultados de solicitudes ya enviadas se conservan aunque exista una pausa. Una fase detenida antes de su lanzamiento permanece pendiente hasta que el usuario indique explícitamente que desea continuar.

La interfaz debe distinguir entre una generación que sigue en curso y una fase que está esperando la continuación del usuario. La pausa no revierte resultados ni elimina trabajo realizado.

El alcance de la pausa sobre una sesión completa o un chunk individual se define en D01.

## 10. Fallos, reintentos y correcciones

### 10.1 Reintentos automáticos

Ante un fallo transitorio, el sistema permite hasta **tres reintentos automáticos adicionales al intento inicial** de la etapa afectada. No realiza reintentos automáticos indefinidos.

Al agotar el límite, la etapa queda en `failed`. La interfaz muestra un error comprensible y la opción de reintento manual cuando corresponda. La política debe evitar que mecanismos internos de recuperación multipliquen inadvertidamente el límite funcional.

La espera previa al inicio de una etapa no debe confundirse con el tiempo de ejecución ni provocar un fallo prematuro de escenas que comienzan más tarde. Los tiempos máximos por fase forman parte de la configuración operativa.

### 10.2 Reintentos manuales

El usuario puede reintentar la etapa fallida conservando los resultados exitosos anteriores. Agotar los reintentos automáticos bloquea el avance afectado, pero no elimina el proyecto ni sus archivos.

El tratamiento de las demás escenas mientras una falla y el presupuesto automático posterior a un reintento manual se definen en D06.

### 10.3 Edición permitida

| Fallo | Acción permitida |
|---|---|
| Generación de imagen | Reintentar con la misma instrucción o corregir únicamente `IMAGE`. |
| Generación de video | Reintentar con la misma instrucción o corregir únicamente `VIDEO`, conservando la imagen exitosa. |
| Generación de voz | Reintentar la generación fallida con el mismo guion, sin sustituir un audio ya completado. |
| Obtención de marcas de tiempo | Reintentar sobre el mismo audio, incluida la conmutación al mecanismo de respaldo de §11. |
| Descomposición | Reintentar la división del mismo guion sin reescribirlo ni regenerar el audio. |
| Montaje final | Reintentar el montaje con los componentes ya generados. |

Ninguna recuperación permite cambiar `ID`, `PROMPT`, el orden narrativo o un voice-over completado. Las correcciones visuales son la única excepción a la regla de chunks no editables.

## 11. Proveedores y operación

Antes de utilizar el MVP deben estar configurados los proveedores de razonamiento, voz, imágenes y video, junto con sus parámetros de generación. Existe un proveedor activo por etapa.

| Etapa | Capacidad requerida |
|---|---|
| Razonamiento | Dividir el guion con fidelidad conforme a §6.1 y generar instrucciones visuales. La referencia de capacidad establecida para el proyecto es equivalente a Sonnet 4.6 o superior. |
| Voz | Producir la narración completa en MP3 con voz, calidad y velocidad preconfiguradas, y entregar marcas de tiempo del audio generado con granularidad suficiente para situar cada fragmento del guion. |
| Imagen | Generar imágenes desde texto en 16:9 y con resolución mínima de 1920 × 1080. |
| Video | Animar una imagen de referencia y admitir una duración configurada dentro de sus capacidades. Sus duraciones admitidas y su máximo forman parte de la configuración. |

### 11.1 Marcas de tiempo y mecanismo de respaldo

Las marcas de tiempo son una capacidad requerida de la etapa de voz. Se obtienen por uno de dos mecanismos, en este orden de preferencia:

1. **Marcas de tiempo nativas.** El proveedor de voz las entrega junto al MP3.
2. **Alineación forzada.** Si el proveedor activo no las entrega, el sistema las deriva alineando el MP3 generado contra el guion conocido.

La alineación forzada es el mecanismo de respaldo declarado del producto y no sustituye la preferencia por marcas de tiempo nativas. Verificar cuál de los dos aplica al proveedor configurado es una tarea previa a implementar la fase de descomposición.

La imposibilidad de obtener los intervalos por cualquiera de los dos mecanismos constituye un fallo de descomposición, se refleja en `chunk-decomposing` y sigue la política de reintentos de §10.1.

### 11.2 Vinculación y cambio de proveedor

El responsable operativo puede cambiar manualmente el proveedor activo. No existe conmutación automática entre proveedores en el MVP.

La etapa conserva el proveedor utilizado para sus reintentos automáticos y manuales. En voz, esta asociación pertenece a la sesión; en imagen y video, al chunk y a la etapa correspondiente.

Cambiar el proveedor activo no reasigna por sí solo etapas ya vinculadas. Mientras no se defina la excepción de D03, estas permanecen asociadas al proveedor original y pueden continuar bloqueadas si este no se recupera. Los resultados completados no se regeneran por un cambio de configuración.

Un cambio en el conjunto de duraciones admitidas del proveedor de video no altera los intervalos ni los chunks ya establecidos en sesiones existentes.

## 12. Persistencia, archivos y descargas

### 12.1 Conservación del proyecto

El sistema conserva sesiones, chunks, estados, referencias a resultados y errores de forma persistente. El avance debe sobrevivir a reinicios y poder recuperarse en consultas posteriores.

Recibir más de una confirmación de éxito para una misma generación no debe duplicar resultados, iniciar dos veces la etapa siguiente ni incorporar una escena varias veces al montaje.

### 12.2 Archivos

Los archivos locales se organizan en carpetas identificadas por el título del video y **no se eliminan automáticamente ni caducan**. Los proyectos con títulos iguales deben permanecer separados y no sobrescribir sus resultados.

Se conservan localmente el guion y los textos generados, el MP3 completo, sus marcas de tiempo, los clips y el MP4 final. La política para conservar imágenes o resultados disponibles exclusivamente mediante enlaces temporales se define en D05.

La conservación de archivos es independiente de la vigencia de la sesión. El efecto funcional de la expiración de dos días indicada en el alcance original se define en D04.

### 12.3 Modelo de acceso, descargas y aislamiento

El MVP se ejecuta como una **instalación local destinada a un único usuario**. No existen cuentas, autenticación ni reglas de autorización.

El usuario puede descargar imágenes y clips exitosos individualmente mientras otras escenas siguen procesándose o presentan fallos. El MP4 final solo está disponible después de completarse el montaje.

Las sesiones se consultan mediante su identificador. La separación de datos entre sesiones es un **requisito funcional de integridad, no un control de seguridad**: impide que un proyecto muestre o sobrescriba resultados de otro, y no protege frente a accesos de terceros.

Exponer la aplicación fuera de un entorno local exige definir previamente autenticación y reglas de autorización. Esa exposición queda fuera del MVP, conforme a §2.3.

## 13. Criterios de aceptación del MVP

| ID | Resultado verificable |
|---|---|
| AC01 | Un título y un guion válidos permiten iniciar una sesión sin etiquetas ni delimitadores de chunks. |
| AC02 | Se obtiene un único MP3 por guion; después del éxito no se permite cambiar el guion ni regenerar la voz. |
| AC03 | Los fragmentos narrados reconstruyen el guion completo en orden, sin omisiones, duplicaciones ni reescritura. |
| AC04 | Los chunks tienen identificadores consecutivos e invariables y sus cuatro campos de contenido completos. |
| AC05 | No se solicita un video si la imagen de su chunk no está disponible. |
| AC06 | Cada solicitud de video utiliza la duración admitida por el proveedor más próxima al intervalo narrado y nunca supera su máximo. |
| AC07 | Una fase pausada antes del lanzamiento no comienza hasta continuar; una solicitud ya enviada no se interrumpe. |
| AC08 | Al agotarse tres reintentos automáticos, se informa el fallo y no continúa un ciclo automático indefinido. |
| AC09 | Un fallo visual permite corregir únicamente el prompt de su etapa y conserva el contenido narrativo. |
| AC10 | Una escena fallida impide generar el video final; sus resultados exitosos y los de otras escenas siguen disponibles. |
| AC11 | El montaje respeta el orden numérico, aunque las escenas hayan terminado en otro orden. |
| AC12 | `final-video` solo se alcanza con todas las escenas completas y un MP4 16:9 narrado, sincronizado y descargable. |
| AC13 | Un fallo de montaje permite reintentar sin regenerar voz, imágenes ni clips exitosos. |
| AC14 | Un reinicio no pierde el avance; confirmaciones repetidas no duplican escenas ni lanzamientos. |
| AC15 | Los archivos locales no se eliminan automáticamente y dos proyectos con el mismo título no sobrescriben sus resultados. |
| AC16 | El MVP permite pausas y descargas parciales sin requerir una interfaz de administración o reportes. |
| AC17 | Los cortes entre chunks coinciden con fronteras de oración, salvo la excepción de oración larga prevista en §6.1. |
| AC18 | Ningún chunk supera el máximo del proveedor de video activo ni queda por debajo de la cota inferior configurada, salvo esa misma excepción. |
| AC19 | Los intervalos de los chunks son contiguos, no se solapan y cubren el voice-over desde el segundo 0 hasta su duración total. |
| AC20 | El sistema obtiene los intervalos mediante marcas de tiempo nativas o, en su ausencia, mediante alineación forzada; la imposibilidad de obtenerlos se reporta como fallo de descomposición y no como fallo de voz. |
| AC21 | La interfaz muestra, por fase y por escena, el estado vigente, los resultados disponibles, los errores y las acciones aplicables, y refleja el avance durante el procesamiento. |
| AC22 | Una sesión consultada por su identificador muestra únicamente sus propios chunks, archivos y resultados. |
| AC23 | Cada escena registra la duración solicitada y el factor de ajuste de velocidad aplicado, consultables para diagnóstico. |

Los criterios afectados por la sección siguiente deberán completarse al cerrar esas decisiones. AC12 y AC19 quedan sujetos a la regla que resulte de D11 en lo relativo a los silencios.

## 14. Decisiones de producto

Las decisiones marcadas como abiertas no están aprobadas y deben cerrarse antes de implementar el comportamiento correspondiente. No modifican las reglas confirmadas de las secciones anteriores.

| ID | Decisión requerida | Estado | Resolución adoptada o alternativa propuesta |
|---|---|---|---|
| D01 | Alcance de la pausa y tratamiento de reintentos pendientes. | Abierta | Aplicar la pausa a toda la sesión: terminar solicitudes enviadas y bloquear nuevas fases y reintentos hasta continuar. |
| D02 | Duraciones discretas, escenas que superan el máximo y calidad del ajuste visual. | **Cerrada** | Regla de segmentación de §6.1 con cota superior e inferior, y selección de la duración admitida más próxima en §7.2. El factor de ajuste deja de ser un parámetro independiente. |
| D03 | Recuperación de etapas vinculadas a un proveedor no disponible. | Abierta | Permitir reasignación manual explícita de la etapa fallida, conservando resultados previos y verificando compatibilidad de duración y formato. |
| D04 | Efecto de la expiración de la sesión a los dos días. | Abierta | Determinar si limita consulta, descargas o reanudación y qué ocurre con trabajos en curso; conservar los archivos locales en todos los casos. |
| D05 | Dependencia de enlaces temporales del proveedor. | Abierta | Guardar localmente todos los entregables antes de que caduquen sus enlaces, incluidas las imágenes. |
| D06 | Continuación de otras escenas tras un fallo y reintentos posteriores a una acción manual. | Abierta | Permitir que las escenas independientes continúen y definir si cada reintento manual habilita un nuevo ciclo automático. |
| D07 | Autorización y acceso a las sesiones. | **Cerrada** | Instalación local monousuario, sin cuentas ni autorización. La separación entre sesiones es integridad funcional, no seguridad (§12.3). |
| D08 | Parámetros de salida del MP4 final. | Abierta | Definir resolución, fps y códecs, y decidir si se elimina el audio propio de los clips generados o se mezcla con el voice-over. |
| D09 | Idiomas admitidos. | Abierta | Establecer los idiomas de guion y de voz soportados y el comportamiento ante un guion en un idioma no soportado. |
| D10 | Momento exacto del bloqueo del guion durante la generación de voz. | Abierta | Determinar si el guion se bloquea al lanzar la generación o al confirmarse el éxito, y qué ocurre con una edición recibida durante la ventana intermedia. |
| D11 | Asignación de los silencios de la narración a una escena. | **Pendiente de POC** | Dos candidatas: la escena previa absorbe el silencio posterior, o el silencio se reparte entre escenas contiguas. Se valida según §14.1. |

D08, D09 y D10 proceden de la división de la antigua D07 de la versión 1.1, que agrupaba decisiones heterogéneas bajo un solo identificador y no cubría las reglas de autorización que §12.3 le asignaba.

### 14.1 POC pendiente (D11)

La POC debe determinar la regla de asignación de silencios y producir una decisión cerrada. Alcance mínimo:

- Comparar las dos reglas candidatas sobre guiones con pausas representativas del contenido previsto.
- Determinar a partir de qué duración un silencio sostenido por un único clip resulta visualmente aceptable, y si ese umbral obliga a una tercera regla.
- Verificar que la regla elegida preserva la partición de §7.3 y no deja huecos ni solapes.
- Comprobar que la regla es compatible con las cotas de §6.1 y no eleva el factor de ajuste por encima del límite configurado.

Salida esperada: regla adoptada, umbral asociado si procede, y actualización de §7.3, AC12 y AC19.

## 15. Gaps abiertos no bloqueantes

Registrados para priorización. No impiden definir el MVP ni iniciar su refinamiento.

| # | Gap | Sección afectada |
|---|---|---|
| 1 | No se declaran las transiciones permitidas entre estados, en particular la salida de `failed` tras un reintento manual. | §8, §10.2 |
| 2 | No se distingue fallo transitorio de fallo permanente. Un rechazo por filtro de contenido del proveedor consumiría el presupuesto de reintentos sin posibilidad de éxito. | §10.1 |
| 3 | La pausa no está representada en el modelo de datos ni en las máquinas de estado. Depende de D01. | §3, §8 |
| 4 | La reasignación manual de proveedor prevista en D03 no tiene canal definido al no existir interfaz de administración. | §2.3, §11.2 |
| 5 | No existe límite de escala por sesión: ni cota de palabras, ni de número de chunks, ni presupuesto de generaciones. | §4.1, §10.1 |
| 6 | No se trata la concurrencia entre sesiones ni los límites de tasa del proveedor activo. | §11 |
| 7 | No se define el mecanismo de actualización del progreso en la interfaz. | §8.3 |
| 8 | No se define la regla de desambiguación de carpetas con títulos iguales. | §12.2, AC15 |
| 9 | No hay requisitos no funcionales, objetivo de negocio ni métricas de éxito. | Documento completo |
| 10 | No hay política de contenido para guiones enviados a proveedores de terceros. | §4.1, §11 |

## 16. Registro de cambios

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
