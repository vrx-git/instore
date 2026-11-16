import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from './api';
import { useToast } from '../components/ui';

export type Role = 'owner' | 'manager' | 'staff';
export interface User { id: number; name: string; username: string; role: Role }

interface Session {
  user: User | null;
  needsSetup: boolean;
  settings: Record<string, string>;
  can: (what: 'delete' | 'reports' | 'settings' | 'users' | 'expenses' | 'masters') => boolean;
  refresh: () => void;
}
const Ctx = createContext<Session | null>(null);
export const useSession = () => useContext(Ctx)!;

export function SessionProvider({ children }: { children: (s: Session & { loading: boolean }) => ReactNode }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['auth'], queryFn: () => api.get<{ needsSetup: boolean; user: User | null }>('/auth/status') });
  const user = status.data?.user ?? null;
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, string>>('/settings'), enabled: !!user });

  useEffect(() => {
    const h = () => qc.invalidateQueries({ queryKey: ['auth'] });
    window.addEventListener('sr:logout', h);
    return () => window.removeEventListener('sr:logout', h);
  }, [qc]);

  useEffect(() => {
    const c = settings.data?.theme_color;
    if (c) document.documentElement.style.setProperty('--brand', c);
  }, [settings.data?.theme_color]);

  const role = user?.role;
  const can: Session['can'] = (what) => {
    if (!role) return false;
    if (role === 'owner') return true;
    if (role === 'manager') return what !== 'users' && what !== 'settings';
    return false; // staff: create/edit day-to-day records only
  };
  const value: Session = {
    user, needsSetup: !!status.data?.needsSetup, settings: settings.data ?? {}, can,
    refresh: () => qc.invalidateQueries(),
  };
  return <Ctx.Provider value={value}>{children({ ...value, loading: status.isLoading || (!!user && settings.isLoading) })}</Ctx.Provider>;
}

/** Mutation helper with toast on success/failure and cache invalidation. */
export function useSave<TVars = any, TRes = any>(fn: (v: TVars) => Promise<TRes>, opts: { success?: string; onDone?: (r: TRes, v: TVars) => void; invalidate?: boolean } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (opts.invalidate !== false) qc.invalidateQueries();
      if (opts.success) toast(opts.success);
      opts.onDone?.(r, v);
    },
    onError: (e: any) => toast(e.message || 'Something went wrong', 'error'),
  });
}
