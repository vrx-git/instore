/**
 * Google sign-in using the OAuth 2.0 redirect flow for browser apps (response_type=token).
 * A redirect (instead of a pop-up) works reliably in iPhone Home Screen apps.
 * The access token lives ~1 hour; it is kept in sessionStorage only.
 */
import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from './config';

export type AuthMode = 'start' | 'restore' | 'reconnect' | 'auto';
export interface Token { accessToken: string; expiresAt: number; email: string }
export interface RedirectResult { token?: Omit<Token, 'email'>; mode: AuthMode; email: string; returnTo: string; error?: string }

const PENDING = 'instore.oauth';
const TOKEN = 'instore.token';

const store = {
  get(k: string, local = false) { try { return JSON.parse((local ? localStorage : sessionStorage).getItem(k) || 'null'); } catch { return null; } },
  set(k: string, v: unknown, local = false) { try { (local ? localStorage : sessionStorage).setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k: string, local = false) { try { (local ? localStorage : sessionStorage).removeItem(k); } catch { /* ignore */ } },
};

export const isConfigured = () => !!GOOGLE_CLIENT_ID;
export const redirectUri = () => `${location.origin}${import.meta.env.BASE_URL}`;

/** Leave the app for Google's sign-in page; we come back to the app's start URL. */
export function startAuth(email: string, mode: AuthMode, opts: { silent?: boolean; noUi?: boolean } = {}) {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google sign-in is not set up yet (missing Client ID).');
  const nonce = crypto.randomUUID();
  const returnTo = location.pathname.slice(import.meta.env.BASE_URL.length - 1) || '/';
  store.set(PENDING, { nonce, mode, email, returnTo }, true);
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: GOOGLE_SCOPES.join(' '),
    include_granted_scopes: 'true',
    state: nonce,
    login_hint: email,
  });
  // Reconnects skip the account chooser; automatic renewals never show Google UI at all
  // (prompt=none: Google returns an error instead, and we fall back to the reconnect bar).
  if (opts.noUi) p.set('prompt', 'none');
  else if (!opts.silent) p.set('prompt', 'select_account');
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}

/** On app start: pick up a token Google sent back in the URL fragment. */
export function takeRedirectResult(): RedirectResult | null {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  if (!hash || !/(access_token|error)=/.test(hash)) return null;
  const p = new URLSearchParams(hash);
  const pending = store.get(PENDING, true);
  store.del(PENDING, true);
  // Remove the token from the address bar and go back to the screen the user was on.
  const back = `${import.meta.env.BASE_URL.replace(/\/$/, '')}${pending?.returnTo ?? '/'}`;
  history.replaceState(null, '', back);
  if (!pending || pending.nonce !== p.get('state')) return { mode: 'start', email: '', returnTo: '/', error: 'Sign-in response did not match. Please try again.' };
  if (p.get('error')) {
    const e = p.get('error');
    return { ...pending, error: e === 'access_denied' ? 'Google access was not allowed.' : `Google sign-in failed (${e}).` };
  }
  const expiresIn = Number(p.get('expires_in')) || 3600;
  return { ...pending, token: { accessToken: p.get('access_token')!, expiresAt: Date.now() + (expiresIn - 60) * 1000 } };
}

export async function fetchEmail(accessToken: string): Promise<string> {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error('Could not read the Google account email');
  return String((await r.json()).email || '').toLowerCase();
}

export function saveToken(t: Token) { store.set(TOKEN, t); }
export function currentToken(): Token | null {
  const t: Token | null = store.get(TOKEN);
  return t && t.expiresAt > Date.now() ? t : null;
}
export function clearToken() { store.del(TOKEN); }

export const AUTO_RENEW_GAP_MS = 10 * 60 * 1000;
export const RENEW_BEFORE_MS = 10 * 60 * 1000;

/** Should INSTORE quietly renew Google sign-in now? (pure, unit-tested) */
export function shouldAutoRenew(o: { token: Pick<Token, 'expiresAt' | 'email'> | null; email: string; online: boolean; lastAttempt: number; now: number }) {
  if (!o.email || !o.online) return false;
  if (o.now - o.lastAttempt < AUTO_RENEW_GAP_MS) return false;
  if (!o.token || o.token.email !== o.email) return true;
  return o.token.expiresAt - o.now < RENEW_BEFORE_MS;
}

const ATTEMPT = 'instore.autoRenewAt';
export const lastAutoAttempt = () => Number(store.get(ATTEMPT)) || 0;
export const markAutoAttempt = (now: number) => store.set(ATTEMPT, now);

/** Token including ones that are about to expire (for the renew check). */
export const storedToken = (): Token | null => store.get(TOKEN);

export class AuthExpired extends Error {
  constructor() { super('Google sign-in expired'); }
}
