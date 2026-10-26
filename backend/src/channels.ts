/**
 * Adaptadores de salida: convierten un ChatMessage del CRM al formato de cada red.
 */
import { ChatMessage, Conversation, ProductCard, QuickButton } from '../../shared/models';
import { errorMessage, fetchJson, GRAPH_URL, redactUrl, telegramUrl } from './http';
import { log as logger } from './log';

export interface Secrets {
  whatsappToken?: string;
  phoneNumberId?: string;
  pageToken?: string;
  telegramToken?: string;
  publicBaseUrl?: string;
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const plain = (s: string) => s.replace(/\*([^*]+)\*/g, '$1');

/** Las imágenes del catálogo pueden ser rutas relativas (/products/x.jpg) del hosting. */
function absUrl(url: string | undefined, base?: string): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//.test(url)) return url;
  return base ? base.replace(/\/$/, '') + (url.startsWith('/') ? url : '/' + url) : undefined;
}

/** Respuesta de los envíos: id del mensaje en cada red. */
interface SendResponse {
  messages?: { id?: string }[];
  message_id?: string;
  result?: { message_id?: number };
}

/** POST a la red; si falla, lanza el error para que el despachador marque el mensaje como fallido. */
async function post(url: string, body: unknown, token?: string): Promise<SendResponse> {
  const r = await fetchJson<SendResponse>(url, { method: 'POST', body, token, timeoutMs: 15_000 });
  if (!r.ok) {
    logger.error('Error enviando al canal', { url: redactUrl(url), status: r.status, json: r.json });
    throw new Error(errorMessage(r));
  }
  return r.json;
}

export async function sendToChannel(conv: Conversation, msg: ChatMessage, s: Secrets): Promise<string | undefined> {
  switch (conv.channel) {
    case 'whatsapp':
      return sendWhatsApp(conv.externalId, msg, s);
    case 'messenger':
    case 'instagram':
      return sendMeta(conv.externalId, msg, s);
    case 'telegram':
      return sendTelegram(conv.externalId, msg, s);
    default:
      // webchat: las respuestas se devuelven directo en la petición del widget.
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// WhatsApp Cloud API
// ---------------------------------------------------------------------------

export function waPayloads(m: ChatMessage, base?: string): object[] {
  const btns = (b: QuickButton[]) => b.slice(0, 3).map((x) => ({ type: 'reply', reply: { id: x.id, title: cut(x.title, 20) } }));

  if (m.templateName) {
    // Plantilla aprobada: imagen de encabezado (si tiene) y variables {{1}}, {{2}}… del cuerpo.
    const headerImage = absUrl(m.imageUrl, base);
    const components = [
      ...(headerImage ? [{ type: 'header', parameters: [{ type: 'image', image: { link: headerImage } }] }] : []),
      ...(m.templateParams?.length ? [{ type: 'body', parameters: m.templateParams.map((t) => ({ type: 'text', text: t })) }] : []),
    ];
    return [{ type: 'template', template: { name: m.templateName, language: { code: 'es' }, components } }];
  }

  // WhatsApp no tiene carrusel libre en mensajes de sesión: cada producto va como
  // tarjeta con imagen + botones "Ver detalles" / "Lo quiero" (se ven en fila como un carrusel).
  if (m.type === 'carousel') {
    return (m.cards ?? []).map((c: ProductCard) => cardPayload(c, base));
  }

  const video = absUrl(m.videoUrl, base);
  if (video) return [{ type: 'video', video: { link: video, ...(m.text ? { caption: cut(m.text, 1024) } : {}) } }];

  const image = absUrl(m.imageUrl, base);
  const header = image ? { type: 'image', image: { link: image } } : m.header ? { type: 'text', text: cut(m.header, 60) } : undefined;

  if ((m.type === 'buttons' || m.type === 'product' || m.type === 'template') && m.buttons?.length) {
    return [{
      type: 'interactive',
      interactive: {
        type: 'button',
        ...(header ? { header } : {}),
        // Si el encabezado es la imagen, el nombre del producto va en el cuerpo.
        body: { text: cut((image && m.header ? `*${m.header}*
` : '') + (m.text || ' '), 1024) },
        ...(m.footer ? { footer: { text: cut(m.footer, 60) } } : {}),
        action: { buttons: btns(m.buttons) },
      },
    }];
  }
  if (m.type === 'list' && m.buttons?.length) {
    return [{
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: cut(m.text, 1024) },
        action: {
          button: cut(m.listButton || 'Ver opciones', 20),
          sections: [{ title: 'Opciones', rows: m.buttons.slice(0, 10).map((b) => ({ id: b.id, title: cut(b.title, 24), ...(b.description ? { description: cut(b.description, 72) } : {}) })) }],
        },
      },
    }];
  }
  if (image) return [{ type: 'image', image: { link: image, caption: [m.header, m.text].filter(Boolean).join('\n') } }];
  return [{ type: 'text', text: { body: [m.header ? `*${m.header}*` : '', m.text, m.footer ? `_${m.footer}_` : ''].filter(Boolean).join('\n') } }];
}

