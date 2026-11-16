import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Download, Upload, Pencil } from 'lucide-react';
import { api, download } from '../lib/api';
import { INDIAN_STATES, money } from '../lib/format';
import { useSave, useSession } from '../lib/session';
import { Field, Modal, PageHeader, Tabs, Badge, useToast, confirmAction } from '../components/ui';
import { PRINT_FORMATS } from '../components/InvoicePrint';

type Tab = 'business' | 'print' | 'accounts' | 'users' | 'backup' | 'password';

export default function Settings() {
  const { tab = 'business' } = useParams() as { tab?: Tab };
  const nav = useNavigate();
  const { can } = useSession();
  const tabs = [
    ...(can('settings') ? [{ id: 'business' as Tab, label: 'Business' }, { id: 'print' as Tab, label: 'Invoice & Print' }] : []),
    ...(can('masters') ? [{ id: 'accounts' as Tab, label: 'Cash & Bank' }] : []),
    ...(can('users') ? [{ id: 'users' as Tab, label: 'Staff & Roles' }, { id: 'backup' as Tab, label: 'Backup' }] : []),
    { id: 'password' as Tab, label: 'My Password' },
  ];
  const current = tabs.find((t) => t.id === tab) ? tab : tabs[0].id;
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" />
      <Tabs tabs={tabs} value={current} onChange={(t) => nav(`/settings/${t}`)} />
      {current === 'business' && <BusinessSettings />}
      {current === 'print' && <PrintSettings />}
      {current === 'accounts' && <Accounts />}
      {current === 'users' && <Users />}
      {current === 'backup' && <Backup />}
      {current === 'password' && <Password />}
    </div>
  );
}

function useSettingsForm(keys: string[]) {
  const { settings } = useSession();
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => { setF(Object.fromEntries(keys.map((k) => [k, settings[k] ?? '']))); }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useSave(() => api.put('/settings', f), { success: 'Settings saved' });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return { f, setF, set, save };
}

function BusinessSettings() {
  const { f, setF, set, save } = useSettingsForm(['business_name', 'business_phone', 'business_email', 'business_address', 'business_gstin', 'business_state', 'logo', 'bank_details']);
  const toast = useToast();
  const onLogo = (file?: File) => {
    if (!file) return;
    if (file.size > 500_000) return toast('Logo must be smaller than 500 KB', 'error');
    const r = new FileReader();
    r.onload = () => setF({ ...f, logo: String(r.result) });
    r.readAsDataURL(file);
  };
  return (
    <div className="card space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Business name"><input className="input" value={f.business_name ?? ''} onChange={set('business_name')} /></Field>
        <Field label="Phone"><input className="input" value={f.business_phone ?? ''} onChange={set('business_phone')} /></Field>
        <Field label="Email"><input className="input" value={f.business_email ?? ''} onChange={set('business_email')} /></Field>
        <Field label="GSTIN (leave empty if not registered)"><input className="input uppercase" maxLength={15} value={f.business_gstin ?? ''} onChange={(e) => setF({ ...f, business_gstin: e.target.value.toUpperCase() })} /></Field>
        <Field label="State (decides CGST/SGST vs IGST)">
          <select className="input" value={f.business_state ?? ''} onChange={set('business_state')}>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="Address" className="sm:col-span-2"><textarea className="input" rows={2} value={f.business_address ?? ''} onChange={set('business_address')} /></Field>
        <Field label="Bank details (printed on invoices)" className="sm:col-span-2"><textarea className="input" rows={2} placeholder="Bank, A/c no, IFSC, UPI ID" value={f.bank_details ?? ''} onChange={set('bank_details')} /></Field>
        <Field label="Logo">
          <div className="flex items-center gap-3">
            {f.logo ? <img src={f.logo} alt="Logo" className="h-14 w-14 rounded border object-contain" /> : <div className="flex h-14 w-14 items-center justify-center rounded border text-xs text-slate-400">None</div>}
            <input type="file" accept="image/*" className="text-sm" onChange={(e) => onLogo(e.target.files?.[0])} aria-label="Upload logo" />
            {f.logo && <button className="btn-ghost text-xs" onClick={() => setF({ ...f, logo: '' })}>Remove</button>}
          </div>
        </Field>
      </div>
      <div className="flex justify-end"><button className="btn-primary" onClick={() => save.mutate(undefined)}>Save</button></div>
    </div>
  );
}

