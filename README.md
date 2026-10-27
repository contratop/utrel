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
  <img src="https://img.shields.io/badge/Tests-76%20passing-brightgreen.svg" alt="76 tests pasando" />
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
- **Múltiples tableros por usuario** con archivo y papelera de recuperación.
- **Fondos personalizables:** Elige entre degradados integrados, sube tus propias imágenes (PNG, JPEG, WebP, GIF, AVIF hasta 8 MB) o enlaza una URL remota con previsualización en vivo.
- **Color de lista personalizable (10 tonos):** Tiñe la columna entera con un degradado sutil y una barra de acento que respeta la legibilidad de las tarjetas.
- **Límites WIP por lista (Work In Progress):** Fija un tope de tarjetas por columna. El contador te avisa visualmente: amarillo (≤ 3 huecos), rojo (límite alcanzado) y morado (límite superado), sin bloquear la creación de tareas.
- **Listas contraíbles:** Pliega cualquier columna en una tira vertical compacta con un solo clic. El estado se recuerda por dispositivo y usuario, y las listas plegadas siguen siendo zonas válidas para soltar tarjetas.
- **Drag & Drop fluido y táctil:** Arrastra y suelta tarjetas y columnas tanto con ratón como con pulsación táctil prolongada en móviles y tablets, con autoscroll en los bordes y sin saltos bruscos de maquetación.

### 🃏 Tarjetas y Flujo de Trabajo
- **Edición enriquecida:** Título y descripción con soporte completo de GitHub Flavored Markdown (GFM) saneado con DOMPurify.
- **Completado rápido de tareas:** Círculo interactivo directo en la tarjeta del tablero para marcar la fecha de vencimiento como completada al instante con un solo toque y sin abrir el modal.
- **Fechas de vencimiento inteligentes:** Código de colores semafórico según la urgencia (vencida, urgente, próxima o completada).
- **Checklists múltiples:** Crea varias listas de comprobación por tarjeta con barra de progreso y cálculo porcentual en tiempo real.
- **Etiquetas y Portadas:** 10 colores de etiqueta, fondos de portada (color o imagen propia) y miembros asignados con su avatar.
- **Comentarios y Colaboración:** Hilo de discusión con Markdown, marcas de tiempo y avatares de usuario.

### 📅 Vista de Calendario
- Alterna entre el tablero Kanban tradicional y una cuadrícula mensual limpia donde las tarjetas se ordenan por su fecha de vencimiento.
- Panel lateral para tarjetas sin fecha asignada y filtro para ocultar tareas completadas.

### 🖱️ Menú Contextual Propio
- Clic derecho personalizado tanto en tarjetas como en listas y fondo del tablero (abrir, archivar, renombrar, cambiar color, eliminar, etc.). Navegable mediante teclado con flechas y Enter, accesible y cerrable con Escape o scroll.

### 🛠️ Administración de la Instancia (`/admin`)
- **Primer usuario = Administrador:** La primera cuenta creada en una instalación limpia adquiere permisos de administrador automáticamente.
- **Control de registro:** Abre o cierra el registro público de cuentas con un solo interruptor. Si está cerrado, solo los administradores pueden dar de alta nuevos usuarios.
- **Gestión de cuentas:** Promociona administradores, cambia contraseñas, edita perfiles, deshabilita usuarios (con corte inmediato de sesiones) o elimina cuentas junto con sus tableros asociados.

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
| `UPLOADS_DIR` | `$DATA_DIR/uploads` | Carpeta para avatares y fotos de fondo de tableros y portadas. |
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

### 🧪 Cobertura de pruebas (76 tests automatizados)
- **31 tests de Backend (`utrel-server`):** Pruebas contra un servidor Express real con base de datos SQLite efímera (autenticación con scrypt, cookies de sesión, permisos y pertenencia a tableros, límites WIP, subida de ficheros, flujo SSE y panel de administración).
- **45 tests de Frontend (`utrel-client`):** Pruebas unitarias de cálculo de arrastre (DnD) y fechas, validación de manifest y PWA, y montaje completo de la aplicación compilada en `jsdom` (simulación de eventos SSE, clic derecho, contracción de listas y marcado directo de tarjetas).

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
