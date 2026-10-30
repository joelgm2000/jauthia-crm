import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessProfile } from '@shared/market';
import { Icon } from './icon';

/**
 * Perfil del negocio para la inteligencia de mercado: lo usan el panel de la plataforma (Editar cliente)
 * y la página de Inteligencia del cliente. Edita el objeto recibido en el lugar y avisa con (changed).
 */
@Component({
  selector: 'app-business-profile-form',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = profile();
    <div class="field"><label>¿Qué hace el negocio? * <small class="muted">Qué vende, a quién y cómo (2 a 5 frases)</small></label>
      <textarea class="textarea" rows="3" maxlength="2000" [(ngModel)]="p.description" (ngModelChange)="changed.emit()" placeholder="Vendemos equipos de gimnasio para casa y negocio: caminadoras, bicicletas, máquinas de fuerza y peso libre. Entregamos e instalamos en la Costa Caribe."></textarea></div>
    <div class="grid-2">
      <div class="field"><label>Nicho o industria *</label><input class="input" maxlength="150" [(ngModel)]="p.industry" (ngModelChange)="changed.emit()" placeholder="Equipos de gimnasio y fitness" /></div>
      <div class="field"><label>Zona donde vende *</label><input class="input" maxlength="200" [(ngModel)]="p.zone" (ngModelChange)="changed.emit()" placeholder="Valledupar, Cesar, La Guajira y envíos a toda Colombia" /></div>
    </div>
    <div class="field"><label>Cliente ideal</label><input class="input" maxlength="600" [(ngModel)]="p.idealCustomer" (ngModelChange)="changed.emit()" placeholder="Gimnasios, conjuntos residenciales, hoteles y personas que entrenan en casa" /></div>
    <div class="field"><label>¿Qué los hace diferentes?</label><input class="input" maxlength="1000" [(ngModel)]="p.differentiators" (ngModelChange)="changed.emit()" placeholder="Garantía de 1 año, envío gratis en la ciudad, plan separe, instalación incluida" /></div>
    <div class="grid-2">
      <div class="field"><label>Sitio web</label><input class="input" maxlength="300" [(ngModel)]="p.website" (ngModelChange)="changed.emit()" placeholder="https://…" /></div>
      <div class="field"><label>Instagram</label><input class="input" maxlength="300" [(ngModel)]="p.instagram" (ngModelChange)="changed.emit()" placeholder="@usuario o https://instagram.com/…" /></div>
      <div class="field"><label>Facebook</label><input class="input" maxlength="300" [(ngModel)]="p.facebook" (ngModelChange)="changed.emit()" placeholder="https://facebook.com/…" /></div>
      <div class="field"><label>TikTok</label><input class="input" maxlength="300" [(ngModel)]="p.tiktok" (ngModelChange)="changed.emit()" placeholder="@usuario" /></div>
      <div class="field"><label>YouTube</label><input class="input" maxlength="300" [(ngModel)]="p.youtube" (ngModelChange)="changed.emit()" placeholder="@canal o https://youtube.com/@…" /></div>
    </div>
    <div class="field">
      <label>Competidores <small class="muted">Para el análisis con IA son opcionales (los busca sola). Para las <b>estadísticas reales</b> escribe aquí sus cuentas exactas: solo se miden las que confirmes.</small></label>
      @for (c of p.competitors; track $index) {
        <div class="comp">
          <div class="comp-top">
            <input class="input" maxlength="120" [(ngModel)]="c.name" (ngModelChange)="changed.emit()" placeholder="Nombre del competidor" />
            <input class="input" maxlength="300" [(ngModel)]="c.url" (ngModelChange)="changed.emit()" placeholder="Sitio web (opcional)" />
            <button type="button" class="btn ghost icon-only sm" title="Quitar" (click)="p.competitors.splice($index, 1); changed.emit()"><app-icon name="trash" [size]="14" /></button>
          </div>
          <div class="comp-nets">
            <input class="input" maxlength="300" [(ngModel)]="c.instagram" (ngModelChange)="changed.emit()" placeholder="Instagram: @usuario" />
            <input class="input" maxlength="300" [(ngModel)]="c.facebook" (ngModelChange)="changed.emit()" placeholder="Facebook: enlace de la página" />
            <input class="input" maxlength="300" [(ngModel)]="c.tiktok" (ngModelChange)="changed.emit()" placeholder="TikTok: @usuario" />
            <input class="input" maxlength="300" [(ngModel)]="c.youtube" (ngModelChange)="changed.emit()" placeholder="YouTube: @canal" />
          </div>
        </div>
      }
      @if (p.competitors.length < 10) {
        <button type="button" class="btn sm" (click)="p.competitors.push({ name: '', url: '' }); changed.emit()"><app-icon name="plus" [size]="14" /> Agregar competidor</button>
      }
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 10px; }
    label small { font-weight: 400; margin-left: 4px; }
    .comp { border: 1px solid var(--line); border-radius: 10px; padding: 8px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 6px; }
    .comp-top { display: grid; grid-template-columns: 1fr 1.2fr auto; gap: 6px; }
    .comp-nets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    @media (max-width: 900px) { .comp-nets { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 640px) { .comp-top { grid-template-columns: 1fr auto; } .comp-top input:nth-child(2) { grid-column: 1; grid-row: 2; } .comp-nets { grid-template-columns: 1fr; } }
  `,
})
export class BusinessProfileForm {
  readonly profile = input.required<BusinessProfile>();
  readonly changed = output<void>();
}

/** Copia del perfil lista para enviar: sin competidores vacíos ni espacios sobrantes. */
export function cleanProfile(p: BusinessProfile): BusinessProfile {
  const t = (s?: string) => (s ?? '').trim();
  return {
    description: t(p.description), industry: t(p.industry), zone: t(p.zone), idealCustomer: t(p.idealCustomer),
    differentiators: t(p.differentiators), website: t(p.website), instagram: t(p.instagram), facebook: t(p.facebook), tiktok: t(p.tiktok), youtube: t(p.youtube),
    competitors: p.competitors
      .map((c) => ({ name: t(c.name), url: t(c.url), instagram: t(c.instagram), facebook: t(c.facebook), tiktok: t(c.tiktok), youtube: t(c.youtube) }))
      .filter((c) => c.name),
  };
}
