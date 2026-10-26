import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiImageStyle } from '@shared/api';
import { Product } from '@shared/models';
import { CrmStore } from '../../core/data/crm-store';
import { addMediaToProduct, AI_STYLES, generateAiImage } from '../../core/media';
import { Icon } from '../../ui/icon';

/**
 * Fotos y video de un producto: subir (arrastrar o elegir), elegir la principal, quitar,
 * y generar fotos nuevas con la IA de la plataforma (si el cliente tiene el módulo).
 * Edita el producto recibido en el lugar y avisa con (changed).
 */
@Component({
  selector: 'app-product-media',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = product();
    <div class="drop" [class.over]="over()" (dragover)="$event.preventDefault(); over.set(true)" (dragleave)="over.set(false)" (drop)="onDrop($event)">
      <div class="thumbs">
        @for (u of photos(); track u) {
          <button type="button" class="thumb" [class.main]="u === p.imageUrl" (click)="setMain(u)" [title]="u === p.imageUrl ? 'Foto principal' : 'Usar como foto principal'">
            <img [src]="u" alt="" />
            @if (u === p.imageUrl) { <span class="tag">Principal</span> }
            <span class="del" role="button" title="Quitar" (click)="remove(u, $event)"><app-icon name="x" [size]="12" /></span>
          </button>
        }
        @if (p.videoUrl) {
          <div class="thumb video">
            <video [src]="p.videoUrl" muted preload="metadata"></video>
            <span class="tag"><app-icon name="play" [size]="11" /> Video</span>
            <span class="del" role="button" title="Quitar video" (click)="removeVideo()"><app-icon name="x" [size]="12" /></span>
          </div>
        }
        <label class="thumb add">
          <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" multiple hidden (change)="onPick($event)" />
          <app-icon name="plus" [size]="18" />
          <small>Fotos o video</small>
        </label>
      </div>
      <small class="muted">Arrastra aquí las fotos (JPG/PNG) y un video MP4 de hasta 16 MB. Toca una foto para hacerla la principal: es la que ve el cliente en el chat. El video se envía con "Ver detalles".</small>
    </div>

    @if (aiEnabled()) {
      <div class="ai">
        <div class="ai-head"><app-icon name="sparkles" [size]="15" /> <b>Generar fotos con IA</b> <small class="muted">a partir de la foto principal</small></div>
        <input class="input" placeholder="Indicación opcional (ej: en un gimnasio con espejos, fondo azul)" [(ngModel)]="extra" />
        <div class="row wrap">
          @for (s of styles; track s.id) {
            <button type="button" class="btn sm" [disabled]="!!busy() || !canAi()" [title]="s.hint" (click)="generate(s.id)">{{ s.label }}</button>
          }
        </div>
        @if (!canAi()) { <small class="muted">Primero sube una foto del producto: la IA parte de ella.</small> }
      </div>
    }

    @if (busy(); as b) { <div class="busy"><span class="spin"></span> {{ b }}</div> }

    <details class="url">
      <summary>¿La foto ya está en internet? Pega su URL</summary>
      <input class="input" placeholder="https://…" [ngModel]="p.imageUrl" (ngModelChange)="p.imageUrl = $event; changed.emit()" />
    </details>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 10px; }
    .drop { border: 2px dashed var(--line); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 8px; transition: border-color .15s, background .15s; }
    .drop.over { border-color: var(--brand); background: var(--brand-soft); }
    .thumbs { display: flex; flex-wrap: wrap; gap: 8px; }
    .thumb { position: relative; width: 92px; height: 92px; border-radius: 10px; overflow: hidden; border: 2px solid var(--line); padding: 0; background: var(--panel); cursor: pointer; }
    .thumb.main { border-color: var(--brand); }
    .thumb img, .thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .thumb .tag { position: absolute; left: 4px; bottom: 4px; font-size: 10px; font-weight: 700; background: rgba(0,0,0,.65); color: #fff; padding: 2px 6px; border-radius: 6px; display: flex; gap: 3px; align-items: center; }
    .thumb .del { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 50%; background: rgba(0,0,0,.6); color: #fff; display: grid; place-items: center; }
    .thumb.add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--muted); border-style: dashed; }
    .ai { border: 1px solid var(--line); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 8px; background: var(--brand-soft); }
    .ai-head { display: flex; align-items: center; gap: 6px; }
    .busy { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
    .spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line); border-top-color: var(--brand); animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .url summary { cursor: pointer; font-size: 12px; color: var(--muted); }
    .url input { margin-top: 6px; }
  `,
})
export class ProductMedia {
  private readonly store = inject(CrmStore);
  readonly product = input.required<Product>();
  readonly aiEnabled = input(false);
  readonly changed = output<void>();

  readonly styles = AI_STYLES;
  readonly busy = signal<string | null>(null);
  readonly over = signal(false);
  extra = '';

  photos(): string[] {
    const p = this.product();
    return [...new Set([p.imageUrl, ...(p.gallery ?? [])].filter(Boolean))];
  }

  /** La IA solo parte de fotos subidas a este catálogo. */
  canAi(): boolean {
    return this.product().imageUrl.startsWith('/media/');
  }

  onPick(e: Event): void {
    const el = e.target as HTMLInputElement;
    void this.add([...(el.files ?? [])]);
    el.value = '';
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.over.set(false);
    void this.add([...(e.dataTransfer?.files ?? [])]);
  }

  async add(files: File[]): Promise<void> {
    if (!files.length || this.busy()) return;
    const errors = await addMediaToProduct(this.product(), files, (m) => this.busy.set(m));
    this.busy.set(null);
    errors.forEach((m) => this.store.toast(m, 'error'));
    this.changed.emit();
  }

  setMain(u: string): void {
    const p = this.product();
    if (u === p.imageUrl) return;
    p.gallery = [...(p.imageUrl ? [p.imageUrl] : []), ...(p.gallery ?? []).filter((x) => x !== u)];
    p.imageUrl = u;
    this.changed.emit();
  }

  remove(u: string, e: Event): void {
    e.stopPropagation();
    const p = this.product();
    if (u === p.imageUrl) {
      const [next, ...rest] = p.gallery ?? [];
      p.imageUrl = next ?? '';
      p.gallery = rest;
    } else {
      p.gallery = (p.gallery ?? []).filter((x) => x !== u);
    }
    this.changed.emit();
  }

  removeVideo(): void {
    delete this.product().videoUrl;
    this.changed.emit();
  }

  async generate(style: AiImageStyle): Promise<void> {
    const p = this.product();
    this.busy.set('La IA está creando la foto (puede tardar hasta un minuto)…');
    try {
      const url = await generateAiImage(p.imageUrl, style, this.extra);
      p.gallery = [...(p.gallery ?? []), url];
      this.store.toast('Foto lista: tócala para usarla como principal', 'success');
      this.changed.emit();
    } catch (e) {
      this.store.toast((e as Error).message, 'error');
    } finally {
      this.busy.set(null);
    }
  }
}
