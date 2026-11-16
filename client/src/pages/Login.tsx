import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Field } from '../components/ui';

export default function Login({ setup }: { setup: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', business_name: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(setup ? '/auth/setup' : '/auth/login', form);
      await qc.invalidateQueries();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand font-bold text-white">SR</div>
          <div>
            <h1 className="font-semibold text-slate-900">Stock Register</h1>
            <p className="text-xs text-slate-500">Inventory & GST Billing</p>
          </div>
        </div>
        <p className="text-sm text-slate-600">{setup ? 'Welcome! Create the owner account to get started.' : 'Log in to continue.'}</p>
        {setup && (
          <>
            <Field label="Business name"><input className="input" value={form.business_name} onChange={set('business_name')} /></Field>
            <Field label="Your name"><input className="input" required value={form.name} onChange={set('name')} /></Field>
          </>
        )}
        <Field label="Username"><input className="input" required autoFocus autoComplete="username" value={form.username} onChange={set('username')} /></Field>
        <Field label={setup ? 'Password (min 6 characters)' : 'Password'}>
          <input className="input" type="password" required minLength={setup ? 6 : 1} autoComplete={setup ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} />
        </Field>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button className="btn-primary w-full py-2" disabled={busy}>{setup ? 'Create account' : 'Log in'}</button>
      </form>
    </div>
  );
}
