# API REST y MCP de Utrel

Documentación de la API de **Utrel 1.2** para automatizaciones, scripts, n8n y agentes de IA.

- **URL base REST:** `https://tu-servidor/api`
- **Endpoint MCP:** `https://tu-servidor/api/mcp`
- **Formato:** JSON UTF-8; fechas en ISO 8601 (`2026-12-01T00:00:00.000Z`)
- **Identificadores:** UUID
- **Autenticación:** cookie de sesión o `Authorization: Bearer utrel_…`

> Esta API está pensada para integraciones servidor a servidor. No se envía CORS abierto, así que una web alojada en otro dominio no puede llamarla directamente desde el navegador.

---

## Índice

1. [Autenticación y tokens](#1-autenticación-y-tokens)
2. [Convenciones y errores](#2-convenciones-y-errores)
3. [Referencia REST](#3-referencia-rest)
4. [Objetos y payloads](#4-objetos-y-payloads)
5. [Recetas REST](#5-recetas-rest)
6. [Servidor MCP](#6-servidor-mcp)
7. [n8n y agentes de IA](#7-n8n-y-agentes-de-ia)
8. [Límites y validaciones](#8-límites-y-validaciones)

---

## 1. Autenticación y tokens

### 1.1 Crear un token desde la interfaz

1. Inicia sesión y abre tu avatar → **Mi perfil**.
2. En **Acceso API y MCP**, escribe un nombre (por ejemplo `n8n`) y pulsa **Generar token**.
3. Copia el valor en ese momento. **No se vuelve a mostrar**: en la base de datos solo queda su hash.
4. Usa el token en la cabecera `Authorization`. Puedes revocarlo desde la misma lista.

### 1.2 Crear un token por API

Con una sesión por cookie:

```bash
curl -s -X POST http://localhost:4000/api/auth/tokens \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"n8n"}'
```

Respuesta `201`:

```json
{
  "token": "utrel_8Kx…",
  "id": "4a1f7d2e-…",
  "name": "n8n",
  "prefix": "utrel_8Kx",
  "createdAt": "2026-11-06T10:00:00.000Z",
  "lastUsedAt": null,
  "tokens": [
    {
      "id": "4a1f7d2e-…",
      "name": "n8n",
      "prefix": "utrel_8Kx",
      "createdAt": "2026-11-06T10:00:00.000Z",
      "lastUsedAt": null
    }
  ]
}
```

El campo `token` es el único momento en el que se devuelve el valor completo. El límite es de **10 tokens por usuario**.

### 1.3 Usar el token

```bash
export UTREL_URL="http://localhost:4000"
export UTREL_TOKEN="utrel_…"

curl -s "$UTREL_URL/api/auth/me" \
  -H "Authorization: Bearer $UTREL_TOKEN"
```

El token hereda **todos los permisos del usuario** y funciona en toda la API, incluidas las subidas y el MCP. `lastUsedAt` se actualiza como máximo una vez por minuto para no escribir en SQLite en cada petición.

### 1.4 Listar y revocar tokens

```bash
# Listar (nunca devuelve el valor completo)
curl -s "$UTREL_URL/api/auth/tokens" \
  -H "Authorization: Bearer $UTREL_TOKEN"

# Revocar
curl -s -X DELETE "$UTREL_URL/api/auth/tokens/<TOKEN_ID>" \
  -H "Authorization: Bearer $UTREL_TOKEN"
```

La revocación es inmediata: la siguiente petición con ese token recibe `401`.

### 1.5 Sesión por cookie

Las rutas de login y registro crean la cookie `utrel_session` (`HttpOnly`, `SameSite=Lax`, 30 días). Para usar `curl` con sesión:

```bash
curl -s -c cookies.txt -X POST "$UTREL_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"tu-usuario","password":"tu-contraseña"}'
```

---

## 2. Convenciones y errores

### 2.1 Peticiones

- Envía `Content-Type: application/json` en las peticiones con cuerpo JSON, salvo en `POST /api/uploads`, que recibe la imagen en crudo.
- Los campos omitidos en un `PATCH` **no cambian**. Enviar `null` limpia el campo cuando el endpoint lo permite.
- Todas las rutas por debajo de `/api` requieren autenticación, salvo `GET /api/health`, `GET /api/auth/config`, `POST /api/auth/register` y `POST /api/auth/login`.
- Los recursos de un tablero solo son visibles para sus miembros. Si no tienes acceso, la API responde `404` (no revela que el recurso existe).
- Cabecera opcional `X-Client-Id`: identifica el dispositivo que origina un cambio para que el flujo SSE no se lo notifique a sí mismo.

### 2.2 Errores HTTP

Formato uniforme:

```json
{ "error": "Mensaje legible en español" }
```

| Código | Significado |
| :--- | :--- |
| `400` | Datos inválidos, campo obligatorio ausente, límite superado |
| `401` | Sin sesión o token inválido/revocado |
| `403` | Autenticado, pero sin permiso (por ejemplo, archivar un tablero que no es tuyo) |
| `404` | Recurso inexistente o sin acceso al tablero |
| `409` | Conflicto (email o usuario repetido, miembro ya añadido) |
| `415` | Formato de imagen no soportado |
| `500` | Error interno |

### 2.3 Enumeraciones

| Campo | Valores |
| :--- | :--- |
| `priority` | `none`, `low`, `medium`, `high`, `urgent` |
| `coverColor` / color de etiqueta o lista | `green`, `yellow`, `orange`, `red`, `purple`, `blue`, `sky`, `lime`, `pink`, `gray` |
| `background` (tablero) | `aurora`, `ocean`, `sunset`, `forest`, `berry`, `graphite` |
| `coverPosition` | `center`, `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |

### 2.4 Fechas e imágenes

- `dueDate` acepta ISO 8601 o `YYYY-MM-DD`. Se guarda en ISO. `null` o `""` la eliminan.
- `coverImage` y `backgroundImage` aceptan una ruta subida (`/uploads/<uuid>.png`) o una URL `http(s)`. `null` las elimina.

---

## 3. Referencia REST

### 3.1 Salud y configuración

| Método | Ruta | Auth | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | No | Comprueba que el servicio está vivo |
| `GET` | `/auth/config` | No | Registro abierto y si la instancia necesita configuración inicial |

```json
// GET /api/health
{ "ok": true, "service": "utrel" }

// GET /api/auth/config
{ "allowRegistration": true, "needsSetup": false }
```

### 3.2 Cuenta y tokens

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `POST` | `/auth/register` | Crea una cuenta y devuelve la cookie de sesión |
| `POST` | `/auth/login` | Inicia sesión con `identifier` (email o usuario) y `password` |
| `POST` | `/auth/logout` | Borra la sesión actual |
| `GET` | `/auth/me` | Devuelve el usuario autenticado |
| `PATCH` | `/auth/me` | Cambia usuario, nombre, avatar o contraseña |
| `GET` | `/auth/users?q=…` | Busca usuarios para añadirlos a un tablero (mínimo 2 caracteres) |
| `GET` | `/auth/tokens` | Lista los tokens del usuario |
| `POST` | `/auth/tokens` | Crea un token; el valor completo solo aparece aquí |
| `DELETE` | `/auth/tokens/:id` | Revoca un token |

`POST /auth/register`:

```json
{
  "email": "ana@ejemplo.com",
  "username": "ana",
  "name": "Ana",
  "password": "contraseña-larga"
}
```

`PATCH /auth/me` admite `username`, `name`, `avatar`, `currentPassword` y `newPassword`. Para cambiar la contraseña hay que enviar también `currentPassword`.

### 3.3 Tableros

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/boards` | Lista los tableros accesibles, con contadores y miembros |
| `POST` | `/boards` | Crea un tablero con tres listas y seis etiquetas por defecto |
| `GET` | `/boards/:id` | Devuelve el tablero completo |
| `POST` | `/boards/:id/copy` | Copia etiquetas y columnas; las tarjetas son opcionales |
| `PATCH` | `/boards/:id` | Renombra, cambia el fondo o archiva |
| `DELETE` | `/boards/:id` | Elimina el tablero y todo su contenido (solo propietario) |
| `PUT` | `/boards/lanes` | Guarda las columnas del Kanban de tableros del usuario (1–8) |
| `POST` | `/boards/:id/members` | Añade un miembro (solo propietario) |
| `DELETE` | `/boards/:id/members/:userId` | Quita un miembro (solo propietario) |
| `POST` | `/boards/:id/labels` | Crea una etiqueta |
| `PATCH` | `/labels/:id` | Renombra o recolorea una etiqueta |
| `DELETE` | `/labels/:id` | Elimina una etiqueta |
| `POST` | `/boards/:id/lists` | Crea una lista al final |
| `PATCH` | `/lists/:id` | Renombra, recolorea, archiva, limita o reordena una lista |
| `DELETE` | `/lists/:id` | Elimina una lista y sus tarjetas |

`POST /boards`:

```json
{ "title": "Producto", "background": "aurora" }
```

Respuesta `201`: el [payload completo del tablero](#41-tablero-completo).

`PATCH /boards/:id`:

```json
{
  "title": "Producto 2026",
  "background": "ocean",
  "backgroundImage": "https://ejemplo.com/fondo.jpg",
  "archived": false
}
```

Solo el propietario puede enviar `archived: true` y eliminar el tablero.

`POST /boards/:id/copy`:

```json
{ "includeCards": true }
```

Cualquier miembro con acceso puede copiar el tablero. Se copian siempre el fondo, las etiquetas y las columnas; con `includeCards: true` se añaden también las tarjetas activas con sus etiquetas, enlaces y checklists. No se copian comentarios, historial ni miembros. La copia pertenece a quien hace la petición y la respuesta `201` devuelve su [payload completo](#41-tablero-completo).

`POST /boards/:id/members` acepta cualquiera de estas claves:

```json
{ "username": "ana" }
{ "email": "ana@ejemplo.com" }
{ "identifier": "ana" }
```

Respuesta `201`:

```json
{
  "members": [
    {
      "id": "…",
      "username": "ana",
      "name": "Ana",
      "email": "ana@ejemplo.com",
      "avatar": null,
      "role": "member"
    }
  ]
}
```

`PATCH /lists/:id`:

```json
{
  "title": "En revisión",
  "color": "purple",
  "cardLimit": 5,
  "archived": false,
  "targetIndex": 1
}
```

- `cardLimit`: entero de 1 a 999, o `null` para quitar el límite WIP.
- `color`: color de la lista o `null`.
- `targetIndex`: posición de la lista dentro del tablero.

Las rutas de listas y etiquetas devuelven el payload completo del tablero, igual que `POST /boards/:id/labels`.

`PUT /boards/lanes`:

```json
{
  "lanes": [
    { "id": "backlog", "title": "Backlog", "boardIds": ["<BOARD_ID>"] },
    { "id": "doing", "title": "En curso", "boardIds": [] }
  ]
}
```

### 3.4 Tarjetas

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `POST` | `/lists/:id/cards` | Crea una tarjeta en la lista |
| `GET` | `/cards/:id` | Devuelve la tarjeta completa |
| `PATCH` | `/cards/:id` | Edita campos, mueve, archiva o restaura |
| `DELETE` | `/cards/:id` | Elimina la tarjeta definitivamente |
| `POST` | `/cards/:id/copy` | Copia la tarjeta en su lista |
| `POST` | `/lists/:id/cards/archive` | Archiva todas las tarjetas de la lista |
| `POST` | `/cards/:id/labels` | Añade una etiqueta |
| `DELETE` | `/cards/:id/labels/:labelId` | Quita una etiqueta |
| `POST` | `/cards/:id/members` | Asigna un miembro del tablero |
| `DELETE` | `/cards/:id/members/:userId` | Quita un miembro de la tarjeta |
| `POST` | `/cards/:id/checklists` | Crea un checklist |
| `PATCH` | `/checklists/:id` | Renombra o reordena un checklist |
| `DELETE` | `/checklists/:id` | Elimina un checklist |
| `POST` | `/checklists/:id/items` | Añade un elemento |
| `PATCH` | `/checklist-items/:id` | Edita, completa, mueve o reordena un elemento |
| `DELETE` | `/checklist-items/:id` | Elimina un elemento |
| `POST` | `/cards/:id/comments` | Añade un comentario |
| `PATCH` | `/comments/:id` | Edita un comentario (solo autor) |
| `DELETE` | `/comments/:id` | Borra un comentario (autor o propietario) |

#### Crear una tarjeta por REST

```bash
curl -s -X POST "$UTREL_URL/api/lists/<LIST_ID>/cards" \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Revisar el PR"}'
```

Respuesta `201`:

```json
{
  "card": { "id": "…", "listId": "…", "title": "Revisar el PR", "…": "…" },
  "board": "<BOARD_ID>"
}
```

`POST /lists/:id/cards` crea la tarjeta con el título. Si el título es una URL, el servidor descarga la vista previa, usa el título de la página o del vídeo y añade el enlace y la miniatura como portada.

Para rellenar el resto de campos, usa `PATCH /cards/:id` y los subrecursos de etiquetas, miembros y checklists. Si necesitas crear una tarjeta con **todos** sus campos de forma atómica, el MCP ofrece `create_card` con ese comportamiento.

#### Editar una tarjeta

```bash
curl -s -X PATCH "$UTREL_URL/api/cards/<CARD_ID>" \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Revisar el PR de pagos",
    "description": "## Criterios\n- Tests en verde\n- Sin regresiones",
    "dueDate": "2026-12-01",
    "dueComplete": false,
    "priority": "high",
    "coverColor": "blue",
    "coverImage": null,
    "coverPosition": "center",
    "link": "https://ejemplo.com/articulo",
    "archived": false,
    "listId": "<LIST_ID>",
    "targetIndex": 0
  }'
```

Campos admitidos:

| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `title` | string | Máx. 500; en una tarjeta normal el cliente limita a 100 |
| `description` | string | Markdown, máx. 20 000 |
| `dueDate` | string o `null` | ISO o `YYYY-MM-DD`; `null` la quita |
| `dueComplete` | boolean | Marca la fecha como completada |
| `priority` | enum | `none`, `low`, `medium`, `high`, `urgent` |
| `coverColor` | enum o `null` | Color de portada |
| `coverImage` | string o `null` | `/uploads/…` o URL `http(s)` |
| `coverPosition` | enum | Encuadre de la imagen |
| `link` | string o `null` | Añade o quita el enlace y su vista previa |
| `archived` | boolean | Archiva o restaura |
| `listId` | string | Mueve a otra lista del mismo tablero |
| `targetIndex` | number | Posición de destino (0 = primera) |

`PATCH` devuelve `{ "card": { … } }` con el detalle actualizado.

#### Subrecursos de la tarjeta

```json
// POST /cards/:id/labels
{ "labelId": "<LABEL_ID>" }

// POST /cards/:id/members
{ "userId": "<USER_ID>" }

// POST /cards/:id/checklists
{ "title": "Criterios de aceptación" }

// POST /checklists/:id/items
{ "text": "Añadir validación" }

// PATCH /checklist-items/:id
{ "text": "Añadir validación y tests", "done": true }

// PATCH /checklist-items/:id (mover a otro checklist de la misma tarjeta)
{ "checklistId": "<CHECKLIST_ID>", "targetIndex": 0 }

// POST /cards/:id/comments
{ "body": "Listo para revisar" }
```

Los endpoints de subrecursos devuelven la tarjeta completa (`{ "card": { … } }`). Las rutas de creación responden `201`.

### 3.5 Imágenes

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `POST` | `/uploads` | Sube una imagen en crudo y devuelve su URL |

Formatos: PNG, JPEG, WebP, GIF y AVIF, hasta **8 MB**. El `Content-Type` debe ser el de la imagen.

```bash
curl -s -X POST "$UTREL_URL/api/uploads" \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: image/png" \
  --data-binary @portada.png
```

Respuesta `201`:

```json
{ "url": "/uploads/8f14e45f-….png", "size": 48213 }
```

### 3.6 Eventos en vivo (SSE)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/boards/:id/events` | Flujo `text/event-stream` con los cambios del tablero |

```bash
curl -N "$UTREL_URL/api/boards/<BOARD_ID>/events" \
  -H "Authorization: Bearer $UTREL_TOKEN"
```

Eventos:

```text
event: hello
data: {"boardId":"…","user":"ana"}

event: change
data: {"boardId":"…","at":"2026-11-06T10:00:00.000Z","kind":"change","origin":null,"actor":"…"}
```

`kind` puede ser `change` o `deleted`. El navegador usa `EventSource` con cookie; si necesitas autenticar con Bearer desde un cliente, usa una librería SSE que permita cabeceras.

### 3.7 Administración de la instancia

Estas rutas solo están disponibles para usuarios con `isAdmin`. Con el token de un administrador también funcionan; un usuario normal recibe `403`.

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/admin/overview` | Ajustes, estadísticas y todos los usuarios |
| `PATCH` | `/admin/settings` | Abre o cierra el registro público |
| `POST` | `/admin/users` | Crea una cuenta desde el panel |
| `PATCH` | `/admin/users/:id` | Edita rol, estado, datos o contraseña |
| `DELETE` | `/admin/users/:id` | Elimina la cuenta y sus tableros |

`GET /admin/overview`:

```json
{
  "settings": { "allowRegistration": true },
  "stats": {
    "users": 4,
    "admins": 1,
    "disabled": 0,
    "boards": 7,
    "lists": 21,
    "cards": 48,
    "sessions": 3
  },
  "users": [
    {
      "id": "…",
      "email": "ana@ejemplo.com",
      "username": "ana",
      "name": "Ana",
      "avatar": null,
      "isAdmin": true,
      "disabled": false,
      "createdAt": "2026-11-06T10:00:00.000Z",
      "ownedBoards": 2,
      "sharedBoards": 1
    }
  ]
}
```

`PATCH /admin/settings`:

```json
{ "allowRegistration": false }
```

`POST /admin/users`:

```json
{
  "email": "luis@ejemplo.com",
  "username": "luis",
  "name": "Luis",
  "password": "contraseña-larga",
  "isAdmin": false
}
```

`PATCH /admin/users/:id` admite `email`, `username`, `name`, `password`, `isAdmin` y `disabled`. Un administrador no puede quitarse sus propios permisos ni deshabilitar su cuenta. Al deshabilitar una cuenta o cambiar su contraseña se cierran sus sesiones.

`DELETE /admin/users/:id` no permite borrar la propia cuenta y responde:

```json
{ "ok": true, "deleted": { "id": "…", "boards": 2 } }
```

---

## 4. Objetos y payloads

### 4.1 Tablero completo

`GET /api/boards/:id`, `POST /api/boards` y las rutas de listas/etiquetas devuelven esta estructura:

```json
{
  "board": {
    "id": "…",
    "title": "Producto",
    "background": "aurora",
    "backgroundImage": null,
    "ownerId": "…",
    "createdAt": "2026-11-06T10:00:00.000Z"
  },
  "members": [
    {
      "id": "…",
      "username": "ana",
      "name": "Ana",
      "email": "ana@ejemplo.com",
      "avatar": null,
      "role": "owner"
    }
  ],
  "labels": [
    { "id": "…", "name": "Prioridad alta", "color": "red" }
  ],
  "lists": [
    {
      "id": "…",
      "boardId": "…",
      "title": "Por hacer",
      "color": null,
      "cardLimit": null,
      "position": 1000,
      "cards": [
        {
          "id": "…",
          "boardId": "…",
          "listId": "…",
          "title": "Revisar el PR",
          "description": "",
          "dueDate": null,
          "dueComplete": false,
          "priority": "none",
          "coverColor": null,
          "coverImage": null,
          "coverPosition": "center",
          "link": null,
          "position": 1000,
          "archived": false,
          "createdAt": "2026-11-06T10:00:00.000Z",
          "updatedAt": "2026-11-06T10:00:00.000Z",
          "labels": [],
          "members": [],
          "checklist": { "checklists": 0, "total": 0, "done": 0 },
          "commentCount": 0
        }
      ]
    }
  ],
  "archivedCards": [
    { "id": "…", "title": "Antigua", "listId": "…", "listTitle": "Hecho" }
  ],
  "archivedLists": [
    { "id": "…", "title": "Descartadas" }
  ],
  "activity": [
    {
      "id": "…",
      "kind": "board",
      "message": "creó el tablero",
      "createdAt": "2026-11-06T10:00:00.000Z",
      "user": {
        "id": "…",
        "username": "ana",
        "name": "Ana",
        "avatar": null
      }
    }
  ]
}
```

`GET /api/boards` devuelve una versión resumida por tablero (`listCount`, `cardCount`, `overdueCount`, `role`, `members`) más `lanes`.

### 4.2 Tarjeta completa

`GET /api/cards/:id`, `PATCH /api/cards/:id` y los subrecursos devuelven `{ "card": { … } }`:

```json
{
  "card": {
    "id": "…",
    "boardId": "…",
    "listId": "…",
    "listTitle": "Por hacer",
    "title": "Revisar el PR",
    "description": "## Criterios\n- Tests en verde",
    "dueDate": "2026-12-01T00:00:00.000Z",
    "dueComplete": false,
    "priority": "high",
    "coverColor": "blue",
    "coverImage": null,
    "coverPosition": "center",
    "link": {
      "url": "https://ejemplo.com/articulo",
      "title": "Guía de ejemplo",
      "image": "https://ejemplo.com/portada.jpg",
      "icon": null,
      "site": "ejemplo.com"
    },
    "position": 1000,
    "archived": false,
    "createdAt": "2026-11-06T10:00:00.000Z",
    "updatedAt": "2026-11-06T10:00:00.000Z",
    "labels": [
      { "id": "…", "name": "Prioridad alta", "color": "red" }
    ],
    "members": [
      { "id": "…", "username": "ana", "name": "Ana", "avatar": null }
    ],
    "checklist": { "checklists": 1, "total": 3, "done": 1 },
    "commentCount": 2,
    "checklists": [
      {
        "id": "…",
        "title": "Criterios de aceptación",
        "position": 1000,
        "items": [
          { "id": "…", "text": "Añadir validación", "done": true, "position": 1000 }
        ]
      }
    ],
    "comments": [
      {
        "id": "…",
        "body": "Listo para revisar",
        "createdAt": "2026-11-06T10:00:00.000Z",
        "updatedAt": "2026-11-06T10:00:00.000Z",
        "user": {
          "id": "…",
          "username": "ana",
          "name": "Ana",
          "avatar": null
        }
      }
    ],
    "activity": [
      {
        "id": "…",
        "kind": "card",
        "message": "creó la tarjeta",
        "createdAt": "2026-11-06T10:00:00.000Z",
        "user": {
          "id": "…",
          "username": "ana",
          "name": "Ana",
          "avatar": null
        }
      }
    ]
  }
}
```

`link` es `null` cuando la tarjeta no tiene enlace. Los comentarios se ordenan del más reciente al más antiguo.

---

## 5. Recetas REST

### 5.1 Flujo completo: tablero, lista y tarjeta

```bash
export UTREL_URL="http://localhost:4000"
export UTREL_TOKEN="utrel_…"

# 1. Tablero nuevo (incluye listas y etiquetas por defecto)
BOARD=$(curl -s -X POST "$UTREL_URL/api/boards" \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Automatizaciones"}')
BOARD_ID=$(echo "$BOARD" | jq -r '.board.id')
LIST_ID=$(echo "$BOARD" | jq -r '.lists[0].id')
LABEL_ID=$(echo "$BOARD" | jq -r '.labels[0].id')

# 2. Tarjeta
CARD=$(curl -s -X POST "$UTREL_URL/api/lists/$LIST_ID/cards" \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Creada desde n8n"}')
CARD_ID=$(echo "$CARD" | jq -r '.card.id')

# 3. Completar campos
curl -s -X PATCH "$UTREL_URL/api/cards/$CARD_ID" \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description":"Creada por una automatización",
    "dueDate":"2026-12-01",
    "priority":"high"
  }'

# 4. Etiqueta, checklist y elemento
curl -s -X POST "$UTREL_URL/api/cards/$CARD_ID/labels" \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"labelId\":\"$LABEL_ID\"}"

CHECKLIST=$(curl -s -X POST "$UTREL_URL/api/cards/$CARD_ID/checklists" \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Criterios"}')
CHECKLIST_ID=$(echo "$CHECKLIST" | jq -r '.card.checklists[0].id')

curl -s -X POST "$UTREL_URL/api/checklists/$CHECKLIST_ID/items" \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Comprobar el resultado"}'

# 5. Archivar y borrar
curl -s -X PATCH "$UTREL_URL/api/cards/$CARD_ID" \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"archived":true}'

curl -s -X DELETE "$UTREL_URL/api/cards/$CARD_ID" \
  -H "Authorization: Bearer $UTREL_TOKEN"
```

### 5.2 Copiar una tarjeta

```bash
curl -s -X POST "$UTREL_URL/api/cards/$CARD_ID/copy" \
  -H "Authorization: Bearer $UTREL_TOKEN"
```

Copia campos, etiquetas, miembros y checklists; no copia comentarios.

### 5.3 Archivar toda una lista

```bash
curl -s -X POST "$UTREL_URL/api/lists/$LIST_ID/cards/archive" \
  -H "Authorization: Bearer $UTREL_TOKEN"
```

Devuelve el tablero completo con las tarjetas ya archivadas.

---

## 6. Servidor MCP

Utrel expone un servidor **MCP stateless** sobre **Streamable HTTP** en:

```text
https://tu-servidor/api/mcp
```

- Transporte: `POST` con JSON-RPC 2.0 y respuesta `application/json`.
- Autenticación: la misma cabecera `Authorization: Bearer utrel_…` (o cookie).
- No usa sesiones MCP ni `Mcp-Session-Id`; cada petición es independiente.
- Las notificaciones (sin `id`) se aceptan con `202 Accepted` y sin cuerpo.
- No se admiten lotes JSON-RPC (arrays): se responden como solicitud inválida.

### 6.1 Información del servicio

```bash
curl -s "$UTREL_URL/api/mcp" \
  -H "Authorization: Bearer $UTREL_TOKEN"
```

```json
{
  "name": "utrel",
  "transport": "streamable-http",
  "endpoint": "/api/mcp",
  "protocolVersion": "2025-06-18",
  "tools": [
    "list_boards",
    "get_board",
    "get_card",
    "create_list",
    "create_card",
    "update_card",
    "delete_card"
  ]
}
```

### 6.2 Inicializar

```bash
curl -s -X POST "$UTREL_URL/api/mcp" \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": { "name": "n8n", "version": "1.0" }
    }
  }'
```

Respuesta:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": { "tools": { "listChanged": false } },
    "serverInfo": { "name": "utrel", "version": "1.2.0" }
  }
}
```

Después, el cliente envía la notificación `notifications/initialized` (sin `id`) y recibe `202`.

### 6.3 Listar herramientas

```bash
curl -s -X POST "$UTREL_URL/api/mcp" \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

### 6.4 Herramientas

| Herramienta | Argumentos | Devuelve |
| :--- | :--- | :--- |
| `list_boards` | ninguno | `{ "boards": [...] }` con tableros accesibles |
| `get_board` | `boardId` | Payload completo del tablero |
| `get_card` | `cardId` | `{ "card": { ... } }` con checklists y comentarios |
| `create_list` | `boardId`, `title` | `{ "list": { id, boardId, title, position } }` |
| `create_card` | `listId`, `title` + campos opcionales | `{ "card": { ... } }` |
| `update_card` | `cardId` + al menos un campo | `{ "card": { ... } }` |
| `delete_card` | `cardId` | `{ "ok": true, "id": "…" }` |

#### `create_card`

| Argumento | Tipo | Obligatorio | Notas |
| :--- | :--- | :--- | :--- |
| `listId` | string | Sí | Lista de destino |
| `title` | string | Sí | Máx. 500 |
| `description` | string | No | Markdown, máx. 20 000 |
| `dueDate` | string o `null` | No | ISO o `YYYY-MM-DD` |
| `dueComplete` | boolean | No | Fecha completada |
| `priority` | enum | No | `none` por defecto |
| `coverColor` | enum o `null` | No | Color de portada |
| `coverImage` | string o `null` | No | `/uploads/…` o URL `http(s)` |
| `coverPosition` | enum | No | `center` por defecto |
| `link` | string o `null` | No | Añade enlace y vista previa |
| `labelIds` | string[] | No | Etiquetas del tablero |
| `memberIds` | string[] | No | Miembros del tablero |
| `checklists` | array | No | Checklists iniciales con sus elementos |

Cada checklist:

```json
{
  "title": "Criterios",
  "items": [
    "Primer paso",
    { "text": "Segundo paso", "done": true }
  ]
}
```

Ejemplo completo:

```bash
curl -s -X POST "$UTREL_URL/api/mcp" \
  -H "Authorization: Bearer $UTREL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "create_card",
      "arguments": {
        "listId": "<LIST_ID>",
        "title": "Tarea para IA",
        "description": "Creada por un modelo",
        "dueDate": "2026-12-01",
        "priority": "urgent",
        "labelIds": ["<LABEL_ID>"],
        "checklists": [
          {
            "title": "Pasos",
            "items": [
              { "text": "Revisar el contexto", "done": true },
              { "text": "Ejecutar la acción", "done": false }
            ]
          }
        ]
      }
    }
  }'
```

La respuesta MCP es un resultado de herramienta con el JSON como texto:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\n  \"card\": {\n    \"id\": \"…\",\n    \"title\": \"Tarea para IA\"\n  }\n}"
      }
    ]
  }
}
```

Los clientes MCP deben leer `result.content[0].text` y parsearlo como JSON.

#### `update_card`

Acepta `cardId` y uno o varios de: `title`, `description`, `dueDate`, `dueComplete`, `priority`, `coverColor`, `coverImage`, `coverPosition`, `link`, `labelIds`, `memberIds`, `archived`, `listId`, `targetIndex`.

- `labelIds` y `memberIds` **reemplazan** el conjunto completo; `[]` lo vacía.
- `listId` mueve la tarjeta a otra lista del mismo tablero.
- `targetIndex` la coloca en una posición concreta (0 = primera).
- `dueDate: null`, `coverColor: null`, `coverImage: null` o `link: null` limpian el campo.

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "update_card",
    "arguments": {
      "cardId": "<CARD_ID>",
      "title": "Título corregido",
      "priority": "high",
      "labelIds": ["<LABEL_ID>"],
      "archived": false
    }
  }
}
```

#### `delete_card`

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "delete_card",
    "arguments": { "cardId": "<CARD_ID>" }
  }
}
```

### 6.5 Errores MCP

Los errores de protocolo usan el objeto `error` de JSON-RPC:

| Código | Caso |
| :--- | :--- |
| `-32600` | Solicitud inválida o método que no es texto |
| `-32601` | Método JSON-RPC desconocido |
| `-32602` | Parámetros inválidos de la llamada o herramienta desconocida |
| `-32603` | Error interno |

Los errores de ejecución de una herramienta (permisos, recurso inexistente, validación) se devuelven con HTTP `200` y:

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [{ "type": "text", "text": "Tablero no encontrado" }],
    "isError": true
  }
}
```

### 6.6 Cliente MCP de escritorio

Ejemplo de configuración para Claude Desktop u otro cliente compatible con HTTP:

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

---

## 7. n8n y agentes de IA

### 7.1 Nodo MCP Client

Configura:

- **Transport:** HTTP / Streamable HTTP
- **URL:** `https://tu-servidor/api/mcp`
- **Header:** `Authorization: Bearer utrel_…`

El nodo descubre las herramientas con `tools/list` y puede llamar a `create_card`, `update_card`, etc.

### 7.2 Nodo HTTP Request

Si prefieres JSON-RPC directo:

- **Method:** `POST`
- **URL:** `https://tu-servidor/api/mcp`
- **Headers:**
  - `Authorization: Bearer utrel_…`
  - `Content-Type: application/json`
  - `Accept: application/json, text/event-stream`
- **Body (JSON):**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "create_card",
    "arguments": {
      "listId": "{{ $json.listId }}",
      "title": "{{ $json.title }}",
      "description": "{{ $json.description }}",
      "priority": "medium"
    }
  }
}
```

### 7.3 Prompt sugerido para un agente

```text
Eres un asistente que gestiona el tablero Utrel del equipo.
Usa list_boards para localizar el tablero y get_board para obtener los IDs
de sus listas y etiquetas. Para crear una tarea usa create_card con listId,
title, description, dueDate (YYYY-MM-DD), priority y labelIds. Antes de
borrar algo con delete_card, confirma con la persona usuaria.
```

---

## 8. Límites y validaciones

| Elemento | Límite |
| :--- | :--- |
| Tokens por usuario | 10 |
| Título de tablero o lista | 120 caracteres |
| Título de tarjeta | 500 caracteres (el cliente usa 100) |
| Descripción de tarjeta | 20 000 caracteres |
| Comentario | 10 000 caracteres |
| Título de checklist | 120 caracteres |
| Elemento de checklist | 500 caracteres |
| Etiqueta | 60 caracteres |
| Nombre de token | 60 caracteres |
| Columnas del Kanban de tableros | 1–8 |
| Título de una columna Kanban | 40 caracteres |
| Límite WIP de una lista | 1–999 o `null` |
| Imagen subida | 8 MB; PNG, JPEG, WebP, GIF o AVIF |
| Cuerpo JSON | 1 MB |
| Historial devuelto | Últimas 15 entradas por tablero y tarjeta |
| Búsqueda de usuarios | Mínimo 2 caracteres, máximo 10 resultados |

### Códigos de error habituales

| Situación | Respuesta |
| :--- | :--- |
| Token ausente, inválido o revocado | `401 { "error": "Necesitas iniciar sesión" }` |
| Tablero ajeno o inexistente | `404 { "error": "Tablero no encontrado" }` |
| Intentar archivar un tablero sin ser propietario | `403` |
| Etiqueta o miembro de otro tablero | `400` (etiqueta inexistente en el tablero: `404`) |
| Mover una tarjeta a una lista de otro tablero | `400` |
| Prioridad, color o posición inválidos | `400` |
| Formato de imagen no admitido | `415` |

---

*Utrel 1.2 · Documentación de la API REST y MCP.*
