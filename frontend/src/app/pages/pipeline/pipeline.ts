import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { isClosed, STAGES, weightedValue } from '@shared/flow';
import { CHANNEL_LABELS, ChannelType, Conversation, StageDef, StageId } from '@shared/models';
import { CrmStore } from '../../core/data/crm-store';
import { intentEmoji } from '../../ui/labels';
import { ChannelIcon } from '../../ui/channel-icon';
import { Icon } from '../../ui/icon';
import { AgoPipe, CopPipe, InitialsPipe } from '../../ui/pipes';

interface Column {
  stage: StageDef;
  items: Conversation[];
  total: number;
}

@Component({
  selector: 'app-pipeline',
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, Icon, ChannelIcon, AgoPipe, CopPipe, InitialsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page wide">
      <div class="page-head">
        <div>
          <h1>Embudo de ventas</h1>
          <p>Las tarjetas avanzan solas cuando el bot detecta señales de compra. Arrástralas para moverlas a mano.</p>
        </div>
        <span class="spacer"></span>
        <div class="kpis">
          <div><small>En el embudo</small><b>{{ openCount() }}</b></div>
          <div><small>Valor ponderado</small><b>{{ weighted() | cop: true }}</b></div>
          <div class="hot"><small>🔥 A punto de comprar</small><b>{{ store.hotLeads().length }}</b></div>
        </div>
      </div>

      <div class="filters row wrap">
        <button class="chip" [class.on]="onlyHot()" (click)="onlyHot.set(!onlyHot())"><app-icon name="flame" [size]="13" /> Solo calientes</button>
        <button class="chip" [class.on]="showClosed()" (click)="showClosed.set(!showClosed())">Mostrar ganados/perdidos</button>
        <span class="sep"></span>
        <button class="chip" [class.on]="channel() === 'all'" (click)="channel.set('all')">Todos los canales</button>
        @for (ch of channels; track ch) {
          <button class="chip" [class.on]="channel() === ch" (click)="channel.set(ch)"><app-channel-icon [channel]="ch" [size]="14" /> {{ labels[ch] }}</button>
        }
      </div>

      @if (store.hotLeads().length && !onlyHot()) {
        <div class="hot-strip">
          <app-icon name="flame" [size]="18" />
          <b>Listos para cerrar:</b>
          @for (c of store.hotLeads().slice(0, 6); track c.id) {
            <button class="hot-chip" (click)="open(c)">
              <span class="avatar" [style.background]="c.avatarColor" style="width:22px;height:22px;font-size:10px">{{ c.name | initials }}</span>
              {{ c.name }} · {{ c.score }}%
            </button>
          }
        </div>
      }

      <div class="board" cdkDropListGroup>
        @for (col of columns(); track col.stage.id) {
          <section class="column" [style.--c]="col.stage.color">
            <header>
              <div class="row"><i class="dot"></i><b>{{ col.stage.name }}</b><span class="count">{{ col.items.length }}</span></div>
              <small>{{ col.total | cop: true }} · {{ col.stage.actor }}</small>
            </header>
            <div class="drop" cdkDropList [cdkDropListData]="col.stage.id" (cdkDropListDropped)="drop($event)">
              @for (c of col.items; track c.id) {
                <article class="deal" cdkDrag [cdkDragData]="c" [class.is-hot]="c.hot" (click)="open(c)">
                  <div class="row">
                    <span class="avatar" [style.background]="c.avatarColor" style="width:30px;height:30px;font-size:11px">{{ c.name | initials }}</span>
                    <div class="who">
                      <b>{{ c.name }}</b>
                      <small><app-channel-icon [channel]="c.channel" [size]="12" /> {{ c.fields.ciudad || labels[c.channel] }}</small>
                    </div>
                    @if (c.hot) { <span class="flame" title="A punto de comprar"><app-icon name="flame" [size]="16" /></span> }
                  </div>
                  @if (c.fields.modeloInteres || c.fields.subcategoria) {
                    <div class="product"><app-icon name="box" [size]="13" /> {{ c.fields.modeloInteres || c.fields.subcategoria }}</div>
                  }
                  @if (c.intent) {
                    <div class="intent">{{ emoji(c.intent.type) }} {{ c.intent.text }}</div>
                  }
                  <div class="score-bar"><i [style.width.%]="c.score"></i></div>
                  <div class="row foot">
                    <b class="val">{{ c.value | cop: true }}</b>
                    @if (c.priority === 'alta') { <span class="badge high">Alta</span> }
                    <span class="spacer"></span>
                    @if (c.botActive) { <span class="mini" title="Atiende el bot"><app-icon name="bot" [size]="12" /></span> }
                    <small><app-icon name="clock" [size]="11" /> {{ c.stageChangedAt | ago }}</small>
                  </div>
                </article>
              } @empty {
                <div class="col-empty">Arrastra aquí</div>
              }
            </div>
          </section>
        }
      </div>
    </div>
  `,
  styles: `
    .page.wide { max-width: none; height: 100vh; display: flex; flex-direction: column; }
    .kpis { display: flex; gap: 10px; }
    .kpis > div { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 8px 14px; display: flex; flex-direction: column; min-width: 120px; }
    .kpis b { font-size: 18px; }
    .kpis .hot { border-color: #ffc4b4; background: #fff4f0; }
    :root[data-theme='dark'] .kpis .hot { background: #2a1510; border-color: #5a2a1c; }
    .filters { margin-bottom: 12px; }
    .sep { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
    .hot-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 14px; border-radius: 12px; background: linear-gradient(90deg, #fff1ec, #fff8f2); color: #9a2a10; margin-bottom: 12px; }
    :root[data-theme='dark'] .hot-strip { background: #2a1510; color: #ffb4a0; }
    .hot-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #ffc4b4; background: #fff; border-radius: 999px; padding: 3px 10px 3px 3px; font-weight: 600; font-size: 12px; cursor: pointer; color: #9a2a10; }
    :root[data-theme='dark'] .hot-chip { background: #3a1d14; border-color: #5a2a1c; color: #ffb4a0; }
    .board { flex: 1; display: flex; gap: 12px; overflow-x: auto; padding-bottom: 12px; min-height: 0; }
    .column { flex: 0 0 280px; display: flex; flex-direction: column; background: var(--panel-2); border: 1px solid var(--line); border-radius: 14px; min-height: 0; }
    .column header { padding: 12px 12px 8px; border-top: 3px solid var(--c); border-radius: 14px 14px 0 0; }
    .column header small { display: block; margin-top: 2px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
    .count { margin-left: auto; font-size: 12px; font-weight: 700; background: var(--hover); border-radius: 10px; padding: 1px 8px; }
    .drop { flex: 1; overflow-y: auto; padding: 4px 8px 10px; display: flex; flex-direction: column; gap: 8px; min-height: 80px; }
    .deal { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 7px; cursor: grab; box-shadow: var(--shadow); transition: box-shadow .15s, transform .15s; }
    .deal:hover { box-shadow: 0 6px 16px rgba(16,24,40,.12); }
    .deal.is-hot { border-color: #ffb4a0; box-shadow: 0 0 0 3px rgba(255, 77, 46, .12); }
    .who { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .who b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .who small { display: flex; align-items: center; gap: 4px; font-size: 12px; }
    .flame { color: var(--hot); animation: pulse 1.6s infinite; }
    @keyframes pulse { 50% { transform: scale(1.15); } }
    .product { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; background: var(--hover); border-radius: 7px; padding: 4px 7px; text-transform: capitalize; }
    .intent { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .foot small { display: inline-flex; gap: 3px; align-items: center; font-size: 11px; }
    .val { font-size: 13px; }
    .mini { color: #1d4ed8; }
    .col-empty { text-align: center; color: var(--muted); font-size: 12px; padding: 18px; border: 2px dashed var(--line); border-radius: 10px; }
    .cdk-drag-preview { box-shadow: var(--shadow-lg); border-radius: 12px; }
    .cdk-drag-placeholder { opacity: .35; }
    .cdk-drop-list-dragging .deal:not(.cdk-drag-placeholder) { transition: transform 200ms cubic-bezier(0, 0, .2, 1); }
  `,
})
export class Pipeline {
  readonly store = inject(CrmStore);
  private router = inject(Router);
  readonly labels = CHANNEL_LABELS;
  readonly channels = Object.keys(CHANNEL_LABELS) as ChannelType[];
  readonly onlyHot = signal(false);
  readonly showClosed = signal(false);
  readonly channel = signal<ChannelType | 'all'>('all');
  readonly emoji = intentEmoji;

  readonly columns = computed<Column[]>(() => {
    const convs = this.store
      .conversations()
      .filter((c) => (!this.onlyHot() || c.hot) && (this.channel() === 'all' || c.channel === this.channel()));
    return STAGES.filter((s) => this.showClosed() || !isClosed(s.id)).map((stage) => {
      const items = convs
        .filter((c) => c.stage === stage.id)
        .sort((a, b) => Number(b.hot) - Number(a.hot) || b.score - a.score || b.lastMessageAt - a.lastMessageAt);
      return { stage, items, total: items.reduce((n, c) => n + (c.value || 0), 0) };
    });
  });

  readonly openCount = computed(() => this.store.conversations().filter((c) => !isClosed(c.stage)).length);
  readonly weighted = computed(() => weightedValue(this.store.conversations()));

  drop(e: CdkDragDrop<StageId>): void {
    const conv = e.item.data as Conversation;
    if (e.container.data !== conv.stage) this.store.setStage(conv.id, e.container.data);
  }

  open(c: Conversation): void {
    this.router.navigate(['/inbox', c.id]);
  }
}
