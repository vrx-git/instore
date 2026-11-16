import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { getDb } from './db/db.js';
import { HttpError } from './services/util.js';

export type Role = 'owner' | 'manager' | 'staff';
export interface AuthUser { id: number; name: string; username: string; role: Role }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AuthUser } }
}

const COOKIE = 'sr_session';
const DAYS = 30;

function startSession(res: Response, userId: number) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + DAYS * 864e5);
  getDb().run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, expires.toISOString());
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', expires });
}

export function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    const u = getDb().get<AuthUser>(
      `SELECT u.id, u.name, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`, token, new Date().toISOString());
    if (u) req.user = u;
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new HttpError(401, 'Please log in');
  next();
}

/** Allow only the listed roles. */
export const allow = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || !roles.includes(req.user.role)) throw new HttpError(403, 'You do not have permission for this');
  next();
};
/** Deleting records needs manager or owner. */
export const canDelete = allow('owner', 'manager');

const creds = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });
const setupSchema = z.object({ name: z.string().trim().min(1), username: z.string().trim().min(3), password: z.string().min(6), business_name: z.string().trim().optional() });

export const authRouter = Router();

authRouter.get('/status', (req, res) => {
  const hasUsers = !!getDb().get('SELECT id FROM users LIMIT 1');
  res.json({ needsSetup: !hasUsers, user: req.user ?? null });
});

/** First run: create the owner account. Only works while there are no users. */
authRouter.post('/setup', (req, res) => {
  const db = getDb();
  if (db.get('SELECT id FROM users LIMIT 1')) throw new HttpError(400, 'Setup already done');
  const body = setupSchema.parse(req.body);
  const id = db.insert('users', { name: body.name, username: body.username.toLowerCase(), password_hash: bcrypt.hashSync(body.password, 10), role: 'owner' });
  if (body.business_name) db.setSetting('business_name', body.business_name);
  startSession(res, id);
  res.json({ ok: true });
});

authRouter.post('/login', (req, res) => {
  const { username, password } = creds.parse(req.body);
  const u = getDb().get<any>('SELECT * FROM users WHERE username = ? AND active = 1', username.toLowerCase());
  if (!u || !bcrypt.compareSync(password, u.password_hash)) throw new HttpError(401, 'Wrong username or password');
  startSession(res, u.id);
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) getDb().run('DELETE FROM sessions WHERE token = ?', token);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

authRouter.post('/password', requireAuth, (req, res) => {
  const { current, next } = z.object({ current: z.string(), next: z.string().min(6) }).parse(req.body);
  const db = getDb();
  const u = db.get<any>('SELECT * FROM users WHERE id = ?', req.user!.id);
  if (!bcrypt.compareSync(current, u.password_hash)) throw new HttpError(400, 'Current password is wrong');
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(next, 10), u.id);
  res.json({ ok: true });
});

export function hashPassword(p: string) {
  return bcrypt.hashSync(p, 10);
}
