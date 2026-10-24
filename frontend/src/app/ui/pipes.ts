import { Pipe, PipeTransform } from '@angular/core';

/** Formato de WhatsApp: *negrita*, _cursiva_, ~tachado~ y saltos de línea. */
@Pipe({ name: 'wa' })
export class WaFormatPipe implements PipeTransform {
  transform(text: string | null | undefined): string {
    const esc = (text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc
      .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
      .replace(/(^|\s)_([^_\n]+)_/g, '$1<i>$2</i>')
      .replace(/~([^~\n]+)~/g, '<s>$1</s>')
      .replace(/\{\{(\d+)\}\}/g, '<span class="var">{{$1}}</span>')
      .replace(/\n/g, '<br>');
  }
}

@Pipe({ name: 'ago' })
export class AgoPipe implements PipeTransform {
  transform(ts: number | null | undefined): string {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const m = Math.round(diff / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return `${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h`;
    const d = Math.round(h / 24);
    if (d < 7) return `${d} d`;
    return new Date(ts).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }
}

@Pipe({ name: 'hour' })
export class HourPipe implements PipeTransform {
  transform(ts: number | null | undefined): string {
    return ts ? new Date(ts).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : '';
  }
}

@Pipe({ name: 'cop' })
export class CopPipe implements PipeTransform {
  transform(v: number | null | undefined, compact = false): string {
    const n = v ?? 0;
    if (compact && n >= 1_000_000) return `$${(n / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
    return '$' + n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }
}

@Pipe({ name: 'initials' })
export class InitialsPipe implements PipeTransform {
  transform(name: string | null | undefined): string {
    return (name ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('');
  }
}
