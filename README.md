# JAUTHIA CRM · EvoSport

CRM omnicanal con bot de ventas (SDR) para WhatsApp, Instagram, Messenger, Telegram y chat web.
Está construido con **Angular 22** (frontend), **Node.js + Express + Socket.io** (backend) y **PostgreSQL**
(base de datos). Todo es software libre y gratuito, y sigue el documento *Flujo de ventas de onboarding* de
JAUTHIA para EvoSport.

## Qué incluye

| Módulo | Qué hace |
|---|---|
| **Bandeja omnicanal** | Todas las redes en una sola lista, con filtros por canal, sin leer, calientes 🔥, bot/asesor y "mías". |
| **Chat estilo WhatsApp** | Mensajes con botones, listas, **carrusel de productos con imagen + "Ver detalles" + "Lo quiero"** y ficha técnica. |
| **Alerta de intención** | Cuando el cliente pide un producto ("¿tienen caminadoras?") aparece un aviso con las fotos y el botón *Enviar carrusel*. También avisa cuando pide precio, quiere comprar o envía un comprobante. |
| **Simulador** | Botón **Probar bot**: chateas como si fueras el cliente y tocas los botones. No se envía nada a las redes reales. |
| **Embudo (Kanban)** | Las 9 etapas del flujo. Las tarjetas avanzan solas con las señales de compra y se pueden arrastrar. Hay una franja de "Listos para cerrar". |
| **Puntaje de compra** | Cada señal suma puntos (eligió producto, pidió precio, forma de pago…). Desde 70 se marca **🔥 a punto de comprar**. |
| **Flujo del bot (editable)** | Preguntas por ruta (cardio, fuerza, peso libre, accesorios), botones, sinónimos, cuándo pasa al asesor, seguimientos y mensajes base. Todo se configura desde la pantalla, sin tocar código. |
| **Catálogo** | Productos con imagen, ficha técnica, disponibilidad, peso máximo, techo mínimo y palabras clave que los activan en el chat. |
| **Plantillas de WhatsApp** | Editor con vista previa en un celular: texto, botones, ficha o carrusel. |
| **Canales** | El cliente elige qué redes conectar. La pantalla muestra la URL del webhook y los pasos de cada una. |
| **Tareas, contactos y resumen** | Tarea automática con la nota resumen en cada traspaso. Contactos exportables a CSV. Panel con KPIs. |

### Reglas del flujo que ya están programadas

- Hace **una pregunta por mensaje**, con botones cuando se puede, y guarda cada respuesta en un campo del CRM.
- Recomienda **de 1 a 3 opciones** filtrando por peso del usuario, caminar o trotar, altura del techo y disponibilidad.
- **Pasa al asesor** cuando el cliente elige una opción, pide precio, descuento, cotización o catálogo, quiere comprar, apartar o pagar, pregunta por garantía, Addi o financiación, o cuando el bot no le entiende dos veces seguidas.
- **El bot nunca da precios**: avisa que la asesora enviará la cotización con el descuento mayorista.
- Si es un gimnasio o una compra de varias máquinas, la marca con **prioridad alta**.
- Fuera de horario (L a V 8:30–12:30 y 2:30–6:30, sábado 9–5) informa el horario y deja la tarea para primera hora.
- Hace **seguimiento a las 24 h, 72 h y 7 días**. Si sigue sin respuesta, pasa la conversación a **Perdido**.
- Asigna asesor por rotación y deja una **nota resumen**, por ejemplo: *"Cliente: Carmen. Villanueva. Hogar. Trotadora. 75 kg…"*.

## Plataforma multi-cliente (para vender por mensualidad)

El sistema está pensado para que **tú (JAUTHIA) se lo vendas a varios negocios**. Cada cliente tiene sus datos
totalmente aislados: sus conversaciones, catálogo, flujo del bot, plantillas, usuarios y tokens de WhatsApp.

