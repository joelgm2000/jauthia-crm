import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ChatMessage, QuickButton } from '@shared/models';
import { Icon } from './icon';
import { HourPipe, WaFormatPipe } from './pipes';

export interface ButtonPick {
  id: string;
  title: string;
}

/**
 * Burbuja de chat con los formatos interactivos de WhatsApp:
 * texto, botones de respuesta rápida, lista, carrusel de productos y ficha de producto.
 */
@Component({
  selector: 'app-message-bubble',
  imports: [Icon, WaFormatPipe, HourPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'hostClass()' },
  template: `
    @let m = msg();
    @if (m.type === 'note') {
      <div class="note"><app-icon name="note" [size]="13" /> <span [innerHTML]="m.text | wa"></span> <time>{{ m.createdAt | hour }}</time></div>
    } @else if (m.type === 'carousel') {
      <div class="who">{{ who() }}</div>
      @if (m.text) { <div class="bubble"><span [innerHTML]="m.text | wa"></span></div> }
      <div class="carousel">
        @for (c of m.cards; track c.productId) {
          <article class="pcard">
            <img [src]="c.imageUrl" [alt]="c.title" loading="lazy" />
            <div class="card-body">
              <b>{{ c.title }}</b>
              <small>{{ c.subtitle }}</small>
            </div>
            @for (b of c.buttons; track b.id) {
              <button class="qbtn" [disabled]="!interactive()" (click)="pick.emit({ id: b.id, title: b.title })">
                <app-icon [name]="b.id.startsWith('det_') ? 'info' : 'cart'" [size]="14" /> {{ b.title }}
              </button>
            }
          </article>
        }
      </div>
      <time class="t">{{ m.createdAt | hour }} @if (m.direction === 'out') { <app-icon [name]="m.status === 'read' ? 'checks' : 'check'" [size]="13" [class.read]="m.status === 'read'" /> }</time>
    } @else {
      <div class="who">{{ who() }}</div>
      <div class="bubble" [class.has-img]="!!m.imageUrl || !!m.videoUrl">
        @if (m.imageUrl) { <img class="hero" [src]="m.imageUrl" [alt]="m.header || 'imagen'" loading="lazy" /> }
        @if (m.videoUrl) { <video class="hero" [src]="m.videoUrl" controls preload="metadata" playsinline></video> }
        @if (m.header) { <div class="header">{{ m.header }}</div> }
        <div class="text" [innerHTML]="m.text | wa"></div>
        @if (m.footer) { <div class="footer">{{ m.footer }}</div> }
        <time>{{ m.createdAt | hour }} @if (m.direction === 'out') { <app-icon [name]="m.status === 'read' ? 'checks' : m.status === 'failed' ? 'x' : m.status === 'pending' ? 'clock' : 'check'" [size]="13" [class.read]="m.status === 'read'" /> }</time>
      </div>
      @if ((m.type === 'buttons' || m.type === 'product' || m.type === 'template') && m.buttons?.length) {
        <div class="qbtns">
          @for (b of m.buttons; track b.id) {
            <button class="qbtn" [disabled]="!interactive()" (click)="pick.emit({ id: b.id, title: b.title })">{{ b.title }}</button>
          }
        </div>
      }
      @if (m.type === 'list' && m.buttons?.length) {
        <div class="qbtns">
          <button class="qbtn" (click)="listOpen.set(!listOpen())"><app-icon name="list" [size]="14" /> {{ m.listButton || 'Ver opciones' }}</button>
        </div>
        @if (listOpen()) {
          <div class="list-sheet">
            @for (b of m.buttons; track b.id) {
              <button [disabled]="!interactive()" (click)="choose(b)">
                <span><b>{{ b.title }}</b>@if (b.description) { <small>{{ b.description }}</small> }</span>
                <i class="radio"></i>
              </button>
            }
          </div>
        }
      }
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; max-width: min(78%, 560px); margin: 2px 0; }
    :host(.in) { align-self: flex-start; }
    :host(.out) { align-self: flex-end; align-items: flex-end; }
    :host(.sys) { align-self: center; max-width: 90%; }
    :host(.carousel-host) { max-width: 100%; }
    .who { font-size: 11px; color: var(--muted); margin: 6px 6px 2px; }
    :host(.in) .who { display: none; }
    .bubble { position: relative; padding: 7px 10px 6px; border-radius: 10px; background: var(--bubble-in); box-shadow: 0 1px .5px rgba(0,0,0,.13); color: var(--text); font-size: 14px; line-height: 1.4; overflow-wrap: anywhere; }
    :host(.out) .bubble { background: var(--bubble-out); }
    :host(.bot) .bubble { background: var(--bubble-bot); }
    .bubble.has-img { padding: 4px 4px 6px; max-width: 320px; }
    .bubble.has-img .text, .bubble.has-img .header, .bubble.has-img .footer { padding: 0 6px; }
    .hero { display: block; width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 7px; margin-bottom: 6px; }
    video.hero { object-fit: contain; background: #000; }
    .header { font-weight: 700; margin-bottom: 2px; }
    .footer { font-size: 12px; color: var(--muted); margin-top: 4px; }
    time { display: flex; gap: 3px; align-items: center; justify-content: flex-end; font-size: 11px; color: var(--muted); margin-top: 2px; }
    time .read { color: #34b7f1; }
    .t { margin: 2px 8px; }
    .qbtns { display: flex; flex-direction: column; gap: 3px; margin-top: 3px; width: 100%; min-width: 220px; max-width: 320px; }
    .qbtn { display: flex; align-items: center; justify-content: center; gap: 6px; background: var(--bubble-in); color: var(--wa-link); border: 0; border-radius: 8px; padding: 9px 10px; font-weight: 600; font-size: 14px; box-shadow: 0 1px .5px rgba(0,0,0,.13); cursor: pointer; }
    .qbtn:disabled { cursor: default; }
    .qbtn:not(:disabled):hover { filter: brightness(.96); }
    .carousel { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 8px; scroll-snap-type: x mandatory; max-width: 100%; }
    .pcard { flex: 0 0 220px; scroll-snap-align: start; background: var(--bubble-in); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.15); display: flex; flex-direction: column; }
    .pcard img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; }
    .card-body { padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .card-body b { font-size: 14px; }
    .card-body small { color: var(--muted); font-size: 12px; line-height: 1.3; }
    .pcard .qbtn { border-radius: 0; box-shadow: none; border-top: 1px solid var(--line); }
    .list-sheet { margin-top: 4px; background: var(--bubble-in); border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,.15); width: 300px; overflow: hidden; }
    .list-sheet button { display: flex; width: 100%; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--text); text-align: left; cursor: pointer; }
    .list-sheet button:not(:disabled):hover { background: var(--hover); }
    .list-sheet span { display: flex; flex-direction: column; }
    .list-sheet small { color: var(--muted); }
    .radio { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--muted); flex: none; }
    .note { display: flex; align-items: center; gap: 6px; background: var(--note-bg); color: var(--note-fg); font-size: 12px; padding: 5px 10px; border-radius: 8px; margin: 4px 0; }
    .note time { margin: 0 0 0 6px; }
    :host ::ng-deep .var { background: #ffe9a8; color: #6b4e00; border-radius: 4px; padding: 0 3px; }
  `,
})
export class MessageBubble {
  readonly msg = input.required<ChatMessage>();
  /** true en el simulador: el asesor puede tocar los botones como si fuera el cliente. */
  readonly interactive = input(false);
  readonly pick = output<ButtonPick>();
  readonly listOpen = signal(false);

  readonly hostClass = computed(() => {
    const m = this.msg();
    if (m.type === 'note') return 'sys';
    return [m.direction, m.sender === 'bot' ? 'bot' : '', m.type === 'carousel' ? 'carousel-host' : ''].join(' ');
  });

  readonly who = computed(() => {
    const m = this.msg();
    if (m.sender === 'bot') return '🤖 Bot';
    if (m.sender === 'asesor') return m.authorName ?? 'Asesor';
    return '';
  });

  choose(b: QuickButton): void {
    this.listOpen.set(false);
    this.pick.emit({ id: b.id, title: b.title });
  }
}
