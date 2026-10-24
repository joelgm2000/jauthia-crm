/** Etiquetas de la interfaz compartidas por varias pantallas. */
import { EDITABLE_FIELDS } from '@shared/actions';
import { AVAILABILITIES, ContactFields, IntentType, USE_MODES } from '@shared/models';

export interface FieldLabel {
  key: keyof ContactFields;
  label: string;
  options?: readonly string[];
  numeric?: boolean;
}

const LABELS: Record<(typeof EDITABLE_FIELDS)[number], Omit<FieldLabel, 'key'>> = {
  ciudad: { label: 'Ciudad' },
  uso: { label: 'Uso', options: ['hogar', 'negocio'] },
  categoria: { label: 'Categoría' },
  subcategoria: { label: 'Equipo' },
  modeloInteres: { label: 'Modelo de interés' },
  cantidad: { label: 'Cantidad' },
  pesoUsuario: { label: 'Peso usuario (kg)', numeric: true },
  modoUso: { label: 'Caminar / trotar', options: USE_MODES },
  alturaTecho: { label: 'Altura techo (cm)', numeric: true },
  piso: { label: 'Piso' },
  espacio: { label: 'Espacio' },
  usuarios: { label: 'Usuarios' },
  rangoKg: { label: 'Rango kg' },
  disponibilidad: { label: 'Disponibilidad', options: AVAILABILITIES },
  formaPago: { label: 'Forma de pago' },
  cedula: { label: 'Cédula' },
  correo: { label: 'Correo' },
  direccion: { label: 'Dirección' },
};

/** Campos del contacto en el orden en que se muestran (los mismos que el asesor puede editar). */
export const FIELD_LABELS: FieldLabel[] = EDITABLE_FIELDS.map((key) => ({ key, ...LABELS[key] }));

const INTENT_EMOJI: Record<IntentType, string> = { producto: '🛒', precio: '💲', compra: '💳', pago: '🧾', soporte: '🛠️', humano: '🙋' };

export function intentEmoji(t: IntentType | string): string {
  return INTENT_EMOJI[t as IntentType] ?? '💬';
}
