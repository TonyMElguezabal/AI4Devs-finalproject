# Borrador de adenda al PRD — telemetría opcional (JOS-199)

**Estado: borrador para aprobación del Product Owner. No está aplicado a `docs/PRD.md`.**

## Propuesta de texto

### 12.4 Telemetría y privacidad (nuevo)

1. **Consentimiento previo.** Vid4You no envía ningún dato fuera del equipo del usuario sin su permiso. En el primer arranque se muestra un aviso con tres casillas, todas desmarcadas: *informes de errores*, *conteos de uso de proveedores y costes* y *conteos anónimos de uso*. El usuario guarda sus elecciones con **Guardar** (aunque deje todo desmarcado) y no se le vuelve a preguntar. Si cierra el aviso con "Ahora no" o Escape, no se guarda nada, el envío sigue desactivado y el aviso vuelve a aparecer en el siguiente arranque. Puede cambiarlas en cualquier momento desde el botón **Privacidad**.
2. **Qué se envía, cuando está activado.**
   - *Errores:* código, mensaje y traza del error, con rutas de archivo y nombre de usuario eliminados.
   - *Proveedores y costes:* cuántas llamadas se hicieron por etapa y proveedor, su resultado (éxito, transitorio, no reintentable), cuánto tardaron y las unidades facturadas (imágenes, segundos de clip, caracteres de voz).
   - *Uso:* cuántas veces se abre la aplicación, cuántas sesiones se inician y cuántos vídeos finales se generan.
   - En todos los casos: versión, canal (UAT/PROD), sistema operativo, arquitectura y un identificador aleatorio de la instalación.
3. **Qué nunca se envía.** Título, guion, narración, prompts, imágenes, clips, nombres o rutas de archivo, nombre de usuario, claves de proveedores ni ningún dato personal.
4. **Registro local.** Independientemente del consentimiento, la aplicación guarda un registro local rotativo (10 MB × 5 archivos) en la carpeta de datos del usuario; no sale del equipo.
5. **Aviso de nueva versión.** En UAT y PROD, al arrancar, la aplicación consulta una vez la última versión publicada en GitHub y, si hay una distinta de la instalada, muestra un aviso con un enlace a la publicación. No descarga ni instala nada. No depende del consentimiento de telemetría.
6. **Destino.** Los datos pasan por un relé propio (`otel.vid4you.download`) que descarta cualquier atributo no permitido antes de reenviarlos al servicio de observabilidad.

## Preguntas abiertas para el Product Owner
- ¿El texto del aviso y los nombres de las tres casillas son los deseados (hoy están en inglés en la interfaz)?
- ¿Se desea una política de privacidad publicada y enlazada desde el aviso?
- ¿Cuánto tiempo se conservan los datos en el servicio de observabilidad (hoy: el de la capa gratuita)?
- Hoy "Ahora no" vuelve a preguntar en cada arranque hasta que el usuario guarde. ¿Se prefiere eso, o que "Ahora no" cuente como respuesta y no se pregunte más?
