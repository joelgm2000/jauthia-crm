import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Puntaje de 0 a 100 en un anillo animado (rojo bajo, ámbar medio, verde alto). */
@Component({
  selector: 'app-score-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 120 120" role="img" [attr.aria-label]="'Puntaje ' + value() + ' de 100'">
      <circle cx="60" cy="60" r="52" class="track" />
      <circle cx="60" cy="60" r="52" class="fill" [style.stroke]="color()" [style.stroke-dasharray]="dash()" />
      <text x="60" y="62" text-anchor="middle" dominant-baseline="middle" [style.font-size.px]="label() ? 30 : 34">{{ value() }}</text>
      @if (label()) { <text x="60" y="86" text-anchor="middle" class="sub">{{ label() }}</text> }
    </svg>
  `,
  styles: `
    :host { display: inline-flex; flex: none; }
    .track { fill: none; stroke: var(--line); stroke-width: 10; }
    .fill { fill: none; stroke-width: 10; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 60px 60px; animation: ring 1.1s ease-out; }
    text { fill: var(--text); font-weight: 800; font-family: Montserrat, Inter, sans-serif; }
    .sub { font-size: 11px; font-weight: 600; fill: var(--muted); }
    @keyframes ring { from { stroke-dasharray: 0 400; } }
    @media print { .fill { animation: none; } }
  `,
})
export class ScoreRing {
  readonly value = input.required<number>();
  readonly size = input(88);
  readonly label = input('');
  private readonly C = 2 * Math.PI * 52;
  readonly dash = computed(() => `${(Math.max(0, Math.min(100, this.value())) / 100) * this.C} ${this.C}`);
  readonly color = computed(() => scoreColor(this.value()));
}

export function scoreColor(v: number): string {
  return v >= 70 ? '#16a34a' : v >= 40 ? '#f59e0b' : '#dc2626';
}
