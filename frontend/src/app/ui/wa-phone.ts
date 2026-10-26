import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { templateDrafts } from '@shared/templates';
import { ChatMessage, Product, WaTemplate } from '@shared/models';
import { MessageBubble } from './message-bubble';

/** Mensajes que vería el cliente con esta plantilla (misma conversión que al enviarla). */
export function templateToMessages(t: WaTemplate, products: Product[], companyName = ''): ChatMessage[] {
  const vars = { nombre: 'Carlos', producto: products.find((p) => t.productIds?.includes(p.id))?.name ?? 'tu equipo', empresa: companyName };
  return templateDrafts(t, products, vars, false).map((d, i) => ({
    ...d, id: 'p' + i, conversationId: 'preview', direction: 'out', sender: 'asesor', createdAt: Date.now(), status: 'read', authorName: companyName,
  }));
}

@Component({
  selector: 'app-wa-phone',
  imports: [MessageBubble],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="phone">
      <div class="bar"><span class="av">{{ (title() || '?').charAt(0) }}</span><div><b>{{ title() }}</b><small>cuenta de empresa</small></div></div>
      <div class="screen">
        @for (m of msgs(); track m.id) { <app-message-bubble [msg]="m" /> }
      </div>
    </div>
  `,
  styles: `
    .phone { width: 100%; max-width: 340px; border-radius: 30px; border: 8px solid #111; background: var(--chat-bg); overflow: hidden; box-shadow: var(--shadow-lg); margin: 0 auto; }
    .bar { display: flex; align-items: center; gap: 8px; background: #075e54; color: #fff; padding: 10px 12px; }
    :root[data-theme='dark'] .bar { background: #202c33; }
    .bar small { display: block; opacity: .75; font-size: 11px; }
    .av { width: 32px; height: 32px; border-radius: 50%; background: #1a9dd9; display: grid; place-items: center; font-weight: 800; }
    .screen { min-height: 380px; max-height: 520px; overflow-y: auto; padding: 14px 10px; display: flex; flex-direction: column; }
    .screen app-message-bubble { max-width: 92%; }
  `,
})
export class WaPhone {
  readonly template = input.required<WaTemplate>();
  readonly products = input<Product[]>([]);
  readonly title = input('');
  readonly msgs = computed(() => templateToMessages(this.template(), this.products(), this.title()));
}
