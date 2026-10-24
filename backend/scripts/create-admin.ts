/**
 * Emergencia: crea o restablece la cuenta del DUEÑO de la plataforma (super administrador)
 * desde la terminal del servidor. Solo acepta el correo de PLATFORM_OWNER_EMAIL.
 *   npm run create-admin -- "Nombre" correo@empresa.com "contraseña-larga"
 */
import { config } from '../src/config';
import { migrate, pool } from '../src/db';
import { createUser, setPasswordByEmail } from '../src/auth';
import { passwordSchema } from '../src/schemas';

async function main(): Promise<void> {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password) throw new Error('Uso: npm run create-admin -- "Nombre" correo@empresa.com "contraseña"');
  if (!config.ownerEmail || email.trim().toLowerCase() !== config.ownerEmail) throw new Error('El correo debe ser el de PLATFORM_OWNER_EMAIL');
  passwordSchema.parse(password);
  await migrate();
  if (await setPasswordByEmail(email, password)) console.log(`Listo: nueva contraseña para ${email}.`);
  else {
    await createUser(null, name, email, password, 'superadmin');
    console.log(`Listo: dueño de la plataforma ${email} creado.`);
  }
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
