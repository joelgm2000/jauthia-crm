/** Logger mínimo con fecha (se ve con `docker compose logs`). Nunca registrar tokens ni contraseñas. */
function line(level: string, msg: string, extra?: unknown): string {
  const base = `${new Date().toISOString()} ${level} ${msg}`;
  if (extra === undefined) return base;
  try {
    return `${base} ${JSON.stringify(extra instanceof Error ? { error: extra.message } : extra)}`;
  } catch {
    return base;
  }
}

export const log = {
  info: (msg: string, extra?: unknown) => console.log(line('INFO', msg, extra)),
  warn: (msg: string, extra?: unknown) => console.warn(line('WARN', msg, extra)),
  error: (msg: string, extra?: unknown) => console.error(line('ERROR', msg, extra)),
};
