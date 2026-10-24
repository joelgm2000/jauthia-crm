import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STAGES, weightedValue } from '@shared/flow';
import { DAY } from '@shared/time';
import { CHANNEL_LABELS, ChannelType } from '@shared/models';
import { CrmStore } from '../../core/data/crm-store';
import { CHANNEL_COLORS, ChannelIcon } from '../../ui/channel-icon';
import { Icon } from '../../ui/icon';
import { AgoPipe, CopPipe, InitialsPipe } from '../../ui/pipes';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, Icon, ChannelIcon, AgoPipe, CopPipe, InitialsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Hola, equipo {{ store.settings().companyName }} 👋</h1>
          <p>Así va el embudo de WhatsApp, redes sociales y chatbot.</p>
        </div>
        <span class="spacer"></span>
        <a class="btn primary" routerLink="/inbox"><app-icon name="inbox" [size]="15" /> Ir a la bandeja</a>
      </div>

      <div class="kpis">
        <div class="kpi card">
          <span class="ic" style="--c:#0ea5e9"><app-icon name="users" /></span>
          <small>Leads nuevos (7 días)</small><b>{{ newLeads() }}</b>
        </div>
        <div class="kpi card">
          <span class="ic" style="--c:#8b5cf6"><app-icon name="bot" /></span>
          <small>Atendidos por el bot</small><b>{{ botShare() }}%</b>
        </div>
        <div class="kpi card hot">
          <span class="ic" style="--c:#ff4d2e"><app-icon name="flame" /></span>
          <small>A punto de comprar</small><b>{{ store.hotLeads().length }}</b>
        </div>
        <div class="kpi card">
          <span class="ic" style="--c:#f59e0b"><app-icon name="money" /></span>
          <small>Pipeline ponderado</small><b>{{ weighted() | cop: true }}</b>
        </div>
        <div class="kpi card">
          <span class="ic" style="--c:#10b981"><app-icon name="trend" /></span>
          <small>Ventas ganadas</small><b>{{ won().count }} · {{ won().value | cop: true }}</b>
        </div>
      </div>

      <div class="grid">
        <section class="card">
          <div class="card-head"><h2>Embudo por etapa</h2><span class="spacer"></span><a routerLink="/pipeline" class="btn ghost sm">Ver tablero</a></div>
          <div class="card-pad funnel">
            @for (s of funnel(); track s.id) {
              <div class="frow">
                <span class="fname">{{ s.name }}</span>
                <div class="fbar"><i [style.width.%]="s.pct" [style.background]="s.color"></i></div>
                <b>{{ s.count }}</b>
              </div>
            }
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Conversaciones por canal</h2></div>
          <div class="card-pad funnel">
            @for (c of byChannel(); track c.ch) {
              <div class="frow">
                <span class="fname row"><app-channel-icon [channel]="c.ch" [size]="16" /> {{ c.label }}</span>
                <div class="fbar"><i [style.width.%]="c.pct" [style.background]="c.color"></i></div>
                <b>{{ c.count }}</b>
              </div>
            } @empty { <div class="empty">Sin conversaciones aún.</div> }
          </div>
        </section>

        <section class="card">
          <div class="card-head"><app-icon name="flame" [size]="16" style="color:var(--hot)" /><h2>Listos para cerrar</h2></div>
          <div class="people">
            @for (c of store.hotLeads(); track c.id) {
              <a class="person" [routerLink]="['/inbox', c.id]">
                <span class="avatar" [style.background]="c.avatarColor" style="width:34px;height:34px;font-size:12px">{{ c.name | initials }}</span>
                <span class="pm"><b>{{ c.name }}</b><small>{{ c.fields.modeloInteres || c.fields.subcategoria || 'Sin producto' }} · {{ c.fields.ciudad }}</small></span>
                <span class="badge hot">{{ c.score }}%</span>
              </a>
            } @empty { <div class="empty">Cuando un cliente muestre intención de compra aparecerá aquí.</div> }
          </div>
        </section>

        <section class="card">
          <div class="card-head"><app-icon name="tasks" [size]="16" /><h2>Tareas pendientes</h2><span class="spacer"></span><a routerLink="/tasks" class="btn ghost sm">Ver todas</a></div>
          <div class="people">
            @for (t of store.openTasks().slice(0, 6); track t.id) {
              <a class="person" [routerLink]="['/inbox', t.conversationId]">
                <span class="tdot" [class.late]="t.dueAt < now"></span>
                <span class="pm"><b>{{ t.title }}</b><small>{{ t.detail }}</small></span>
                @if (t.priority === 'alta') { <span class="badge high">Alta</span> }
                <small>{{ t.dueAt | ago }}</small>
              </a>
            } @empty { <div class="empty">Todo al día ✨</div> }
          </div>
        </section>

        <section class="card span2">
          <div class="card-head"><h2>Productos más pedidos en el chat</h2></div>
          <div class="card-pad prods">
            @for (p of topProducts(); track p.name) {
              <div class="prod">
                <img [src]="p.img" [alt]="p.name" />
                <div><b>{{ p.name }}</b><small>{{ p.count }} conversación(es)</small></div>
              </div>
            } @empty { <div class="empty">Aún no hay interés registrado.</div> }
          </div>
        </section>
      </div>
    </div>
  `,
  styles: `
    .kpi.hot { border-color: #ffc4b4; }
    .ic { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; color: var(--c); background: color-mix(in srgb, var(--c) 13%, transparent); margin-bottom: 6px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
    .grid > * { min-width: 0; }
    .span2 { grid-column: span 2; }
    .funnel { display: flex; flex-direction: column; gap: 10px; }
    .frow { display: grid; grid-template-columns: 200px 1fr 36px; align-items: center; gap: 10px; }
    .fname { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fbar { height: 12px; background: var(--hover); border-radius: 8px; overflow: hidden; }
    .fbar i { display: block; height: 100%; border-radius: 8px; min-width: 4px; transition: width .4s; }
    .frow b { text-align: right; }
    .people { display: flex; flex-direction: column; }
    .person { display: flex; align-items: center; gap: 10px; padding: 10px 18px; border-bottom: 1px solid var(--line); color: var(--text); }
    .person:hover { background: var(--panel-2); }
    .person:last-child { border: 0; }
    .pm { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .pm small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tdot { width: 10px; height: 10px; border-radius: 50%; background: var(--warn); flex: none; }
    .tdot.late { background: var(--danger); }
    .prods { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    .prod { display: flex; gap: 10px; align-items: center; border: 1px solid var(--line); border-radius: 12px; padding: 8px; }
    .prod img { width: 64px; height: 48px; object-fit: cover; border-radius: 8px; }
    .prod div { display: flex; flex-direction: column; }
    @media (max-width: 1200px) { .kpis { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .span2 { grid-column: auto; } .kpis { grid-template-columns: 1fr 1fr; } .frow { grid-template-columns: 120px 1fr 30px; } }
  `,
})
export class Dashboard {
  readonly store = inject(CrmStore);
  readonly now = Date.now();

  readonly newLeads = computed(() => this.store.conversations().filter((c) => c.createdAt > this.now - 7 * DAY).length);
  readonly botShare = computed(() => {
    const all = this.store.conversations();
    if (!all.length) return 0;
    const byBot = all.filter((c) => c.bot.nodeId && c.bot.nodeId !== '').length;
    return Math.round((byBot / all.length) * 100);
  });
  readonly weighted = computed(() => weightedValue(this.store.conversations()));
  readonly won = computed(() => {
    const w = this.store.conversations().filter((c) => c.stage === 'ganado' || c.stage === 'entrega');
    return { count: w.length, value: w.reduce((n, c) => n + (c.value || 0), 0) };
  });
  readonly funnel = computed(() => {
    const all = this.store.conversations();
    const max = Math.max(1, ...STAGES.map((s) => all.filter((c) => c.stage === s.id).length));
    return STAGES.map((s) => {
      const count = all.filter((c) => c.stage === s.id).length;
      return { ...s, count, pct: (count / max) * 100 };
    });
  });
  readonly byChannel = computed(() => {
    const all = this.store.conversations();
    const map = new Map<ChannelType, number>();
    all.forEach((c) => map.set(c.channel, (map.get(c.channel) ?? 0) + 1));
    const max = Math.max(1, ...map.values());
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([ch, count]) => ({ ch, count, label: CHANNEL_LABELS[ch], color: CHANNEL_COLORS[ch], pct: (count / max) * 100 }));
  });
  readonly topProducts = computed(() => {
    const prods = this.store.products();
    const count = new Map<string, number>();
    for (const c of this.store.conversations()) {
      const ids = new Set([...(c.bot.lastProductIds ?? []), ...(c.intent?.productIds ?? [])]);
      ids.forEach((id) => count.set(id, (count.get(id) ?? 0) + 1));
    }
    return [...count.entries()]
      .map(([id, n]) => ({ p: prods.find((p) => p.id === id), n }))
      .filter((x) => x.p)
      .sort((a, b) => b.n - a.n)
      .slice(0, 8)
      .map((x) => ({ name: x.p!.name, img: x.p!.imageUrl, count: x.n }));
  });
}
