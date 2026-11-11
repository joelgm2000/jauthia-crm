/**
 * Carga rápida de productos: convierte un texto pegado (como lo escribe el cliente en WhatsApp o en una nota)
 * en los campos del producto. Sin IA: reglas simples y predecibles.
 *
 *   Evo Latte                     → nombre
 *   1.889.900                     → precio
 *   MOTOR 1.5 AC                  → ficha: Motor = 1.5 AC
 *   Soporte de peso Max 90 kg     → ficha: Soporte de peso máx. = 90 kg  (y peso máximo del usuario = 90)
 *   Velocidad: 1-10 km/h          → ficha: Velocidad = 1-10 km/h
 *   5 kg: 90.000                  → opción "5 kg" a $90.000 (desde dos líneas así, el producto tiene opciones)
 *   Ideal para caminar en casa    → descripción
 */
import { CatalogCategory, ProductSpec, ProductVariant } from './models';
import { includesWord, normalize } from './text';

export interface ParsedProduct {
  name: string;
  price: number;
  specs: ProductSpec[];
  description: string;
  keywords: string[];
  category?: string;
  subcategory?: string;
  maxUserKg?: number;
  variantName?: string;
  variants?: ProductVariant[];
  warranty?: string;
}

const BULLET = /^[\s\-•*·▪►✓✔→]+/;
const PRICE_LINE = /^(precio|valor|price)?\s*[:=-]?\s*(\$|cop|usd)?\s*\d[\d.,\s]*\s*(\$|cop|usd|pesos)?$/i;
const KEY_VALUE = /^([^:=]{2,40})\s*[:=]\s*(.+)$/;
/** "5 kg: 90.000", "2,5 kg - $45.000", "Talla M 80.000" */
const VARIANT_LINE = /^(\d[\d.,]*\s*(?:kg|kilos?|lb|libras?|gr?|cm|mts?|ml|l)|talla\s+\S{1,5})\s*[:=\-–]?\s*\$?\s*(\d[\d.,]{2,})\s*(?:cop|pesos)?$/i;

/** "1.889.900" / "$1,889,900 COP" / "1889900.50" → número. */
export function parsePrice(s: string): number {
  const raw = s.replace(/[^\d.,]/g, '');
  if (!raw) return 0;
  // El último separador seguido de 1 o 2 cifras es decimal; seguido de 3 cifras, es de miles.
  const dec = raw.match(/[.,](\d{1,2})$/);
  const int = (dec ? raw.slice(0, -dec[0].length) : raw).replace(/[.,]/g, '');
  return Number(int + (dec ? '.' + dec[1] : '')) || 0;
}

/** "SOPORTE DE PESO MAX" → "Soporte de peso máx." */
function label(s: string): string {
  const t = s.trim().toLowerCase().replace(/\bmax\b\.?/g, 'máx.').replace(/\bmin\b\.?/g, 'mín.');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Palabras que delatan el tipo de producto, por si el texto no lo nombra (solo si el catálogo tiene ese tipo). */
const TYPE_HINTS: Record<string, string[]> = {
  trotadora: ['km/h', 'banda', 'motor', 'inclinacion'],
  caminadora: ['km/h', 'banda', 'motor'],
  eliptica: ['eliptica', 'zancada'],
  bicicleta: ['bicicleta', 'spinning', 'pedal'],
};

function detectType(text: string, categories: CatalogCategory[]): { category?: string; subcategory?: string } {
  const t = normalize(text);
  for (const c of categories) {
    const sub = c.subcategories.find((s) => includesWord(t, s));
    if (sub) return { category: c.id, subcategory: sub };
  }
  for (const c of categories) {
    const sub = c.subcategories.find((s) => TYPE_HINTS[normalize(s)]?.some((h) => t.includes(h)));
    if (sub) return { category: c.id, subcategory: sub };
  }
  const cat = categories.find((c) => includesWord(t, c.name));
  return cat ? { category: cat.id } : {};
}

export function parseProductText(text: string, categories: CatalogCategory[] = []): ParsedProduct {
  const lines = text.split(/\r?\n/).map((l) => l.replace(BULLET, '').trim()).filter(Boolean);
  let name = '';
  let price = 0;
  const specs: ProductSpec[] = [];
  const notes: string[] = [];
  const options: { label: string; price: number; line: string }[] = [];

  for (const line of lines) {
    const opt = name ? line.match(VARIANT_LINE) : null;
    if (opt) {
      options.push({ label: opt[1].replace(/\s+/g, ' ').trim(), price: parsePrice(opt[2]), line });
      continue;
    }
    const kv = line.match(KEY_VALUE);
    const key = kv ? normalize(kv[1]) : '';
    if (!price && (PRICE_LINE.test(line) || (kv && /^(precio|valor)/.test(key)))) {
      price = parsePrice(kv ? kv[2] : line);
      continue;
    }
    if (kv && /^(nombre|producto|referencia)$/.test(key)) {
      name = kv[2].trim();
      continue;
    }
    if (kv && /^(descripcion|detalle)$/.test(key)) {
      notes.push(kv[2].trim());
      continue;
    }
    if (!name) {
      name = line;
      continue;
    }
    if (kv) {
      specs.push({ label: label(kv[1]), value: kv[2].trim() });
      continue;
    }
    // "Velocidad 1-10 km/h": lo que va antes del primer número es la etiqueta; el resto, el valor.
    const m = line.match(/^(\D{2,40}?)\s+(\d.*)$/);
    if (m) specs.push({ label: label(m[1]), value: m[2].trim() });
    else notes.push(line);
  }

  // Una sola línea así no son opciones: es un dato de la ficha.
  if (options.length === 1) {
    const [label_, value] = options[0].line.split(/\s*[:=\-–]\s*/);
    if (value) specs.push({ label: label(label_), value: value.trim() });
    else notes.push(options[0].line);
  }
  const variants: ProductVariant[] = options.length > 1 ? options.map((o, i) => ({ id: `v${i + 1}`, label: o.label, price: o.price })) : [];
  if (variants.length) price = Math.min(...variants.map((v) => v.price));

  // "Garantía: 6 meses" va al campo de garantía del producto, no a la ficha.
  const wIdx = specs.findIndex((s) => /garant/i.test(s.label));
  const warranty = wIdx >= 0 ? specs.splice(wIdx, 1)[0].value : '';
  const weight = specs.find((s) => /peso|soporta|usuario|capacidad/i.test(s.label) && /kg/i.test(s.value));
  const maxUserKg = weight ? Number(weight.value.match(/(\d+(?:[.,]\d+)?)\s*kg/i)?.[1].replace(',', '.')) || undefined : undefined;
  const type = detectType(text, categories);

  const summary = specs.slice(0, 3).map((s) => `${s.label.toLowerCase()} ${s.value}`).join(', ');
  const description = notes.length ? notes.join('. ').replace(/\.\./g, '.') : summary ? `${name} con ${summary}.` : '';

  const words = normalize(name).split(' ').filter((w) => w.length > 2 && !/^\d+$/.test(w));
  const keywords = [...new Set([normalize(name), ...words, ...(type.subcategory ? [type.subcategory] : [])])].filter(Boolean).slice(0, 12);

  const optionName = /talla/i.test(variants[0]?.label ?? '') ? 'Talla' : /kg|kilo|lb|libra|\bg/i.test(variants[0]?.label ?? '') ? 'Peso' : 'Medida';
  return { name, price, specs, description, keywords, ...type, ...(maxUserKg ? { maxUserKg } : {}), ...(warranty ? { warranty } : {}), ...(variants.length ? { variants, variantName: optionName } : {}) };
}
