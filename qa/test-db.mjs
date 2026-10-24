// Base PostgreSQL AISLADA para las pruebas (puerto 5544, datos en scratchpad). No toca la base de desarrollo.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync, rmSync } from 'node:fs';
const backend = 'C:/Users/JOEL/Documents/JAUTHIA CRM EvoSport/jauthia-crm/backend';
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.join(backend, 'node_modules/embedded-postgres/dist/index.js')).href);
const dir = path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), 'pgtest');
if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'crm', password: 'qa_test_only', port: 5544, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-c', 'max_connections=200'], onLog: () => {} });
await pg.initialise();
await pg.start();
await pg.createDatabase('crm_qa');
console.log('QA DB ready on 5544');
const stop = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
