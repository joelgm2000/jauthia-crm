/**
 * Autenticación y roles.
 *
 *  - Contraseñas con bcrypt (costo 12). Nunca se guardan ni se registran en texto plano.
 *  - Sesión en cookie httpOnly firmada (JWT, 12 h). El navegador no puede leerla con JavaScript.
 *  - Cerrar sesión, cambiar la contraseña, el rol o desactivar invalida los tokens anteriores (token_version).
 *  - Protección CSRF: toda petición que modifica datos exige el encabezado X-CRM-Request.
 *
 * Roles:
 *  - superadmin: plataforma (sin cliente). Puede gestionar clientes y "entrar" a uno para configurarlo.
 *    Solo el dueño (PLATFORM_OWNER_EMAIL) puede crear o quitar super administradores.
 *  - admin / asesor: pertenecen a UN cliente y solo ven los datos de ese cliente.
 */
import bcrypt from 'bcryptjs';
import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { CrmUserInfo, Role, SessionInfo } from '../../shared/api';
import { newId } from '../../shared/ids';
import { Tenant } from '../../shared/models';
import { config } from './config';
import { pool, tx } from './db';
import { log } from './log';
import { emailSchema, passwordSchema } from './schemas';

const COOKIE = 'crm_session';
/** Costo de bcrypt (12 ≈ 250 ms por contraseña: caro para un atacante, invisible para el usuario). */
const BCRYPT_COST = 12;

/** Fila de la tabla users. */
interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  created_at: number;
  tenant_id: string | null;
  token_version: number;
  password_hash: string;
}
const TTL_SECONDS = 12 * 3600;

export interface AuthUser extends CrmUserInfo {
  tokenVersion: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
    /** Cliente sobre el que actúa esta petición (el del usuario o el que gestiona un super admin). */
    tenant?: Tenant | null;
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown, public code?: string) {
    super(message);
  }
}

function rowToUser(r: UserRow): AuthUser {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    active: r.active,
    createdAt: r.created_at,
    tenantId: r.tenant_id,
    tokenVersion: r.token_version,
    isOwner: r.role === 'superadmin' && !!config.ownerEmail && r.email === config.ownerEmail,
  };
}

export function publicUser(u: AuthUser): CrmUserInfo {
  const { tokenVersion: _tv, ...rest } = u;
  return rest;
}

export async function getTenant(id: string | null | undefined): Promise<Tenant | null> {
  if (!id) return null;
  const r = await pool.query('SELECT data FROM tenants WHERE id = $1', [id]);
  return r.rows[0]?.data ?? null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const r = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return r.rows[0] ? rowToUser(r.rows[0]) : null;
}

/** Usuarios de un cliente (o los super administradores si tenantId es null). */
export async function listUsers(tenantId: string | null): Promise<CrmUserInfo[]> {
  const r = tenantId
    ? await pool.query('SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at', [tenantId])
    : await pool.query(`SELECT * FROM users WHERE role = 'superadmin' ORDER BY created_at`);
  return r.rows.map((x) => publicUser(rowToUser(x)));
}

/** Crea un usuario. `q` permite hacerlo dentro de una transacción (alta del dueño). */
export async function createUser(
  tenantId: string | null, name: string, email: string, password: string, role: Role, q: Pick<typeof pool, 'query'> = pool,
): Promise<AuthUser> {
  if ((role === 'superadmin') !== (tenantId === null)) throw new ApiError(400, 'Rol y cliente no coinciden');
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  try {
    const r = await q.query<UserRow>(
      'INSERT INTO users (id, tenant_id, email, name, password_hash, role, created_at) VALUES ($1, $2, lower($3), $4, $5, $6, $7) RETURNING *',
      [newId('u_'), tenantId, email.trim(), name.trim(), hash, role, Date.now()],
    );
    return rowToUser(r.rows[0]);
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new ApiError(409, 'Ya existe un usuario con ese correo');
    throw e;
  }
}