function cardPayload(c: ProductCard, base?: string): object {
  const image = absUrl(c.imageUrl, base);
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      ...(image ? { header: { type: 'image', image: { link: image } } } : {}),
      body: { text: cut(`*${c.title}*\n${c.subtitle}`, 1024) },
      action: { buttons: c.buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: cut(b.title, 20) } })) },
    },
  };
}

async function sendWhatsApp(to: string, m: ChatMessage, s: Secrets): Promise<string | undefined> {
  if (!s.whatsappToken || !s.phoneNumberId) throw new Error('WhatsApp no está configurado: completa el token y el Phone Number ID en Canales');
  let lastId: string | undefined;
  for (const payload of waPayloads(m, s.publicBaseUrl)) {
    const res = await post(`${GRAPH_URL}/${s.phoneNumberId}/messages`, { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }, s.whatsappToken);
    lastId = res?.messages?.[0]?.id ?? lastId;
  }
  return lastId;
}

// ---------------------------------------------------------------------------
// Messenger + Instagram (Send API)
// ---------------------------------------------------------------------------

export function metaPayloads(m: ChatMessage, base?: string): object[] {
  const generic = (elements: object[]) => ({ attachment: { type: 'template', payload: { template_type: 'generic', elements } } });
  const postbacks = (b: QuickButton[]) => b.slice(0, 3).map((x) => ({ type: 'postback', title: cut(x.title, 20), payload: x.id }));

  if (m.type === 'carousel') {
    return [generic((m.cards ?? []).slice(0, 10).map((c) => ({
      title: cut(c.title, 80),
      subtitle: cut(c.subtitle, 80),
      ...(absUrl(c.imageUrl, base) ? { image_url: absUrl(c.imageUrl, base) } : {}),
      buttons: postbacks(c.buttons),
    })))];
  }
  const video = absUrl(m.videoUrl, base);
  if (video) return [{ attachment: { type: 'video', payload: { url: video, is_reusable: true } } }];
  if (m.type === 'product' && absUrl(m.imageUrl, base)) {
    return [
      generic([{ title: cut(m.header ?? 'Producto', 80), subtitle: cut(plain(m.text).split('\n')[0], 80), image_url: absUrl(m.imageUrl, base), buttons: postbacks(m.buttons ?? []) }]),
      { text: plain(m.text) },
    ];
  }
  if (m.buttons?.length) {
    return [{ text: cut(plain([m.header, m.text].filter(Boolean).join('\n')), 2000), quick_replies: m.buttons.slice(0, 13).map((b) => ({ content_type: 'text', title: cut(b.title, 20), payload: b.id })) }];
  }
  return [{ text: cut(plain([m.header, m.text, m.footer].filter(Boolean).join('\n')), 2000) }];
}

async function sendMeta(recipient: string, m: ChatMessage, s: Secrets): Promise<string | undefined> {
  if (!s.pageToken) throw new Error('Messenger/Instagram no está configurado: pega el token de la página en Canales');
  let lastId: string | undefined;
  for (const message of metaPayloads(m, s.publicBaseUrl)) {
    const res = await post(`${GRAPH_URL}/me/messages?access_token=${encodeURIComponent(s.pageToken)}`, { recipient: { id: recipient }, messaging_type: 'RESPONSE', message });
    lastId = res?.message_id ?? lastId;
  }
  return lastId;
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

async function sendTelegram(chatId: string, m: ChatMessage, s: Secrets): Promise<string | undefined> {
  if (!s.telegramToken) throw new Error('Telegram no está configurado: pega el token del bot en Canales');
  const api = (method: string, body: object) => post(telegramUrl(s.telegramToken!, method), body);
  const kb = (b: QuickButton[]) => ({ inline_keyboard: b.map((x) => [{ text: x.title, callback_data: x.id.slice(0, 64) }]) });
  let res: SendResponse | undefined;
  if (m.type === 'carousel') {
    for (const c of m.cards ?? []) {
      const photo = absUrl(c.imageUrl, s.publicBaseUrl);
      res = photo
        ? await api('sendPhoto', { chat_id: chatId, photo, caption: `${c.title}\n${c.subtitle}`, reply_markup: kb(c.buttons) })
        : await api('sendMessage', { chat_id: chatId, text: `${c.title}\n${c.subtitle}`, reply_markup: kb(c.buttons) });
    }
  } else {
    const text = plain([m.header, m.text, m.footer].filter(Boolean).join('\n'));
    const photo = absUrl(m.imageUrl, s.publicBaseUrl);
    const video = absUrl(m.videoUrl, s.publicBaseUrl);
    const markup = m.buttons?.length ? { reply_markup: kb(m.buttons) } : {};
    res = video
      ? await api('sendVideo', { chat_id: chatId, video, caption: cut(text, 1024), ...markup })
      : photo
      ? await api('sendPhoto', { chat_id: chatId, photo, caption: cut(text, 1024), ...markup })
      : await api('sendMessage', { chat_id: chatId, text, ...markup });
  }
  return res?.result?.message_id ? String(res.result.message_id) : undefined;
}