| Rol | Quién | Qué puede hacer |
|---|---|---|
| **Dueño de la plataforma** | Tu correo (`PLATFORM_OWNER_EMAIL`) | Todo, y es el **único** que crea o quita super administradores |
| **Super administrador** | Tú o tus socios | Crear clientes, elegir módulos y plan, suspender, crear usuarios y entrar a configurar cualquier cliente |
| **Administrador del cliente** | El dueño del negocio | Configurar su flujo, catálogo, canales (WhatsApp…), usuarios y ajustes |
| **Asesor** | Su equipo de ventas | Atender chats, mover etapas y tareas |

En el **panel de la plataforma** (`/super`) das de alta a cada cliente con: nombre, NIT, dirección, ciudad,
contacto, **qué contrató** (CRM, Chatbot o ambos), plan, mensualidad, día de cobro, estado (*en prueba*, *activo* o
*suspendido*) y notas. El panel muestra el ingreso mensual, las pruebas vencidas y los cobros de la semana.

- **Solo Chatbot:** el cliente ve bandeja, catálogo, plantillas, flujo del bot y canales (sin embudo, contactos ni tareas).
- **Solo CRM:** bandeja omnicanal, embudo, contactos, tareas y resumen, sin bot.
- **Suspender** a un cliente cierra sus sesiones al instante, le impide entrar y apaga sus webhooks.
- Al crear un cliente eliges la **plantilla de flujo**: *Genérico* (cualquier negocio, usa sus propias categorías) o
  *Gimnasio* (como EvoSport, con catálogo de ejemplo).
- **Gestionar** te deja entrar a cualquier cliente para dejarle todo configurado. Arriba aparece una franja morada para que sepas a quién estás editando.

### Cada cliente parametriza lo suyo

- **Canales:** el cliente (o tú) pega su Phone Number ID, su token de WhatsApp, la clave secreta de la app y el token de
  verificación. Los tokens se guardan **cifrados (AES-256-GCM)** y nunca se vuelven a mostrar, solo `••••1234`.
  El botón **Probar conexión** valida los datos contra Meta o Telegram; en Telegram registra el webhook solo.
- **Catálogo:** cada cliente crea **sus categorías y tipos de producto**. Los filtros de gimnasio (peso máximo,
  caminar/trotar, techo) solo aparecen si los activa.
  **Carga rápida:** pega el producto como lo escribirías en WhatsApp (nombre, precio y una característica por línea)
  y adjunta las fotos y un video MP4: se organiza solo (precio, ficha técnica, peso máximo, categoría y palabras clave)
  y se abre el editor para revisar. Las fotos se reducen a JPG antes de subirlas y el video se envía con "Ver detalles".
- **IA de imágenes (módulo opcional):** el súper admin la activa por cliente. Genera fotos del producto
  (fondo de estudio, en ambiente o publicitaria) a partir de la foto principal. Usa la clave de Gemini que el súper
  admin pone en *Editar cliente* (se guarda cifrada y nadie puede volver a verla) o, si el cliente no tiene, la de la
  plataforma (`GEMINI_API_KEY` en el `.env` del servidor). Máximo 30 imágenes por hora por cliente.
- **Flujo del bot:** preguntas, botones, rutas, mensajes y seguimientos propios. Una pregunta puede tomar sus opciones
  directamente de las categorías del catálogo. `{empresa}` se reemplaza por el nombre del negocio.
- **Configuración:** horario, reglas comerciales, puntaje para 🔥 y **mensajes mínimos antes de marcar 🔥** (por defecto 3).

### Comportamiento del bot

- Si el cliente escribe *"quiero comprar un producto"* sin decir cuál, el bot pregunta **"¿Qué producto te gustaría?"**
  y muestra la lista de categorías. Luego sigue con las preguntas de ese producto y pide nombre y ciudad antes de recomendar.
- Si dice el nombre y el producto en el mismo mensaje, guarda ambos y le muestra el producto.
- **Nunca marca 🔥 "a punto de comprar" en los primeros mensajes** (mínimo 3, configurable).

## Estructura: frontend y backend separados

```
jauthia-crm/
├── frontend/          Angular: lo que ve el asesor. No tiene acceso a la base de datos ni a los tokens.
├── backend/           Node.js + Express: API, inicio de sesión, webhooks, envío de mensajes, seguimientos.
├── shared/            Tipos, flujo del bot y reglas de negocio que usan los dos (sin secretos).
├── docker-compose.yml PostgreSQL + app + Caddy (HTTPS) para el VPS.
└── deploy/            Caddyfile y script de copias de seguridad.
```

