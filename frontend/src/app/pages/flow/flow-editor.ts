import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DEFAULT_FLOW, FlowConfig, FlowNode, STAGES } from '@shared/flow';
import { CrmStore } from '../../core/data/crm-store';
import { Icon } from '../../ui/icon';
import { ensureSellerConfig, SellerPanel } from './seller-panel';
import { splitList } from '@shared/text';
import { FIELD_LABELS } from '../../ui/labels';

type Tab = 'vendedor' | 'preguntas' | 'disparadores' | 'faqs' | 'mensajes';

const ROUTE_COLORS = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#14b8a6', '#6366f1', '#f97316'];

@Component({
  selector: 'app-flow-editor',
  imports: [FormsModule, RouterLink, Icon, SellerPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flow-editor.html',
  styleUrl: './flow-editor.css',
})
export class FlowEditor {
  readonly store = inject(CrmStore);
  /** Rutas del flujo de ESTE cliente (salen de los pasos, no de una lista fija). */
  readonly routes = computed(() => {
    const ids = [...new Set((this.flow()?.nodes ?? []).map((n) => n.route).filter((r) => r !== 'todas' && r !== 'basicas'))]; // las básicas van en su pestaña
    return ids.map((id, i) => ({ id, label: this.store.categories().find((c) => c.id === id)?.name ?? id, color: ROUTE_COLORS[i % ROUTE_COLORS.length] }));
  });
  newRoute = '';
  readonly stages = STAGES;
  readonly fields = FIELD_LABELS;
  readonly tab = signal<Tab>('vendedor');
  readonly flow = signal<FlowConfig | null>(null);
  readonly selectedId = signal<string>('saludo');
  readonly dirty = signal(false);

  readonly common = computed(() => this.flow()?.nodes.filter((n) => n.route === 'todas' && n.kind === 'question') ?? []);
  readonly finals = computed(() => this.flow()?.nodes.filter((n) => n.kind !== 'question') ?? []);
  readonly selected = computed(() => this.flow()?.nodes.find((n) => n.id === this.selectedId()));
  readonly nodeIds = computed(() => this.flow()?.nodes.map((n) => n.id) ?? []);

  constructor() {
    effect(() => {
      const f = this.store.flow();
      if (!untracked(this.dirty)) this.flow.set(ensureSellerConfig(structuredClone(f)));
    });
  }

  byRoute(route: string): FlowNode[] {
    return this.flow()?.nodes.filter((n) => n.route === route) ?? [];
  }

  touch(): void {
    this.dirty.set(true);
    this.flow.update((f) => (f ? { ...f } : f));
  }

  nodeTitle(id: string | undefined): string {
    return this.flow()?.nodes.find((n) => n.id === id)?.title ?? id ?? '—';
  }

  addFaq(): void {
    const f = this.flow();
    if (!f) return;
    f.faqs = [...(f.faqs ?? []), { id: 'faq_' + Date.now().toString(36), keywords: [], answer: '' }];
    this.touch();
  }

  removeFaq(i: number): void {
    this.flow()?.faqs?.splice(i, 1);
    this.touch();
  }

  addOption(n: FlowNode): void {
    (n.options ??= []).push({ id: `${n.id}_${(n.options?.length ?? 0) + 1}`, title: 'Nueva opción', value: 'valor', synonyms: [] });
    this.touch();
  }

  removeOption(n: FlowNode, i: number): void {
    n.options?.splice(i, 1);
    this.touch();
  }

  addNode(route: string): void {
    const f = this.flow();
    if (!f) return;
    const id = `${route}_${Date.now().toString(36).slice(-4)}`;
    f.nodes.splice(f.nodes.length - 2, 0, {
      id, kind: 'question', route, title: 'Nueva pregunta', message: '¿…?', display: 'text', parse: 'text', field: 'espacio', next: 'recomendar',
    });
    this.selectedId.set(id);
    this.touch();
  }

  removeNode(n: FlowNode): void {
    const f = this.flow();
    if (!f || !confirm(`¿Eliminar el paso "${n.title}"? Revisa que ningún otro paso apunte a él.`)) return;
    f.nodes = f.nodes.filter((x) => x.id !== n.id);
    this.selectedId.set(f.startNode);
    this.touch();
  }

  readonly splitList = splitList;

  addTrigger(): void {
    this.flow()?.triggers.push({ id: 't_' + Date.now().toString(36), label: 'Nuevo disparador', intent: 'humano', keywords: [], handoff: true, score: 10 });
    this.touch();
  }

  async save(): Promise<void> {
    const f = this.flow();
    if (!f) return;
    await this.store.saveFlow(structuredClone(f));
    this.dirty.set(false);
    this.store.toast('Flujo guardado. El bot ya usa la nueva versión.', 'success');
  }

  reset(): void {
    if (!confirm('¿Restaurar el flujo por defecto de EvoSport? Se perderán tus cambios.')) return;
    this.flow.set(ensureSellerConfig(structuredClone(DEFAULT_FLOW)));
    this.dirty.set(true);
  }

  discard(): void {
    this.dirty.set(false);
    this.flow.set(ensureSellerConfig(structuredClone(this.store.flow())));
  }
}
