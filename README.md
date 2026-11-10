<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/utrel-logo-dark.svg" />
    <img alt="Utrel — Ultra-light Kanban" src="brand/utrel-logo-light.svg" width="340" />
  </picture>
</p>

<p align="center">
  <strong>El gestor Kanban autohospedado, ultraligero y sin tonterías que tu servidor se merece.</strong><br />
  Arranque instantáneo, SQLite con WAL a pelo, cambios en tiempo real por SSE nativo y PWA instalable.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Fair--Source%20%2F%20Non--Commercial-blue.svg" alt="Licencia No Comercial" /></a>
  <img src="https://img.shields.io/badge/Tests-123%20passing-brightgreen.svg" alt="123 tests pasando" />
  <img src="https://img.shields.io/badge/Version-1.2-blue.svg" alt="Versión 1.2" />
  <img src="https://img.shields.io/badge/Docker-GHCR%20Ready-2496ED?logo=docker&logoColor=white" alt="Docker GHCR" />
  <img src="https://img.shields.io/badge/Node-%3E%3D20.19-green.svg?logo=node.js" alt="Node >= 20.19" />
  <img src="https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/SQLite-WAL%20Mode-003B57.svg?logo=sqlite" alt="SQLite WAL" />
</p>

---

## ⚡ ¿Por qué Utrel?

La mayoría de alternativas autohospedadas a Trello se han convertido en monstruos gigantescos: te obligan a levantar contenedores pesados de PostgreSQL, Redis y servicios secundarios consumiendo 2 GB de RAM antes de que hayas movido una sola tarjeta.

**Utrel nace para romper con eso.** 

Es una aplicación de gestión de proyectos y tableros Kanban construida desde cero con una filosofía clara: **velocidad absurda, cero servicios externos y código limpio**:
- 🚀 **Un único contenedor ligero:** Sin PostgreSQL, sin Redis, sin workers secundarios. Una única base de datos SQLite con modo WAL (`better-sqlite3`) y foreign keys estrictas que responde en submilisegundos.
- ⚡ **Tiempo real nativo:** Cambios en vivo sincronizados entre pestañas y dispositivos mediante *Server-Sent Events* (SSE) estándar del navegador. Cero dependencias pesadas tipo Socket.io.
- 📱 **PWA de primera clase:** Diseñada como aplicación web progresiva instalable en escritorio, Android e iPadOS, respetando escrupulosamente el área segura de la pantalla (`viewport-fit=cover`).
- 🔒 **Independencia y privacidad total:** Todo se guarda en tu propia máquina. Tú eres el dueño de tus datos y de tu infraestructura.

---

## ✨ Características Principales

