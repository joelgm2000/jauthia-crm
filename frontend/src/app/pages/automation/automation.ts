import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { canBeHot, DEFAULT_REMARKETING, FollowUpStep, PRODUCT_IMAGE, PURCHASED_STAGES, RemarketingConfig, STAGES } from '@shared/flow';
import { DEFAULT_SOCIAL_PROOF, fillVars } from '@shared/automation';
import { SocialProofConfig, StageId } from '@shared/models';
import { CrmStore } from '../../core/data/crm-store';
import { Icon } from '../../ui/icon';

/** Etapas abiertas (las que aún no compran) que se pueden elegir. */
const OPEN_STAGES = STAGES.filter((s) => canBeHot(s.id));
/** Valores de ejemplo para la vista previa. */
const SAMPLE = { nombre: 'Carlos', producto: 'Trotadora Vigor', ciudad_comprador: 'Valledupar' };

interface Draft {
  steps: FollowUpStep[];
  remarketing: RemarketingConfig;
  social: SocialProofConfig;
}

/**
 * Automatizaciones del cliente:
 *  - Remarketing: mensajes (con imagen opcional) cuando el cliente deja de contestar.
 *  - Alertas de compra: aviso a los leads inactivos cuando alguien compra.
 * Se guardan en el flujo del bot (remarketing) y en la configuración general (alertas).
 */
@Component({
  selector: 'app-automation',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './automation.html',
  styleUrl: './automation.css',
})
export class Automation {
  readonly store = inject(CrmStore);
  readonly openStages = OPEN_STAGES;
  readonly purchaseStages = STAGES.filter((s) => PURCHASED_STAGES.includes(s.id) && s.id !== 'entrega');
  readonly d = signal<Draft | null>(null);
  readonly dirty = signal(false);
  readonly productImage = PRODUCT_IMAGE;
  readonly productImages = computed(() => this.store.products().filter((p) => p.imageUrl).map((p) => ({ name: p.name, url: p.imageUrl })));
  readonly templates = computed(() => this.store.templates());

  constructor() {
    effect(() => {
      const flow = this.store.flow();
      const settings = this.store.settings();
      if (untracked(this.dirty)) return;
      this.d.set({
        steps: structuredClone(flow.followUps ?? []),
        remarketing: { ...DEFAULT_REMARKETING, ...structuredClone(flow.remarketing ?? {}) },
        social: { ...DEFAULT_SOCIAL_PROOF, ...structuredClone(settings.socialProof ?? {}) },
      });
    });
  }

  touch(): void {
    this.dirty.set(true);
    this.d.update((x) => (x ? { ...x } : x));
  }

  /** Imagen de la vista previa (para "foto del producto que le interesa" se usa la del producto de ejemplo). */
  previewImage(url: string | undefined): string | undefined {
    if (url !== PRODUCT_IMAGE) return url;
    return this.store.products().find((p) => p.name === SAMPLE.producto)?.imageUrl ?? this.productImages()[0]?.url;
  }

  preview(text: string): string {
    return fillVars(text, { ...SAMPLE, empresa: this.store.settings().companyName });
  }

  toggleStage(list: string[], id: StageId): void {
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    else list.push(id);
    this.touch();
  }

  addStep(d: Draft): void {
    const last = d.steps[d.steps.length - 1]?.afterHours ?? 0;
    d.steps.push({ afterHours: last ? last * 2 : 2, message: '' });
    this.touch();
  }

  removeStep(d: Draft, i: number): void {
    d.steps.splice(i, 1);
    this.touch();
  }

  /** Pasadas 24 h desde el último mensaje del cliente, WhatsApp solo permite plantillas aprobadas. */
  needsTemplate(s: FollowUpStep): boolean {
    return Number(s.afterHours) >= 24;
  }

  templateStatus(id: string | undefined): string | null {
    const t = id ? this.templates().find((x) => x.id === id) : undefined;
    if (!t) return null;
    return t.status === 'APPROVED' ? null : 'Esta plantilla aún no está aprobada por Meta: solo funciona en los chats de prueba.';
  }

  async save(): Promise<void> {
    const d = this.d();
    if (!d) return;
    const steps = d.steps
      .filter((s) => s.message.trim())
      .map((s) => ({ ...s, afterHours: Math.max(0.25, Number(s.afterHours) || 1), imageUrl: s.imageUrl || undefined, templateId: s.templateId || undefined }))
      .sort((a, b) => a.afterHours - b.afterHours);
    const social = { ...d.social, templateId: d.social.templateId || undefined };
    await this.store.saveFlow({ ...this.store.flow(), followUps: steps, remarketing: d.remarketing });
    await this.store.saveSettings({ ...this.store.settings(), socialProof: social });
    this.dirty.set(false);
    this.store.toast('Remarketing y alertas guardados', 'success');
  }
}
