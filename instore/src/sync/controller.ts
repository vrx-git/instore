/**
 * Runs Google Sheets sync for the app: keeps status, schedules syncs (after changes,
 * on open, when back online, every 2 minutes) and handles sign-in results.
 */
import { useSyncExternalStore } from 'react';
import { db, deleteLocal, deviceId, getLocal, onLocalChange, setLocal } from '../data/db';
import { SYNC_DEBOUNCE_MS, SYNC_INTERVAL_MS } from './config';
import { AuthExpired, clearToken, currentToken, fetchEmail, isConfigured, lastAutoAttempt, markAutoAttempt, saveToken, shouldAutoRenew, startAuth, storedToken, takeRedirectResult, type AuthMode } from './google';
import { FIRST_LOG_ROW, markAllDirty, pendingCount, syncOnce } from './engine';
import { createSheet, findSheet, SheetsBackend } from './sheets';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'reconnect' | 'error';
export interface SyncState {
  /** local settings loaded (and any sign-in result handled) */
  ready: boolean;
  configured: boolean;
  email: string;
  sheetId: string;
  status: SyncStatus;
  lastSync: number;
  pending: number;
  error: string;
  /** set after a sign-in redirect so the UI can show a message */
  notice: string;
}

let state: SyncState = { ready: false, configured: isConfigured(), email: '', sheetId: '', status: 'off', lastSync: 0, pending: 0, error: '', notice: '' };
const listeners = new Set<() => void>();
const set = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };

export const syncState = () => state;
export function useSync() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

let timer: ReturnType<typeof setTimeout> | undefined;
let captured: ReturnType<typeof takeRedirectResult> = null;

/** Call first thing at startup (synchronous): picks up a Google sign-in result from the URL before the router reads it. */
export function captureRedirect() {
  captured = takeRedirectResult();
}
let running: Promise<void> | null = null;
let again = false;
let started = false;

/** Call once at app start. */
export async function initSync() {
  if (started) return;
  started = true;
  const result = captured;
  captured = null;
  const [email, sheetId, last] = await Promise.all([getLocal('sync_email'), getLocal('sync_sheet'), getLocal('sync_last')]);
  set({ email: email ?? '', sheetId: sheetId ?? '', lastSync: Number(last) || 0, status: email ? 'idle' : 'off' });

  onLocalChange(() => { if (state.email) schedule(SYNC_DEBOUNCE_MS); });
  setInterval(() => { if (state.email && !document.hidden) syncNow(); }, SYNC_INTERVAL_MS);
  window.addEventListener('online', () => state.email && syncNow());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.email) syncNow(); });

  if (result) await finishSignIn(result);
  else if (state.email) syncNow();
  set({ ready: true });
}

function schedule(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), ms);
}

/** Sign in to Google for the given email. Leaves the app and comes back. */
export function connect(email: string, mode: AuthMode) {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error('Enter a valid email address');
  startAuth(clean, mode, { silent: mode === 'reconnect' });
}

export function reconnect() {
  if (state.email) startAuth(state.email, 'reconnect', { silent: true });
}

/**
 * Called by the PIN screen: if backup is on and Google sign-in is missing or nearly
 * expired, renew it quietly (no Google screens). Returns true if leaving the app to do so.
 */
export function autoRenewIfNeeded(): boolean {
  const now = Date.now();
  if (!shouldAutoRenew({ token: storedToken(), email: state.email, online: navigator.onLine, lastAttempt: lastAutoAttempt(), now })) return false;
  markAutoAttempt(now);
  startAuth(state.email, 'auto', { noUi: true });
  return true;
}

async function finishSignIn(r: NonNullable<ReturnType<typeof takeRedirectResult>>) {
  if (r.error || !r.token) {
    // A quiet automatic renewal that needs the user (e.g. password) just falls back to the reconnect bar.
    if (r.mode === 'auto') { set({ status: state.email ? 'reconnect' : 'off' }); return; }
    set({ error: r.error ?? 'Sign-in failed', status: state.email ? 'reconnect' : 'off' });
    return;
  }
  try {
    const actual = await fetchEmail(r.token.accessToken);
    if (r.email && actual !== r.email) {
      set({ error: `You signed in as ${actual}, but the backup email is ${r.email}. Please choose ${r.email}.`, status: state.email ? 'reconnect' : 'off' });
      return;
    }
    saveToken({ ...r.token, email: actual });
    const switching = state.email && state.email !== actual;
    let sheetId = !switching && state.sheetId ? state.sheetId : await findSheet(r.token.accessToken);
    if (!sheetId) {
      if (r.mode === 'restore') { clearToken(); set({ error: `No INSTORE backup found in ${actual}.`, status: 'off' }); return; }
      sheetId = await createSheet(r.token.accessToken);
    }
    if (sheetId !== state.sheetId) {
      // New sheet for this device: read it from the start and upload everything we have.
      await setLocal('sync_cursor', String(FIRST_LOG_ROW));
      if (r.mode !== 'restore') await markAllDirty(db);
    }
    await Promise.all([setLocal('sync_email', actual), setLocal('sync_sheet', sheetId)]);
    set({ email: actual, sheetId, status: 'idle', error: '', notice: r.mode === 'restore' ? 'restored' : r.mode === 'start' ? 'started' : '' });
    await syncNow();
  } catch (e: any) {
    set({ error: e.message || 'Could not connect to Google', status: 'error' });
  }
}

export function syncNow(): Promise<void> {
  if (!state.email || !state.sheetId) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    try {
      const token = currentToken();
      if (!token || token.email !== state.email) { set({ status: 'reconnect', pending: await pendingCount(db) }); return; }
      if (!navigator.onLine) { set({ status: 'idle', pending: await pendingCount(db) }); return; }
      set({ status: 'syncing', error: '' });
      await syncOnce(db, new SheetsBackend(token.accessToken, state.sheetId), await deviceId());
      const now = Date.now();
      await setLocal('sync_last', String(now));
      set({ status: 'idle', lastSync: now, pending: await pendingCount(db) });
    } catch (e: any) {
      if (e instanceof AuthExpired) { clearToken(); set({ status: 'reconnect' }); }
      else set({ status: 'error', error: e.message || 'Sync failed' });
    } finally {
      running = null;
      if (again) { again = false; schedule(500); }
    }
  })();
  return running;
}

/** Turn backup off on this device. Data stays on the phone and in the sheet. */
export async function stopSync() {
  clearToken();
  await Promise.all(['sync_email', 'sync_sheet', 'sync_cursor', 'sync_last'].map(deleteLocal));
  set({ email: '', sheetId: '', status: 'off', lastSync: 0, error: '', notice: '' });
}

export const clearNotice = () => set({ notice: '', error: '' });