/** Cambia un usuario DE ESE CLIENTE (nunca de otro, nunca super administradores). */
export async function updateUser(tenantId: string, id: string, p: { name?: string; role?: 'admin' | 'asesor'; active?: boolean; password?: string }): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [tenantId, id];
  const add = (sql: string, v: unknown) => {
    vals.push(v);
    sets.push(sql.replace('?', `$${vals.length}`));
  };
  if (p.name !== undefined) add('name = ?', p.name.trim());
  if (p.role !== undefined) add('role = ?', p.role);
  if (p.active !== undefined) add('active = ?', p.active);
  if (p.password !== undefined) add('password_hash = ?', await bcrypt.hash(p.password, BCRYPT_COST));
  if (p.role !== undefined || p.active !== undefined || p.password !== undefined) sets.push('token_version = token_version + 1');
  if (!sets.length) return;
  const r = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2`, vals);
  if (!r.rowCount) throw new ApiError(404, 'El usuario no existe en este cliente');
}

export async function deleteUser(tenantId: string, id: string): Promise<void> {
  const r = await pool.query('DELETE FROM users WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  if (!r.rowCount) throw new ApiError(404, 'El usuario no existe en este cliente');
}

export async function setPasswordByEmail(email: string, password: string): Promise<boolean> {
  const r = await pool.query('UPDATE users SET password_hash = $2, active = TRUE, token_version = token_version + 1 WHERE email = lower($1)', [email, await bcrypt.hash(password, BCRYPT_COST)]);
  return !!r.rowCount;
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

interface TokenPayload {
  sub: string;
  v: number;
  /** Cliente que está gestionando un super administrador. */
  t?: string | null;
}

export function setSession(res: Response, u: AuthUser, actingTenant: string | null = null): void {
  const payload: TokenPayload = { sub: u.id, v: u.tokenVersion, ...(actingTenant ? { t: actingTenant } : {}) };
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: TTL_SECONDS, algorithm: 'HS256' });
  res.cookie(COOKIE, token, { httpOnly: true, secure: config.isProd, sameSite: 'lax', maxAge: TTL_SECONDS * 1000, path: '/' });
}

export interface Session {
  user: AuthUser;
  tenant: Tenant | null;
}

/** Lee y valida la sesión. Se usa en HTTP y en Socket.io. */
export async function sessionFromToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as TokenPayload;
    const user = await findUserById(p.sub);
    if (!user || !user.active || user.tokenVersion !== p.v) return null;
    const tenant = await getTenant(user.role === 'superadmin' ? p.t : user.tenantId);
    // Un cliente suspendido no puede entrar (los super administradores sí, para gestionarlo).
    if (user.role !== 'superadmin' && (!tenant || tenant.status === 'suspendido')) return null;
    return { user, tenant };
  } catch {
    return null;
  }
}

export function readCookie(header: string | undefined, name = COOKIE): string | undefined {
  return header
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + '='))
    ?.slice(name.length + 1);
}

/** Exige sesión válida. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const s = await sessionFromToken(req.cookies?.[COOKIE]);
  if (!s) {
    res.status(401).json({ error: 'Inicia sesión' });
    return;
  }
  req.user = s.user;
  req.tenant = s.tenant;
  next();
}

/** Exige que la petición actúe sobre un cliente (los super admins deben "entrar" a uno). */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant) {
    res.status(409).json({ error: 'Elige un cliente para gestionar', code: 'NO_TENANT' });
    return;
  }
  next();
}

export function requireSuperadmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'superadmin') {
    res.status(403).json({ error: 'Solo para super administradores' });
    return;
  }
  next();
}

/** Anti-CSRF: los navegadores no permiten a otros sitios agregar encabezados propios. */
export function requireCsrfHeader(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET' && req.get('x-crm-request') !== '1') {
    res.status(403).json({ error: 'Solicitud no permitida' });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Rutas /api/auth
// ---------------------------------------------------------------------------

// Por IP: 20 intentos FALLIDOS cada 15 min (los inicios correctos no cuentan: una oficina comparte IP).
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, message: { error: 'Demasiados intentos. Espera 15 minutos.' } });
// Además, por cuenta: un ataque repartido entre muchas IPs contra el mismo correo también se frena.
const accountLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true,
  keyGenerator: (req) => 'acct:' + String(req.body?.email ?? '').trim().toLowerCase().slice(0, 200),
  message: { error: 'Demasiados intentos para esta cuenta. Espera 15 minutos.' },
});
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
const setupSchema = z.object({ name: z.string().min(2).max(80), email: emailSchema, password: passwordSchema });

// Hash de referencia para que un correo inexistente tarde lo mismo (evita adivinar usuarios).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

export const authRouter = Router();
authRouter.use(requireCsrfHeader);

/** ¿Hay que crear la cuenta del dueño de la plataforma? */
authRouter.get('/status', async (_req, res) => {
  const r = await pool.query(`SELECT count(*)::int AS n FROM users WHERE role = 'superadmin'`);
  res.json({ setupNeeded: r.rows[0].n === 0, ownerConfigured: !!config.ownerEmail });
});

/** Crea la cuenta del dueño de la plataforma. Solo funciona una vez y solo con PLATFORM_OWNER_EMAIL. */
authRouter.post('/setup', loginLimiter, async (req, res) => {
  const p = setupSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: p.error.issues[0]?.message ?? 'Datos inválidos' });
    return;
  }
  if (!config.ownerEmail) {
    res.status(400).json({ error: 'Falta PLATFORM_OWNER_EMAIL en la configuración del servidor' });
    return;
  }
  if (p.data.email.trim().toLowerCase() !== config.ownerEmail) {
    res.status(403).json({ error: 'La cuenta inicial debe ser la del dueño de la plataforma' });
    return;
  }
  // Bloqueo de la tabla: dos peticiones simultáneas no pueden crear dos dueños.
  const u = await tx(async (c) => {
    await c.query('LOCK TABLE users IN EXCLUSIVE MODE');
    const n = (await c.query(`SELECT count(*)::int AS n FROM users WHERE role = 'superadmin'`)).rows[0].n;
    return n > 0 ? null : createUser(null, p.data.name, p.data.email, p.data.password, 'superadmin', c);
  });
  if (!u) {
    res.status(409).json({ error: 'La plataforma ya tiene dueño' });
    return;
  }
  setSession(res, u);
  log.info('Dueño de la plataforma creado', { id: u.id });
  const body: SessionInfo = { user: publicUser(u), tenant: null };
  res.json(body);
});

authRouter.post('/login', loginLimiter, accountLimiter, async (req, res) => {
  const p = loginSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: 'Correo o contraseña incorrectos' });
    return;
  }
  const r = await pool.query('SELECT * FROM users WHERE email = lower($1)', [p.data.email.trim()]);
  const row = r.rows[0];
  const ok = await bcrypt.compare(p.data.password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok || !row.active) {
    log.warn('Inicio de sesión fallido', { ip: req.ip });
    res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    return;
  }
  const u = rowToUser(row);
  const tenant = await getTenant(u.tenantId);
  if (u.role !== 'superadmin' && tenant?.status === 'suspendido') {
    res.status(402).json({ error: 'El servicio de tu empresa está suspendido. Comunícate con tu proveedor.' });
    return;
  }
  setSession(res, u);
  const body: SessionInfo = { user: publicUser(u), tenant };
  res.json(body);
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [req.user!.id]);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const body: SessionInfo = { user: publicUser(req.user!), tenant: req.tenant ?? null };
  res.json(body);
});

export { COOKIE };
