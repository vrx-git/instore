import { db, getSetting, setSetting } from '../data/db';
import type { Role, User } from '../data/models';

export class AuthError extends Error {}

const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export async function hashPin(pin: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}

const validPin = (pin: string) => /^\d{4}$/.test(pin);

export async function hasUsers() {
  return (await db.users.count()) > 0;
}

export async function createUser(name: string, pin: string, role: Role): Promise<number> {
  if (!name.trim()) throw new AuthError('Enter a name');
  if (!validPin(pin)) throw new AuthError('PIN must be 4 digits');
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  return db.users.add({ name: name.trim(), role, salt, pinHash: await hashPin(pin, salt), active: 1, createdAt: Date.now() });
}

/** First run: creates the owner and an initial store. */
export async function setupOwner(name: string, pin: string, businessName: string) {
  if (await hasUsers()) throw new AuthError('Already set up');
  const id = await createUser(name, pin, 'owner');
  if (!(await db.stores.count())) await db.stores.add({ name: 'Main Store', kind: 'store', active: 1 });
  if (businessName.trim()) await setSetting('business_name', businessName.trim());
  return id;
}

export async function verifyPin(userId: number, pin: string): Promise<User> {
  const u = await db.users.get(userId);
  if (!u || !u.active) throw new AuthError('User not found');
  if ((await hashPin(pin, u.salt)) !== u.pinHash) throw new AuthError('Wrong PIN');
  return u;
}

export async function changePin(userId: number, pin: string) {
  if (!validPin(pin)) throw new AuthError('PIN must be 4 digits');
  const u = await db.users.get(userId);
  if (!u) throw new AuthError('User not found');
  await db.users.update(userId, { pinHash: await hashPin(pin, u.salt) });
}

export async function setUserActive(userId: number, active: 0 | 1) {
  const u = await db.users.get(userId);
  if (!u) return;
  if (!active && u.role === 'owner' && (await db.users.filter((x) => x.role === 'owner' && !!x.active).count()) <= 1) {
    throw new AuthError('Keep at least one active owner');
  }
  await db.users.update(userId, { active });
}

// ---- session (kept in sessionStorage so a reload stays unlocked, closing the app locks it) ----
const KEY = 'instore.session';
export const LOCK_AFTER_MS = 5 * 60 * 1000;

export function saveSession(userId: number) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ userId, at: Date.now() })); } catch { /* private mode */ }
}
export function readSession(): number | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (s && Date.now() - s.at < LOCK_AFTER_MS) return s.userId;
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

export const lastUserId = async () => Number(await getSetting('last_user')) || undefined;
export const rememberUser = (id: number) => setSetting('last_user', String(id));