## Ejecutar en tu PC

Requisitos: **Node 22 o superior**. No necesitas instalar PostgreSQL: en desarrollo se usa un PostgreSQL real
(binarios oficiales) que viene en el paquete `embedded-postgres` y guarda los datos en `backend/.pgdata`.

```bash
npm run install:all
```

```bash
npm run dev
```

Eso arranca tres cosas a la vez: la base de datos (puerto 5433), el backend (puerto 3000) y el frontend (puerto 4200).
Abre http://localhost:4200. La primera vez te pide **crear la cuenta del dueño de la plataforma** con el correo de
`PLATFORM_OWNER_EMAIL` (en `backend/.env`). Después, en el panel de la plataforma, creas tu primer cliente y su administrador.

- La configuración del backend está en `backend/.env` (plantilla: `backend/.env.example`).
- **Modo demo sin servidor:** pon `demo: true` en `frontend/src/environments/environment.ts`.
- Probar el motor del bot en la terminal: `npm run check:bot`.
- ¿Perdiste el acceso del dueño? `npm run create-admin -- "Nombre" tu-correo "contraseña-larga"` (solo acepta el correo del dueño).

## Seguridad

- **El navegador nunca toca la base de datos.** Todo pasa por la API del backend (`POST /api/action`), que revisa
  la sesión, el rol y los datos (con *zod*: tipos, tamaños máximos y solo los campos permitidos).
- **Usuarios propios:** contraseñas cifradas con *bcrypt*, mínimo 10 caracteres, y un límite de intentos de inicio de sesión.
  La sesión va en una cookie **httpOnly** (JavaScript no puede leerla) que dura 12 h. Cerrar sesión, cambiar la
  contraseña, cambiar el rol o desactivar al usuario invalida sus sesiones abiertas.
- **Asesores = usuarios:** el bot reparte las conversaciones calificadas en rotación entre los usuarios activos con
  rol *asesor* (si aún no hay, entre los administradores).
- **Roles y clientes:** cada consulta a la base de datos va filtrada por el cliente del usuario. Un asesor o administrador
  nunca puede leer ni escribir datos de otro cliente (probado). Solo el dueño de la plataforma nombra super administradores.
- **CSRF:** las peticiones que modifican datos exigen el encabezado `X-CRM-Request`, que otro sitio no puede agregar.
- **Tiempo real:** el WebSocket solo acepta conexiones con sesión válida y revisa las sesiones cada 5 minutos.
- **Tokens** de WhatsApp, Meta y Telegram de cada cliente: cifrados en la base de datos con `SECRETS_KEY`. Nunca llegan al navegador.
- **Webhooks firmados:** Meta con `X-Hub-Signature-256` (`META_APP_SECRET`) y Telegram con `secret_token`
  (`TELEGRAM_WEBHOOK_SECRET`). En producción, sin esos secretos se rechaza todo. Un reintento del webhook no
  procesa dos veces el mismo mensaje.
- **Bloqueo de intentos:** 20 inicios fallidos por IP y 10 por cuenta cada 15 minutos. La IP real solo se lee de
  `X-Forwarded-For` con `TRUST_PROXY=1` (ya configurado en Docker detrás de Caddy). Sin proxy, deja `TRUST_PROXY` vacío.
- **Capacidad:** `DB_POOL_MAX` (20 por defecto) son las conexiones simultáneas a PostgreSQL. Probado con 2.000 clientes
  escribiendo a la vez (ver el informe de pruebas).
- **El simulador** solo puede escribir en conversaciones de prueba. **El chat web público** valida la sesión y
  limita los mensajes por minuto.
- **Servidor:** encabezados de seguridad (Helmet: CSP, HSTS, X-Frame-Options), errores sin detalles internos,
  contenedor sin usuario root, y PostgreSQL **sin puerto expuesto** a internet.

## Subir a un servidor

Sirve cualquier VPS Ubuntu con Docker (Hetzner, Contabo, DigitalOcean…). La opción gratis recomendada es
**Oracle Cloud "Always Free"** (servidor ARM que no vence); la guía paso a paso está en el documento
"Guía de compra: servidor para JAUTHIA CRM".

