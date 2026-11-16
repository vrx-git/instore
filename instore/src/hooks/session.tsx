import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import type { User } from '../data/models';
import { clearSession, LOCK_AFTER_MS, readSession, rememberUser, saveSession, touchSession } from '../services/auth';

interface Session {
  user: User | null;
  isOwner: boolean;
  unlock: (u: User) => void;
  lock: () => void;
}
const Ctx = createContext<Session>({ user: null, isOwner: false, unlock: () => {}, lock: () => {} });
export const useSession = () => useContext(Ctx);
/** Current user id, for stamping stock moves. */
export const useUserId = () => useContext(Ctx).user?.id ?? 0;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<number | null>(() => readSession());
  const user = useLiveQuery(async () => (userId ? (await db.users.get(userId)) ?? null : null), [userId]);

  const unlock = useCallback((u: User) => {
    saveSession(u.id!);
    rememberUser(u.id!);
    setUserId(u.id!);
  }, []);
  const lock = useCallback(() => { clearSession(); setUserId(null); }, []);

  // Keep the session alive while in use; lock after 5 minutes in the background.
  useEffect(() => {
    if (!userId) return;
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) lock();
      else touchSession();
    };
    const onAct = () => touchSession();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pointerdown', onAct, { passive: true });
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pointerdown', onAct); };
  }, [userId, lock]);

  // A user who was disabled is logged out.
  useEffect(() => { if (user && !user.active) lock(); }, [user, lock]);

  const value: Session = { user: user ?? null, isOwner: user?.role === 'owner', unlock, lock };
  return <Ctx.Provider value={value}>{userId && user === undefined ? null : children}</Ctx.Provider>;
}
