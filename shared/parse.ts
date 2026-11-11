/** Interpretación de respuestas escritas a mano por el cliente. */
import { normalize, titleCase } from './text';

/**
 * Ciudades y municipios conocidos (Colombia: capitales, principales ciudades y la zona de la costa/Cesar).
 * Sirve para no confundir el nombre con la ciudad cuando el cliente responde al revés: "Valledupar, Joel".
 */
const CITIES = new Set(
  [
    'bogota', 'medellin', 'cali', 'barranquilla', 'cartagena', 'cucuta', 'bucaramanga', 'pereira', 'santa marta', 'ibague',
    'pasto', 'manizales', 'neiva', 'villavicencio', 'armenia', 'valledupar', 'monteria', 'sincelejo', 'popayan', 'tunja',
    'riohacha', 'florencia', 'quibdo', 'yopal', 'arauca', 'leticia', 'mocoa', 'san andres', 'soacha', 'bello', 'itagui',
    'envigado', 'soledad', 'palmira', 'buenaventura', 'tulua', 'barrancabermeja', 'girardot', 'zipaquira', 'facatativa',
    'fusagasuga', 'chia', 'duitama', 'sogamoso', 'rionegro', 'apartado', 'cienaga', 'fundacion', 'aracataca', 'el banco',
    'plato', 'maicao', 'uribia', 'manaure', 'fonseca', 'san juan del cesar', 'villanueva', 'urumita', 'la jagua del pilar',
    'barrancas', 'hatonuevo', 'albania', 'dibulla', 'distraccion', 'el molino', 'aguachica', 'agustin codazzi', 'codazzi',
    'bosconia', 'curumani', 'chimichagua', 'el copey', 'la paz', 'la jagua de ibirico', 'pailitas', 'pelaya', 'san diego',
    'manaure balcon del cesar', 'pueblo bello', 'chiriguana', 'astrea', 'becerril', 'gamarra', 'el paso', 'la gloria',
    'pelaya', 'rio de oro', 'san alberto', 'san martin', 'tamalameque', 'magangue', 'turbaco', 'lorica', 'sahagun',
    'corozal', 'malambo', 'sabanalarga', 'puerto colombia', 'galapa', 'baranoa',
  ],
);

/** ¿Es una ciudad conocida (o la ciudad de envío gratis del negocio)? */
export function isKnownCity(text: string, extra: string[] = []): boolean {
  const t = normalize(text).replace(/[.,]/g, '').trim();
  if (!t) return false;
  return CITIES.has(t) || extra.some((x) => !!x && normalize(x) === t);
}

/** "Soy Mario de Valledupar" → { name: 'Mario', city: 'Valledupar' } */
export function parseNameCity(raw: string, extraCities: string[] = []): { name?: string; city?: string } {
  let t = raw
    .replace(/[¡!¿?]/g, ' ')
    .replace(/\b(hola|buenas|buenos dias|buenos días|buenas tardes|buenas noches|que tal|qué tal|saludos)\b[,.]?/gi, ' ')
    .replace(/\b(mi nombre es|me llamo|soy|habla|le escribe|te escribe)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return {};
  const sep = t.match(/\s*(?:,|\s-\s|\by estoy en\b|\by soy de\b|\by vivo en\b|\bdesde\b|\bde\b|\ben\b)\s*/i);
  let name = t;
  let city: string | undefined;
  if (sep && sep.index !== undefined) {
    name = t.slice(0, sep.index);
    city = t
      .slice(sep.index + sep[0].length)
      // "María, de Valledupar" / "Ana, desde Bosconia": el conector no es parte de la ciudad.
      .replace(/^(?:(?:y\s+)?(?:soy|estoy|vivo)\s+)?(?:la ciudad de|el municipio de|desde|de|en)\s+/i, '')
      // La ciudad termina donde empieza otra idea: "Valledupar, tienen spinning" → "Valledupar".
      .split(/[,.;:]|\s(?:y|e|tienen|tiene|quiero|quisiera|queria|quería|busco|necesito|me interesa|para|cuanto|cuánto|precio)\s/i)[0]
      .trim();
    // "La Guajira" tras una coma sí es parte de la ciudad (departamento).
    const rest = t.slice(sep.index + sep[0].length);
    const dept = rest.match(/^[^,]+,\s*([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s(?:del|de|la)?\s?[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)\s*$/);
    if (dept) city = rest.trim();
  }
  name = name.split(/\s+/).slice(0, 3).join(' ');
  // Respondió al revés ("Valledupar, Joel") o solo la ciudad ("Valledupar"): no tomamos la ciudad como nombre.
  if (name && isKnownCity(name, extraCities)) {
    if (!city) return { city: titleCase(name) };
    if (!isKnownCity(city, extraCities) && city.split(/\s+/).length <= 3) [name, city] = [city, name];
  }
  return { name: name ? titleCase(name) : undefined, city: city ? titleCase(city.replace(/[.]+$/, '')) : undefined };
}

/** Palabras que cortan el nombre: "me llamo Joel y soy de…" → "Joel". */
const NOT_NAME = new Set(['y', 'e', 'de', 'desde', 'en', 'soy', 'vivo', 'es', 'para', 'pero', 'por', 'con', 'no', 'el', 'la', 'un', 'una', 'mi', 'tengo', 'quiero', 'busco']);

/**
 * El cliente corrige o da sus datos en medio de la conversación:
 *   "Me llamo Joel" / "mi nombre es Joel" → nombre
 *   "Soy de Bosconia" / "vivo en Valledupar" / "mi ciudad es…" → ciudad
 * Solo con frases explícitas, para no confundir otras respuestas con un nombre.
 */
export function parseCorrection(raw: string, extraCities: string[] = []): { name?: string; city?: string } {
  // "No me llamo Valledupar, me llamo Joel": se descarta la parte negada.
  const t = raw.replace(/\b(?:no me llamo|mi nombre no es|no soy)\s+[\p{L}'´]+/giu, ' ');
  const out: { name?: string; city?: string } = {};
  const n = t.match(/\b(?:me llamo|mi nombre es|mi nombre correcto es)\s+([\p{L}'´]+(?:\s+[\p{L}'´]+){0,2})/iu);
  if (n) {
    const words: string[] = [];
    for (const w of n[1].split(/\s+/)) {
      if (NOT_NAME.has(w.toLowerCase())) break;
      words.push(w);
    }
    if (words.length) out.name = titleCase(words.join(' '));
  }
  const c = t.match(/\b(?:soy de|vivo en|mi ciudad es|la ciudad es|(?:les |te |le )?escribo desde|estoy en la ciudad de)\s+(?!(?:un|una|el|los|las|mi)\s)([\p{L}'´ ]{2,40}?)(?=\s*(?:[,.;:!?]|\s(?:y|e|pero|me|mi|para|quiero|busco)\s|$))/iu);
  if (c) out.city = titleCase(c[1].trim());
  // "Me llamo Valledupar" no tiene sentido: si el "nombre" es una ciudad conocida, se ignora.
  if (out.name && isKnownCity(out.name, extraCities)) delete out.name;
  return out;
}
