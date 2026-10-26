import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WaTemplate } from '@shared/models';
import { CrmStore } from '../../core/data/crm-store';
import { newId } from '@shared/ids';
import { Icon } from '../../ui/icon';
import { WaPhone } from '../../ui/wa-phone';

@Component({
  selector: 'app-templates',
  imports: [FormsModule, Icon, WaPhone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Plantillas de WhatsApp</h1><p>Mensajes con botones, fichas y carruseles de productos. Las de tipo MARKETING/UTILITY se envían a Meta para aprobación.</p></div>
        <span class="spacer"></span>
        <button class="btn primary" (click)="create()"><app-icon name="plus" [size]="15" /> Nueva plantilla</button>
      </div>
      <div class="layout">
        <div class="list">
          @for (t of store.templates(); track t.id) {
            <button class="t card" [class.on]="t.id === draft()?.id" (click)="select(t)">
              <div class="row"><b>{{ t.name }}</b><span class="spacer"></span><span class="badge" [class.ok]="t.status === 'APPROVED'" [class.warn]="t.status !== 'APPROVED'">{{ t.status }}</span></div>
              <small>{{ t.body }}</small>
              <div class="row"><span class="badge info">{{ kinds[t.kind] }}</span><span class="badge gray">{{ t.category }}</span></div>
            </button>
          }
        </div>

        @if (draft(); as t) {
          <div class="card editor">
            <div class="card-pad col" style="gap:14px">
              <div class="grid-2">
                <div class="field"><label>Nombre (minúsculas_y_guiones)</label><input class="input" [(ngModel)]="t.name" (ngModelChange)="touch()" /></div>
                <div class="field"><label>Tipo</label>
                  <select class="select" [(ngModel)]="t.kind" (ngModelChange)="touch()">
                    @for (k of kindKeys; track k) { <option [value]="k">{{ kinds[k] }}</option> }
                  </select></div>
              </div>
              <div class="grid-2">
                <div class="field"><label>Categoría Meta</label>
                  <select class="select" [(ngModel)]="t.category" (ngModelChange)="touch()"><option>MARKETING</option><option>UTILITY</option><option>AUTHENTICATION</option></select></div>
                <div class="field"><label>Estado</label>
                  <select class="select" [(ngModel)]="t.status" (ngModelChange)="touch()"><option>LOCAL</option><option>PENDING</option><option>APPROVED</option><option>REJECTED</option></select></div>
              </div>
              @if (t.kind !== 'carousel' && t.kind !== 'product') {
                <div class="field"><label>Encabezado</label><input class="input" [(ngModel)]="t.header" (ngModelChange)="touch()" /></div>
                <div class="field"><label>Imagen de encabezado (URL, opcional)</label><input class="input" [(ngModel)]="t.imageUrl" (ngModelChange)="touch()" /></div>
              }
              <div class="field"><label>Cuerpo — usa *negrita* y variables {{ '{{1}}' }}, {{ '{{2}}' }}</label><textarea class="textarea" [(ngModel)]="t.body" (ngModelChange)="touch()"></textarea></div>
              @if (t.kind !== 'carousel') {
                <div class="field"><label>Pie</label><input class="input" [(ngModel)]="t.footer" (ngModelChange)="touch()" /></div>
              }
              @if (t.kind === 'carousel' || t.kind === 'product') {
                <div class="field">
                  <label>{{ t.kind === 'carousel' ? 'Productos del carrusel (hasta 10)' : 'Producto' }}</label>
                  <div class="prods">
                    @for (p of store.products(); track p.id) {
                      <button class="pp" [class.on]="t.productIds?.includes(p.id)" (click)="toggleProduct(t, p.id)">
                        <img [src]="p.imageUrl" [alt]="p.name" /><span>{{ p.name }}</span>
                      </button>
                    }
                  </div>
                </div>
              }
              @if (t.kind !== 'carousel') {
                <div class="field">
                  <label>Botones de respuesta rápida (máx. 3, 20 caracteres)</label>
                  @for (b of t.buttons; track $index) {
                    <div class="row">
                      <input class="input" maxlength="20" placeholder="Texto del botón" [(ngModel)]="b.title" (ngModelChange)="touch()" />
                      <input class="input" placeholder="id (ej: quiero_cotizacion)" [(ngModel)]="b.id" (ngModelChange)="touch()" />
                      <button class="btn ghost icon-only sm" (click)="t.buttons.splice($index, 1); touch()"><app-icon name="x" [size]="14" /></button>
                    </div>
                  }
                  @if (t.buttons.length < 3) {
                    <button class="btn sm" style="align-self:flex-start" (click)="t.buttons.push({ id: 'btn_' + (t.buttons.length + 1), title: '' }); touch()"><app-icon name="plus" [size]="13" /> Botón</button>
                  }
                </div>
              }
            </div>
            <div class="modal-foot">
              <button class="btn danger" style="margin-right:auto" (click)="remove(t)"><app-icon name="trash" [size]="14" /> Eliminar</button>
              <button class="btn primary" (click)="save(t)">Guardar plantilla</button>
            </div>
          </div>
          <div class="phone-col">
            <span class="label">Así lo ve el cliente</span>
            <app-wa-phone [template]="preview()!" [products]="store.products()" [title]="store.settings().companyName" />
          </div>
        } @else {
          <div class="card empty">Elige una plantilla para editarla.</div>
        }
      </div>
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: 300px 1fr 360px; gap: 16px; align-items: start; }
    .list { display: flex; flex-direction: column; gap: 10px; }
    .t { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; text-align: left; cursor: pointer; color: var(--text); }
    .t small { color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .t.on { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(26, 157, 217,.15); }
    .prods { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; max-height: 260px; overflow-y: auto; }
    .pp { display: flex; flex-direction: column; gap: 4px; border: 2px solid var(--line); border-radius: 10px; background: var(--panel); padding: 0 0 6px; overflow: hidden; cursor: pointer; font-size: 12px; color: var(--text); }
    .pp img { width: 100%; aspect-ratio: 4/3; object-fit: cover; }
    .pp.on { border-color: var(--brand); }
    .phone-col { display: flex; flex-direction: column; gap: 8px; position: sticky; top: 16px; }
    @media (max-width: 1300px) { .layout { grid-template-columns: 260px 1fr; } .phone-col { grid-column: span 2; position: static; } }
    @media (max-width: 800px) { .layout { grid-template-columns: 1fr; } .phone-col { grid-column: auto; } }
  `,
})
export class Templates {
  readonly store = inject(CrmStore);
  readonly kinds: Record<WaTemplate['kind'], string> = { text: 'Texto', buttons: 'Con botones', carousel: 'Carrusel de productos', product: 'Ficha de producto' };
  readonly kindKeys = Object.keys(this.kinds) as WaTemplate['kind'][];
  readonly draft = signal<WaTemplate | null>(null);
  private version = signal(0);
  /** Copia para refrescar la vista previa en cada cambio. */
  readonly preview = computed(() => {
    this.version();
    const d = this.draft();
    return d ? structuredClone(d) : null;
  });

  constructor() {
    effect(() => {
      const first = this.store.templates()[0];
      if (first && !untracked(this.draft)) untracked(() => this.select(first));
    });
  }

  select(t: WaTemplate): void {
    this.draft.set(structuredClone(t));
  }

  touch(): void {
    this.version.update((v) => v + 1);
  }

  create(): void {
    this.draft.set({ id: newId('tpl'), name: 'nueva_plantilla', category: 'MARKETING', kind: 'buttons', language: 'es', body: 'Hola {{1}} 👋', buttons: [], status: 'LOCAL' });
  }

  toggleProduct(t: WaTemplate, id: string): void {
    const ids = t.productIds ?? [];
    t.productIds = ids.includes(id) ? ids.filter((x) => x !== id) : t.kind === 'product' ? [id] : [...ids, id].slice(0, 10);
    this.touch();
  }

  async save(t: WaTemplate): Promise<void> {
    t.name = t.name.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
    await this.store.saveTemplate(structuredClone(t));
    this.store.toast('Plantilla guardada', 'success');
  }

  async remove(t: WaTemplate): Promise<void> {
    if (!confirm(`¿Eliminar ${t.name}?`)) return;
    await this.store.removeTemplate(t.id);
    this.draft.set(null);
  }
}