1. Apunta un dominio o subdominio a la IP del servidor. Gratis: un subdominio de DuckDNS (`evosport-crm.duckdns.org`).
2. En tu PC empaqueta el proyecto (sin `node_modules`, bases locales ni secretos):
   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\empaquetar.ps1
   ```
   Súbelo: `scp -i tu-llave.key ..\jauthia-crm.zip ubuntu@IP:~`
3. En el servidor:
   ```bash
   python3 -m zipfile -e jauthia-crm.zip . && cd jauthia-crm
   bash deploy/setup-server.sh
   ```
   El script instala Docker, abre los puertos 80/443, crea el `.env` con claves al azar (te pide el dominio y tu
   correo), arranca todo y programa la copia de seguridad diaria. Caddy saca el certificado HTTPS gratis.
   **Guarda una copia del `.env`** (sobre todo `SECRETS_KEY`): sin ella no se pueden leer los tokens de tus clientes.
4. Abre `https://TU-DOMINIO` y crea la cuenta del dueño.
   IA de imágenes: pon la clave de cada cliente en el panel (*Editar cliente → Clave API*), o una clave general
   con `GEMINI_API_KEY=...` (aistudio.google.com → Get API key) en el `.env` y `docker compose up -d`. Las fotos y videos de los clientes quedan en el volumen `media` y entran en la
   copia de seguridad diaria.
5. Actualizar a una versión nueva: `git pull && docker compose up -d --build` (o vuelve a empaquetar y subir el zip).
   El `.env` y los volúmenes no se tocan.

### Widget de chat para el sitio web

Pega esta línea antes de `</body>` en el sitio de EvoSport (la pantalla *Canales → Chat web* la muestra lista para copiar):

```html
<script src="https://TU-DOMINIO/widget.js?t=ID-DEL-CLIENTE" data-title="EvoSport" data-color="#ff6b1a" async></script>
```

El visitante ve una burbuja con el mismo bot: botones, listas y carrusel con fotos, *Ver detalles* y *Lo quiero*.
La conversación entra a la bandeja como **Chat web**, y lo que responda la asesora desde el CRM le aparece al
visitante en unos segundos. El widget no usa cookies, va aislado de los estilos del sitio (Shadow DOM) y nunca
inserta HTML que venga del servidor. Con `WEBCHAT_ORIGINS` limitas en qué sitios se puede usar.

### Webhooks (uno por cliente)

La pantalla *Canales* de cada cliente muestra sus URLs listas para copiar. `ID` es el identificador del cliente (por ejemplo `evosport-k3x9`).

| Canal | URL | En la red |
|---|---|---|
| WhatsApp | `https://TU-DOMINIO/webhooks/ID/whatsapp` | Meta → WhatsApp → Configuración → Webhook. Token de verificación = el que pegaste en Canales. Suscribirse a `messages`. |
| Messenger / Instagram | `https://TU-DOMINIO/webhooks/ID/meta` | Suscribirse a `messages` y `messaging_postbacks` (página) y a `messages` (instagram). |
| Telegram | `https://TU-DOMINIO/webhooks/ID/telegram` | Se registra solo al pulsar **Probar conexión**. |
| Chat web | `https://TU-DOMINIO/widget.js?t=ID` | Ver "Widget de chat para el sitio web". |

### Cómo se ve el carrusel en cada red

- **WhatsApp**: los mensajes de sesión no tienen un carrusel libre, así que cada producto se envía como tarjeta con imagen y los botones *Ver detalles* y *Lo quiero*. Fuera de la ventana de 24 h se usan **plantillas aprobadas**: la plantilla de tipo carrusel debe crearse y aprobarse en el Administrador de WhatsApp con el mismo nombre.
- **Messenger e Instagram**: usan el carrusel nativo (*generic template*) con imagen y botones.
- **Telegram**: envía una foto con botones por cada producto.

> ⚠️ Las imágenes del catálogo de ejemplo son ilustraciones **SVG** que solo sirven para el demo.
> WhatsApp y Meta solo aceptan **JPG o PNG en una URL pública**, así que antes de salir a producción
> cambia la imagen de cada producto en *Catálogo* por una foto real.

