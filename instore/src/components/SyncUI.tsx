import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
import { clearNotice, connect, reconnect, stopSync, syncNow, useSync } from '../sync/controller';
import { sheetUrl } from '../sync/sheets';
import { redirectUri } from '../sync/google';
import { timeAgo } from '../lib/format';
import { Field, List, Row, useToast } from './ui';

/** Banner shown on every screen when Google sign-in expired (about once an hour). */
export function ReconnectBanner() {
  const s = useSync();
  if (s.status !== 'reconnect') return null;
  return (
    <button onClick={reconnect} className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.6rem)] z-40 mx-auto flex max-w-lg items-center justify-center gap-2 bg-[#FFF8E1] px-4 py-2.5 text-sm font-medium text-[#8D6E00]">
      <CloudOff size={16} /> Backup resumes at next login{s.pending ? ` (${s.pending} waiting)` : ''} · tap to reconnect now
    </button>
  );
}

/** Small header icon showing backup state. */
export function SyncIcon() {
  const s = useSync();
  if (s.status === 'off') return null;
  const Icon = s.status === 'syncing' ? RefreshCw : s.status === 'idle' ? Cloud : s.status === 'error' ? AlertTriangle : CloudOff;
  const color = s.status === 'idle' || s.status === 'syncing' ? 'text-primary' : 'text-[#8D6E00]';
  return (
    <button className={`tap flex w-11 items-center justify-center ${color}`} aria-label={`Backup: ${s.status}`}
      onClick={() => (s.status === 'reconnect' ? reconnect() : syncNow())}>
      <Icon size={20} className={s.status === 'syncing' ? 'animate-spin' : ''} />
    </button>
  );
}

/** Toast messages after returning from Google sign-in. */
export function SyncNotices() {
  const s = useSync();
  const toast = useToast();
  useEffect(() => {
    if (s.notice === 'started') toast('Backup started');
    if (s.notice === 'restored') toast('Data restored from your backup');
    if (s.error) toast(s.error, 'error');
    if (s.notice || s.error) clearNotice();
  }, [s.notice, s.error, toast]);
  return null;
}

/** Settings → Backup email section. */
export function BackupEmailSection() {
  const s = useSync();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [changing, setChanging] = useState(false);

  const start = () => {
    try { connect(email, 'start'); } catch (e: any) { toast(e.message, 'error'); }
  };

  if (!s.configured) {
    return (
      <div className="card p-4 text-sm text-muted">
        Google backup isn't set up in this build yet (missing Google Client ID). See instore/README.md → "Google backup setup".
      </div>
    );
  }

  if (!s.email || changing) {
    return (
      <div className="card space-y-3 p-4">
        <p className="text-sm text-muted">
          {changing ? 'Enter the new Gmail address. Everything on this phone will be copied to a new sheet in that account.' : 'Enter the Gmail address to back up to. Your data goes to a Google Sheet in that account and syncs to every device you link with the same email.'}
        </p>
        <Field label="Backup email">
          <input className="field" type="email" inputMode="email" autoCapitalize="off" autoComplete="email" placeholder="you@gmail.com"
            value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} />
        </Field>
        <button className="btn-primary w-full" disabled={!email.includes('@')} onClick={start}>Save & start backup</button>
        {changing && <button className="btn-outline w-full" onClick={() => setChanging(false)}>Cancel</button>}
        <p className="text-xs text-muted">Google will ask you to confirm this account once. INSTORE can only see the sheet it creates, nothing else in your Drive.</p>
      </div>
    );
  }

  const statusText = s.status === 'syncing' ? 'Syncing…'
    : s.status === 'reconnect' ? 'Paused until next login (Google sign-in expired)'
    : s.status === 'error' ? `Error: ${s.error || 'sync failed'}`
    : s.lastSync ? `Last backed up ${timeAgo(s.lastSync)}` : 'Waiting for first sync';

  return (
    <List>
      <Row>
        <Cloud size={18} className="text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{s.email}</div>
          <div className={`text-xs ${s.status === 'reconnect' || s.status === 'error' ? 'text-[#8D6E00]' : 'text-muted'}`}>{statusText}{s.pending ? ` · ${s.pending} waiting` : ''}</div>
        </div>
      </Row>
      {s.status === 'reconnect'
        ? <Row onClick={reconnect} className="font-medium text-primary"><CloudOff size={18} /> Reconnect Google</Row>
        : <Row onClick={() => syncNow()} className="text-primary"><RefreshCw size={18} className={s.status === 'syncing' ? 'animate-spin' : ''} /> <span className="text-ink">Sync now</span></Row>}
      <Row><span className="w-[18px]" /><span className="text-xs text-muted">Syncs automatically when you open INSTORE and every 2 minutes while it's open.</span></Row>
      {s.sheetId && (
        <a href={sheetUrl(s.sheetId)} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-primary active:bg-mint">
          <ExternalLink size={18} /> <span className="text-ink">Open Google Sheet</span>
        </a>
      )}
      <Row onClick={() => { setEmail(''); setChanging(true); }}><span className="w-[18px]" /> <span className="flex-1">Change email</span></Row>
      <Row onClick={async () => { if (window.confirm('Stop backup on this phone? Your data stays on the phone and in the sheet.')) { await stopSync(); toast('Backup stopped'); } }}>
        <span className="w-[18px]" /> <span className="text-out">Stop backup</span>
      </Row>
    </List>
  );
}

/** First-run: link a new device to an existing backup. */
export function RestoreFromEmail({ onCancel }: { onCancel: () => void }) {
  const toast = useToast();
  const s = useSync();
  const [email, setEmail] = useState('');
  if (!s.configured) return <p className="text-center text-sm text-muted">Google backup isn't set up in this build yet.</p>;
  return (
    <div className="w-full max-w-sm space-y-4">
      <p className="text-center text-muted">Enter the backup email you use on your other device. Your items, stock history and users will be downloaded.</p>
      <Field label="Backup email">
        <input className="field" type="email" inputMode="email" autoCapitalize="off" autoComplete="email" placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <button className="btn-primary w-full text-[17px]" disabled={!email.includes('@')} onClick={() => { try { connect(email, 'restore'); } catch (e: any) { toast(e.message, 'error'); } }}>
        Restore with Google
      </button>
      <button className="btn-outline w-full" onClick={onCancel}>Back</button>
      <p className="break-all text-center text-[11px] text-muted/70">{redirectUri()}</p>
    </div>
  );
}
