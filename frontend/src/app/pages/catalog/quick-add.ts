import { ChangeDetectionStrategy, Component, computed, inject, input, OnDestroy, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { newId } from '@shared/ids';
import { Product } from '@shared/models';
import { parseProductText } from '@shared/product-parse';
import { CrmStore } from '../../core/data/crm-store';
import { addMediaToProduct, isVideo } from '../../core/media';
import { Icon } from '../../ui/icon';
import { CopPipe } from '../../ui/pipes';

const EXAMPLE = `Evo Latte
1.889.900
Motor 1.5 AC
Soporte de peso máx 90 kg
Velocidad 1-10 km/h`;

/**
 * Carga rápida: el cliente pega el texto del producto (nombre, precio y características, una por línea)
 * y adjunta fotos o un video. Se organiza solo y se abre el editor para revisar y guardar.
 */
@Component({
  selector: 'app-quick-add',
  imports: [FormsModule, Icon, CopPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" (click)="closed.emit()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-head"><app-icon name="sparkles" /><h2>Carga rápida de producto</h2><span class="spacer"></span><button class="btn ghost icon-only sm" (click)="closed.emit()"><app-icon name="x" /></button></div>
        <div class="modal-body">
          <div class="field">
            <label>Pega el producto como lo escribirías en WhatsApp: nombre, precio y una característica por línea</label>
            <textarea class="textarea" rows="8" [placeholder]="example" [ngModel]="text()" (ngModelChange)="text.set($event)"></textarea>
          </div>
          @if (parsed(); as r) {
            <div class="guess">
              <b>{{ r.name }}</b>
              <span>{{ r.price ? (r.price | cop) : 'sin precio' }}</span>
              @for (s of r.specs; track $index) { <span class="chip">{{ s.label }}: {{ s.value }}</span> }
            </div>
          }
          <label class="drop" [class.over]="over()" (dragover)="$event.preventDefault(); over.set(true)" (dragleave)="over.set(false)" (drop)="onDrop($event)">
            <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" multiple hidden (change)="onPick($event)" />
            <app-icon name="image" [size]="20" />
            <span><b>Adjunta las fotos y el video</b> (arrastra o toca aquí)</span>
            <small class="muted">La primera foto queda como principal. Video MP4 de hasta 16 MB.</small>
          </label>
          @if (files().length) {
            <div class="files">
              @for (f of files(); track f.url) {
                <div class="file">
                  @if (f.video) { <video [src]="f.url" muted></video> } @else { <img [src]="f.url" alt="" /> }
                  <button class="del" title="Quitar" (click)="removeFile(f.url)"><app-icon name="x" [size]="12" /></button>
                </div>
              }
            </div>
          }
          @if (busy(); as b) { <div class="busy"><span class="spin"></span> {{ b }}</div> }
        </div>
        <div class="modal-foot">
          <button class="btn" (click)="closed.emit()">Cancelar</button>
          <button class="btn primary" [disabled]="!parsed() || !!busy()" (click)="organize()"><app-icon name="sparkles" [size]="14" /> Organizar producto</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .guess { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 13px; padding: 8px 10px; border-radius: 10px; background: var(--brand-soft); }
    .drop { border: 2px dashed var(--line); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; cursor: pointer; color: var(--text); }
    .drop.over { border-color: var(--brand); background: var(--brand-soft); }
    .files { display: flex; flex-wrap: wrap; gap: 8px; }
    .file { position: relative; width: 80px; height: 80px; border-radius: 10px; overflow: hidden; border: 1px solid var(--line); }
    .file img, .file video { width: 100%; height: 100%; object-fit: cover; }
    .file .del { position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; border-radius: 50%; border: 0; background: rgba(0,0,0,.6); color: #fff; display: grid; place-items: center; cursor: pointer; padding: 0; }
    .busy { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
    .spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line); border-top-color: var(--brand); animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `,
})
export class QuickAdd implements OnDestroy {
  private readonly store = inject(CrmStore);
  /** Categoría por defecto si el texto no la deja clara. */
  readonly defaultCategory = input('');
  readonly done = output<Product>();
  readonly closed = output<void>();

  readonly example = EXAMPLE;
  readonly text = signal('');
  readonly files = signal<{ file: File; url: string; video: boolean }[]>([]);
  readonly busy = signal<string | null>(null);
  readonly over = signal(false);
  readonly parsed = computed(() => {
    const r = parseProductText(this.text(), this.store.categories());
    return r.name ? r : null;
  });

  onPick(e: Event): void {
    const el = e.target as HTMLInputElement;
    this.addFiles([...(el.files ?? [])]);
    el.value = '';
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.over.set(false);
    this.addFiles([...(e.dataTransfer?.files ?? [])]);
  }

  private addFiles(list: File[]): void {
    const ok = list.filter((f) => f.type.startsWith('image/') || f.type === 'video/mp4');
    if (ok.length < list.length) this.store.toast('Solo se aceptan fotos y videos MP4', 'error');
    this.files.update((cur) => [...cur, ...ok.map((file) => ({ file, url: URL.createObjectURL(file), video: isVideo(file) }))]);
  }

  removeFile(url: string): void {
    URL.revokeObjectURL(url);
    this.files.update((cur) => cur.filter((f) => f.url !== url));
  }

  async organize(): Promise<void> {
    const r = this.parsed();
    if (!r) return;
    const gym = !!this.store.settings().catalog?.gymFilters;
    const product: Product = {
      id: newId('p'), name: r.name, price: r.price, specs: r.specs, description: r.description, keywords: r.keywords,
      category: r.category ?? this.defaultCategory(), subcategory: r.subcategory ?? '',
      imageUrl: '', availability: 'tienda', active: true,
      ...(gym && r.maxUserKg ? { maxUserKg: r.maxUserKg } : {}),
    };
    const errors = await addMediaToProduct(product, this.files().map((f) => f.file), (m) => this.busy.set(m));
    this.busy.set(null);
    errors.forEach((m) => this.store.toast(m, 'error'));
    this.done.emit(product);
  }

  ngOnDestroy(): void {
    this.files().forEach((f) => URL.revokeObjectURL(f.url));
  }
}
