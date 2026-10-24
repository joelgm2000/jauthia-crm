/** Horario de atención del cliente (zona horaria configurable). */
import { CrmSettings } from './models';
import { DAY, MINUTE } from './time';

function localParts(now: number, tz: string): { day: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = fmt.formatToParts(new Date(now));
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
  return { day, minutes: h * 60 + m };
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** ¿Está abierto el negocio en ese momento? */
export function isOpen(settings: CrmSettings, now: number): boolean {
  const { day, minutes } = localParts(now, settings.hours.timezone);
  const ranges = settings.hours.days[String(day)] ?? [];
  return ranges.some((r) => {
    const [a, b] = r.split('-');
    return minutes >= toMin(a) && minutes < toMin(b);
  });
}

/** Próximo momento en que abre (para agendar la tarea del asesor). */
export function nextOpening(settings: CrmSettings, now: number): number {
  const step = 15 * MINUTE;
  for (let t = now; t < now + 8 * DAY; t += step) if (isOpen(settings, t)) return t;
  return now;
}
