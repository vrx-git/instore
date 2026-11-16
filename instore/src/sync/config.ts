/**
 * Google OAuth Client ID (a public identifier, not a secret).
 * Create it in Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application).
 * Can be overridden at build time with VITE_GOOGLE_CLIENT_ID.
 */
export const GOOGLE_CLIENT_ID: string =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || '1036531995108-7s9f4gn8hki9jn36n64f6n48u6flefcq.apps.googleusercontent.com';

/** drive.file = only files INSTORE creates; userinfo.email = confirm the backup account. */
export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'];

export const SHEET_TITLE = 'INSTORE Data';
export const SYNC_INTERVAL_MS = 2 * 60 * 1000;
export const SYNC_DEBOUNCE_MS = 4000;
