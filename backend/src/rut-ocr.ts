/**
 * Lectura GRATIS del RUT en el propio servidor (sin APIs de pago y sin que el documento salga del servidor):
 *  - PDF descargado de la DIAN: el texto ya viene dentro del PDF → se lee con pdf.js (Mozilla).
 *  - Foto o PDF escaneado: OCR con Tesseract (español), después de agrandar y pasar a grises la imagen.
 *
 * El RUT es un formulario fijo: cada dato está debajo de una casilla numerada ("31. Primer apellido",
 * "5. Número de Identificación Tributaria (NIT)"…). Se ubica cada número y se lee lo que hay debajo,
 * hasta la siguiente casilla de la misma fila. El cliente siempre revisa y corrige lo leído.
 */
import { BusinessData } from '../../shared/onboarding';
import { log } from './log';

/** Palabra con su caja: y crece hacia abajo (como en una imagen). */
export interface Token {
  t: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// ---------------------------------------------------------------------------
// Extraer palabras
// ---------------------------------------------------------------------------

// pdf.js solo existe como módulo ES; el backend compila a CommonJS, así que se importa en tiempo de ejecución.
const importEsm = new Function('s', 'return import(s)') as (s: string) => Promise<any>;

/** Palabras de la primera página de un PDF con texto (vacío si es un PDF escaneado). */
export async function pdfTokens(data: Buffer): Promise<Token[]> {
  const pdfjs = await importEsm('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const out: Token[] = [];
    for (const it of content.items as { str?: string; transform: number[]; width: number; height: number }[]) {
      const s = it.str ?? '';
      if (!s.trim()) continue;
      const h = Math.abs(it.height || it.transform[3]) || 8;
      const x = it.transform[4];
      const yTop = vp.height - it.transform[5] - h;
      // Un trozo de texto puede traer varias palabras: se reparte su ancho por caracteres.
      const per = (it.width || s.length * h * 0.5) / s.length;
      let i = 0;
      for (const w of s.split(/(\s+)/)) {
        if (w.trim()) out.push({ t: w, x0: x + i * per, y0: yTop, x1: x + (i + w.length) * per, y1: yTop + h });
        i += w.length;
      }
    }
    return out;
  } finally {
    await task.destroy();
  }
}

let ocrBusy: Promise<unknown> = Promise.resolve();

/** OCR de una foto (JPG, PNG o WebP). Uno a la vez para no llenar la memoria del servidor. */
export async function imageTokens(data: Buffer): Promise<Token[]> {
  const run = async (): Promise<Token[]> => {
    const { Jimp } = await import('jimp');
    const Tesseract = await import('tesseract.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const spa = require('@tesseract.js-data/spa') as { langPath: string };
    const img = await Jimp.read(data);
    // Fotos pequeñas: se agrandan (Tesseract necesita letras de ~30 px). Fotos enormes: se reducen.
    const long = Math.max(img.bitmap.width, img.bitmap.height);
    const scale = Math.min(3, 2600 / long);
    if (scale > 1.05 || scale < 0.95) img.scale(scale);
    img.greyscale().contrast(0.2);
    const png = await img.getBuffer('image/png');
    const worker = await Tesseract.createWorker('spa', 1, { langPath: spa.langPath, gzip: true, cacheMethod: 'none' });
    try {
      // PSM 11: texto disperso (un formulario con casillas, no párrafos).
      await worker.setParameters({ tessedit_pageseg_mode: '11' as never, user_defined_dpi: '300' });
      const r = await worker.recognize(png, {}, { blocks: true });
      return (r.data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)))
        .filter((w) => w.text.trim())
        .map((w) => ({ t: w.text.trim(), ...w.bbox }));
    } finally {
      await worker.terminate();
    }
  };
  const next = ocrBusy.then(run, run);
  ocrBusy = next.catch(() => undefined);
  return next;
}

// ---------------------------------------------------------------------------
// Leer las casillas
// ---------------------------------------------------------------------------

