import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Product, WaTemplate } from '@shared/models';
import { Icon } from '../../ui/icon';
import { WaPhone } from '../../ui/wa-phone';

@Component({
  selector: 'app-template-picker',
  imports: [Icon, WaPhone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" (click)="close.emit()">
      <div class="modal wide" (click)="$event.stopPropagation()">
        <div class="modal-head">
          <app-icon name="template" /> <h2>Plantillas de WhatsApp</h2>
          <span class="spacer"></span>
          <button class="btn ghost icon-only sm" (click)="close.emit()"><app-icon name="x" /></button>
        </div>
        <div class="body">
          <div class="list">
            @for (t of templates(); track t.id) {
              <button class="t" [class.on]="current()?.id === t.id" (click)="sel.set(t.id)">
                <b>{{ t.name }}</b>
                <small>{{ t.body }}</small>
                <span class="row"><span class="badge info">{{ t.kind }}</span><span class="badge" [class.ok]="t.status === 'APPROVED'" [class.warn]="t.status !== 'APPROVED'">{{ t.status }}</span></span>
              </button>
            }
          </div>
          <div class="preview">
            @if (current(); as t) { <app-wa-phone [template]="t" [products]="products()" [title]="companyName()" /> }
          </div>
        </div>
        <div class="modal-foot">
          <small class="muted" style="margin-right:auto">Las variables {{ '{{1}}' }} y {{ '{{2}}' }} se reemplazan por el nombre del cliente y el modelo.</small>
          <button class="btn" (click)="close.emit()">Cancelar</button>
          <button class="btn primary" [disabled]="!current()" (click)="send.emit(current()!)"><app-icon name="send" [size]="14" /> Enviar plantilla</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .body { display: grid; grid-template-columns: 1fr 360px; gap: 16px; padding: 16px 20px; }
    .list { display: flex; flex-direction: column; gap: 8px; max-height: 60vh; overflow-y: auto; }
    .t { display: flex; flex-direction: column; gap: 4px; text-align: left; border: 1px solid var(--line); background: var(--panel); border-radius: 10px; padding: 10px 12px; cursor: pointer; color: var(--text); }
    .t small { color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .t.on { border-color: var(--brand); background: var(--brand-soft); }
    @media (max-width: 820px) { .body { grid-template-columns: 1fr; } }
  `,
})
export class TemplatePicker {
  readonly templates = input.required<WaTemplate[]>();
  readonly products = input<Product[]>([]);
  readonly companyName = input('');
  readonly close = output<void>();
  readonly send = output<WaTemplate>();
  readonly sel = signal<string | null>(null);
  readonly current = computed<WaTemplate | undefined>(() => this.templates().find((t) => t.id === this.sel()) ?? this.templates()[0]);
}
