import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting } from '../data/db';
import type { User } from '../data/models';
import { lastUserId, setupOwner, verifyPin } from '../services/auth';
import { useSession } from '../hooks/session';
import { PinPad } from '../components/PinPad';
import { Field } from '../components/ui';

function Logo() {
  return (
    <div className="flex flex-col items-center gap-2">
      <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="h-16 w-16 rounded-2xl" />
      <div className="text-2xl font-bold tracking-[0.2em] text-primary">INSTORE</div>
    </div>
  );
}

export default function Login() {
  const users = useLiveQuery(() => db.users.filter((u) => !!u.active).toArray());
  if (!users) return null;
  return users.length ? <Unlock users={users} /> : <Setup />;
}

function Setup() {
  const { unlock } = useSession();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [f, setF] = useState({ business: '', name: '' });
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const finish = async (confirm: string) => {
    if (confirm !== pin) { setError('PINs do not match, try again'); setStep(2); setPin(''); return; }
    try {
      const id = await setupOwner(f.name, pin, f.business);
      unlock((await db.users.get(id))!);
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="flex min-h-full flex-col items-center px-6 pb-safe pt-safe">
      <div className="mt-10"><Logo /></div>
      {step === 1 && (
        <form className="mt-8 w-full max-w-sm space-y-4" onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) setStep(2); }}>
          <p className="text-center text-muted">Welcome! Set up INSTORE on this phone.</p>
          <Field label="Shop / business name"><input className="field" value={f.business} onChange={(e) => setF({ ...f, business: e.target.value })} /></Field>
          <Field label="Your name"><input className="field" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <button className="btn-primary w-full text-[17px]" disabled={!f.name.trim()}>Continue</button>
          <p className="text-center text-xs text-muted">Your data stays on this phone. You'll be the owner and can add staff later.</p>
        </form>
      )}
      {step === 2 && (
        <div className="mt-8 w-full max-w-sm">
          <p className="mb-6 text-center font-medium">Create a 4-digit PIN</p>
          <PinPad key="p1" error={error} onComplete={(p) => { setPin(p); setError(''); setStep(3); }} />
        </div>
      )}
      {step === 3 && (
        <div className="mt-8 w-full max-w-sm">
          <p className="mb-6 text-center font-medium">Enter the PIN again</p>
          <PinPad key="p2" onComplete={finish} />
        </div>
      )}
    </div>
  );
}

function Unlock({ users }: { users: User[] }) {
  const { unlock } = useSession();
  const [selected, setSelected] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const business = useLiveQuery(() => getSetting('business_name'));

  useEffect(() => {
    lastUserId().then((id) => setSelected(users.find((u) => u.id === id) ?? (users.length === 1 ? users[0] : null)));
  }, [users]);

  const tryPin = async (pin: string) => {
    if (!selected) return;
    setBusy(true);
    try { unlock(await verifyPin(selected.id!, pin)); }
    catch (e: any) { setError(`${e.message} `); setTimeout(() => setError(e.message), 0); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-full flex-col items-center px-6 pb-safe pt-safe">
      <div className="mt-10"><Logo /></div>
      {business && <div className="mt-1 text-sm text-muted">{business}</div>}
      {!selected ? (
        <div className="mt-8 w-full max-w-sm">
          <p className="mb-3 text-center font-medium">Who's using INSTORE?</p>
          <div className="card divide-y divide-line/70">
            {users.map((u) => (
              <button key={u.id} className="tap flex w-full items-center gap-3 px-4 py-3 text-left active:bg-mint" onClick={() => setSelected(u)}>
                <Avatar name={u.name} />
                <div><div className="font-semibold">{u.name}</div><div className="text-xs capitalize text-muted">{u.role}</div></div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-8 flex w-full max-w-sm flex-col items-center">
          <Avatar name={selected.name} big />
          <div className="mt-2 font-semibold">{selected.name}</div>
          {users.length > 1 && <button className="tap text-sm text-primary" onClick={() => { setSelected(null); setError(''); }}>Switch user</button>}
          <p className="mb-4 mt-3 text-muted">Enter your PIN</p>
          <PinPad key={selected.id} onComplete={tryPin} error={error} disabled={busy} />
        </div>
      )}
    </div>
  );
}

export function Avatar({ name, big }: { name: string; big?: boolean }) {
  const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return <span className={`flex shrink-0 items-center justify-center rounded-full bg-mint font-semibold text-primary ${big ? 'h-16 w-16 text-xl' : 'h-9 w-9 text-sm'}`}>{initials}</span>;
}
