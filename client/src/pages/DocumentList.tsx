import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, qs } from '../lib/api';
import { money, fmtDate, daysAgo, today } from '../lib/format';
import { DOCS, docBySlug } from '../lib/docTypes';
import { useSession } from '../lib/session';
import { DataTable, DateRange, PageHeader, Stat, StatusBadge, Badge } from '../components/ui';

export default function DocumentList() {
  const { slug = '' } = useParams();
  const type = docBySlug(slug);
  const nav = useNavigate();
  const { can } = useSession();
  const [range, setRange] = useState({ from: daysAgo(90), to: today() });
  const [status, setStatus] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['documents', type, range, status], enabled: !!type,
    queryFn: () => api.get(`/documents/${type}${qs({ ...range, status })}`),
  });
  if (!type) return <Navigate to="/" replace />;
  const meta = DOCS[type];
  const rows = data ?? [];
  const isInvoice = type === 'sales_invoice' || type === 'purchase_invoice';
  const live = rows.filter((r: any) => r.status !== 'cancelled');

  return (
    <div>
      <PageHeader title={meta.plural}
        actions={<button className="btn-primary" onClick={() => nav(`/${slug}/new`)}><Plus size={16} /> New {meta.label}</button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Count" value={live.length} />
        <Stat label="Total value" value={money(live.reduce((s: number, r: any) => s + r.total, 0))} tone="blue" />
        {isInvoice && <Stat label={type === 'sales_invoice' ? 'Unpaid (to receive)' : 'Unpaid (to pay)'} value={money(live.reduce((s: number, r: any) => s + Math.max(0, r.balance), 0))} tone={type === 'sales_invoice' ? 'green' : 'red'} />}
        {type === 'sales_invoice' && can('reports') && <Stat label="Profit" value={money(live.reduce((s: number, r: any) => s + r.profit, 0))} tone="green" />}
        {meta.hasStatus && <Stat label="Open" value={rows.filter((r: any) => r.status === 'open').length} tone="amber" />}
      </div>
      <DataTable rows={rows} loading={isLoading} exportName={meta.slug} onRowClick={(r) => nav(`/doc/${r.id}`)}
        empty={<span>No {meta.plural.toLowerCase()} in this period.</span>}
        toolbar={<>
          <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
          <select className="input w-auto py-1" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All status</option><option value="open">Open</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
          </select>
        </>}
        columns={[
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'number', label: 'No.', render: (r) => <span className="font-medium text-slate-900">{r.number}</span> },
          { key: 'party_name', label: meta.partyLabel },
          { key: 'is_gst', label: 'GST', value: (r) => (r.is_gst ? 'GST' : 'Non-GST'), render: (r) => r.is_gst ? <Badge tone="blue">GST</Badge> : <Badge>Non-GST</Badge> },
          { key: 'total', label: 'Amount', num: true, total: true, render: (r) => <span className={r.status === 'cancelled' ? 'line-through text-slate-400' : 'font-medium'}>{money(r.total)}</span> },
          ...(isInvoice ? [{ key: 'balance', label: 'Due', num: true, total: true, render: (r: any) => r.status === 'cancelled' ? '' : r.balance > 0.009 ? <span className="text-red-600">{money(r.balance)}</span> : <Badge tone="green">Paid</Badge> }] : []),
          ...(type === 'sales_invoice' && can('reports') ? [{ key: 'profit', label: 'Profit', num: true, total: true, render: (r: any) => money(r.profit) }] : []),
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]} />
    </div>
  );
}