## Arquitectura

```
shared/                    reglas puras (sin I/O) que usan el backend y el modo demo
  models.ts                modelos (Conversation, ChatMessage, Product…) y valores permitidos
  flow.ts                  flujo parametrizado, etapas del embudo y sus reglas (cerrada, caliente, valor)
  flow-engine.ts           motor del bot: califica, responde FAQs, recomienda, puntúa y traspasa
  automation.ts            reglas del remarketing y de las alertas de compra (ventana de 24 h)
  products.ts              recomendación, tarjetas del carrusel y ficha técnica
  templates.ts             plantillas de WhatsApp: variables {{1}} {{2}} {{3}} y mensajes que producen
  messages.ts              construcción de conversaciones y mensajes (ids, notas, estado inicial)
  actions.ts               reglas de las acciones del asesor (cambiar etapa, pausar bot, editar campos)
  parse.ts · hours.ts      lectura de "nombre y ciudad" · horario de atención
  text.ts · ids.ts · time.ts  utilidades: normalizar/slug, ids únicos, duraciones
  api.ts                   contrato de la API, roles y eventos en tiempo real
  seed.ts                  catálogo EvoSport, plantillas, canales y configuración inicial
backend/src/
  server.ts                Express + Helmet + rutas + Socket.io
  auth.ts                  usuarios, roles, bcrypt, sesión JWT en cookie httpOnly, CSRF, suspensión
  schemas.ts               validación zod de todo lo que entra por la API
  api.ts                   rutas /api (sesión, rol, módulo) → actions.ts
  actions.ts               un manejador tipado por acción del CRM
  super.ts                 panel de la plataforma: clientes, planes, usuarios, super administradores
  core.ts                  configuración de cada cliente en caché + ingesta → motor del bot → base de datos
  dispatcher.ts            envío de mensajes pendientes a cada red (con reintentos)
  automation.ts            remarketing periódico y alertas de compra al cambiar de etapa
  tenants.ts               datos iniciales de un cliente nuevo
  webhooks.ts              WhatsApp, Messenger/Instagram, Telegram, chat web
  channels.ts · http.ts    adaptadores de envío a cada red · llamadas HTTP con tiempo límite
  channel-setup.ts         "Probar conexión" con WhatsApp, Meta y Telegram
  secrets.ts               tokens de cada cliente cifrados con AES-256-GCM
  db.ts                    PostgreSQL (tablas, documentos JSONB, transacciones, eventos)
  realtime.ts              Socket.io autenticado
backend/widget/widget.js   widget de chat para pegar en el sitio del cliente
frontend/src/app/
  core/data/crm-store.ts   estado central (signals): lee del servidor y escribe por la API
  core/data/server-source.ts  carga inicial + eventos en tiempo real
  core/data/demo-backend.ts   servidor simulado para el modo demo (mismas reglas de /shared)
  pages/                   inbox, pipeline, dashboard, contacts, tasks, catalog, templates, flow, automation, channels, settings, super
qa/                        pruebas de seguridad, conversación, remarketing y masividad (ver qa/README.md)
```

**Flujo de un mensaje:** webhook → `ingest()` bloquea la conversación, guarda el mensaje y ejecuta el bot en una
transacción → las respuestas quedan como `pending` → el despachador las envía a la red (y reintenta si falla) →
Socket.io muestra todo en la bandeja al instante.

**Base de datos (PostgreSQL):** `tenants` (clientes), `users`, `conversations`, `messages`, `products`, `templates`,
`tasks`, `channels`, `settings` y `channel_secrets` (cifrada). Todas las tablas llevan `tenant_id`. Cada registro se guarda como JSONB con índices para fechas, estados e ids de canal.

## Pendiente o por confirmar con el dueño

- **Altura**: se modeló como altura del techo para los equipos de fuerza (se configura en *Catálogo → Techo mínimo*). Falta confirmar qué máquinas la requieren y qué alternativa ofrecer si el techo no alcanza.
- **TikTok**: TikTok no tiene una API pública de mensajes directos, así que el canal queda como "próximamente".
- **Correo**: falta la integración de entrada (SendGrid o Mailgun).
