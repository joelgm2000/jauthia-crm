/**
 * Servidor del CRM JAUTHIA (backend).
 *
 *   /api/auth/*        inicio de sesión (cookie httpOnly)
 *   /api/super/*       panel de la plataforma (super administradores)
 *   /api/*             API del CRM (requiere sesión, rol y cliente activo)
 *   /webhooks/*        WhatsApp, Messenger/Instagram, Telegram, chat web
 *   /socket.io         tiempo real para la bandeja
 *   /health            estado del servidor (para Docker)
 */
import { createServer } from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { apiRouter } from './api';
import { ApiError, authRouter } from './auth';
import { config } from './config';
import { startAutomation } from './automation';
import { startDispatcher } from './dispatcher';
import { migrate, pool } from './db';
import { log } from './log';
import { startRealtime } from './realtime';
import { superRouter } from './super';
import { webhooksRouter } from './webhooks';

async function main(): Promise<void> {
  await migrate();

  const app = express();
  app.disable('x-powered-by');
  // Detrás de Caddy/Nginx (TRUST_PROXY=1) se lee la IP real del proxy. Sin proxy no se confía en
  // X-Forwarded-For: si no, un atacante inventaría su IP en cada intento y evadiría los bloqueos.
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  // El widget de chat web vive en el sitio del cliente (otro dominio): esa ruta pública acepta
  // cualquier origen, pero SIN cookies ni credenciales. El resto de la API solo acepta el frontend.
  app.use(/^\/webhooks\/[^/]+\/webchat/, cors({ origin: config.webchatOrigins.includes('*') ? '*' : config.webchatOrigins, credentials: false }));
  const appCors = cors({ origin: config.corsOrigins, credentials: true });
  app.use((req, res, next) => (/^\/webhooks\/[^/]+\/webchat/.test(req.path) ? next() : appCors(req, res, next)));
  app.use(cookieParser());
  // Guardamos el cuerpo original para validar las firmas de Meta.
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => ((req as Request).rawBody = buf) }));

  app.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/super', superRouter);
  app.use('/api', apiRouter);
  app.use('/webhooks', webhooksRouter);

  // Imágenes del catálogo (WhatsApp necesita URLs públicas).
  const productsDir = [process.env.PRODUCTS_DIR, path.resolve(__dirname, '../../frontend/public/products'), path.resolve(__dirname, '../../../../frontend/public/products')]
    .filter((d): d is string => !!d)
    .find((d) => existsSync(d));
  const crossOrigin = (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  };
  if (productsDir) app.use('/products', crossOrigin, express.static(productsDir, { maxAge: '7d' }));

  // Script del widget de chat web para pegar en el sitio del cliente.
  const widgetFile = [path.resolve(__dirname, '../widget/widget.js'), path.resolve(__dirname, '../../../widget/widget.js')].find((f) => existsSync(f));
  if (widgetFile) app.get('/widget.js', crossOrigin, (_req, res) => res.type('application/javascript').set('Cache-Control', 'public, max-age=300').sendFile(widgetFile));

  // Frontend compilado (opcional: en el VPS lo puede servir Nginx/Caddy).
  if (config.frontendDir && existsSync(config.frontendDir)) {
    app.use(express.static(config.frontendDir, { maxAge: '1h', index: false }));
    app.get(/^\/(?!api|webhooks|socket\.io|widget\.js|products).*/, (_req, res) => res.sendFile(path.join(config.frontendDir, 'index.html')));
  }

  // Errores: nunca se envían detalles internos al navegador.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    // JSON mal formado o demasiado grande: error del cliente, no del servidor.
    const type = (err as { type?: string }).type;
    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON inválido' });
      return;
    }
    if (type === 'entity.too.large') {
      res.status(413).json({ error: 'La petición es demasiado grande' });
      return;
    }
    log.error('Error no controlado', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  const http = createServer(app);
  startRealtime(http);
  startDispatcher();
  startAutomation();

  http.listen(config.port, () => log.info(`CRM backend escuchando en http://localhost:${config.port}`));

  const shutdown = () => {
    log.info('Cerrando servidor…');
    http.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  log.error('No se pudo iniciar el servidor', e);
  process.exit(1);
});
