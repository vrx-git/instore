import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App';
import { SessionProvider } from './hooks/session';
import { ToastProvider } from './components/ui';
import { SyncNotices } from './components/SyncUI';
import { migrateFromV1 } from './data/db';
import { captureRedirect, initSync } from './sync/controller';
import { ensureAccounts } from './services/payments';

registerSW({ immediate: true });
captureRedirect();

// Move data from INSTORE 1.0 (if any) before showing the app, then start Google sync.
migrateFromV1().catch((e) => console.error('Migration failed', e)).then(() => ensureAccounts()).catch(() => {}).finally(() => {
  initSync();
  render();
});

const render = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ToastProvider>
        <SyncNotices />
        <SessionProvider>
          <App />
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
