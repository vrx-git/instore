import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Trash2 } from 'lucide-react';
import { api, qs } from '../lib/api';
import { money, fmtDate, today, daysAgo } from '../lib/format';
import { useSave, useSession } from '../lib/session';
import { DataTable, DateRange, Field, Modal, PageHeader, Badge, Stat, confirmAction } from '../components/ui';

export default function Payments() {
  const { can } = useSession();
  const [dir, setDir] = useState('');
  const [range, setRange] = useState({ from: daysAgo(90), to: today() });
  const [form, setForm] = useState<'in' | 'out' | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['payments', dir, range], queryFn: () => api.get(`/payments${qs({ direction: dir, ...range })}`) });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.get('/accounts') });
  const del = useSave((id: number) => api.del(`/payments/${id}`), { success: 'Payment deleted' });
  const rows = data ?? [];

  return (
    <div>
      <PageHeader title="Payments" subtitle="Money received from customers and paid to suppliers"
        actions={<>
          <button className="btn-primary" onClick={() => setForm('in')}><ArrowDownLeft size={16} /> Payment In</button>
          <button className="btn-secondary" onClick={() => setForm('out')}><ArrowUpRight size={16} /> Payment Out</button>
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Received (period)" value={money(rows.filter((r: any) => r.direction === 'in').reduce((s: number, r: any) => s + r.amount, 0))} tone="green" />
        <Stat label="Paid (period)" value={money(rows.filter((r: any) => r.direction === 'out').reduce((s: number, r: any) => s + r.amount, 0))} tone="red" />
        {accounts.data?.slice(0, 2).map((a: any) => <Stat key={a.id} label={`${a.name} balance`} value={money(a.balance)} />)}
      </div>
      <DataTable rows={rows} loading={isLoading} exportName="payments"
        toolbar={<>
          <select className="input w-auto py-1" value={dir} onChange={(e) => setDir(e.target.value)} aria-label="Direction">
            <option value="">All</option><option value="in">Received</option><option value="out">Paid</option>
          </select>
          <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        </>}
        columns={[
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'number', label: 'No.' },
          { key: 'direction', label: 'Type', render: (r) => r.direction === 'in' ? <Badge tone="green">Received</Badge> : <Badge tone="red">Paid</Badge> },
          { key: 'party_name', label: 'Party', render: (r) => <span className="font-medium">{r.party_name}</span> },
          { key: 'account_name', label: 'Mode' },
          { key: 'bills', label: 'Against bills', className: 'text-slate-500' },
          { key: 'reference', label: 'Ref / Note', value: (r) => [r.reference, r.note].filter(Boolean).join(' · ') },
          { key: 'amount', label: 'Amount', num: true, render: (r) => <span className="font-medium">{money(r.amount)}</span> },
          ...(can('delete') ? [{ key: 'x', label: '', render: (r: any) => <button className="btn-ghost p-1 text-red-600" aria-label="Delete" onClick={(e) => { e.stopPropagation(); if (confirmAction('Delete this payment?')) del.mutate(r.id); }}><Trash2 size={14} /></button> }] : []),
        ]} />
      {form && <PaymentForm direction={form} onClose={() => setForm(null)} />}
    </div>
  );
}

export function PaymentForm({ direction, partyId, docId, onClose }: { direction: 'in' | 'out'; partyId?: number; docId?: number; onClose: () => void }) {
  const parties = useQuery({ queryKey: ['parties', direction === 'in' ? 'customer' : 'supplier'], queryFn: () => api.get(`/parties?type=${direction === 'in' ? 'customer' : 'supplier'}`) });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.get('/accounts') });
  const [f, setF] = useState<any>({ date: today(), party_id: partyId ?? '', account_id: '', amount: '', reference: '', note: '' });
  const [alloc, setAlloc] = useState<Record<number, number>>({});
  const bills = useQuery({
    queryKey: ['open-bills', f.party_id, direction],
    queryFn: () => api.get(`/payments/open-bills${qs({ party_id: f.party_id, direction })}`), enabled: !!f.party_id,
  });
  const party = parties.data?.find((p: any) => p.id === Number(f.party_id));

  // Pre-fill: paying one bill, or the full outstanding balance.
  useEffect(() => {
    if (!bills.data) return;
    if (docId) {
      const b = bills.data.find((x: any) => x.id === docId);
      if (b) { setAlloc({ [b.id]: b.due }); setF((x: any) => ({ ...x, amount: x.amount || b.due })); }
    }
  }, [bills.data, docId]);

  // Auto spread the amount over oldest bills when amount changes.
  const spread = (amount: number) => {
    let left = amount;
    const next: Record<number, number> = {};
    for (const b of bills.data ?? []) { if (left <= 0) break; const a = Math.min(b.due, left); next[b.id] = Math.round(a * 100) / 100; left -= a; }
    setAlloc(next);
  };

  const save = useSave(() => api.post('/payments', {
    direction, ...f, party_id: Number(f.party_id), amount: Number(f.amount),
    account_id: Number(f.account_id || accounts.data?.[0]?.id),
    allocations: Object.entries(alloc).filter(([, v]) => v > 0).map(([doc_id, amount]) => ({ doc_id: Number(doc_id), amount })),
  }), { success: direction === 'in' ? 'Payment received' : 'Payment recorded', onDone: onClose });

  return (
    <Modal open onClose={onClose} title={direction === 'in' ? 'Payment In (received)' : 'Payment Out (paid)'} wide
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!f.party_id || !(Number(f.amount) > 0) || save.isPending} onClick={() => save.mutate(undefined)}>Save payment</button></>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Party" className="col-span-2">
          <select className="input" value={f.party_id} onChange={(e) => { setF({ ...f, party_id: e.target.value }); setAlloc({}); }} disabled={!!partyId}>
            <option value="">Choose party…</option>
            {parties.data?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {party && <span className="mt-1 block text-xs text-slate-500">Balance: {party.balance >= 0 ? `${money(party.balance)} to receive` : `${money(-party.balance)} to pay`}</span>}
        </Field>
        <Field label="Date"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Amount"><input type="number" min="0" step="0.01" className="input" autoFocus value={f.amount} onChange={(e) => { setF({ ...f, amount: e.target.value }); spread(Number(e.target.value) || 0); }} /></Field>
        <Field label="Paid by">
          <select className="input" value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })}>
            {accounts.data?.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Reference (UPI / cheque no.)"><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Note" className="col-span-2 sm:col-span-3"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      {!!bills.data?.length && (
        <div className="mt-4">
          <div className="mb-1 text-sm font-medium">Settle against bills</div>
          <table className="table">
            <thead><tr><th>Bill</th><th>Date</th><th className="num">Due</th><th className="num w-36">Amount</th></tr></thead>
            <tbody>
              {bills.data.map((b: any) => (
                <tr key={b.id}>
                  <td>{b.number}</td><td>{fmtDate(b.date)}</td><td className="num">{money(b.due)}</td>
                  <td><input type="number" min="0" max={b.due} step="0.01" className="input text-right" value={alloc[b.id] ?? ''} aria-label={`Amount for ${b.number}`}
                    onChange={(e) => setAlloc({ ...alloc, [b.id]: Math.min(b.due, e.target.valueAsNumber || 0) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-500">Any amount not set against a bill stays as an advance in the party balance.</p>
        </div>
      )}
    </Modal>
  );
}