### 📋 Tableros y Columnas
- **Múltiples tableros por usuario** con papelera de elementos archivados (listas y tarjetas) y dos vistas: **Normal** (cuadrícula de portadas) o **Kanban**, donde cada tablero es una tarjeta. Las columnas del Kanban son tuyas: añade, renombra, reordena o elimina columnas (hasta 8) y mueve cada tablero entre ellas; se guardan por usuario.
- **Copiar tableros completos:** «Copiar tablero…» en el menú del tablero permite duplicar un tablero completo con sus columnas, colores, etiquetas y fondo, con la opción de copiar también sus tarjetas o dejarlo limpio como plantilla.
- **Fondos personalizables:** Elige entre degradados integrados, sube tus propias imágenes (PNG, JPEG, WebP, GIF, AVIF hasta 8 MB) o enlaza una URL remota con previsualización en vivo.
- **Color de lista personalizable (10 tonos):** Tiñe la columna entera con un degradado sutil y una barra de acento que respeta la legibilidad de las tarjetas.
- **Límites WIP por lista (Work In Progress):** Fija un tope de tarjetas por columna. El contador te avisa visualmente: amarillo (≤ 3 huecos), rojo (límite alcanzado) y morado (límite superado), sin bloquear la creación de tareas.
- **Archivado en bloque:** «Archivar todas las tarjetas» vacía una columna de una vez, con confirmación previa; todo se puede restaurar después desde «Elementos archivados».
- **Añadir lista como una columna más:** El botón «Añadir lista» vive al final de las columnas, solo en la vista de tablero. Al pulsarlo, la lista que estás nombrando ocupa su sitio a la derecha —nunca una fila encima del lienzo— y no aparece en la vista de calendario.
- **Buscador a pantalla completa:** «Buscar» abre un modal casi completo donde las tarjetas aparecen en cuadrícula mientras escribes, con los filtros de fecha, etiquetas y miembros dentro del propio buscador. Abrir un resultado lleva a su tarjeta; al cerrar se limpian los filtros para empezar de cero.
- **Renombrado cómodo:** Mientras escribes el nombre de una lista, la columna deja de arrastrarse —puedes seleccionar el texto con el ratón— y Escape cancela el cambio sin guardarlo.
- **Listas contraíbles:** Pliega cualquier columna en una tira vertical compacta con un solo clic. El estado se recuerda por dispositivo y usuario, y las listas plegadas siguen siendo zonas válidas para soltar tarjetas.
- **Drag & Drop fluido y táctil:** Arrastra y suelta tarjetas y columnas tanto con ratón como con pulsación táctil prolongada en móviles y tablets, con autoscroll en los bordes y sin saltos bruscos de maquetación.
- **Columnas adaptativas:** Las listas del tablero y las columnas del Kanban de tableros crecen con su contenido y se desplazan en horizontal, igual que en un tablero normal.
- **Animaciones cuidadas:** Entrada suave de tarjetas y columnas, avisos de destino al arrastrar, líneas de inserción, diálogos y menús animados. Todo respeta `prefers-reduced-motion`.

