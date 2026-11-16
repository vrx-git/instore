import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ZodError } from 'zod';
import { authRouter, loadUser, requireAuth, allow } from './auth.js';
import { masters } from './routes/masters.js';
import { tx } from './routes/transactions.js';
import { reports } from './routes/reports.js';
import { io } from './routes/io.js';
import { HttpError } from './services/util.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use(loadUser);

  app.use('/api/auth', authRouter);
  app.use('/api', requireAuth, masters, tx);
  app.use('/api/reports', requireAuth, allow('owner', 'manager'), reports);
  app.use('/api/io', requireAuth, io);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // Serve the built client in production.
  const dist = resolve(import.meta.dirname, '../../client/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*splat}', (_req, res) => res.sendFile(join(dist, 'index.html')));
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      const i = err.issues[0];
      return res.status(400).json({ error: `${i.path.join('.') || 'value'}: ${i.message}` });
    }
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (String(err?.message).includes('UNIQUE constraint failed')) {
      const field = String(err.message).split('.').pop();
      return res.status(400).json({ error: `This ${field} is already used` });
    }
    console.error(err);
    res.status(500).json({ error: err?.message || 'Something went wrong' });
  });
  return app;
}
