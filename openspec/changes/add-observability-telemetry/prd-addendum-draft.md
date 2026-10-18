# Borrador de adenda al PRD — telemetría opcional (JOS-199)

**Estado: borrador con las decisiones del Product Owner del 2026-10-18 incorporadas; pendiente de su aprobación final y de aplicarlo a `docs/PRD.md`.**

## Propuesta de texto

### 12.4 Telemetría y privacidad (nuevo)

1. **Consentimiento previo.** Vid4You no envía ningún dato fuera del equipo del usuario sin su permiso. En el primer arranque se muestra un aviso con tres casillas, todas desmarcadas: *informes de errores*, *conteos de uso de proveedores y costes* y *conteos anónimos de uso*. El usuario guarda sus elecciones con **Save**, o cierra el aviso con **Not now** o Escape; en ambos casos se registra una respuesta (con "Not now", todo desactivado) y el aviso no vuelve a aparecer solo. El aviso incluye un enlace a la política de privacidad. Puede cambiarlas en cualquier momento desde el botón **Privacidad**.
2. **Qué se envía, cuando está activado.**
   - *Errores:* código, mensaje y traza del error, con rutas de archivo y nombre de usuario eliminados.
   - *Proveedores y costes:* cuántas llamadas se hicieron por etapa y proveedor, su resultado (éxito, transitorio, no reintentable), cuánto tardaron y las unidades facturadas (imágenes, segundos de clip, caracteres de voz).
   - *Uso:* cuántas veces se abre la aplicación, cuántas sesiones se inician y cuántos vídeos finales se generan.
   - En todos los casos: versión, canal (UAT/PROD), sistema operativo, arquitectura y un identificador aleatorio de la instalación.
3. **Qué nunca se envía.** Título, guion, narración, prompts, imágenes, clips, nombres o rutas de archivo, nombre de usuario, claves de proveedores ni ningún dato personal.
4. **Registro local.** Independientemente del consentimiento, la aplicación guarda un registro local rotativo (10 MB × 5 archivos) en la carpeta de datos del usuario; no sale del equipo.
5. **Aviso de nueva versión.** En UAT y PROD, al arrancar, la aplicación consulta una vez la última versión publicada en GitHub y, si hay una distinta de la instalada, muestra un aviso con un enlace a la publicación. No descarga ni instala nada. No depende del consentimiento de telemetría.
6. **Política de privacidad publicada.** El repositorio incluye `PRIVACY.md` (en inglés), enlazada desde el aviso, con lo anterior y el plazo de conservación: los datos se conservan mientras lo permita la capa gratuita del servicio de observabilidad.
7. **Destino.** Los datos pasan por un relé propio (`otel.vid4you.download`) que descarta cualquier atributo no permitido antes de reenviarlos al servicio de observabilidad.

## Decisiones tomadas (2026-10-18)
- Texto del aviso y nombres de las casillas: en inglés, como están en la interfaz.
- Política de privacidad: sí, publicada (`PRIVACY.md` en el repositorio) y enlazada desde el aviso.
- Conservación de los datos: mientras lo permita la capa gratuita del servicio de observabilidad.
- "Not now" cuenta como respuesta (todo desactivado) y no se vuelve a preguntar; sobre una respuesta ya guardada no cambia nada.

## Pendiente
- Aprobación final del texto y su incorporación a `docs/PRD.md`.
- Un enlace estable a `PRIVACY.md`: hoy apunta a la rama `main`, donde el archivo existirá tras la primera integración.
