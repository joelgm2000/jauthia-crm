/**
 * Citas en la tienda: el cliente elige por el chat qué día y a qué hora pasa por el negocio.
 * Los días y horas salen del horario de atención (Configuración) en la zona horaria del negocio.
 * Funciones puras: las usan el motor del bot, el backend y la pantalla "Citas".
 */
import type { CrmSettings } from './models';
import { normalize, stripAccents } from './text';

export const CITA_STATUSES = ['agendada', 'asistio', 'no_vino', 'cancelada'] as const;
export type CitaStatus = (typeof CITA_STATUSES)[number];
export const CITA_STATUS_LABEL: Record<CitaStatus, string> = {
  agendada: 'Agendada',
  asistio: 'Asistió',
  no_vino: 'No vino',
  cancelada: 'Cancelada',
};

/** En la tienda o por videollamada (para quien no puede venir). */
export const CITA_KINDS = ['tienda', 'videollamada'] as const;
export type CitaKind = (typeof CITA_KINDS)[number];
export const CITA_KIND_LABEL: Record<CitaKind, string> = { tienda: 'En la tienda', videollamada: 'Videollamada' };

/** Cita de un cliente (va en la conversación). */
export interface Cita {
  /** Fecha y hora de la cita (ms). */
  at: number;
  /** Sin valor = en la tienda. */
  kind?: CitaKind;
  status: CitaStatus;
  createdAt: number;
}

export interface CitasConfig {
  /** Activa las citas en el flujo del bot. */
  enabled: boolean;
  /** Palabras con las que el cliente pide una cita. */
  keywords: string[];
  /** Dirección de la tienda (va en la confirmación). */
  address: string;
  /** Cuántos días hacia adelante puede agendar. */
  daysAhead: number;
  /** Cada cuántos minutos hay una hora disponible. */
  slotMinutes: number;
  /** Al pasar al asesor, ofrecer el botón "Agendar cita". */
  offerOnHandoff: boolean;
  messages: {
    offer: string;
    askDay: string;
    askTime: string;
    confirm: string;
    /** "No puedo ir": video, videollamada o domicilio. */
    alternatives: string;
    confirmVideoCall: string;
    /** Cuando pide un video y el producto no tiene uno en el catálogo. */
    videoLater: string;
    delivery: string;
  };
}

export const DEFAULT_CITAS: CitasConfig = {
  enabled: false,
  keywords: [
    'agendar', 'agendar cita', 'cita', 'sacar cita', 'pedir cita', 'pasar por la tienda', 'ir a la tienda', 'voy a pasar',
    'puedo pasar', 'puedo ir', 'ir a verla', 'ir a verlo', 'conocer la tienda', 'visitarlos',
  ],
  address: '',
  daysAhead: 7,
  slotMinutes: 60,
  offerOnHandoff: true,
  messages: {
    offer: '¿Prefieres venir a la tienda a verlo en persona? Agenda tu cita aquí 👇',
    askDay: '¡Claro! 😊 ¿Qué día quieres tu cita en {empresa}?',
    askTime: 'Perfecto. ¿A qué hora te queda bien el {dia}?',
    confirm: '✅ ¡Listo, {nombre}! Tu cita quedó para el {fecha} a las {hora}.{direccion} Si necesitas cambiarla, escríbenos por aquí.',
    alternatives: '¡No te preocupes! 😊 Si no puedes venir, te mostramos el equipo de otra forma o te lo llevamos:',
    confirmVideoCall: '✅ ¡Listo, {nombre}! Tu videollamada quedó para el {fecha} a las {hora}. Una asesora te llama por aquí para mostrarte el equipo en vivo.',
    videoLater: '🎬 ¡Claro! Una asesora te envía un video corto del equipo en un momento.',
    delivery: '🚚 ¡Claro! Hacemos entregas a domicilio. Una asesora te confirma el costo del envío y la fecha de entrega.',
  },
};

/** Configuración de citas del flujo con los valores por defecto que falten. */
export function citasOf(flow: { citas?: Partial<CitasConfig> }): CitasConfig {
  const c = flow.citas ?? {};
  return { ...DEFAULT_CITAS, ...c, messages: { ...DEFAULT_CITAS.messages, ...c.messages } };
}

