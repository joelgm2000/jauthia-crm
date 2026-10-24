// Ejecuta UNA pasada del remarketing contra la base de QA simulando que pasaron N horas.
// Uso: tsx run-remarketing.ts <horas>   (lo llama automation.mjs; no arranca el servidor)
import { runRemarketing } from '../backend/src/automation';
import { pool } from '../backend/src/db';

const hours = Number(process.argv[2] ?? 0);
runRemarketing(Date.now() + hours * 3_600_000)
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
