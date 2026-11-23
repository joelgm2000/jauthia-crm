/**
 * El cliente pide no recibir más mensajes ("no me escriban más", "STOP", "denme de baja").
 * Meta exige respetarlo de inmediato (WhatsApp Business Messaging Policy y Developer Policies 5.2.b):
 * se le confirma una sola vez y se apagan para él el remarketing, las alertas de compra y las plantillas.
 * Si después él vuelve a escribir, se le puede responder (la conversación la abrió él).
 */
import { normalize } from './text';

export const OPT_OUT_TAG = 'no-contactar';
export const OPT_OUT_REPLY = 'Listo, no te enviaremos más mensajes automáticos ni promociones. Si necesitas algo, escríbenos cuando quieras 🙌';

/** Mensaje completo que solo dice "stop", "baja", etc. */
const WHOLE = /^(stop|stopp|para ya|baja|darme de baja|unsubscribe|no mas|no mas mensajes|cancelar suscripcion|desuscribir|desuscribirme)$/;

const PATTERNS = [
  // "no me escriban más", "no nos sigan enviando", "no me vuelvan a llamar" (imperativo: "no me escribieron" NO cuenta)
  /\bno (me|nos) (vuelvan a |sigan |vuelvas a |sigas )?(escriban|escribas|escribir|envien|envies|enviar|enviando|escribiendo|manden|mandes|mandar|mandando|contacten|contactes|contactar|llamen|llames|llamar|molesten|molestes|molestar)\b/,
  // "dejen de escribirme", "deja de enviarme mensajes"
  /\bdej(en|a|ar) de (escribir|enviar|mandar|molestar|contactar|llamar)/,
  // "no quiero recibir más mensajes", "no deseo que me escriban"
  /\bno (quiero|deseo|me interesa) (recibir|que me (escriban|envien|contacten|llamen)|mas (mensajes|informacion|publicidad|promociones))/,
  // "denme de baja", "quiero darme de baja", "me doy de baja"
  /\b(dar|darme|denme|deme|me doy|doy) de baja\b/,
  // "borren mi número", "sáquenme de la lista", "eliminen mi contacto"
  /\b(borr|elimin|saqu|quit)\w* (mi (numero|contacto|telefono)|de (su|la|sus) (lista|base|base de datos|difusion))/,
];

/** ¿El mensaje pide dejar de recibir mensajes? */
export function isOptOut(text: string): boolean {
  const t = normalize(text).replace(/[.,!¡¿?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  return WHOLE.test(t) || PATTERNS.some((p) => p.test(t));
}

// ---------------------------------------------------------------------------
// Permiso para promociones (opt-in)
// ---------------------------------------------------------------------------
// WhatsApp exige permiso del cliente antes de escribirle por iniciativa del negocio (plantillas). Que nos escriba
// permite responderle dentro de las 24 h, pero el remarketing y las alertas de compra fuera de ese plazo
// solo se envían a quien aceptó con este botón.

export const OPT_IN_TAG = 'acepta-promociones';
export const OPT_IN_BTN = { yes: 'optin_si', no: 'optin_no' } as const;

export interface OptInConfig {
  /** Preguntar al pasar al asesor (una sola vez por cliente). */
  enabled: boolean;
  /** Pregunta; {empresa} se reemplaza por el nombre del negocio. */
  message: string;
}

export const DEFAULT_OPT_IN: OptInConfig = {
  enabled: true,
  message: '¿Te avisamos por aquí de ofertas y novedades de {empresa}? Puedes escribir STOP cuando quieras para dejar de recibirlas.',
};

export const OPT_IN_REPLY = {
  yes: '¡Listo! 🙌 Te avisaremos por aquí. Si algún día no quieres recibir más, escribe STOP.',
  no: 'Perfecto, no te enviaremos promociones 👍',
};
