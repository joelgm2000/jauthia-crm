/**
 * "Probar conexión" de la pantalla Canales: valida los datos que pegó el cliente contra la red real.
 * Los tokens se leen descifrados en el servidor y nunca salen hacia el navegador.
 */
import { ChannelConfig, ChannelType } from '../../shared/models';
import { config } from './config';
import { getDoc } from './db';
import { fetchJson, GRAPH_URL, telegramUrl } from './http';
import { getSecrets } from './secrets';

export interface TestResult {
  ok: boolean;
  message: string;
  accountName?: string;
}

interface WaPhone { display_phone_number?: string; verified_name?: string }
interface MetaPage { name?: string; instagram_business_account?: { username?: string } }
interface TgMe { ok?: boolean; result?: { username?: string } }

export async function testChannelConnection(tenantId: string, channel: ChannelType): Promise<TestResult> {
  const cfg = await getDoc<ChannelConfig>(tenantId, 'channels', channel);
  const s = await getSecrets(tenantId, channel);
  const webhookBase = config.publicBaseUrl ? `${config.publicBaseUrl}/webhooks/${tenantId}` : '';

  switch (channel) {
    case 'whatsapp': {
      if (!cfg?.phoneNumberId) return { ok: false, message: 'Falta el Phone Number ID.' };
      if (!s['accessToken']) return { ok: false, message: 'Falta el token de acceso.' };
      const r = await fetchJson<WaPhone>(`${GRAPH_URL}/${encodeURIComponent(cfg.phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`, { token: s['accessToken'] });
      if (!r.ok) return { ok: false, message: `Meta rechazó los datos: ${r.json.error?.message ?? 'error desconocido'}` };
      const missing = [!s['appSecret'] && 'la clave secreta de la app', !s['verifyToken'] && 'el token de verificación'].filter(Boolean);
      return {
        ok: missing.length === 0,
        accountName: `${r.json.verified_name ?? 'WhatsApp'} (${r.json.display_phone_number ?? ''})`.trim(),
        message: missing.length
          ? `El número responde (${r.json.display_phone_number}), pero falta ${missing.join(' y ')} para recibir mensajes de forma segura.`
          : `Conectado: ${r.json.verified_name} · ${r.json.display_phone_number}. Ahora pega el webhook en Meta.`,
      };
    }
    case 'messenger':
    case 'instagram': {
      if (!s['pageToken']) return { ok: false, message: 'Falta el token de la página.' };
      const fields = channel === 'instagram' ? 'name,instagram_business_account{username}' : 'name';
      const r = await fetchJson<MetaPage>(`${GRAPH_URL}/me?fields=${fields}`, { token: s['pageToken'] });
      if (!r.ok) return { ok: false, message: `Meta rechazó el token: ${r.json.error?.message ?? 'error desconocido'}` };
      const ig = r.json.instagram_business_account?.username;
      if (channel === 'instagram' && !ig) return { ok: false, message: 'La página no tiene una cuenta de Instagram profesional conectada.' };
      const missing = !s['appSecret'] || !s['verifyToken'];
      return {
        ok: !missing,
        accountName: channel === 'instagram' ? `@${ig}` : r.json.name,
        message: missing ? 'El token funciona, pero falta la clave secreta de la app o el token de verificación.' : `Conectado: ${channel === 'instagram' ? '@' + ig : r.json.name}.`,
      };
    }
    case 'telegram': {
      if (!s['botToken']) return { ok: false, message: 'Falta el token del bot (@BotFather).' };
      const me = await fetchJson<TgMe>(telegramUrl(s['botToken'], 'getMe'));
      const username = me.json.result?.username ?? '';
      if (!me.ok || !me.json?.ok) return { ok: false, message: 'Telegram rechazó el token del bot.' };
      if (!s['webhookSecret']) return { ok: false, message: 'Falta el secreto del webhook (invéntalo: letras y números, 20+ caracteres).' };
      if (!/^https:\/\//.test(webhookBase)) {
        return { ok: false, accountName: '@' + username, message: 'El bot existe, pero el servidor necesita PUBLIC_BASE_URL con https para registrar el webhook.' };
      }
      // Registra el webhook automáticamente: el cliente no tiene que hacer nada en Telegram.
      const set = await fetchJson<{ ok?: boolean }>(telegramUrl(s['botToken'], 'setWebhook'), {
        body: { url: `${webhookBase}/telegram`, secret_token: s['webhookSecret'], allowed_updates: ['message', 'callback_query'] },
      });
      return set.json.ok
        ? { ok: true, accountName: '@' + username, message: `Conectado: @${username}. Webhook registrado.` }
        : { ok: false, accountName: '@' + username, message: 'No se pudo registrar el webhook en Telegram.' };
    }
    case 'webchat':
      return { ok: true, message: 'El chat web no necesita tokens: pega el código en tu sitio.' };
    default:
      return { ok: false, message: 'Este canal todavía no está disponible.' };
  }
}
