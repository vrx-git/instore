import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Pencil, Trash2, Printer, ArrowLeft, Plus, Wallet } from 'lucide-react';
import { api, qs } from '../lib/api';
import { money, fmtDate, daysAgo, today } from '../lib/format';
import { useSave, useSession } from '../lib/session';
import { DOCS, type DocType } from '../lib/docTypes';
import { DateRange, Loading, PageHeader, Stat, Tabs, DataTable, confirmAction } from '../components/ui';
import { PartyForm } from '../components/PartyForm';
import { PrintHeader } from '../components/PrintHeader';
import { PaymentForm } from './Payments';
import { BalanceText } from './Parties';

const KIND: Record<string, string> = { payment_in: 'Payment received', payment_out: 'Payment made', ...Object.fromEntries(Object.entries(DOCS).map(([k, v]) => [k, v.label])) };

export default function PartyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useSession();
  const [tab, setTab] = useState<'ledger' | 'bills'>('ledger');
  const [range, setRange] = useState({ from: daysAgo(365), to: today() });
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const { data: p } = useQuery({ queryKey: ['party', id], queryFn: () => api.get(`/parties/${id}`) });
  const ledger = useQuery({ queryKey: ['ledger', id, range], queryFn: () => api.get(`/parties/${id}/ledger${qs(range)}`) });
  const isSupplier = p?.type === 'supplier';
  const bills = useQuery({
    queryKey: ['party-bills', id, isSupplier],
    queryFn: () => api.get(`/documents/${isSupplier ? 'purchase_invoice' : 'sales_invoice'}${qs({ party_id: id })}`), enabled: !!p,
  });
  const del = useSave(() => api.del(`/parties/${id}`), { success: 'Party removed', onDone: () => nav('/parties') });
  if (!p) return <Loading />;
  const L = ledger.data;

  return (
    <div className="space-y-4">
      <PageHeader title={p.name} subtitle={<Link to="/parties" className="inline-flex items-center gap-1 hover:text-brand"><ArrowLeft size={14} /> All parties</Link>}
        actions={<>
          <button className="btn-primary" onClick={() => setPaying(true)}><Wallet size={16} /> {p.balance < 0 ? 'Make payment' : 'Receive payment'}</button>
          <button className="btn-secondary" onClick={() => nav(isSupplier ? '/purchases/new' : '/sales/new', { state: { party_id: p.id } })}><Plus size={16} /> {isSupplier ? 'Purchase' : 'Invoice'}</button>
          <button className="btn-secondary" onClick={() => setEditing(true)}><Pencil size={16} /></button>
          {can('delete') && <button className="btn-secondary text-red-600" onClick={() => confirmAction('Delete this party? If it has bills it will be marked inactive.') && del.mutate(undefined)}><Trash2 size={16} /></button>}
        </>} />

      <div className="no-print grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Balance" value={<BalanceText value={p.balance} />} />
        <Stat label="Phone" value={<span className="text-base">{p.phone || '—'}</span>} />
        <Stat label="GSTIN" value={<span className="text-base">{p.gstin || '—'}</span>} sub={p.state} />
        <Stat label="Type" value={<span className="text-base capitalize">{p.type}</span>} sub={p.address} />
      </div>

      <Tabs tabs={[{ id: 'ledger', label: 'Party Ledger' }, { id: 'bills', label: isSupplier ? 'Purchase bills' : 'Sales invoices' }]} value={tab} onChange={setTab} />

      {tab === 'ledger' && (
        <>
          <div className="no-print flex flex-wrap items-center gap-2">
            <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
            <button className="btn-secondary ml-auto" onClick={() => window.print()}><Printer size={16} /> Print ledger</button>
          </div>
          <div className="card print-area p-4">
            <style>{'@page { size: A4; margin: 12mm; }'}</style>
            <div className="hidden print:block"><PrintHeader title="PARTY LEDGER" /></div>
            <div className="mb-3 mt-2 flex flex-wrap justify-between gap-2 text-sm">
              <div><b>{p.name}</b>{p.gstin && <> · GSTIN {p.gstin}</>}{p.phone && <> · {p.phone}</>}</div>
              <div className="text-slate-500">{fmtDate(range.from)} to {fmtDate(range.to)}</div>
            </div>
            {!L ? <Loading /> : (
              <table className="table">
                <thead><tr><th>Date</th><th>Particulars</th><th>Ref</th><th className="num">Debit (+)</th><th className="num">Credit (−)</th><th className="num">Balance</th></tr></thead>
                <tbody>
                  <tr className="bg-slate-50"><td colSpan={5} className="font-medium">Opening balance</td><td className="num font-medium">{balStr(L.opening)}</td></tr>
                  {L.rows.map((r: any, i: number) => (
                    <tr key={i} className="cursor-pointer" onClick={() => r.kind.startsWith('payment') ? nav('/payments') : nav(`/doc/${r.ref_id}`)}>
                      <td>{fmtDate(r.date)}</td><td>{KIND[r.kind]}</td><td>{r.ref}</td>
                      <td className="num">{r.debit ? money(r.debit) : ''}</td><td className="num">{r.credit ? money(r.credit) : ''}</td>
                      <td className="num">{balStr(r.balance)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold"><td colSpan={5}>Closing balance</td><td className="num">{balStr(L.closing)}</td></tr>
                </tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-slate-500">Dr = amount to receive from party · Cr = amount to pay to party</p>
          </div>
        </>
      )}

      {tab === 'bills' && (
        <DataTable rows={bills.data} loading={bills.isLoading} onRowClick={(r) => nav(`/doc/${r.id}`)} exportName={`${p.name}-bills`}
          columns={[
            { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'number', label: 'No.' },
            { key: 'type', label: 'Type', value: (r) => DOCS[r.type as DocType].label },
            { key: 'total', label: 'Total', num: true, total: true, render: (r) => money(r.total) },
            { key: 'paid', label: 'Paid', num: true, total: true, render: (r) => money(r.paid) },
            { key: 'balance', label: 'Due', num: true, total: true, render: (r) => <span className={r.balance > 0 ? 'text-red-600' : 'text-emerald-600'}>{money(r.balance)}</span> },
          ]} />
      )}

      {editing && <PartyForm party={p} onClose={() => setEditing(false)} />}
      {paying && <PaymentForm direction={p.balance < 0 || isSupplier ? 'out' : 'in'} partyId={p.id} onClose={() => setPaying(false)} />}
    </div>
  );
}

const balStr = (b: number) => (Math.abs(b) < 0.01 ? '0.00' : `${money(Math.abs(b))} ${b > 0 ? 'Dr' : 'Cr'}`);