### 🃏 Tarjetas y Flujo de Trabajo
- **Edición enriquecida:** Título y descripción con soporte completo de GitHub Flavored Markdown (GFM) saneado con DOMPurify. Al editar la descripción, una cinta de opciones (negrita, cursiva, encabezados, listas, checklist, cita, código, enlace y separador) aplica el formato sobre la selección sin soltar el teclado. En el detalle, el título es de una sola línea (sin saltos) y admite como máximo 100 caracteres.
- **Completado rápido de tareas:** Círculo interactivo directo en la tarjeta del tablero —y también en la vista de calendario— para marcar la fecha de vencimiento como completada al instante con un solo toque y sin abrir el modal.
- **Fechas de vencimiento inteligentes:** Código de colores semafórico según la urgencia (vencida, urgente, próxima o completada).
- **Checklists múltiples y progreso en tarjeta:** Crea varias listas de comprobación por tarjeta con barra de progreso y cálculo porcentual en tiempo real. En el tablero, las tarjetas con checklists muestran su barra de progreso y porcentaje (`0%` a `100%`) directamente, tiñéndose en verde al completarse. Reordena las checklists con su asa y arrastra cualquier elemento dentro de su checklist o a otra de la misma tarjeta.
- **Etiquetas y Portadas:** El color se elige en un desplegable discreto —una pastilla con el color actual y la paleta de 10 tonos al desplegarla— en vez de tener todas las muestras a la vista, fondos de portada (color o imagen propia) y miembros asignados con su avatar. Con una imagen de portada eliges su encuadre en una cuadrícula 3×3 (nueve posiciones) y la tarjeta muestra exactamente esa zona.
- **Etiquetas desde el menú:** Crear, renombrar, recolorear o eliminar etiquetas vive en «Etiquetas…», dentro del menú de la derecha, para no saturar la barra superior.
- **Checklists legibles:** El texto de cada elemento crece con su contenido, así que un paso largo se ve entero de un vistazo en lugar de quedar recortado.
- **Edición sin pérdidas y sin salidas accidentales:** Al terminar de pulsar fuera de un campo en edición (título de tablero o de tarjeta, descripción, renombrar lista) los cambios se guardan; pero una selección de texto que acaba fuera del cuadro, o un clic en el primer instante, ya no descartan lo que estabas escribiendo. Con un editor abierto, Escape sale del campo (no de la tarjeta) y el primer clic en el fondo solo cierra el editor.
- **Desplegables que se cierran solos:** Los menús de la barra superior y de cada lista, y el selector de color, se cierran al pulsar fuera de ellos o con Escape, sin dejar nada flotando en pantalla.
- **Insignias en la tarjeta:** Cada tarjeta resume de un vistazo su prioridad, su fecha, si tiene descripción, su checklist (`hecho/total`) y sus comentarios, con icono y número en la misma línea.
- **Enlaces con vista previa:** Pega un enlace al crear una tarjeta y nace con el nombre de la página o del vídeo, el enlace y su miniatura como banner (en YouTube, además, con el icono del servicio). Cualquier tarjeta admite un enlace en su sección «Enlace», que carga título, favicon y miniatura —evitando redes privadas— y ofrece «Establecer banner» para usar la imagen capturada como portada.
- **Copiar tarjetas:** «Copiar tarjeta», tanto en el menú contextual como en las acciones del detalle, duplica la tarjeta en su misma columna con todas sus propiedades: descripción, fecha, prioridad, portada, enlace, etiquetas, miembros y checklists. Los comentarios no se duplican.
- **Iconos profesionales:** Toda la interfaz usa los iconos SVG de [Lucide](https://lucide.dev) (menús, tarjetas, diálogos) en lugar de emojis del sistema, con el mismo grosor de trazo en toda la app.
- **Comentarios y Colaboración:** Hilo de discusión con Markdown, marcas de tiempo y avatares de usuario.
- **Historial de actividad:** Cada tarjeta guarda las últimas 15 actualizaciones de sus miembros (quién asignó o quitó a quién) y el tablero conserva sus últimas 15 actualizaciones propias (nombre, fondo e incorporaciones o salidas de miembros), con autor y fecha.

### 📅 Vista de Calendario
- Alterna entre el tablero Kanban tradicional y una cuadrícula mensual limpia donde las tarjetas se ordenan por su fecha de vencimiento.
- Panel lateral para tarjetas sin fecha asignada y filtro para ocultar tareas completadas.
- **Cambiar la fecha arrastrando:** Lleva cualquier tarjeta (con o sin fecha) a otro día de la cuadrícula para cambiar su vencimiento. Se conserva la hora que ya tenía.

### 🖱️ Menú Contextual Propio
- Clic derecho personalizado tanto en tarjetas como en listas y fondo del tablero (abrir, archivar, renombrar, cambiar color, eliminar, etc.), con icono en cada opción —también en los menús y en la edición de tarjetas—. Navegable mediante teclado con flechas y Enter, accesible y cerrable con Escape o scroll.
- **Confirmaciones propias:** Borrar tableros, listas, tarjetas o cuentas abre un diálogo de la app (con Escape y clic fuera para cancelar), nunca un `window.confirm` del navegador.

### 🛠️ Administración de la Instancia (`/admin`)
- **Primer usuario = Administrador:** La primera cuenta creada en una instalación limpia adquiere permisos de administrador automáticamente.
- **Control de registro:** Abre o cierra el registro público de cuentas con un solo interruptor. Si está cerrado, solo los administradores pueden dar de alta nuevos usuarios.
- **Gestión de cuentas:** Promociona administradores, cambia contraseñas, edita perfiles, deshabilita usuarios (con corte inmediato de sesiones) o elimina cuentas junto con sus tableros asociados.

### 🤖 API, MCP y automatizaciones
- **Tokens personales:** Genera tokens desde «Mi perfil → Acceso API y MCP», con nombre, fecha de último uso y revocación inmediata. Cada token se muestra una sola vez y se guarda hasheado.
- **API REST completa:** Con `Authorization: Bearer <token>` puedes listar tableros, crear listas, crear tarjetas y completar todos sus campos (descripción, fecha, prioridad, portada, enlace, etiquetas, miembros y checklists), editarlas, moverlas, archivarlas y borrarlas. Es la misma API que usa la interfaz, así que respeta permisos y registra la actividad.
- **Servidor MCP:** Endpoint `POST /api/mcp` compatible con Streamable HTTP y JSON-RPC 2.0. Expone herramientas para que n8n, Claude, ChatGPT u otro agente de IA consulten tableros y gestionen tarjetas sin escribir código.
- **n8n y cualquier automatización:** Sirve tanto el nodo MCP Client como el nodo HTTP Request, porque la autenticación es un simple encabezado Bearer.
- **Acceso directo al código:** Un icono discreto en la esquina inferior derecha enlaza al [repositorio oficial](https://github.com/contratop/utrel).

---

## 🤖 API REST y MCP

> 📘 Referencia completa con todos los endpoints, payloads, errores y ejemplos: **[API.md](API.md)**.

### 1. Crear un token

1. Abre tu avatar en la esquina superior derecha y entra en **Mi perfil**.
2. En **Acceso API y MCP**, escribe un nombre (por ejemplo `n8n`) y pulsa **Generar token**.
3. Copia el token en ese momento: no se vuelve a mostrar. Puedes revocarlo cuando quieras desde la misma lista.

Envíalo siempre en la cabecera:

```http
Authorization: Bearer utrel_…
```

### 2. API REST

La base es `https://tu-servidor/api`. Los endpoints son los mismos que consume la web:

| Método | Ruta | Qué hace |
| :--- | :--- | :--- |
| `GET` | `/boards` | Lista tus tableros |
| `GET` | `/boards/:id` | Tablero completo (listas, tarjetas, etiquetas y miembros) |
| `POST` | `/boards/:id/copy` | Copia etiquetas y columnas, con tarjetas opcionales |
| `POST` | `/boards/:id/lists` | Crea una lista |
| `POST` | `/lists/:id/cards` | Crea una tarjeta |
| `PATCH` | `/cards/:id` | Edita campos, mueve (`listId`, `targetIndex`) o archiva |
| `DELETE` | `/cards/:id` | Borra una tarjeta |
| `POST` | `/cards/:id/copy` | Copia la tarjeta en su lista |
| `POST` | `/cards/:id/comments` | Añade un comentario |
| `POST` | `/cards/:id/checklists` | Crea un checklist |
| `POST` | `/checklists/:id/items` | Añade un elemento |

```bash
# Crear una tarjeta
curl -X POST https://tu-servidor/api/lists/<LIST_ID>/cards \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Revisar el PR",
    "description": "Creada desde n8n",
    "dueDate": "2026-12-01",
    "priority": "high",
    "labelIds": ["<LABEL_ID>"]
  }'

# Editar, mover o archivar
curl -X PATCH https://tu-servidor/api/cards/<CARD_ID> \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dueComplete": true}'

# Borrar
curl -X DELETE https://tu-servidor/api/cards/<CARD_ID> \
  -H "Authorization: Bearer $UTREL_TOKEN"
```

> Los IDs de listas y etiquetas se obtienen con `GET /api/boards/:id`. Los permisos son los del usuario dueño del token: si no perteneces al tablero, la API responde `404`.

### 3. Servidor MCP

El endpoint MCP es `https://tu-servidor/api/mcp` y habla JSON-RPC 2.0 sobre Streamable HTTP (respuestas `application/json`). Se autentica con el mismo token.

Herramientas disponibles:

| Herramienta | Para qué sirve |
| :--- | :--- |
| `list_boards` | Ver tableros accesibles |
| `get_board` | Ver listas, tarjetas y etiquetas de un tablero |
| `get_card` | Ver una tarjeta completa |
| `create_list` | Crear una columna |
| `create_card` | Crear tarjeta con todos sus campos y checklists |
| `update_card` | Editar, mover, archivar, reemplazar etiquetas o miembros |
| `delete_card` | Borrar una tarjeta |

Comprobación rápida con `curl`:

```bash
curl -X POST https://tu-servidor/api/mcp \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

En **n8n** puedes usar el nodo **MCP Client** apuntando a esa URL y añadiendo la cabecera `Authorization`, o el nodo **HTTP Request** con el mismo encabezado. Ejemplo de configuración para un cliente MCP de escritorio:

```json
{
  "mcpServers": {
    "utrel": {
      "type": "http",
      "url": "https://tu-servidor/api/mcp",
      "headers": {
        "Authorization": "Bearer utrel_…"
      }
    }
  }
}
```

> El token concede acceso completo a tu cuenta. Créalo solo para integraciones de confianza y revócalo si dejas de usarlo.

La guía ampliada —incluyendo subrecursos de tarjetas, subidas, SSE, referencia de errores y configuración de clientes MCP— está en **[API.md](API.md)**.

---

## 🚦 Colores de Fecha de Vencimiento

| Estado | Color | Clase CSS | Comportamiento |
| :--- | :--- | :--- | :--- |
| **Vencida** | Morado | `due-overdue` | La fecha límite ya ha pasado |
| **Urgente** | Rojo | `due-urgent` | Queda 1 día o menos para la entrega |
| **Próxima** | Naranja | `due-soon` | Quedan 3 días o menos |
| **Con margen** | Neutro | `due-later` | Quedan más de 3 días |
| **Completada** | Verde | `due-complete` | Marcada como completada (prevalece sobre el vencimiento) |

---

## 🐳 Despliegue con Docker

### Opción 1: Docker Compose (Recomendada)

Crea un archivo `docker-compose.yml` en tu servidor:

```yaml
services:
  utrel:
    image: ghcr.io/contratop/utrel:latest
    container_name: utrel
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      NODE_ENV: production
      PORT: "4000"
      DATA_DIR: /data
      ALLOW_REGISTRATION: "true" # Puedes apagarlo después desde el panel /admin
      COOKIE_SECURE: "true"      # Cambia a "true" si estás detrás de HTTPS
    volumes:
      - utrel-data:/data

volumes:
  utrel-data:
```

Levanta la aplicación en segundo plano:

```bash
docker compose up -d
```

Abre `http://localhost:4000` (o tu dominio). Al ser el primer arranque, la aplicación te mostrará la pantalla de bienvenida para que crees tu cuenta de administrador. ¡A disfrutar!

---

### Opción 2: Compilación local con Docker

Si prefieres construir la imagen directamente desde el código fuente:

```bash
git clone https://github.com/contratop/utrel.git
cd utrel
docker compose up -d --build
```

---

## ⚙️ Variables de Entorno

| Variable | Valor por defecto | Descripción |
| :--- | :--- | :--- |
| `PORT` | `4000` | Puerto HTTP donde escucha el servidor. |
| `DATA_DIR` | `server/data` (en Docker: `/data`) | Directorio donde se almacenan la base de datos y los archivos. |
| `DB_FILE` | `$DATA_DIR/utrel.db` | Ruta del archivo de base de datos SQLite. |
| `UPLOADS_DIR` | `$DATA_DIR/uploads` | Carpeta para avatares, fondos y portadas (imágenes de hasta 8 MB). |
| `CLIENT_DIST` | `client/dist` | Ruta donde se encuentran los archivos web compilados de React. |
| `ALLOW_REGISTRATION` | `true` | Estado inicial del registro público. Una vez configurado en `/admin`, manda la base de datos. |
| `COOKIE_SECURE` | `false` | Ponlo en `true` para requerir cookies seguras detrás de un proxy con HTTPS. |

> [!TIP]
> **Notas para Nginx / Proxies Inversos:**  
> Para que los eventos en tiempo real funcionen al 100%, tu proxy no debe almacenar en búfer la ruta SSE. El servidor ya envía la cabecera `X-Accel-Buffering: no`. En Nginx, asegúrate de tener `proxy_buffering off;` para la ruta `/api/boards/:id/events`.

---

## 💻 Desarrollo Local y Tests

Requisitos: Node.js 20.19 o superior.

```bash
# Instalar dependencias del monorepo (servidor y cliente)
npm install

# Iniciar servidor Express (puerto 4000) y cliente Vite (puerto 5173) en paralelo
npm run dev

# Compilar cliente React para producción
npm run build

# Ejecutar la suite completa de tests automatizados
npm test
```

### 🧪 Cobertura de pruebas (123 tests automatizados)
- **44 tests de Backend (`utrel-server`):** Pruebas contra un servidor Express real con base de datos SQLite efímera (autenticación con scrypt, cookies de sesión, tokens Bearer, API REST autenticada, servidor MCP con `initialize`, `tools/list` y CRUD de tarjetas, permisos y pertenencia a tableros, límites WIP, reordenación de checklists y movimiento de elementos entre ellas, columnas Kanban por usuario, encuadre de portadas, metadatos de enlaces, creación de tarjetas desde una URL, copia completa de tarjetas y de tableros con o sin contenido, título automático de YouTube y archivado de toda una lista, historial de actividad con tope de 15, subida de imágenes, flujo SSE y panel de administración).
- **79 tests de Frontend (`utrel-client`):** Pruebas unitarias de cálculo de arrastre (DnD), fechas, columnas personalizadas, validación de manifest, iconos y CSS de la PWA (área segura del iPad, alto real de la ventana), y montaje completo de la aplicación compilada en `jsdom` (simulación de eventos SSE, clic derecho, contracción y renombrado de listas, marcado directo de tarjetas, etiquetas en el menú de la derecha con selector de color discreto, buscador a pantalla completa con resultados, lista nueva como una columna más, vistas normal y Kanban con columnas editables, encuadre de portada, historial de tablero y tarjeta, cinta Markdown, arrastre de checklists y elementos, cambio de fecha en el calendario, texto largo de checklists, vista previa de Markdown, enlaces de YouTube con portada y vista previa, icono de enlace y progreso total de checklists en las tarjetas, establecimiento del banner del enlace, archivado en bloque con confirmación, copia de tarjetas desde el menú y desde el detalle, copia de tableros con elección de contenido y cancelación, generación y revocación de tokens de API/MCP en el perfil, enlace al repositorio oficial, cierre de los desplegables al pulsar fuera y cierre inteligente de los editores).

---

## 🤝 Autores y Créditos

**Utrel** ha sido diseñado y desarrollado con orgullo por:
- **[contratop](https://github.com/contratop)** — Arquitectura, diseño de producto, UX/UI, dirección y programación.
- **Conexor** — Agente de IA copiloto, pair programming, optimización de rendimiento y soporte de desarrollo.

Un proyecto parido codo con codo para demostrar que el software moderno de productividad puede ser rápido, elegante, ligero y libre de la codicia corporativa.

---

## 📜 Licencia

Distribuido bajo los términos de la **Utrel Non-Commercial License (Fair-Source)**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

* Se autoriza, fomenta y celebra el uso personal, educativo, en entornos de investigación, servidores domésticos (*homelabs*) y el autohospedaje comunitario sin coste alguno.
* Queda terminantemente prohibida su comercialización, reventa o explotación como servicio alojado de pago (SaaS) sin autorización explícita por escrito del titular del copyright.

---

## ⚖️ Aviso Legal

*Trello® es una marca registrada de Atlassian Pty Ltd.*  
Utrel es un desarrollo de software independiente y autónomo creado para la comunidad. No está afiliado, respaldado, asociado ni patrocinado en modo alguno por Atlassian ni por ninguna de sus filiales.