const h = (t: Token) => Math.max(4, t.y1 - t.y0);
const NUM = /^(\d{1,2})[.,:]?$/;
const NUM_GLUED = /^(\d{1,2})[.,]\p{L}/u;
/** Título de casilla: "Primer", "Dirección"… (mayúscula y minúsculas). Un valor como "LC" o "MENDEZ" no lo es. */
const isLabelWord = (t?: Token) => !!t && /^\p{Lu}\p{Ll}{2,}/u.test(t.t);

interface Anchor {
  n: number;
  tok: Token;
}

/** Números de casilla: "31." (o "31") seguido de una palabra en la misma línea, o "31.Primer" pegado. */
function anchors(toks: Token[]): Anchor[] {
  const out: Anchor[] = [];
  for (const tok of toks) {
    const glued = tok.t.match(NUM_GLUED);
    const m = glued ?? tok.t.match(NUM);
    if (!m) continue;
    if (!glued) {
      const next = toks
        .filter((o) => o !== tok && Math.abs(o.y0 - tok.y0) < h(tok) * 0.6 && o.x0 > tok.x0 && o.x0 - tok.x1 < h(tok) * 3)
        .sort((a, b) => a.x0 - b.x0)[0];
      // "41. Dirección": con punto basta que siga una palabra; sin punto (fotos), que parezca título de casilla.
      const dotted = /[.,:]$/.test(tok.t);
      if (!next || !(dotted ? /^\p{L}/u.test(next.t) : isLabelWord(next))) continue;
    }
    out.push({ n: Number(m[1]), tok });
  }
  return out;
}

/** Texto debajo de la casilla n (primera línea con algo), hasta la siguiente casilla de la misma fila. */
function cell(toks: Token[], all: Anchor[], n: number): string {
  const a = all.filter((x) => x.n === n).sort((p, q) => p.tok.y0 - q.tok.y0)[0];
  if (!a) return '';
  const lh = h(a.tok);
  const right = Math.min(...all.filter((o) => o !== a && Math.abs(o.tok.y0 - a.tok.y0) < lh * 0.8 && o.tok.x0 > a.tok.x0 + lh).map((o) => o.tok.x0), Infinity);
  // La casilla termina donde empieza la siguiente fila de casillas (una casilla vacía no se "roba" los títulos de abajo).
  const nextRow = Math.min(...all.filter((o) => o.tok.y0 > a.tok.y0 + lh * 0.7).map((o) => o.tok.y0), Infinity);
  const bottom = Math.min(a.tok.y1 + lh * 3.2, nextRow - lh * 0.3);
  const below = toks.filter((t) => t.y0 > a.tok.y0 + lh * 0.7 && t.y0 < bottom && t.x0 >= a.tok.x0 - lh && t.x0 < right - lh * 0.3);
  if (!below.length) return '';
  const first = Math.min(...below.map((t) => t.y0));
  return below.filter((t) => t.y0 < first + lh * 0.8).sort((p, q) => p.x0 - q.x0).map((t) => t.t).join(' ').replace(/\s+/g, ' ').trim();
}

const digits = (s: string) => s.replace(/\D/g, '');
/** Número limpio (solo dígitos y espacios: "1 0 0 1 9 9"): si trae letras, la lectura no es confiable. */
const cleanNumber = (s: string, min: number) => (/^[\d\s.-]+$/.test(s) && digits(s).length >= min ? digits(s) : '');
/** "Valledupar 0 0 1" / "Cesar 2 0" / "Valledupar 0D" → sin los códigos del final. */
const noCodes = (s: string) => s.replace(/(\s+\S*\d\S*)+\s*$/, '').replace(/^\d+\s*$/, '').replace(/[|_—–]+/g, '').trim();
const title = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

export interface RutRead {
  data: BusinessData;
  isRut: boolean;
  /** Cuántos datos se encontraron. */
  found: number;
}

