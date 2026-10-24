import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CHANNEL_LABELS, ChannelConfig, ChannelType } from '@shared/models';
import { AuthService } from '../../core/auth.service';
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

  config(id: ChannelType): ChannelConfig {
    return this.byId().get(id) ?? { id, enabled: false, connected: false, botEnabled: true };
  }

  toggleOpen(i: ChannelInfo): void {
    const id = this.open() === i.id ? null : i.id;
    this.open.set(id);
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

  webhookUrl(hook: string): string {
    return `${this.store.publicBaseUrl() || window.location.origin}/webhooks/${this.auth.tenant()?.id}/${hook}`;
  }

  widgetSnippet(): string {
    const name = this.store.settings().companyName || 'Chat';
    return `<script src="${this.store.publicBaseUrl() || window.location.origin}/widget.js?t=${this.auth.tenant()?.id}" data-title="${name}" data-color="#ff6b1a" async></script>`;
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text);
    this.store.toast('Copiado', 'info');
  }
}
