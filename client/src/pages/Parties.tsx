import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import { api, qs } from '../lib/api';
import { money } from '../lib/format';
import { DataTable, PageHeader, Stat, Badge } from '../components/ui';
import { PartyForm } from '../components/PartyForm';

export function BalanceText({ value }: { value: number }) {
  if (Math.abs(value) < 0.01) return <span className="text-slate-400">Settled</span>;
  return value > 0
    ? <span className="font-medium text-emerald-600">{money(value)} <span className="text-xs font-normal">to receive</span></span>
    : <span className="font-medium text-red-600">{money(-value)} <span className="text-xs font-normal">to pay</span></span>;
}

export default function Parties() {
  const nav = useNavigate();
  const [type, setType] = useState('');
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['parties', type], queryFn: () => api.get(`/parties${qs({ type })}`) });
  const rows = data ?? [];
  const receivable = rows.filter((p: any) => p.balance > 0).reduce((s: number, p: any) => s + p.balance, 0);
  const payable = -rows.filter((p: any) => p.balance < 0).reduce((s: number, p: any) => s + p.balance, 0);

  return (
    <div>
      <PageHeader title="Parties" subtitle="Customers and suppliers with live balances"
        actions={<>
          <Link to="/import?tab=parties" className="btn-secondary"><Upload size={16} /> Import Excel</Link>
          <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add party</button>
        </>} />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Parties" value={rows.length} />
        <Stat label="Total to receive" value={money(receivable)} tone="green" />
        <Stat label="Total to pay" value={money(payable)} tone="red" />
      </div>
      <DataTable rows={rows} loading={isLoading} exportName="parties" onRowClick={(r) => nav(`/parties/${r.id}`)}
        toolbar={
          <select className="input w-auto py-1" value={type} onChange={(e) => setType(e.target.value)} aria-label="Party type">
            <option value="">All parties</option><option value="customer">Customers</option><option value="supplier">Suppliers</option>
          </select>
        }
        columns={[
          { key: 'name', label: 'Name', render: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
          { key: 'type', label: 'Type', render: (r) => <Badge tone={r.type === 'supplier' ? 'blue' : r.type === 'both' ? 'amber' : 'slate'}>{r.type}</Badge> },
          { key: 'phone', label: 'Phone' },
          { key: 'gstin', label: 'GSTIN' },
          { key: 'state', label: 'State' },
          { key: 'balance', label: 'Balance', num: true, render: (r) => <BalanceText value={r.balance} /> },
        ]} />
      {adding && <PartyForm onClose={() => setAdding(false)} onSaved={(id) => nav(`/parties/${id}`)} />}
    </div>
  );
}