/**
 * Botones de las citas. Día: cdia_2026-11-14. Hora: chora_2026-11-14_1500.
 * Videollamada: vdia_ / vhora_. "No puedo ir": cita_no → video, videollamada o domicilio.
 */
export const CITA_BTN = {
  start: 'cita_start', day: 'cdia_', time: 'chora_', vday: 'vdia_', vtime: 'vhora_',
  cannot: 'cita_no', video: 'cita_video', videoCall: 'cita_vllamada', delivery: 'cita_domicilio',
} as const;
export const CITA_DAY_NODE = 'cita_dia';
export const CITA_TIME_NODE = 'cita_hora';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const WEEKDAYS_LABEL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

type DateParts = Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;

function partsIn(ts: number, tz: string): DateParts {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ts))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out as DateParts;
}

/** Diferencia (ms) entre la hora local de la zona y UTC en ese momento. */
function tzOffset(ts: number, tz: string): number {
  const p = partsIn(ts, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ts / 1000) * 1000;
}

/** "2026-11-14" del momento `ts` en la zona del negocio. */
export function dateKeyOf(ts: number, tz: string): string {
  const p = partsIn(ts, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function keyParts(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m, d];
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = keyParts(key);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

function weekdayOf(key: string): number {
  const [y, m, d] = keyParts(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Momento (ms) del día `key` a los `minutes` minutos, hora local del negocio. */
export function localToUtc(key: string, minutes: number, tz: string): number {
  const [y, m, d] = keyParts(key);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const off = tzOffset(guess, tz);
  const t = guess - off;
  const off2 = tzOffset(t, tz);
  return off2 === off ? t : guess - off2;
}

/** Minutos desde la medianoche, hora local del negocio. */
export function minutesOf(ts: number, tz: string): number {
  const p = partsIn(ts, tz);
  return (p.hour % 24) * 60 + p.minute;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function rangesOf(settings: CrmSettings, key: string): [number, number][] {
  return (settings.hours.days[String(weekdayOf(key))] ?? []).map((r) => {
    const [a, b] = r.split('-');
    return [toMin(a), toMin(b)] as [number, number];
  });
}

/** Con cuánta anticipación mínima se puede pedir una cita. */
const LEAD_MS = 30 * 60_000;

/** Horas disponibles de un día (minutos desde la medianoche), máximo 10 para que quepan en la lista de WhatsApp. */
export function slotsFor(settings: CrmSettings, key: string, now: number, step = 60): number[] {
  const tz = settings.hours.timezone;
  const all: number[] = [];
  for (const [a, b] of rangesOf(settings, key)) {
    for (let t = a; t + Math.min(step, 30) <= b; t += step) {
      if (localToUtc(key, t, tz) >= now + LEAD_MS) all.push(t);
    }
  }
  if (all.length <= 10) return all;
  const every = Math.ceil(all.length / 10);
  return all.filter((_, i) => i % every === 0).slice(0, 10);
}

/** ¿Esa hora cae dentro del horario de atención y todavía no pasó? */
export function isValidSlot(settings: CrmSettings, key: string, minutes: number, now: number): boolean {
  const at = localToUtc(key, minutes, settings.hours.timezone);
  return at >= now + LEAD_MS && rangesOf(settings, key).some(([a, b]) => minutes >= a && minutes < b);
}

export interface CitaDay {
  key: string;
  /** Botón: "Hoy", "Mañana", "Viernes 14". */
  title: string;
  /** "viernes 14 de noviembre". */
  description: string;
}

/** Días con horas disponibles (máximo 10). */
export function openDays(settings: CrmSettings, now: number, daysAhead: number, step = 60): CitaDay[] {
  const today = dateKeyOf(now, settings.hours.timezone);
  const out: CitaDay[] = [];
  for (let i = 0; i < Math.max(1, daysAhead) && out.length < 10; i++) {
    const key = addDays(today, i);
    if (!slotsFor(settings, key, now, step).length) continue;
    out.push({ key, title: dayTitle(key, today), description: dayLong(key) });
  }
  return out;
}

/** "Hoy", "Mañana" o "Viernes 14". */
export function dayTitle(key: string, today: string): string {
  if (key === today) return 'Hoy';
  if (key === addDays(today, 1)) return 'Mañana';
  const w = WEEKDAYS_LABEL[weekdayOf(key)];
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} ${keyParts(key)[2]}`;
}

/** "viernes 14 de noviembre". */
export function dayLong(key: string): string {
  const [, m, d] = keyParts(key);
  return `${WEEKDAYS_LABEL[weekdayOf(key)]} ${d} de ${MONTHS[m - 1]}`;
}

/** "3:00 pm". */
export function timeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "viernes 14 de noviembre, 3:00 pm" de una cita. */
export function citaLabel(at: number, tz: string): string {
  return `${dayLong(dateKeyOf(at, tz))}, ${timeLabel(minutesOf(at, tz))}`;
}

/** Día escrito por el cliente ("mañana", "el viernes", "el 15") entre los disponibles. */
export function parseDay(text: string, days: CitaDay[], today: string): string | undefined {
  const t = normalize(text);
  const keys = days.map((d) => d.key);
  const pick = (k: string) => (keys.includes(k) ? k : undefined);
  if (/\bpasado manana\b/.test(t)) return pick(addDays(today, 2));
  if (/\bhoy\b/.test(t)) return pick(today);
  // "mañana" es el día siguiente, salvo "en la mañana" / "por la mañana" (la jornada).
  if (/\bmanana\b/.test(t.replace(/\b(en|por|de) la manana\b/g, ''))) return pick(addDays(today, 1));
  const w = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(t));
  if (w >= 0) return keys.find((k) => weekdayOf(k) === w);
  const n = t.match(/\b(?:el|dia)\s+(\d{1,2})\b/);
  if (n) return keys.find((k) => keyParts(k)[2] === Number(n[1]));
  return undefined;
}

/**
 * Hora escrita por el cliente ("a las 3", "3:30 pm", "15:00", "10 de la mañana").
 * `strict`: solo si es claramente una hora ("a las", am/pm o hh:mm), para no confundir "el 15" con las 3 pm.
 */
export function parseTime(text: string, strict = false): number | undefined {
  // Sin normalize(): quitaría los dos puntos de "3:30".
  const t = stripAccents(text).toLowerCase().replace(/\s+/g, ' ');
  if (/\bmedio ?dia\b/.test(t)) return 12 * 60;
  const re = /(a las|a la|tipo|como a las|sobre las)?\s*\b(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|de la manana|de la tarde|de la noche|hrs?|horas)?(?=\s|$|[.,])/g;
  for (const m of t.matchAll(re)) {
    const [, pre, hh, mm, suf] = m;
    if (strict && !pre && !mm && !suf) continue;
    let h = Number(hh);
    const min = mm ? Number(mm) : 0;
    if (h > 23 || min > 59) continue;
    const s = (suf ?? '').replace(/[.\s]/g, '');
    if ((s === 'pm' || s.includes('tarde') || s.includes('noche')) && h < 12) h += 12;
    else if (s === 'am' && h === 12) h = 0;
    else if (!s && !mm && h >= 1 && h <= 7) h += 12;
    return h * 60 + min;
  }
  return undefined;
}

/** "chora_2026-11-14_1500" → día y minutos. */
export function parseTimeButton(id: string): { key: string; minutes: number } | null {
  const m = id.replace(/^[a-z]+_/, '').match(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})$/);
  return m ? { key: m[1], minutes: Number(m[2]) * 60 + Number(m[3]) } : null;
}

export const dayButtonId = (kind: CitaKind, key: string) => (kind === 'videollamada' ? CITA_BTN.vday : CITA_BTN.day) + key;

export function timeButtonId(kind: CitaKind, key: string, minutes: number): string {
  const prefix = kind === 'videollamada' ? CITA_BTN.vtime : CITA_BTN.time;
  return `${prefix}${key}_${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}`;
}

/** "No puedo ir", "me queda lejos", "vivo en otra ciudad". */
export function cannotCome(text: string): boolean {
  return /\b(no puedo (ir|pasar|venir|llegar)|no alcanzo|no me queda (facil|tiempo)|(me )?queda (muy )?lejos|otra ciudad|no estoy en|no vivo en)\b/.test(normalize(text));
}
