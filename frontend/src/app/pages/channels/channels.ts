import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CHANNEL_LABELS, ChannelConfig, ChannelType } from '@shared/models';
import { AuthService } from '../../core/auth.service';
import { api } from '../../core/http';
import { CrmStore } from '../../core/data/crm-store';
import { ChannelIcon } from '../../ui/channel-icon';
import { Icon } from '../../ui/icon';

interface Field {
  key: string;
  label: string;
  help: string;
  placeholder?: string;
}

interface ChannelInfo {
  id: ChannelType;
  desc: string;
  /** Ruta del webhook de este canal (se arma con el id del cliente). */
  hook?: 'whatsapp' | 'meta' | 'telegram';
  /** Datos públicos (se guardan en la configuración del canal). */
  fields: (Field & { key: keyof ChannelConfig })[];
  /** Tokens: se guardan cifrados en el servidor y nunca se vuelven a mostrar. */
  secrets: Field[];
  steps: string[];
  interactive: string;
  available: boolean;
}

const INFO: ChannelInfo[] = [
  {
    id: 'whatsapp', available: true, hook: 'whatsapp',
    desc: 'WhatsApp Business Cloud API de Meta. Canal principal del bot.',
    fields: [
      { key: 'phoneNumberId', label: 'Phone Number ID', help: 'Meta for Developers → tu app → WhatsApp → Configuración de la API.', placeholder: '1234567890' },
      { key: 'wabaId', label: 'WhatsApp Business Account ID (opcional)', help: 'Mismo panel. Sirve para plantillas.', placeholder: '1029384756' },
    ],
    secrets: [
      { key: 'accessToken', label: 'Token de acceso permanente', help: 'Meta Business → Usuarios del sistema → Generar token (permisos whatsapp_business_messaging y whatsapp_business_management). El token temporal del panel vence en 24 h.' },
      { key: 'appSecret', label: 'Clave secreta de la app', help: 'Meta for Developers → tu app → Configuración → Básica → Clave secreta. Valida que los mensajes vienen de Meta.' },
      { key: 'verifyToken', label: 'Token de verificación del webhook', help: 'Invéntalo (letras y números, 20+). Pega el mismo en Meta al configurar el webhook.' },
    ],
    steps: [
      'Crea una app tipo Empresa en developers.facebook.com y agrega el producto WhatsApp.',
      'Copia el Phone Number ID y crea un token permanente en Usuarios del sistema.',
      'Pega los datos aquí, guarda y pulsa "Probar conexión".',
      'En Meta → WhatsApp → Configuración pega la URL del webhook y el token de verificación; suscríbete a "messages".',
    ],
    interactive: 'Botones (3), listas (10), tarjetas de producto con imagen y plantillas aprobadas.',
  },
  {
    id: 'instagram', available: true, hook: 'meta',
    desc: 'Mensajes directos de Instagram (cuenta profesional conectada a una página de Facebook).',
    fields: [{ key: 'igAccountId', label: 'Instagram Account ID (opcional)', help: 'Se detecta solo al probar la conexión.', placeholder: '1784…' }],
    secrets: [
      { key: 'pageToken', label: 'Token de la página', help: 'Token de la página de Facebook conectada a Instagram (permiso instagram_manage_messages).' },
      { key: 'appSecret', label: 'Clave secreta de la app', help: 'Configuración → Básica de tu app en Meta.' },
      { key: 'verifyToken', label: 'Token de verificación del webhook', help: 'Invéntalo y pégalo igual en Meta.' },
    ],
    steps: ['Conecta Instagram a la página de Facebook.', 'En la app de Meta agrega Instagram y el permiso instagram_manage_messages.', 'Pega los datos, prueba y suscribe el webhook "messages" del objeto instagram.'],
    interactive: 'Respuestas rápidas y carrusel nativo con imagen y botones.',
  },
  {
    id: 'messenger', available: true, hook: 'meta',
    desc: 'Facebook Messenger de la página.',
    fields: [{ key: 'pageId', label: 'Page ID (opcional)', help: 'Configuración de la página → Información.', placeholder: '1029…' }],
    secrets: [
      { key: 'pageToken', label: 'Token de la página', help: 'Meta for Developers → Messenger → Generar token de la página.' },
      { key: 'appSecret', label: 'Clave secreta de la app', help: 'Configuración → Básica de tu app en Meta.' },
      { key: 'verifyToken', label: 'Token de verificación del webhook', help: 'Invéntalo y pégalo igual en Meta.' },
    ],
    steps: ['En la app de Meta agrega Messenger y genera el token de la página.', 'Pega los datos aquí y prueba la conexión.', 'Suscribe el webhook a messages y messaging_postbacks.'],
    interactive: 'Respuestas rápidas y carrusel nativo.',
  },
  {
    id: 'telegram', available: true, hook: 'telegram',
    desc: 'Bot de Telegram creado con @BotFather. El webhook se registra solo al probar la conexión.',
    fields: [],
    secrets: [
      { key: 'botToken', label: 'Token del bot', help: 'Escríbele /newbot a @BotFather en Telegram y copia el token.' },
      { key: 'webhookSecret', label: 'Secreto del webhook', help: 'Invéntalo (letras y números, 20+). Valida que los mensajes vienen de Telegram.' },
    ],
    steps: ['Crea el bot con @BotFather.', 'Pega el token y un secreto inventado.', 'Pulsa "Probar conexión": el CRM registra el webhook automáticamente.'],
    interactive: 'Botones y fotos con botones por producto.',
  },
  {
    id: 'webchat', available: true,
    desc: 'Widget de chat para el sitio web del cliente (usa el mismo bot).',
    fields: [], secrets: [],
    steps: ['Copia el código y pégalo antes de </body> en cada página del sitio.', 'Los mensajes llegan a la bandeja como "Chat web".'],
    interactive: 'Todos los formatos (botones, listas, carruseles).',
  },
  { id: 'tiktok', available: false, desc: 'TikTok no ofrece una API pública de mensajes directos para empresas.', fields: [], secrets: [], steps: [], interactive: '—' },
  { id: 'email', available: false, desc: 'Correo entrante (próximamente).', fields: [], secrets: [], steps: [], interactive: 'Texto' },
];

