import { db, getLocal, setLocal, setSetting } from '../data/db';
import { newId, type Role, type User } from '../data/models';

export class AuthError extends Error {}

const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function hashPin(pin: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

const validPin = (pin: string) => /^\d{4}$/.test(pin);

export const activeUsers = () => db.users.filter((u) => !u.deleted && !!u.active).toArray();

export async function hasUsers() {
  return (await activeUsers()).length > 0;
}

export async function createUser(name: string, pin: string, role: Role): Promise<string> {
  if (!name.trim()) throw new AuthError('Enter a name');
  if (!validPin(pin)) throw new AuthError('PIN must be 4 digits');
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const id = newId();
  await db.users.add({ id, name: name.trim(), role, salt, pinHash: await hashPin(pin, salt), active: 1, createdAt: Date.now() } as User);
  return id;
}

/** First run: creates the owner and an initial store. */
export async function setupOwner(name: string, pin: string, businessName: string) {
  if (await hasUsers()) throw new AuthError('Already set up');
  const id = await createUser(name, pin, 'owner');
  if (!(await db.stores.filter((s) => !s.deleted).count())) await db.stores.add({ id: newId(), name: 'Main Store', kind: 'store', active: 1 } as any);
  if (businessName.trim()) await setSetting('business_name', businessName.trim());
  return id;
}

export async function verifyPin(userId: string, pin: string): Promise<User> {
  const u = await db.users.get(userId);
  if (!u || !u.active || u.deleted) throw new AuthError('User not found');
  if ((await hashPin(pin, u.salt)) !== u.pinHash) throw new AuthError('Wrong PIN');
  return u;
}

export async function changePin(userId: string, pin: string) {
  if (!validPin(pin)) throw new AuthError('PIN must be 4 digits');
  const u = await db.users.get(userId);
  if (!u) throw new AuthError('User not found');
  await db.users.update(userId, { pinHash: await hashPin(pin, u.salt) });
}

export async function setUserActive(userId: string, active: 0 | 1) {
  const u = await db.users.get(userId);
  if (!u) return;
  if (!active && u.role === 'owner' && (await db.users.filter((x) => x.role === 'owner' && !!x.active && !x.deleted).count()) <= 1) {
    throw new AuthError('Keep at least one active owner');
  }
  await db.users.update(userId, { active });
}

// ---- session (kept in sessionStorage so a reload stays unlocked, closing the app locks it) ----
const KEY = 'instore.session';
export const LOCK_AFTER_MS = 5 * 60 * 1000;

export function saveSession(userId: string) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ userId, at: Date.now() })); } catch { /* private mode */ }
}
export function readSession(): string | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (s && typeof s.userId === 'string' && Date.now() - s.at < LOCK_AFTER_MS) return s.userId;
  } catch { /* ignore */ }
  return null;
}
export function touchSession() {
  const id = readSession();
  if (id) saveSession(id);
}
export function clearSession() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

export const lastUserId = () => getLocal('last_user');
export const rememberUser = (id: string) => setLocal('last_user', id);
