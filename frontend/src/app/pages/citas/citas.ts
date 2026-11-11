import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CITA_KIND_LABEL, CITA_STATUS_LABEL, Cita, CitaStatus, citasOf, dateKeyOf, dayLong, dayTitle, minutesOf, timeLabel } from '@shared/citas';
import { cartText } from '@shared/products';
import { Conversation } from '@shared/models';
import { AuthService } from '../../core/auth.service';
import { CrmStore } from '../../core/data/crm-store';
import { ChannelIcon } from '../../ui/channel-icon';
import { Icon } from '../../ui/icon';

interface Row {
  conv: Conversation;
  cita: Cita;
}

/** Citas que los clientes agendaron con el bot: en la tienda o por videollamada. */
@Component({
  selector: 'app-citas',
  imports: [RouterLink, Icon, ChannelIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" style="max-width:980px">
      <div class="page-head">
        <div><h1>Citas</h1><p>Los clientes eligen por el chat el día y la hora en que pasan por la tienda, o una videollamada si no pueden venir.</p></div>
        <span class="spacer"></span>
        <div class="row">
          <button class="chip" [class.on]="!history()" (click)="history.set(false)">Próximas ({{ upcoming().length }})</button>
          <button class="chip" [class.on]="history()" (click)="history.set(true)">Historial</button>
        </div>
      </div>

      @if (!enabled()) {
        <div class="card card-pad notice">
          <app-icon name="info" [size]="16" />
          <span>Las citas están apagadas: el bot no las ofrece.
            @if (auth.isAdmin()) { Actívalas en <a routerLink="/flow">Flujo del bot → Citas</a>. } @else { Pídele al administrador que las active. }</span>
        </div>
      }

      @for (g of groups(); track g.key) {
        <h3 class="day">{{ g.title }}</h3>
        <div class="card">
          @for (r of g.rows; track r.conv.id) {
            <div class="cita" [class.closed]="r.cita.status !== 'agendada'">
              <div class="hour">{{ time(r.cita.at) }}</div>
              <div class="cm">
                <div class="row wrap"><app-channel-icon [channel]="r.conv.channel" [size]="14" /> <b>{{ r.conv.name }}</b>
                  <span class="badge" [class.info]="r.cita.kind === 'videollamada'">{{ kind[r.cita.kind ?? 'tienda'] }}</span>
                  <span class="badge" [class.ok]="r.cita.status === 'asistio'" [class.warn]="r.cita.status === 'no_vino'" [class.gray]="r.cita.status === 'cancelada'">{{ status[r.cita.status] }}</span>
                </div>
                <small class="muted">{{ r.conv.phone || r.conv.externalId }}@if (r.conv.fields.ciudad) { · {{ r.conv.fields.ciudad }} }</small>
                @if (interest(r.conv); as i) { <small>{{ i }}</small> }
                <small class="muted">Asesor: {{ advisor(r.conv.assignedTo) }}</small>
              </div>
              <div class="actions">
                <a class="btn sm" [routerLink]="['/inbox', r.conv.id]"><app-icon name="inbox" [size]="13" /> Abrir chat</a>
                @if (r.cita.status === 'agendada') {
                  <button class="btn sm" (click)="set(r, 'asistio')"><app-icon name="check" [size]="13" /> {{ r.cita.kind === 'videollamada' ? 'Se hizo' : 'Asistió' }}</button>
                  <button class="btn sm" (click)="set(r, 'no_vino')">No {{ r.cita.kind === 'videollamada' ? 'contestó' : 'vino' }}</button>
                  <button class="btn sm ghost" (click)="set(r, 'cancelada')">Cancelar</button>
                } @else {
                  <button class="btn sm ghost" (click)="set(r, 'agendada')">Volver a agendada</button>
                }
              </div>
            </div>
          }
        </div>
      } @empty {
        <div class="card"><div class="empty">{{ history() ? 'Aún no hay citas pasadas.' : 'No hay citas próximas 📅' }}</div></div>
      }
    </div>
  `,
  styles: `
    .notice { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; }
    .day { margin: 18px 0 8px; font-size: 14px; color: var(--muted); }
    .cita { display: flex; gap: 14px; align-items: flex-start; padding: 14px 18px; border-bottom: 1px solid var(--line); }
    .cita:last-child { border: 0; }
    .hour { font-weight: 700; font-size: 15px; min-width: 72px; padding-top: 1px; }
    .cm { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .cm .row { gap: 6px; align-items: center; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; max-width: 320px; }
    .closed .cm, .closed .hour { opacity: .6; }
    @media (max-width: 640px) {
      .cita { flex-wrap: wrap; }
      .actions { max-width: none; width: 100%; justify-content: flex-start; }
    }
  `,
})
export class Citas {
  readonly store = inject(CrmStore);
  readonly auth = inject(AuthService);
  readonly history = signal(false);
  readonly status = CITA_STATUS_LABEL;
  readonly kind = CITA_KIND_LABEL;
  readonly enabled = computed(() => citasOf(this.store.flow()).enabled);
  private readonly tz = computed(() => this.store.settings().hours.timezone);
  private readonly today = computed(() => dateKeyOf(Date.now(), this.tz()));

  private readonly all = computed<Row[]>(() =>
    this.store.conversations().filter((c) => !!c.cita).map((c) => ({ conv: c, cita: c.cita! })),
  );
  /** Agendadas desde hoy en adelante (las de hoy aunque ya haya pasado la hora). */
  readonly upcoming = computed(() =>
    this.all()
      .filter((r) => r.cita.status === 'agendada' && dateKeyOf(r.cita.at, this.tz()) >= this.today())
      .sort((a, b) => a.cita.at - b.cita.at),
  );
  private readonly past = computed(() => {
    const up = new Set(this.upcoming());
    return this.all().filter((r) => !up.has(r)).sort((a, b) => b.cita.at - a.cita.at);
  });
  readonly groups = computed(() => {
    const rows = this.history() ? this.past() : this.upcoming();
    const out: { key: string; title: string; rows: Row[] }[] = [];
    for (const r of rows) {
      const key = dateKeyOf(r.cita.at, this.tz());
      let g = out.find((x) => x.key === key);
      if (!g) {
        const t = dayTitle(key, this.today());
        const long = dayLong(key);
        g = { key, title: t === 'Hoy' || t === 'Mañana' ? `${t} · ${long}` : long.charAt(0).toUpperCase() + long.slice(1), rows: [] };
        out.push(g);
      }
      g.rows.push(r);
    }
    return out;
  });

  time(at: number): string {
    return timeLabel(minutesOf(at, this.tz()));
  }

  interest(c: Conversation): string {
    if (c.cart?.length) return `Pedido: ${cartText(c.cart)}`;
    return c.fields.modeloInteres ? `Le interesa: ${c.fields.modeloInteres}` : '';
  }

  advisor(id: string | null | undefined): string {
    return this.store.settings().advisors.find((a) => a.id === id)?.name ?? 'Sin asignar';
  }

  set(r: Row, status: CitaStatus): void {
    void this.store.editConversation(r.conv.id, { cita: { ...r.cita, status } });
  }
}
