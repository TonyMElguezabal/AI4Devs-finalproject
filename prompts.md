> Detalla en esta sección los prompts principales utilizados durante la creación del proyecto, que justifiquen el uso de asistentes de código en todas las fases del ciclo de vida del desarrollo. Esperamos un máximo de 3 por sección, principalmente los de creación inicial o  los de corrección o adición de funcionalidades que consideres más relevantes.
Puedes añadir adicionalmente la conversación completa como link o archivo adjunto si así lo consideras


## Índice

1. [Descripción general del producto](#1-descripción-general-del-producto)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Modelo de datos](#3-modelo-de-datos)
4. [Especificación de la API](#4-especificación-de-la-api)
5. [Historias de usuario](#5-historias-de-usuario)
6. [Tickets de trabajo](#6-tickets-de-trabajo)
7. [Pull requests](#7-pull-requests)

---

## 1. Descripción general del producto

**Prompt 1:**
Actúa como un product manager. Tu tarea es crear el documento PRD inicial para construir una aplicación que se llamará Vid4You:

Resumen ejecutivo:
Vid4You es una aplicación web que convierte un script de vídeo finalmente en un video completo pasando por una lista de escenas narradas (“chunks”) en un conjunto de imágenes y videos cortos generados por IA: una imagen y un video por cada chunk.

El sistema le pide al usuario un título de video y el script inicial de vídeo.
Los proveedores de razonamiento, voice-over, imágenes, y video fueron previamente seleccionados por el administrador.
Finalmente el usuario recibe el video editado en formato mp4 landscape 16:9.
El administrador puede consultar reportes de uso de la herramienta como por ejemplo costos de generación de videos.

El sistema es una plataforma de generación de contenido End to End, la imagen y el video de cada chunk pueden ser entregables independientes, mientras procesa cada imagen y cada video se pueden descargar por partes, finalmente el video editado final contiene todos los chunks de video editados, unidos y narrados por el voice-over generado.

Conceptos principales
Script — la unidad basica de trabajo. 
Chunk — la unidad atómica de trabajo. Un chunk contiene: un id —proporcionado por el cliente y único solamente dentro de su propia solicitud—, una línea narrada ("prompt"), una instrucción para generar una imagen y una instrucción para generar un video o movimiento. Un chunk avanza a través de una máquina de estados fija, desde su envío hasta su finalización o fallo.
Sesión — una solicitud individual que contiene uno o más chunks y se identifica mediante un id generado. Todos los chunks de una solicitud pertenecen a una misma sesión. Las sesiones están aisladas entre sí: un cliente solamente puede ver los chunks de una sesión si cuenta con el id correspondiente.
Proveedor — una implementación conectable y específica de un proveedor de servicios para una etapa de generación —imagen o video—. En cada etapa solamente puede haber un proveedor "activo" a la vez. Sin embargo, cualquier proveedor que haya sido utilizado previamente para procesar un chunk específico permanecerá vinculado a ese chunk durante todo su ciclo de vida, independientemente del proveedor que esté activo actualmente.

MVP
Usuario ingresa un script alrededor de ~1500 palabras.
Se crea una sesion
Se genera voice-over por la duración total del script.
Se generan chunks que son divisiones del script principal. 
Cada chunk tiene un identificador único, el texto leído por el voice-over, el prompt para generar la imagen base, el prompt para generar un video usando una imagen de referencia. 
Se genera la imagen usando el prompt. 
Se genera el video utilizando la imagen previamente generada utilizando el prompt de video.
Se ajusta la duración del video a la duración del voice-over donde se escucha el texto del prompt. 
Se unen todos los chunks en secuencia por su identificador. 
Se genera el video final.

Requisitos de negocio:
- Panel de administracion (alta, baja y administracion general de proveedores).
- Area de trabajo clara con estado de generacion clara al usuario.
- Navegación de estados.
- Ingesta de datos mediante texto.

Ayúdame a:
Crear el PRD inicial
Propón una descripción general del producto actualizada
Una lista de características clave del MVP.
Mejorar el problema que ataca y que intenta resolver y como lo lograria.


/*Se presentó el PRD inicial a ChatGPT para refinar el PRD*/

Analiza este PRD.md y dime si el requerimiento esta claro, si no esta claro o si hay algun problema dimelo. Ten en cuenta que es un documento de requerimientos, no es necesario llegar a temas tecnicos, pero debe estar lo suficientemente claro para que sea la base de un proyecto robusto.
El objetivo del PRD está claro, pero todavía no lo consideraría suficientemente definido para ser la base de un proyecto robusto. Se entiende qué producto quieres construir y cuál es el resultado esperado; sin embargo, hay contradicciones y decisiones funcionales pendientes que podrían llevar a desarrollar comportamientos distintos de los que esperas. No hace falta agregar más detalles técnicos: hace falta precisar algunas reglas del producto.

/*Después de iterar con respuestas a las preguntas de ChatGPT se generó un PRD inicial ya más formal que se versiona ya en GIT como v1.0*/


**Prompt 2:**

Vamos a editar el archivo readme.md que esta en raiz, especificamente en la seccion: “1. Descripción general del producto” siguiendo la plantilla oficial de AI4Devs-finalproject.

Debe cubrir estos subapartados: 
Objetivo, Características y funcionalidades principales, Diseño y experiencia de usuario, Instrucciones de instalación.

Contexto del producto: 
Leer del archivo docs/PRD.md

Necesito que:
Redactes el Objetivo: qué es Vid4You y qué problema resuelve, en 2-3 frases, dirigido a un lector que no conoce nada de generación de videos y contenido automatizado para YouTube.
Lista las funcionalidades como "Características y funcionalidades principales", redactadas de forma clara para el README (puedes mejorar la redacción, pero no cambies el alcance ni añadas funcionalidades nuevas).
Para "Diseño y experiencia de usuario": como todavía no hay mockups ni capturas, deja un placeholder claro indicando "TBD mockups after frontend" en vez de inventar una descripción de UI que no existe.
Para "Instrucciones de instalación": genera el bloque estándar basado en el stack (clonar repo, variables de entorno necesarias) — aqui puede quedar como borrador o TBD tambien para actualizar posteriormente.

No inventes funcionalidades, integraciones ni datos de UX que no te haya dado. Si te falta algo para alguno de los 4 subapartados, pregúntamelo en vez de asumir.


---

## 2. Arquitectura del Sistema

### **2.1. Diagrama de arquitectura:**

Vamos a redactar el Apartado "2. Arquitectura del sistema" del README de Vid4You, siguiendo la plantilla oficial de AI4Devs-finalproject. 

Debe cubrir: “2.1 Diagrama de arquitectura”, en esta sección del diagrama utiliza mermaid para presentar el diagrama editable con los componentes principales de la aplicación y las tecnologías utilizadas. Explica si sigue algún patrón predefinido, justifica por qué se ha elegido esta arquitectura, y destaca los beneficios principales que aportan al proyecto y justifican su uso, así como los sacrificios o déficits que implica.
En las secciones subsecuentes 2.2 describe los componentes principales, 2.3 Descripción de alto nivel del proyecto y estructura de ficheros, 2.4 Infraestructura de despliegue, 2.5 Seguridad, 2.6 Tests. descripción de componentes principales, estructura de ficheros, infraestructura y despliegue, seguridad, y estrategia de tests.

Considera que:
El diagrama de arquitectura en formato Mermaid (tipo "graph" o "flowchart"), mostrando cada componente que interactúa con el sistema incluido el usuario, la máquina (EC2 o similar), el backend, las API de los proveedores, la BD y agrupa los componentes que son parte de este sistema y los externos.
En la justificación menciona porque se decidió cierto patrón de arquitectura y menciona brevemente cómo evolucionaría si el uso creciera — sin comprometerte a implementarlo ahora.
Describe los componentes principales (backend, frontend, db, integraciones API) en una tabla o lista breve con su responsabilidad.
Mencionar la estructura de carpetas del repositorio (backend/, frontend/, docs/, ai-specs/, y lo que sea necesario dentro de cada uno según el stack), coherente con lo que ya generamos en docs/base-standards.md.
Menciona la infraestructura y el despliegue con sus respectivas variables de entorno gestionadas vía .env, sin inventar pipeline de CI/CD que aún no hemos decidido (si crees que hace falta uno, pregúntamelo en vez de asumirlo).
En la sección de seguridad: Google OAuth para autenticación, autorización por roles en backend que podra el usuario Administrador gestionar, gestión de secretos vía .env con permisos restringidos, HTTPS, y cualquier otra medida básica razonable para este alcance (sin sobredimensionar). Recuerda que para el MVP la autorizacion y autenticacion no es necesaria, cualquiera con la URL del MVP puede utilizar el sistema.
Menciona la estrategia de tests general, aclarando que en esta entrega 1 aún no hay código, por lo que es la estrategia planificada, no resultados.

Lee antes el contexto de la aplicación de docs/PRD.md y lee tambien docs/base-standards.md (ya actualizado con el stack) para mantener coherencia total con lo que ya está documentado ahí, y no dupliques información — si algo ya está bien explicado ahi, referencia esa sección en vez de repetirla en el README.
No inventes componentes, servicios ni decisiones de infraestructura que no te haya dado. Si necesitas decidir algo no especificado, pregúntamelo antes de asumir.


### **2.2. Descripción de componentes principales:**

**Prompt 1:**

**Prompt 2:**

**Prompt 3:**

### **2.3. Descripción de alto nivel del proyecto y estructura de ficheros**

**Prompt 1:**

**Prompt 2:**

**Prompt 3:**

### **2.4. Infraestructura y despliegue**

**Prompt 1:**

**Prompt 2:**

**Prompt 3:**

### **2.5. Seguridad**

**Prompt 1:**

**Prompt 2:**

**Prompt 3:**

### **2.6. Tests**

**Prompt 1:**

**Prompt 2:**

**Prompt 3:**

---

### 3. Modelo de Datos

**Prompt 1:**

**Prompt 2:**

**Prompt 3:**

---

### 4. Especificación de la API

**Prompt 1:**

**Prompt 2:**

**Prompt 3:**

---

### 5. Historias de Usuario

**Prompt 1:**

**Prompt 2:**

**Prompt 3:**

---

### 6. Tickets de Trabajo

**Prompt 1:**

**Prompt 2:**

**Prompt 3:**

---

### 7. Pull Requests

**Prompt 1:**

**Prompt 2:**

**Prompt 3:**
