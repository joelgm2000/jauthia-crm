/** Utilidades de texto compartidas (frontend, backend y motor del bot). */

/** Quita tildes y diéresis: "Elíptica" → "Eliptica". */
export function stripAccents(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Texto comparable: minúsculas, sin tildes ni signos, espacios simples. */
export function normalize(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[^\w\s.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿El texto (ya normalizado) contiene la palabra o frase? Acepta plural (s/es). */
export function includesWord(text: string, kw: string): boolean {
  const k = normalize(kw);
  if (!k) return false;
  if (k.includes(' ')) return text.includes(k);
  return new RegExp(`(^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(es|s)?(\\s|$|[.,])`).test(text);
}

export function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(' ');
}

/** Identificador legible para URLs y claves: "Máquinas de fuerza" → "maquinas-de-fuerza". */
export function slugify(name: string, fallback = 'item', max = 40): string {
  return stripAccents(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max) || fallback;
}

/** "a, b ,c" → ['a', 'b', 'c'] */
export function splitList(v: string): string[] {
  return v.split(',').map((x) => x.trim()).filter(Boolean);
}

/** Hash entero estable (para repartir asesores o colores de forma determinista). */
export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
