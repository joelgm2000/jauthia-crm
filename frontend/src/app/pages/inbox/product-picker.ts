import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Product } from '@shared/models';
import { CrmStore } from '../../core/data/crm-store';
import { Icon } from '../../ui/icon';
import { CopPipe } from '../../ui/pipes';

@Component({
  selector: 'app-product-picker',
  imports: [FormsModule, Icon, CopPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" (click)="close.emit()">
      <div class="modal wide" (click)="$event.stopPropagation()">
        <div class="modal-head">
          <app-icon name="box" /> <h2>Enviar productos</h2>
          <span class="spacer"></span>
          <button class="btn ghost icon-only sm" (click)="close.emit()"><app-icon name="x" /></button>
        </div>
        <div class="modal-body">
          <div class="row wrap">
            <input class="input" style="max-width:260px" placeholder="Buscar producto…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
            @for (c of cats(); track c[0]) {
              <button class="chip" [class.on]="cat() === c[0]" (click)="cat.set(c[0])">{{ c[1] }}</button>
            }
          </div>
          <div class="grid">
            @for (p of filtered(); track p.id) {
              <button class="p" [class.sel]="selected().has(p.id)" (click)="toggle(p.id)">
                <img [src]="p.imageUrl" [alt]="p.name" />
                <span class="check"><app-icon name="check" [size]="14" /></span>
                <b>{{ p.name }}</b>
                <small>{{ p.price | cop }} · {{ p.availability }}</small>
              </button>
            }
          </div>
        </div>
        <div class="modal-foot">
          <small class="muted" style="margin-right:auto">{{ selected().size }} seleccionado(s) · WhatsApp muestra el carrusel como tarjetas con imagen y botones.</small>
          <button class="btn" [disabled]="!selected().size" (click)="emit('detail')"><app-icon name="note" [size]="14" /> Enviar ficha(s)</button>
          <button class="btn primary" [disabled]="!selected().size" (click)="emit('carousel')"><app-icon name="image" [size]="14" /> Enviar carrusel</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; max-height: 55vh; overflow-y: auto; padding: 2px; }
    .p { position: relative; display: flex; flex-direction: column; gap: 3px; text-align: left; padding: 0 0 10px; border: 2px solid var(--line); border-radius: 12px; background: var(--panel); cursor: pointer; overflow: hidden; color: var(--text); }
    .p img { width: 100%; aspect-ratio: 4/3; object-fit: cover; margin-bottom: 6px; }
    .p b, .p small { padding: 0 10px; }
    .p.sel { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(26, 157, 217,.15); }
    .check { position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border-radius: 50%; background: rgba(0,0,0,.35); color: transparent; display: grid; place-items: center; }
    .p.sel .check { background: var(--brand); color: #fff; }
  `,
})
export class ProductPicker implements OnInit {
  readonly products = input.required<Product[]>();
  readonly preselect = input<string[]>([]);
  readonly close = output<void>();
  readonly send = output<{ products: Product[]; as: 'carousel' | 'detail' }>();

  private store = inject(CrmStore);
  readonly cats = computed<[string, string][]>(() => [['all', 'Todos'], ...this.store.categories().map((c) => [c.id, c.name] as [string, string])]);
  readonly q = signal('');
  readonly cat = signal<string>('all');
  readonly selected = signal<Set<string>>(new Set());

  readonly filtered = computed(() => {
    const q = this.q().toLowerCase();
    return this.products().filter((p) => p.active && (this.cat() === 'all' || p.category === this.cat()) && (!q || `${p.name} ${p.keywords.join(' ')}`.toLowerCase().includes(q)));
  });

  ngOnInit(): void {
    this.selected.set(new Set(this.preselect()));
  }

  toggle(id: string): void {
    const s = new Set(this.selected());
    if (s.has(id)) s.delete(id);
    else if (s.size < 10) s.add(id);
    this.selected.set(s);
  }

  emit(as: 'carousel' | 'detail'): void {
    const ids = this.selected();
    this.send.emit({ products: this.products().filter((p) => ids.has(p.id)), as });
  }
}
