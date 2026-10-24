import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CrmSettings } from '@shared/models';
import { CrmStore } from '../../core/data/crm-store';
import { newId } from '@shared/ids';
import { Icon } from '../../ui/icon';
import { AuthService } from '../../core/auth.service';
import { UsersPanel } from './users-panel';

const DAYS = [['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['0', 'Domingo']];

@Component({
  selector: 'app-settings',
  imports: [FormsModule, Icon, UsersPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (s(); as s) {
      <div class="page" style="max-width:1000px">
        <div class="page-head">
          <div><h1>Configuración</h1><p>Empresa, horario de atención, asesores y reglas comerciales.</p></div>
          <span class="spacer"></span>
          <button class="btn primary" (click)="save()"><app-icon name="check" [size]="15" /> Guardar</button>
        </div>

        <div class="col" style="gap:16px">
          <section class="card">
            <div class="card-head"><h2>Empresa</h2></div>
            <div class="card-pad grid-2">
              <div class="field"><label>Nombre</label><input class="input" [(ngModel)]="s.companyName" /></div>
              <div class="field"><label>Ciudad con envío e instalación gratis</label><input class="input" [(ngModel)]="s.freeShippingCity" /></div>
              <div class="field"><label>🔥 Puntaje "a punto de comprar"</label><input class="input" type="number" min="1" max="100" [(ngModel)]="s.hotThreshold" /></div>
              <div class="field"><label>Mensajes mínimos antes de marcar 🔥</label><input class="input" type="number" min="1" max="20" [(ngModel)]="s.minMessagesForHot" /></div>
            </div>
          </section>

          <section class="card">
            <div class="card-head"><h2>Horario de atención</h2><span class="spacer"></span><small class="muted">Zona: {{ s.hours.timezone }}</small></div>
            <div class="card-pad col">
              @for (d of days; track d[0]) {
                <div class="day">
                  <b>{{ d[1] }}</b>
                  <input class="input" placeholder="Cerrado — ej: 08:30-12:30, 14:30-18:30" [ngModel]="(s.hours.days[d[0]] ?? []).join(', ')" (ngModelChange)="setDay(s, d[0], $event)" />
                </div>
              }
              <div class="field"><label>Mensaje fuera de horario</label><textarea class="textarea" [(ngModel)]="s.hours.outOfHoursMessage"></textarea></div>
            </div>
          </section>

          @if (store.mode === 'demo') {
          <section class="card">
            <div class="card-head"><h2>Asesores</h2><span class="spacer"></span><button class="btn sm" (click)="s.advisors.push({ id: newId(), name: '', email: '', active: true })"><app-icon name="plus" [size]="13" /> Asesor</button></div>
            <div class="card-pad col">
              <small class="muted">El bot asigna las conversaciones calificadas en rotación entre los asesores activos.</small>
              @for (a of s.advisors; track a.id) {
                <div class="row">
                  <input class="input" placeholder="Nombre" [(ngModel)]="a.name" />
                  <input class="input" placeholder="Correo" [(ngModel)]="a.email" />
                  <label class="row" style="white-space:nowrap"><span class="switch"><input type="checkbox" [(ngModel)]="a.active" /><span></span></span> Activo</label>
                  <button class="btn ghost icon-only sm" (click)="s.advisors.splice($index, 1)"><app-icon name="trash" [size]="14" /></button>
                </div>
              }
            </div>
          </section>
          }

          <section class="card">
            <div class="card-head"><h2>Reglas comerciales al cerrar</h2><span class="spacer"></span><button class="btn sm" (click)="s.discounts.push({ label: '', value: '' })"><app-icon name="plus" [size]="13" /> Regla</button></div>
            <div class="card-pad col">
              <small class="muted">Referencia para los asesores. El bot nunca da precios ni descuentos.</small>
              @for (r of s.discounts; track $index) {
                <div class="row">
                  <input class="input" style="max-width:280px" [(ngModel)]="r.label" />
                  <input class="input" [(ngModel)]="r.value" />
                  <button class="btn ghost icon-only sm" (click)="s.discounts.splice($index, 1)"><app-icon name="x" [size]="14" /></button>
                </div>
              }
            </div>
          </section>

          @if (store.mode === 'server' && auth.isAdmin()) {
            <app-users-panel />
          }

          <section class="card">
            <div class="card-head"><h2>Datos</h2></div>
            <div class="card-pad row wrap">
              @if (store.mode === 'demo') {
                <button class="btn" (click)="resetDemo()"><app-icon name="refresh" [size]="14" /> Reiniciar datos de demostración</button>
                <small class="muted">Estás en modo demo: los datos viven en este navegador. Pon <code>demo: false</code> en <code>frontend/src/environments/environment.ts</code> para usar el servidor.</small>
              } @else {
                <button class="btn" (click)="store.seedDefaults()"><app-icon name="refresh" [size]="14" /> Cargar catálogo, plantillas y flujo por defecto</button>
              }
            </div>
          </section>
        </div>
      </div>
    }
  `,
  styles: `
    .day { display: grid; grid-template-columns: 110px 1fr; align-items: center; gap: 10px; }
  `,
})
export class Settings {
  readonly store = inject(CrmStore);
  readonly auth = inject(AuthService);
  readonly days = DAYS;
  readonly s = signal<CrmSettings | null>(null);

  constructor() {
    effect(() => {
      const cur = this.store.settings();
      untracked(() => this.s.set(structuredClone(cur)));
    });
  }

  newId(): string {
    return newId('adv_');
  }

  setDay(s: CrmSettings, day: string, v: string): void {
    s.hours.days[day] = v.split(',').map((x) => x.trim()).filter((x) => /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(x));
  }

  async save(): Promise<void> {
    const s = this.s();
    if (!s) return;
    s.hotThreshold = Number(s.hotThreshold) || 70;
    s.minMessagesForHot = Number(s.minMessagesForHot) || 3;
    await this.store.saveSettings(structuredClone(s));
    this.store.toast('Configuración guardada', 'success');
  }

  resetDemo(): void {
    if (confirm('¿Borrar todo y volver a cargar los datos de ejemplo?')) {
      this.store.resetDemo();
      this.store.toast('Datos de demostración restaurados', 'success');
    }
  }
}
