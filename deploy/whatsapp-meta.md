# Conectar WhatsApp con un clic (y coexistencia)

Esto se hace **una sola vez para toda la plataforma**. Después, cada cliente conecta su número desde
*Canales → WhatsApp → Conectar con Meta*, sin copiar tokens.

> **Coexistencia:** el cliente sigue usando la app de WhatsApp Business en su celular y el mismo número queda en el
> CRM y el bot. Requiere WhatsApp Business 2.24.17 o superior y que el número esté en un país soportado
> (Colombia lo está). Meta permite traer contactos y chats de los últimos 6 meses solo en las primeras 24 horas.

## 1. App de Meta de JAUTHIA

1. Entra a <https://developers.facebook.com/apps> con la cuenta que administra el portafolio de negocio de JAUTHIA.
2. Usa tu app tipo **Empresa** (o crea una) y agrega el producto **WhatsApp**.
3. **Configuración → Básica:** copia el **Identificador de la app** (`META_APP_ID`) y la **Clave secreta**
   (`META_APP_SECRET`).

## 2. Hacer a JAUTHIA "Tech Provider"

Para conectar números de **otras empresas** (tus clientes), Meta exige:

1. **Verificación del negocio** de JAUTHIA (Business Manager → Centro de seguridad → Verificación).
2. **Revisión de la app** con acceso avanzado a `whatsapp_business_management` y `whatsapp_business_messaging`
   (en el panel de la app: *Revisión de la app → Permisos y funciones*). Explica que es un CRM que conecta el
   WhatsApp de sus clientes con su consentimiento mediante Embedded Signup.
3. Mientras Meta aprueba, el botón funciona con las personas que tengan un rol en tu app (sirve para probar).

## 3. Configuración de "Embedded Signup"

1. En la app: **Facebook Login para empresas → Configuraciones → Crear configuración**.
2. Tipo: **WhatsApp Embedded Signup** (versión 4 o superior; en la v5 la opción de "conectar la app de WhatsApp
   Business" ya viene activada).
3. Permisos: `whatsapp_business_management` y `whatsapp_business_messaging`.
4. Copia el **ID de configuración** (`META_ES_CONFIG_ID`).
5. En **Facebook Login para empresas → Configuración**, agrega tu dominio en *Dominios permitidos para el SDK de
   JavaScript* (ej. `https://crm.jauthia.com`).

## 4. Webhook único de la plataforma

1. En la app: **WhatsApp → Configuración → Webhook → Editar**.
2. URL de devolución de llamada: `https://TU_DOMINIO/webhooks/whatsapp`
3. Token de verificación: invéntalo (letras y números, 20+) y ponlo también en `META_WEBHOOK_VERIFY_TOKEN`.
4. Suscríbete a: `messages`, `smb_message_echoes`, `history`, `smb_app_state_sync` y `account_update`.

## 5. Variables en el servidor

En `~/jauthia-crm/.env`:

```env
META_APP_ID=
META_APP_SECRET=
META_ES_CONFIG_ID=
META_WEBHOOK_VERIFY_TOKEN=
```

Luego:

```bash
cd ~/jauthia-crm && sudo docker compose up -d
```

## Modo prueba (sin número real)

Cada app de Meta trae un **número de prueba gratis** (WhatsApp → Configuración de la API) que puede escribir a
hasta 5 celulares verificados. En *Canales → WhatsApp → Probar primero* se pega su *Identificador del número de
teléfono* y el *token temporal* (vence en 24 h), y el botón **Enviar prueba** manda la plantilla "Hello World".
Si el webhook de la app apunta a `/webhooks/whatsapp`, las respuestas llegan a la bandeja y el bot contesta.

## Lo que no funciona en la API con coexistencia

Grupos, mensajes temporales o "ver una vez", ubicación en tiempo real, listas de difusión (quedan de solo
lectura) y llamadas. El número queda limitado a 20 mensajes por segundo y la app del celular debe abrirse al
menos cada 14 días (si no, Meta lo desconecta y Canales lo avisa).