/** Arma los datos del negocio a partir de las palabras del RUT. */
export function parseRut(toks: Token[]): RutRead {
  const all = anchors(toks);
  const c = (n: number) => cell(toks, all, n);
  const full = toks.map((t) => t.t).join(' ');
  const isRut = /registro\s*[uú]nico\s*tributario|\bDIAN\b|\bRUT\b/i.test(full);

  // NIT (casilla 5); en persona natural es el mismo número de la cédula (casilla 26): se usa la lectura más limpia.
  let nitRaw = cleanNumber(c(5), 6) || cleanNumber(c(26), 6);
  if (!nitRaw) {
    // Último recurso (fotos borrosas): el número de 6 a 10 cifras entre la casilla 5 y la de los nombres (31/35).
    const top = all.find((x) => x.n === 5)?.tok.y0;
    const bottom = all.filter((x) => x.n === 31 || x.n === 35).map((x) => x.tok.y0).sort((p, q) => p - q)[0];
    if (top !== undefined && bottom !== undefined) nitRaw = toks.find((t) => t.y0 > top && t.y0 < bottom && /^\d{6,10}$/.test(t.t))?.t ?? '';
  }
  const tipoTxt = c(24);
  const nombres = [c(33), c(34)].map(noCodes).filter(Boolean).join(' ');
  const apellidos = [c(31), c(32)].map(noCodes).filter(Boolean).join(' ');
  const razon = noCodes(c(35));
  const correo = (c(42).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) ?? [''])[0];
  const d: BusinessData = {
    tipo: /jur[ií]dica/i.test(tipoTxt) || (razon && !apellidos) ? 'juridica' : /natural/i.test(tipoTxt) || apellidos ? 'natural' : '',
    nombre: (razon || [nombres, apellidos].filter(Boolean).join(' ')).slice(0, 160),
    nombreComercial: noCodes(c(36)).slice(0, 120),
    nit: nitRaw.length >= 6 ? nitRaw.slice(0, 15) : '',
    dv: cleanNumber(c(6), 1).slice(0, 1),
    departamento: title(noCodes(c(39))).slice(0, 80),
    ciudad: title(noCodes(c(40))).slice(0, 80),
    direccion: c(41).slice(0, 200),
    correo: correo.toLowerCase().slice(0, 120),
    telefono: cleanNumber(c(44), 7).slice(0, 15),
    actividad: cleanNumber(c(46), 4).slice(0, 4),
  };
  const found = Object.entries(d).filter(([k, v]) => k !== 'tipo' && v).length;
  return { data: d, isRut, found };
}

/** Lee un RUT en PDF o foto. Si el PDF no tiene texto (escaneado), avisa para que suban una foto. */
export async function readRutFree(mime: string, data: Buffer): Promise<{ data: BusinessData | null; notice?: string }> {
  const t0 = Date.now();
  try {
    let toks: Token[];
    if (mime === 'application/pdf') {
      toks = await pdfTokens(data);
      if (toks.length < 20) return { data: null, notice: 'Tu PDF es una imagen escaneada y no se puede leer solo. Sube una foto del RUT o escribe los datos a mano.' };
    } else {
      toks = await imageTokens(data);
    }
    const r = parseRut(toks);
    log.info('Alta de cliente: RUT leído en el servidor', { tipo: mime, palabras: toks.length, datos: r.found, ms: Date.now() - t0 });
    if (r.found < 2) {
      return { data: null, notice: r.isRut ? 'No pudimos leer bien la foto. Tómala de nuevo, de frente y con buena luz, o sube el PDF del RUT.' : 'No encontramos datos del negocio en ese archivo. Revisa que sea el documento correcto o escribe los datos a mano.' };
    }
    return {
      data: r.data,
      notice: !r.isRut ? 'Este documento no parece un RUT: revisa bien los datos.' : mime === 'application/pdf' ? undefined : 'Leímos la foto: revisa bien cada dato, a veces la cámara confunde letras.',
    };
  } catch (e) {
    log.warn('Alta de cliente: no se pudo leer el documento en el servidor', { error: (e as Error).message });
    return { data: null, notice: 'No pudimos leer el documento automáticamente. Escribe los datos a mano, por favor.' };
  }
}
