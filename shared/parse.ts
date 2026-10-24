/** Interpretación de respuestas escritas a mano por el cliente. */
import { titleCase } from './text';

/** "Soy Mario de Valledupar" → { name: 'Mario', city: 'Valledupar' } */
export function parseNameCity(raw: string): { name?: string; city?: string } {
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
  return { name: name ? titleCase(name) : undefined, city: city ? titleCase(city.replace(/[.]+$/, '')) : undefined };
}
