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
> Usa el formato que consideres más adecuado para representar los componentes principales de la aplicación y las tecnologías utilizadas. Explica si sigue algún patrón predefinido, justifica por qué se ha elegido esta arquitectura, y destaca los beneficios principales que aportan al proyecto y justifican su uso, así como sacrificios o déficits que implica.


### **2.2. Descripción de componentes principales:**

> Describe los componentes más importantes, incluyendo la tecnología utilizada

### **2.3. Descripción de alto nivel del proyecto y estructura de ficheros**

> Representa la estructura del proyecto y explica brevemente el propósito de las carpetas principales, así como si obedece a algún patrón o arquitectura específica.

### **2.4. Infraestructura y despliegue**

> Detalla la infraestructura del proyecto, incluyendo un diagrama en el formato que creas conveniente, y explica el proceso de despliegue que se sigue

### **2.5. Seguridad**

> Enumera y describe las prácticas de seguridad principales que se han implementado en el proyecto, añadiendo ejemplos si procede

### **2.6. Tests**

> Describe brevemente algunos de los tests realizados

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

