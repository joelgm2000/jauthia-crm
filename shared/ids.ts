/** Identificadores únicos con prefijo legible ("m…" mensaje, "t…" tarea, "u_…" usuario). */
export function newId(prefix = ''): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const rand = g.crypto?.randomUUID ? g.crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return prefix + Date.now().toString(36) + rand;
}
