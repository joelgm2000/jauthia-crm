/**
 * PostgreSQL local para desarrollo (sin instalar nada en Windows).
 * Usa los binarios oficiales de PostgreSQL que trae el paquete embedded-postgres.
 * Datos en backend/.pgdata  ·  Puerto 5433  ·  Base jauthia_crm
 * En el VPS NO se usa esto: allí corre el PostgreSQL oficial en Docker.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata');
const port = Number(process.env.DEV_DB_PORT ?? 5433);
const password = process.env.DEV_DB_PASSWORD ?? 'crm_dev_local';

// UTF-8 obligatorio: el CRM guarda emojis y tildes (Windows por defecto usaría WIN1252).
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'crm',
  password,
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
});

const fresh = !existsSync(path.join(dir, 'PG_VERSION'));
if (fresh) {
  console.log('Creando base de datos local en', dir);
  await pg.initialise();
}
await pg.start();
if (fresh) await pg.createDatabase('jauthia_crm');
console.log(`PostgreSQL listo en postgresql://crm:***@localhost:${port}/jauthia_crm (Ctrl+C para detener)`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
