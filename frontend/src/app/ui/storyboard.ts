import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SHOT_LABEL, StoryFrame } from '@shared/market';

/**
 * Guion en viñetas, como una historieta: cada escena con un dibujo según el tipo de toma
 * (hablando a cámara, producto, primer plano…), el texto en pantalla encima, y debajo qué grabar y qué decir.
 */
@Component({
  selector: 'app-storyboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="strip">
      @for (f of frames(); track $index) {
        <figure class="frame">
          <div class="panel">
            <span class="num">{{ $index + 1 }}</span>
            @if (f.time) { <span class="time">{{ f.time }}</span> }
            <svg viewBox="0 0 120 150" role="img" [attr.aria-label]="label[f.shot]">
              @switch (f.shot) {
                @case ('cara') {
                  <circle cx="52" cy="62" r="20" class="skin" />
                  <path d="M33 58c2-16 36-18 39 0" class="hair" />
                  <circle cx="45" cy="62" r="2" class="ink-f" /><circle cx="59" cy="62" r="2" class="ink-f" />
                  <path d="M45 71q7 6 14 0" class="ink" />
                  <path d="M18 150c0-28 15-44 34-44s34 16 34 44" class="shirt" />
                  <path d="M76 26h34a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H90l-8 9v-9h-6a6 6 0 0 1-6-6V32a6 6 0 0 1 6-6z" class="bubble" />
                  <path d="M80 37h26M80 44h18" class="ink" />
                }
                @case ('producto') {
                  <ellipse cx="60" cy="122" rx="40" ry="8" class="shade" />
                  <rect x="30" y="52" width="60" height="66" rx="6" class="brand" />
                  <path d="M30 70h60" class="light" />
                  <rect x="44" y="82" width="32" height="22" rx="3" class="light-f" />
                  <path d="M20 34l4 8 8 4-8 4-4 8-4-8-8-4 8-4z" class="spark" />
                  <path d="M100 22l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" class="spark" />
                }
                @case ('detalle') {
                  <rect x="16" y="70" width="54" height="56" rx="6" class="brand" />
                  <circle cx="72" cy="66" r="28" class="lens" />
                  <circle cx="72" cy="66" r="20" class="lens-in" />
                  <path d="M64 60l6 6 10-12" class="ink" />
                  <path d="M92 86l18 20" class="handle" />
                }
                @case ('uso') {
                  <circle cx="60" cy="34" r="12" class="skin" />
                  <path d="M60 46v42M60 58l-24 12M60 58l24-12M60 88l-16 34M60 88l16 34" class="body" />
                  <rect x="80" y="36" width="22" height="10" rx="3" class="brand" />
                  <rect x="18" y="64" width="22" height="10" rx="3" class="brand" />
                  <path d="M10 128h100" class="ground" />
                  <path d="M98 20q8 4 6 12M104 14q12 8 8 22" class="motion" />
                }
                @case ('antes_despues') {
                  <rect x="6" y="20" width="52" height="110" rx="6" class="before" />
                  <rect x="62" y="20" width="52" height="110" rx="6" class="after" />
                  <circle cx="32" cy="66" r="14" class="skin" /><path d="M26 74q6-5 12 0" class="ink" />
                  <circle cx="88" cy="66" r="14" class="skin" /><path d="M82 70q6 6 12 0" class="ink" />
                  <circle cx="27" cy="63" r="1.6" class="ink-f" /><circle cx="37" cy="63" r="1.6" class="ink-f" />
                  <circle cx="83" cy="63" r="1.6" class="ink-f" /><circle cx="93" cy="63" r="1.6" class="ink-f" />
                  <text x="32" y="112" class="tag">ANTES</text><text x="88" y="112" class="tag">DESPUÉS</text>
                }
                @case ('texto') {
                  <rect x="14" y="26" width="92" height="98" rx="8" class="card" />
                  <rect x="24" y="40" width="72" height="12" rx="3" class="brand" />
                  <path d="M24 66h72M24 78h60M24 90h66M24 102h40" class="lines" />
                }
                @case ('cliente') {
                  <circle cx="40" cy="64" r="14" class="skin" /><path d="M14 132c0-22 11-34 26-34s26 12 26 34" class="shirt" />
                  <circle cx="82" cy="70" r="12" class="skin" /><path d="M60 134c0-20 10-30 22-30s22 10 22 30" class="shirt2" />
                  <path d="M22 20h76a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H54l-8 8v-8H22a6 6 0 0 1-6-6V26a6 6 0 0 1 6-6z" class="bubble" />
                  <path d="M30 33l2 4 4 .6-3 3 .7 4-3.7-2-3.7 2 .7-4-3-3 4-.6zM50 33l2 4 4 .6-3 3 .7 4-3.7-2-3.7 2 .7-4-3-3 4-.6zM70 33l2 4 4 .6-3 3 .7 4-3.7-2-3.7 2 .7-4-3-3 4-.6zM90 33l2 4 4 .6-3 3 .7 4-3.7-2-3.7 2 .7-4-3-3 4-.6z" class="star" />
                }
                @case ('tienda') {
                  <rect x="14" y="56" width="92" height="74" class="card" />
                  <path d="M10 40h100l-6 18H16z" class="brand" />
                  <path d="M30 40l-4 18M50 40l-2 18M70 40l2 18M90 40l4 18" class="light" />
                  <rect x="24" y="74" width="34" height="26" rx="2" class="glass" />
                  <rect x="70" y="80" width="24" height="50" rx="2" class="door" />
                  <circle cx="89" cy="106" r="1.8" class="ink-f" />
                }
                @case ('cta') {
                  <rect x="32" y="12" width="56" height="112" rx="10" class="phone" />
                  <rect x="38" y="24" width="44" height="86" rx="4" class="screen" />
                  <path d="M42 34h30a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H50l-6 5v-5h-2a4 4 0 0 1-4-4v-8a4 4 0 0 1 4-4z" class="wa" />
                  <rect x="44" y="92" width="32" height="10" rx="5" class="brand" />
                  <path d="M80 118c6-8 8-14 4-22-2-4 4-6 6-2l4 8c2-4 8-2 6 2 2-2 7 0 5 4 3-1 6 2 3 6l-6 12" class="hand" />
                }
              }
            </svg>
            @if (f.onScreen) { <span class="caption">{{ f.onScreen }}</span> }
          </div>
          <figcaption>
            <small class="shot">{{ label[f.shot] }}</small>
            @if (f.visual) { <p><b>Se ve:</b>{{ ' ' + f.visual }}</p> }
            @if (f.say) { <p><b>Se dice:</b> <i>{{ ' «' + f.say + '»' }}</i></p> }
          </figcaption>
        </figure>
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .frame { margin: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .panel { position: relative; aspect-ratio: 4 / 5; border: 2px solid #0f172a; border-radius: 10px; background: #f8fafc; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    .panel svg { width: 82%; height: 82%; }
    .num { position: absolute; top: 6px; left: 6px; width: 22px; height: 22px; border-radius: 50%; background: #0f172a; color: #fff; font-size: 12px; font-weight: 700; display: grid; place-items: center; }
    .time { position: absolute; top: 7px; right: 7px; font-size: 10.5px; font-weight: 700; background: #fff; color: #0f172a; border: 1px solid #cbd5e1; border-radius: 999px; padding: 1px 7px; }
    .caption { position: absolute; left: 6px; right: 6px; bottom: 6px; background: #fde047; color: #111827; font-weight: 800; font-size: 11.5px; line-height: 1.2; text-align: center; padding: 4px 6px; border-radius: 6px; box-shadow: 0 1px 0 rgba(0,0,0,.25); }
    figcaption { display: flex; flex-direction: column; gap: 3px; font-size: 12px; line-height: 1.4; }
    figcaption p { margin: 0; }
    .shot { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: .03em; }
    .say { font-style: italic; }
    svg * { stroke-linecap: round; stroke-linejoin: round; }
    .skin { fill: #f6c9a4; stroke: #7c4a2d; stroke-width: 1.5; }
    .hair { fill: #3f2a1d; stroke: #3f2a1d; stroke-width: 2; }
    .ink { fill: none; stroke: #1f2937; stroke-width: 2; }
    .ink-f { fill: #1f2937; }
    .shirt { fill: var(--brand, #1a9dd9); stroke: #0f172a; stroke-width: 1.5; }
    .shirt2 { fill: #a78bfa; stroke: #0f172a; stroke-width: 1.5; }
    .bubble { fill: #fff; stroke: #0f172a; stroke-width: 1.8; }
    .brand { fill: var(--brand, #1a9dd9); stroke: #0f172a; stroke-width: 1.8; }
    .light { fill: none; stroke: rgba(255,255,255,.8); stroke-width: 2; }
    .light-f { fill: rgba(255,255,255,.85); }
    .shade { fill: rgba(15,23,42,.15); }
    .spark { fill: #fbbf24; stroke: #b45309; stroke-width: 1; }
    .lens { fill: none; stroke: #0f172a; stroke-width: 5; }
    .lens-in { fill: rgba(186,230,253,.6); }
    .handle { fill: none; stroke: #0f172a; stroke-width: 9; }
    .body { fill: none; stroke: #0f172a; stroke-width: 6; }
    .ground { fill: none; stroke: var(--muted, #64748b); stroke-width: 2; stroke-dasharray: 4 5; }
    .motion { fill: none; stroke: var(--muted, #64748b); stroke-width: 2; }
    .before { fill: #e5e7eb; stroke: #0f172a; stroke-width: 1.5; }
    .after { fill: #bbf7d0; stroke: #0f172a; stroke-width: 1.5; }
    .tag { font: 700 10px system-ui, sans-serif; text-anchor: middle; fill: #0f172a; }
    .card { fill: #fff; stroke: #0f172a; stroke-width: 1.8; }
    .lines { fill: none; stroke: #94a3b8; stroke-width: 5; }
    .star { fill: #fbbf24; stroke: #b45309; stroke-width: .8; }
    .glass { fill: #bae6fd; stroke: #0f172a; stroke-width: 1.5; }
    .door { fill: #fde68a; stroke: #0f172a; stroke-width: 1.5; }
    .phone { fill: #1f2937; }
    .screen { fill: #fff; }
    .wa { fill: #25d366; }
    .hand { fill: #f6c9a4; stroke: #7c4a2d; stroke-width: 1.5; }
    @media print {
      .strip { grid-template-columns: repeat(4, 1fr); }
      .frame { break-inside: avoid; }
    }
  `,
})
export class Storyboard {
  readonly frames = input.required<StoryFrame[]>();
  readonly label = SHOT_LABEL;
}
