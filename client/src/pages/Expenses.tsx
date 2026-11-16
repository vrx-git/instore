import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, qs } from '../lib/api';
import { money, fmtDate, today, monthStart } from '../lib/format';
import { useSave, useSession } from '../lib/session';
import { DataTable, DateRange, Field, Modal, PageHeader, Stat, confirmAction } from '../components/ui';

export default function Expenses() {
  const { can } = useSession();
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [cat, setCat] = useState('');
  const [adding, setAdding] = useState(false);
  const cats = useQuery({ queryKey: ['expense-categories'], queryFn: () => api.get('/expense-categories') });
  const { data, isLoading } = useQuery({ queryKey: ['expenses', range, cat], queryFn: () => api.get(`/expenses${qs({ ...range, category_id: cat })}`) });
  const del = useSave((id: number) => api.del(`/expenses/${id}`), { success: 'Expense deleted' });
  const rows = data ?? [];
  const byCat = Object.entries(rows.reduce((m: Record<string, number>, r: any) => ({ ...m, [r.category_name || 'Other']: (m[r.category_name || 'Other'] || 0) + r.amount }), {})).sort((a: any, b: any) => b[1] - a[1]);

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Rent, salary, electricity and other business costs"
        actions={<button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add expense</button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total (period)" value={money(rows.reduce((s: number, r: any) => s + r.amount, 0))} tone="red" />
        {byCat.slice(0, 3).map(([k, v]: any) => <Stat key={k} label={k} value={money(v)} />)}
      </div>
      <DataTable rows={rows} loading={isLoading} exportName="expenses"
        toolbar={<>
          <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
          <select className="input w-auto py-1" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {cats.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </>}
        columns={[
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'category_name', label: 'Category' },
          { key: 'note', label: 'Note' },
          { key: 'account_name', label: 'Paid from' },
          { key: 'amount', label: 'Amount', num: true, total: true, render: (r) => money(r.amount) },
          ...(can('delete') ? [{ key: 'x', label: '', render: (r: any) => <button className="btn-ghost p-1 text-red-600" aria-label="Delete" onClick={() => confirmAction('Delete this expense?') && del.mutate(r.id)}><Trash2 size={14} /></button> }] : []),
        ]} />
      {adding && <ExpenseForm onClose={() => setAdding(false)} />}
    </div>
  );
}

function ExpenseForm({ onClose }: { onClose: () => void }) {
  const cats = useQuery({ queryKey: ['expense-categories'], queryFn: () => api.get('/expense-categories') });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.get('/accounts') });
  const [f, setF] = useState<any>({ date: today(), category_id: '', account_id: '', amount: '', note: '' });
  const save = useSave(async () => {
    let category_id = f.category_id;
    if (category_id === '__new') {
      const name = window.prompt('New expense category');
      if (!name) throw new Error('Category name is required');
      category_id = (await api.post('/expense-categories', { name })).id;
    }
    return api.post('/expenses', { ...f, amount: Number(f.amount), category_id: category_id ? Number(category_id) : null, account_id: Number(f.account_id || accounts.data?.[0]?.id) });
  }, { success: 'Expense added', onDone: onClose });
  return (
    <Modal open onClose={onClose} title="Add expense"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!(Number(f.amount) > 0)} onClick={() => save.mutate(undefined)}>Save</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Amount"><input type="number" min="0" step="0.01" className="input" autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Category">
          <select className="input" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
            <option value="">—</option>
            {cats.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new">+ New category…</option>
          </select>
        </Field>
        <Field label="Paid from">
          <select className="input" value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })}>
            {accounts.data?.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Note" className="col-span-2"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