/** Lo que la plataforma tiene listo para conectar WhatsApp con un clic. */
interface WaSetup { ready: boolean; appId?: string; configId?: string; graphVersion: string }
interface WaConnectResult { coexistence: boolean; sync?: { contacts: boolean; history: boolean }; channel: ChannelConfig }
type WaTab = 'meta' | 'test' | 'manual';

/** SDK oficial de Meta (se carga solo cuando alguien toca "Conectar con Meta"). */
interface FbSdk {
  init(o: object): void;
  login(cb: (r: { authResponse?: { code?: string } }) => void, o: object): void;
}
declare global {
  interface Window { FB?: FbSdk; fbAsyncInit?: () => void }
}

@Component({
  selector: 'app-channels',
  imports: [FormsModule, Icon, ChannelIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './channels.html',
  styleUrl: './channels.css',
})
export class Channels {
  readonly store = inject(CrmStore);
  readonly auth = inject(AuthService);
  readonly labels = CHANNEL_LABELS;
  readonly info = INFO;
  readonly open = signal<ChannelType | null>(null);
  readonly testing = signal<ChannelType | null>(null);
  readonly result = signal<Record<string, { ok: boolean; message: string }>>({});
  /** Valores que se están escribiendo (los tokens nunca se precargan). */
  draft: Record<string, Record<string, string>> = {};
  pub: Record<string, Record<string, string>> = {};
  private byId = computed(() => new Map(this.store.channels().map((c) => [c.id, c])));

  // ---- Asistente de WhatsApp ----
  readonly waTab = signal<WaTab>('meta');
  readonly waSetup = signal<WaSetup | null>(null);
  readonly waBusy = signal<string | null>(null);
  readonly waDone = signal<WaConnectResult | null>(null);
  testTo = '';

  config(id: ChannelType): ChannelConfig {
    return this.byId().get(id) ?? { id, enabled: false, connected: false, botEnabled: true };
  }

  toggleOpen(i: ChannelInfo): void {
    const id = this.open() === i.id ? null : i.id;
    this.open.set(id);
    if (id === 'whatsapp') void this.loadWaSetup();
    if (id) {
      this.draft[i.id] = {};
      const c = this.config(i.id) as unknown as Record<string, string>;
      this.pub[i.id] = Object.fromEntries(i.fields.map((f) => [f.key, c[f.key] ?? '']));
    }
  }

  saved(channel: ChannelType, key: string): string | undefined {
    return this.store.secrets()[channel]?.[key];
  }

  patch(c: ChannelConfig, p: Partial<ChannelConfig>): void {
    this.store.saveChannel({ ...c, ...p });
  }

  async save(i: ChannelInfo): Promise<void> {
    const c = this.config(i.id);
    const pub = this.pub[i.id] ?? {};
    await this.store.saveChannel({ ...c, ...Object.fromEntries(Object.entries(pub).map(([k, v]) => [k, v.trim() || undefined])) });
    const secrets = Object.fromEntries(Object.entries(this.draft[i.id] ?? {}).filter(([, v]) => v.trim() !== ''));
    if (Object.keys(secrets).length) await this.store.saveChannelSecrets(i.id, secrets);
    this.draft[i.id] = {};
    this.store.toast('Datos guardados (los tokens quedan cifrados en el servidor)', 'success');
  }

  async clearSecret(i: ChannelInfo, key: string): Promise<void> {
    if (!confirm('¿Borrar este dato guardado?')) return;
    await this.store.saveChannelSecrets(i.id, { [key]: '' });
  }

  async test(i: ChannelInfo): Promise<void> {
    this.testing.set(i.id);
    try {
      const r = await this.store.testChannel(i.id);
      this.result.update((x) => ({ ...x, [i.id]: r }));
    } finally {
      this.testing.set(null);
    }
  }

  // ---------------------------------------------------------------------------
  // WhatsApp: conectar con un clic (Meta), número de prueba o manual
  // ---------------------------------------------------------------------------

  async loadWaSetup(): Promise<void> {
    try {
      const s = await api<WaSetup>('/api/channels/whatsapp/setup');
      this.waSetup.set(s);
      const c = this.config('whatsapp');
      this.waTab.set(c.connectionMode === 'test' ? 'test' : c.connectionMode === 'manual' || (!s.ready && c.phoneNumberId) ? 'manual' : 'meta');
    } catch (e) {
      this.store.toast((e as Error).message, 'error');
    }
  }

  private loadFbSdk(s: WaSetup): Promise<FbSdk> {
    if (window.FB) return Promise.resolve(window.FB);
    return new Promise((ok, fail) => {
      window.fbAsyncInit = () => {
        window.FB!.init({ appId: s.appId, autoLogAppEvents: true, xfbml: false, version: s.graphVersion });
        ok(window.FB!);
      };
      const el = document.createElement('script');
      el.src = 'https://connect.facebook.net/es_LA/sdk.js';
      el.async = true;
      el.crossOrigin = 'anonymous';
      el.onerror = () => fail(new Error('No se pudo abrir la ventana de Meta. Revisa tu conexión o desactiva el bloqueador de anuncios.'));
      document.body.appendChild(el);
    });
  }

  /** Abre la ventana oficial de Meta. El cliente elige su número (o su app de WhatsApp Business) y el CRM hace el resto. */
  async connectMeta(): Promise<void> {
    const s = this.waSetup();
    if (!s?.ready || this.waBusy()) return;
    this.waBusy.set('Abriendo la ventana de Meta…');
    this.waDone.set(null);
    // Meta avisa por mensaje qué cuenta y qué número eligió el cliente.
    const session: { wabaId?: string; phoneNumberId?: string; appOnboarding?: boolean; cancelled?: string } = {};
    const onMsg = (e: MessageEvent) => {
      if (!/^https:\/\/(www|web)\.facebook\.com$/.test(e.origin)) return;
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (d.event === 'CANCEL') session.cancelled = d.data?.current_step ?? 'cancelado';
        if (d.data?.waba_id) session.wabaId = String(d.data.waba_id);
        if (d.data?.phone_number_id) session.phoneNumberId = String(d.data.phone_number_id);
        if (d.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') session.appOnboarding = true;
      } catch {
        /* otros mensajes de Meta */
      }
    };
    window.addEventListener('message', onMsg);
    try {
      const FB = await this.loadFbSdk(s);
      this.waBusy.set('Sigue los pasos en la ventana de Meta…');
      const code = await new Promise<string | undefined>((ok) =>
        FB.login((r) => ok(r.authResponse?.code), {
          config_id: s.configId, response_type: 'code', override_default_response_type: true,
          extras: { setup: {}, sessionInfoVersion: '3' },
        }),
      );
      await new Promise((r) => setTimeout(r, 800)); // el último aviso de Meta puede llegar justo después
      if (!code || !session.wabaId) {
        this.store.toast(session.cancelled ? 'Cerraste la ventana de Meta antes de terminar. Puedes intentarlo de nuevo.' : 'Meta no terminó la conexión. Intenta de nuevo.', 'info');
        return;
      }
      this.waBusy.set('Conectando el número y trayendo tus chats…');
      const r = await api<WaConnectResult>('/api/channels/whatsapp/connect', { method: 'POST', body: { code, ...session, cancelled: undefined } });
      this.waDone.set(r);
      this.store.toast('¡WhatsApp conectado!', 'success');
    } catch (e) {
      this.store.toast((e as Error).message, 'error');
    } finally {
      window.removeEventListener('message', onMsg);
      this.waBusy.set(null);
    }
  }

  /** Modo prueba: guarda el número de prueba de Meta (Phone Number ID + token temporal). */
  async saveTest(i: ChannelInfo): Promise<void> {
    await this.store.saveChannel({ ...this.config('whatsapp'), connectionMode: 'test' });
    await this.save(i);
  }

  async sendTest(): Promise<void> {
    if (this.waBusy()) return;
    this.waBusy.set('Enviando el mensaje de prueba…');
    try {
      await api('/api/channels/whatsapp/test', { method: 'POST', body: { to: this.testTo } });
      this.store.toast('Mensaje enviado: revisa ese WhatsApp ("Hello World" de Meta)', 'success');
    } catch (e) {
      this.store.toast((e as Error).message, 'error');
    } finally {
      this.waBusy.set(null);
    }
  }

  webhookUrl(hook: string): string {
    return `${this.store.publicBaseUrl() || window.location.origin}/webhooks/${this.auth.tenant()?.id}/${hook}`;
  }

  /** Webhook único de la plataforma (números conectados con Meta o de prueba en la app de JAUTHIA). */
  platformWebhook(): string {
    return `${this.store.publicBaseUrl() || window.location.origin}/webhooks/whatsapp`;
  }

  widgetSnippet(): string {
    const name = this.store.settings().companyName || 'Chat';
    return `<script src="${this.store.publicBaseUrl() || window.location.origin}/widget.js?t=${this.auth.tenant()?.id}" data-title="${name}" data-color="#1a9dd9" async></script>`;
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text);
    this.store.toast('Copiado', 'info');
  }
}