const THEMES = ['#2563eb', '#0f766e', '#7c3aed', '#be123c', '#c2410c', '#15803d', '#0f172a', '#a16207'];

function PrintSettings() {
  const { f, setF, set, save } = useSettingsForm(['print_format', 'theme_color', 'invoice_terms']);
  return (
    <div className="card space-y-4 p-4">
      <Field label="Default print format">
        <select className="input max-w-xs" value={f.print_format ?? 'A4'} onChange={set('print_format')}>{PRINT_FORMATS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
      </Field>
      <Field label="Theme colour (app and invoices)">
        <div className="flex flex-wrap items-center gap-2">
          {THEMES.map((c) => (
            <button key={c} type="button" aria-label={`Theme ${c}`} onClick={() => setF({ ...f, theme_color: c })}
              className={`h-8 w-8 rounded-full ring-offset-2 ${f.theme_color === c ? 'ring-2 ring-slate-800' : ''}`} style={{ background: c }} />
          ))}
          <input type="color" value={f.theme_color || '#2563eb'} onChange={set('theme_color')} aria-label="Custom colour" className="h-8 w-10 cursor-pointer" />
        </div>
      </Field>
      <Field label="Default terms & conditions"><textarea className="input" rows={3} value={f.invoice_terms ?? ''} onChange={set('invoice_terms')} /></Field>
      <p className="text-sm text-slate-500">Tip: in the print dialog choose "Save as PDF" to share invoices as PDF. For thermal printers, set the printer's paper size to 58mm or 80mm.</p>
      <div className="flex justify-end"><button className="btn-primary" onClick={() => save.mutate(undefined)}>Save</button></div>
    </div>
  );
}

function Accounts() {
  const { data } = useQuery({ queryKey: ['accounts'], queryFn: () => api.get('/accounts') });
  const [edit, setEdit] = useState<any>(null);
  const save = useSave((a: any) => (a.id ? api.put(`/accounts/${a.id}`, a) : api.post('/accounts', a)), { success: 'Saved', onDone: () => setEdit(null) });
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <span className="text-sm text-slate-500">Payments and expenses are recorded against these accounts.</span>
        <button className="btn-primary" onClick={() => setEdit({ name: '', kind: 'bank', opening_balance: 0 })}><Plus size={16} /> Add account</button>
      </div>
      <table className="table">
        <thead><tr><th>Name</th><th>Type</th><th className="num">Opening</th><th className="num">Balance</th><th /></tr></thead>
        <tbody>
          {data?.map((a: any) => (
            <tr key={a.id}><td className="font-medium">{a.name}</td><td className="capitalize">{a.kind}</td><td className="num">{money(a.opening_balance)}</td><td className="num font-medium">{money(a.balance)}</td>
              <td><button className="btn-ghost p-1" aria-label="Edit" onClick={() => setEdit(a)}><Pencil size={14} /></button></td></tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Edit account' : 'Add account'}
          footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={() => save.mutate({ id: edit.id, name: edit.name, kind: edit.kind, opening_balance: Number(edit.opening_balance) || 0 })}>Save</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" className="col-span-2"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Type"><select className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}><option value="cash">Cash</option><option value="bank">Bank / UPI</option></select></Field>
            <Field label="Opening balance"><input type="number" className="input" value={edit.opening_balance} onChange={(e) => setEdit({ ...edit, opening_balance: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

const ROLE_INFO: Record<string, string> = {
  owner: 'Everything, including settings, staff and backup',
  manager: 'All records and reports; can delete. No settings or staff.',
  staff: 'Create and edit items, stock entries, bills, parties and payments. Cannot delete or see reports/expenses.',
};

function Users() {
  const { user } = useSession();
  const { data } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users') });
  const [edit, setEdit] = useState<any>(null);
  const save = useSave((u: any) => (u.id ? api.put(`/users/${u.id}`, u) : api.post('/users', u)), { success: 'Saved', onDone: () => setEdit(null) });
  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-center justify-between border-b border-slate-200 p-3">
          <span className="text-sm text-slate-500">Give your staff their own login.</span>
          <button className="btn-primary" onClick={() => setEdit({ name: '', username: '', password: '', role: 'staff' })}><Plus size={16} /> Add user</button>
        </div>
        <table className="table">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data?.map((u: any) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}{u.id === user?.id && <span className="text-xs text-slate-400"> (you)</span>}</td><td>{u.username}</td>
                <td className="capitalize">{u.role}</td><td>{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}</td>
                <td><button className="btn-ghost p-1" aria-label="Edit" onClick={() => setEdit({ ...u, active: !!u.active, password: '' })}><Pencil size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card p-4 text-sm">
        {Object.entries(ROLE_INFO).map(([r, d]) => <div key={r} className="py-0.5"><b className="capitalize">{r}:</b> <span className="text-slate-600">{d}</span></div>)}
      </div>
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? 'Edit user' : 'Add user'}
          footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={() => {
            const body: any = edit.id ? { name: edit.name, role: edit.role, active: edit.active } : { name: edit.name, username: edit.username, password: edit.password, role: edit.role };
            if (edit.id && edit.password) body.password = edit.password;
            save.mutate({ id: edit.id, ...body });
          }}>Save</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Username"><input className="input" disabled={!!edit.id} value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></Field>
            <Field label={edit.id ? 'New password (optional)' : 'Password (min 6)'}><input className="input" type="password" autoComplete="new-password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
            <Field label="Role"><select className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}><option value="staff">Staff</option><option value="manager">Manager</option><option value="owner">Owner</option></select></Field>
            {edit.id && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active (can log in)</label>}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Backup() {
  const toast = useToast();
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const restore = async (file?: File) => {
    if (!file || !confirmAction('Restore this backup? All current data will be replaced (a safety copy is kept in data/backups).')) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post('/io/restore', fd);
      toast('Backup restored');
      refresh();
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="card space-y-4 p-4">
      <div>
        <h3 className="font-semibold">Download backup</h3>
        <p className="mb-2 text-sm text-slate-500">Saves your complete data (items, bills, parties, payments) as one file. Keep it on a pen drive or Google Drive.</p>
        <button className="btn-primary" onClick={() => download('/io/backup').catch((e) => toast(e.message, 'error'))}><Download size={16} /> Download backup</button>
      </div>
      <div className="border-t border-slate-200 pt-4">
        <h3 className="font-semibold">Restore from backup</h3>
        <p className="mb-2 text-sm text-slate-500">Replaces all current data with the backup file.</p>
        <label className={`btn-secondary cursor-pointer ${busy ? 'opacity-50' : ''}`}><Upload size={16} /> Choose backup file<input type="file" accept=".db" hidden onChange={(e) => restore(e.target.files?.[0])} /></label>
      </div>
    </div>
  );
}

function Password() {
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const toast = useToast();
  const save = useSave(() => api.post('/auth/password', { current: f.current, next: f.next }), { success: 'Password changed', invalidate: false, onDone: () => setF({ current: '', next: '', confirm: '' }) });
  return (
    <form className="card max-w-sm space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); if (f.next !== f.confirm) return toast('New passwords do not match', 'error'); save.mutate(undefined); }}>
      <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
      <Field label="New password (min 6)"><input className="input" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
      <Field label="Confirm new password"><input className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
      <button className="btn-primary">Change password</button>
    </form>
  );
}
