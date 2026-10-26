import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { productCard, productDetails } from '@shared/products';
import { slugify, splitList } from '@shared/text';
import { CatalogCategory, CatalogConfig, ChatMessage, Product } from '@shared/models';
import { AuthService } from '../../core/auth.service';
import { CrmStore } from '../../core/data/crm-store';
import { newId } from '@shared/ids';
import { Icon } from '../../ui/icon';
import { MessageBubble } from '../../ui/message-bubble';
import { CopPipe } from '../../ui/pipes';
import { ProductMedia } from './product-media';
import { QuickAdd } from './quick-add';

@Component({
  selector: 'app-catalog',
  imports: [FormsModule, Icon, CopPipe, MessageBubble, ProductMedia, QuickAdd],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Catálogo</h1><p>Lo que el bot recomienda y muestra en carruseles. Las palabras clave hacen que aparezca cuando el cliente pregunta (ej: "caminadoras").</p></div>
        <span class="spacer"></span>
        <input class="input" style="width:240px" placeholder="Buscar…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        @if (auth.isAdmin()) {
          <button class="btn" (click)="openCategories()"><app-icon name="tag" [size]="15" /> Categorías</button>
          <button class="btn" (click)="newProduct()"><app-icon name="plus" [size]="15" /> Producto</button>
          <button class="btn primary" (click)="quick.set(true)"><app-icon name="sparkles" [size]="15" /> Carga rápida</button>
        }
      </div>
      <div class="row wrap" style="margin-bottom:14px">
        @for (c of cats(); track c[0]) { <button class="chip" [class.on]="cat() === c[0]" (click)="cat.set(c[0])">{{ c[1] }}</button> }
      </div>
      @if (!store.categories().length) {
        <div class="card card-pad empty-cats">
          <b>Este catálogo aún no tiene categorías.</b>
          <p class="muted">Crea las categorías de tu negocio (por ejemplo: Panes, Tortas, Bebidas). El bot las muestra como opciones cuando el cliente pregunta qué hay.</p>
          @if (auth.isAdmin()) { <button class="btn primary" (click)="openCategories()"><app-icon name="tag" [size]="14" /> Crear categorías</button> }
        </div>
      }
      <div class="grid">
        @for (p of filtered(); track p.id) {
          <article class="card prod" [class.off]="!p.active" (click)="auth.isAdmin() && edit(p)">
            @if (p.imageUrl) { <img [src]="p.imageUrl" [alt]="p.name" /> } @else { <div class="noimg"><app-icon name="image" [size]="28" /></div> }
            @if (p.videoUrl) { <span class="vid badge"><app-icon name="play" [size]="11" /> Video</span> }
            <span class="avail badge" [class.ok]="p.availability === 'tienda'" [class.warn]="p.availability === 'bodega'" [class.high]="p.availability === 'agotado'">{{ p.availability }}</span>
            <div class="pb">
              <small class="cap">{{ catName(p.category) }} · {{ p.subcategory }}{{ gym() && p.line ? ' · ' + p.line : '' }}</small>
              <b>{{ p.name }}</b>
              <span class="price">{{ p.price | cop }}</span>
              <div class="row wrap kw">@for (k of p.keywords.slice(0, 4); track k) { <span class="chip">{{ k }}</span> }</div>
            </div>
          </article>
        }
      </div>
    </div>

    @if (editing(); as p) {
      <div class="overlay" (click)="editing.set(null)">
        <div class="modal wide" (click)="$event.stopPropagation()">
          <div class="modal-head"><app-icon name="box" /><h2>{{ p.name || 'Nuevo producto' }}</h2><span class="spacer"></span><button class="btn ghost icon-only sm" (click)="editing.set(null)"><app-icon name="x" /></button></div>
          <div class="edit">
            <div class="modal-body">
              <div class="grid-2">
                <div class="field"><label>Nombre</label><input class="input" [(ngModel)]="p.name" /></div>
                <div class="field"><label>Precio ({{ currency() }})</label><input class="input" type="number" [(ngModel)]="p.price" /></div>
              </div>
              <div class="grid-3">
                <div class="field"><label>Categoría</label>
                  <select class="select" [(ngModel)]="p.category">@for (c of store.categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></div>
                <div class="field"><label>Tipo de producto</label>
                  <input class="input" [(ngModel)]="p.subcategory" [attr.list]="'subs'" />
                  <datalist id="subs">@for (s of subcats(p.category); track s) { <option [value]="s"></option> }</datalist></div>
                @if (gym()) {
                  <div class="field"><label>Línea</label>
                    <select class="select" [(ngModel)]="p.line"><option [ngValue]="undefined">—</option><option value="hogar">Hogar</option><option value="institucional">Institucional</option><option value="profesional">Profesional</option></select></div>
                }
              </div>
              <div class="field"><label>Fotos y video</label><app-product-media [product]="p" [aiEnabled]="!!auth.modules().aiImages" (changed)="touch()" /></div>
              <div class="field"><label>Descripción</label><textarea class="textarea" [(ngModel)]="p.description"></textarea></div>
              <div class="field"><label>Palabras clave que activan el producto (separadas por coma)</label><input class="input" [ngModel]="p.keywords.join(', ')" (ngModelChange)="p.keywords = splitList($event)" /></div>
              <div class="grid-2">
                <div class="field"><label>Disponibilidad</label>
                  <select class="select" [(ngModel)]="p.availability"><option value="tienda">Disponible (entrega inmediata)</option><option value="bodega">Bajo pedido / en bodega</option><option value="agotado">Agotado</option></select></div>
                <label class="row" style="margin-top:22px"><span class="switch"><input type="checkbox" [(ngModel)]="p.active" /><span></span></span> Activo (el bot lo recomienda)</label>
              </div>
              @if (gym()) {
                <div class="grid-3">
                  <div class="field"><label>Peso máx. usuario (kg)</label><input class="input" type="number" [(ngModel)]="p.maxUserKg" /></div>
                  <div class="field"><label>Techo mínimo (cm)</label><input class="input" type="number" [(ngModel)]="p.minCeilingCm" /></div>
                  <div class="field"><label>Uso (cardio)</label>
                    <select class="select" [(ngModel)]="p.mode"><option [ngValue]="undefined">Caminar y trotar</option><option value="caminar">Solo caminar</option><option value="trotar">Trotar</option></select></div>
                </div>
              }
              <div class="field">
                <label>Ficha técnica</label>
                @for (s of p.specs; track $index) {
                  <div class="row"><input class="input" placeholder="Etiqueta" [(ngModel)]="s.label" /><input class="input" placeholder="Valor" [(ngModel)]="s.value" /><button class="btn ghost icon-only sm" (click)="p.specs.splice($index, 1)"><app-icon name="x" [size]="14" /></button></div>
                }
                <button class="btn sm" style="align-self:flex-start" (click)="p.specs.push({ label: '', value: '' })"><app-icon name="plus" [size]="13" /> Agregar dato</button>
              </div>
            </div>
            <div class="pv">
              <span class="label">Vista previa en el chat</span>
              @for (m of preview(p); track m.id) { <app-message-bubble [msg]="m" /> }
            </div>
          </div>
          <div class="modal-foot">
            @if (exists(p.id)) { <button class="btn danger" style="margin-right:auto" (click)="remove(p)"><app-icon name="trash" [size]="14" /> Eliminar</button> }
            <button class="btn" (click)="editing.set(null)">Cancelar</button>
            <button class="btn primary" (click)="save(p)">Guardar</button>
          </div>
        </div>
      </div>
    }

    @if (quick()) {
      <app-quick-add [defaultCategory]="cat() === 'all' ? (store.categories()[0]?.id ?? '') : cat()" (done)="quickDone($event)" (closed)="quick.set(false)" />
    }

    @if (catEdit(); as cfg) {
      <div class="overlay" (click)="catEdit.set(null)">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-head"><app-icon name="tag" /><h2>Categorías del catálogo</h2><span class="spacer"></span><button class="btn ghost icon-only sm" (click)="catEdit.set(null)"><app-icon name="x" /></button></div>
          <div class="modal-body">
            <small class="muted">Cada negocio tiene las suyas. El bot las muestra como opciones ("¿Qué te gustaría ver?") y los tipos sirven para filtrar las recomendaciones.</small>
            @for (c of cfg.categories; track $index) {
              <div class="cat-row">
                <input class="input" placeholder="Nombre (ej: Tortas)" [(ngModel)]="c.name" />
                <input class="input" placeholder="Tipos, separados por coma (ej: chocolate, frutas)" [ngModel]="c.subcategories.join(', ')" (ngModelChange)="c.subcategories = splitList($event)" />
                <button class="btn ghost icon-only sm" (click)="cfg.categories.splice($index, 1)" title="Quitar"><app-icon name="trash" [size]="14" /></button>
              </div>
            }
            <button class="btn sm" style="align-self:flex-start" (click)="addCategory(cfg)"><app-icon name="plus" [size]="13" /> Categoría</button>
            <div class="grid-2">
              <div class="field"><label>Moneda de los precios</label><select class="select" [(ngModel)]="cfg.currency"><option>COP</option><option>USD</option><option>MXN</option><option>PEN</option></select></div>
              <label class="row" style="margin-top:22px"><span class="switch"><input type="checkbox" [(ngModel)]="cfg.gymFilters" /><span></span></span> Filtros de gimnasio (peso, caminar/trotar, techo)</label>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn" (click)="catEdit.set(null)">Cancelar</button>
            <button class="btn primary" (click)="saveCategories(cfg)">Guardar categorías</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .cat-row { display: grid; grid-template-columns: 1fr 1.6fr auto; gap: 8px; align-items: center; }
    .empty-cats { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; margin-bottom: 14px; }
    .empty-cats p { margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
    .prod { overflow: hidden; cursor: pointer; position: relative; transition: transform .15s, box-shadow .15s; }
    .prod:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
    .prod.off { opacity: .5; }
    .prod img, .noimg { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; }
    .noimg { display: grid; place-items: center; background: var(--hover); color: var(--muted); }
    .vid { position: absolute; top: 10px; left: 10px; display: flex; gap: 3px; align-items: center; }
    .avail { position: absolute; top: 10px; right: 10px; text-transform: capitalize; }
    .pb { padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
    .cap { text-transform: capitalize; }
    .price { font-weight: 700; color: var(--brand); }
    .kw { margin-top: 4px; }
    .edit { display: grid; grid-template-columns: 1fr 340px; }
    .pv { background: var(--chat-bg); padding: 16px; display: flex; flex-direction: column; gap: 6px; border-left: 1px solid var(--line); }
    .pv app-message-bubble { max-width: 100%; }
    @media (max-width: 900px) { .edit { grid-template-columns: 1fr; } }
  `,
})
export class Catalog {
  readonly store = inject(CrmStore);
  readonly auth = inject(AuthService);
  readonly cats = computed<[string, string][]>(() => [['all', 'Todos'], ...this.store.categories().map((c) => [c.id, c.name] as [string, string])]);
  readonly gym = computed(() => !!this.store.settings().catalog?.gymFilters);
  readonly currency = computed(() => this.store.settings().catalog?.currency || 'COP');
  readonly catEdit = signal<CatalogConfig | null>(null);
  readonly q = signal('');
  readonly cat = signal<string>('all');
  readonly editing = signal<Product | null>(null);
  readonly quick = signal(false);
  /** Cambia cuando el editor de fotos modifica el producto (para refrescar la vista previa). */
  readonly rev = signal(0);

  readonly filtered = computed(() => {
    const q = this.q().toLowerCase();
    return [...this.store.products()]
      .filter((p) => (this.cat() === 'all' || p.category === this.cat()) && (!q || `${p.name} ${p.keywords.join(' ')}`.toLowerCase().includes(q)))
      .sort((a, b) => a.category.localeCompare(b.category) || a.price - b.price);
  });

  subcats(c: string): string[] {
    return this.store.categories().find((x) => x.id === c)?.subcategories ?? [];
  }

  catName(id: string): string {
    return this.store.categories().find((x) => x.id === id)?.name ?? id;
  }

  // ---- Categorías del catálogo (por cliente) ----
  openCategories(): void {
    const cur = this.store.settings().catalog;
    this.catEdit.set(structuredClone(cur ?? { categories: [], gymFilters: false, currency: 'COP' }));
  }

  addCategory(cfg: CatalogConfig): void {
    cfg.categories.push({ id: '', name: '', subcategories: [] });
  }

  async saveCategories(cfg: CatalogConfig): Promise<void> {
    const used = new Set<string>();
    const categories: CatalogCategory[] = cfg.categories
      .filter((c) => c.name.trim())
      .map((c) => {
        const base = c.id || slugify(c.name, 'categoria');
        let id = base;
        for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
        used.add(id);
        return { id, name: c.name.trim(), subcategories: c.subcategories.map((x) => x.trim().toLowerCase()).filter(Boolean) };
      });
    await this.store.saveSettings({ ...this.store.settings(), catalog: { ...cfg, categories } });
    this.catEdit.set(null);
    this.store.toast('Categorías guardadas', 'success');
  }

  touch(): void {
    this.rev.update((n) => n + 1);
  }

  quickDone(p: Product): void {
    this.quick.set(false);
    this.editing.set(p);
    this.store.toast('Producto organizado: revisa los datos y toca Guardar', 'info');
  }

  edit(p: Product): void {
    this.editing.set(structuredClone(p));
  }

  newProduct(): void {
    this.editing.set({
      id: newId('p'), name: '', category: this.store.categories()[0]?.id ?? '', subcategory: '', keywords: [], imageUrl: '',
      price: 0, availability: 'tienda', description: '', specs: [], active: true,
    });
  }

  exists(id: string): boolean {
    return this.store.products().some((p) => p.id === id);
  }

  readonly splitList = splitList;

  preview(p: Product): ChatMessage[] {
    const base = { conversationId: 'pv', direction: 'out' as const, sender: 'bot' as const, createdAt: Date.now(), status: 'read' as const };
    this.rev(); // se recalcula cuando cambian las fotos o el video
    return [
      { ...base, id: 'c', type: 'carousel', text: '', cards: [productCard(p)] },
      ...productDetails(p).map((d, i) => ({ ...base, id: 'd' + i, ...d })),
    ];
  }

  async save(p: Product): Promise<void> {
    const clean: Product = { ...p, price: Number(p.price) || 0 };
    for (const k of ['maxUserKg', 'minCeilingCm'] as const) {
      const v = clean[k] as unknown;
      if (v === '' || v === null || v === undefined) delete clean[k];
      else clean[k] = Number(v);
    }
    if (!clean.mode) delete clean.mode;
    if (!clean.gallery?.length) delete clean.gallery;
    if (!clean.videoUrl) delete clean.videoUrl;
    if (!clean.line) delete clean.line;
    if (!clean.category) {
      this.store.toast('Primero crea al menos una categoría', 'error');
      return;
    }
    await this.store.saveProduct(clean);
    this.editing.set(null);
    this.store.toast('Producto guardado', 'success');
  }

  async remove(p: Product): Promise<void> {
    if (!confirm(`¿Eliminar ${p.name}?`)) return;
    await this.store.removeProduct(p.id);
    this.editing.set(null);
  }
}
