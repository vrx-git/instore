import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, PackagePlus } from 'lucide-react';
import { api, qs } from '../lib/api';
import { fmtDate, qty, daysAgo, today } from '../lib/format';
import { DataTable, DateRange, PageHeader, Badge } from '../components/ui';

export const ENTRY_TYPES = {
  in: { label: 'Stock In', tone: 'green' as const, receipt: 'STOCK RECEIVE RECEIPT' },
  out: { label: 'Stock Out', tone: 'red' as const, receipt: 'STOCK ISSUE RECEIPT' },
  transfer: { label: 'Transfer', tone: 'blue' as const, receipt: 'STOCK TRANSFER NOTE' },
  opening: { label: 'Opening', tone: 'slate' as const, receipt: 'OPENING STOCK' },
};

export default function StockEntries() {
  const nav = useNavigate();
  const [type, setType] = useState('');
  const [range, setRange] = useState({ from: daysAgo(90), to: today() });
  const { data, isLoading } = useQuery({ queryKey: ['stock-entries', type, range], queryFn: () => api.get(`/stock-entries${qs({ type, ...range })}`) });

  return (
    <div>
      <PageHeader title="Stock In / Out" subtitle="Manual stock entries and transfers between stores (bills update stock automatically)"
        actions={<>
          <button className="btn-primary" onClick={() => nav('/stock/new/in')}><ArrowDownToLine size={16} /> Stock In</button>
          <button className="btn-secondary" onClick={() => nav('/stock/new/out')}><ArrowUpFromLine size={16} /> Stock Out</button>
          <button className="btn-secondary" onClick={() => nav('/stock/new/transfer')}><ArrowLeftRight size={16} /> Transfer</button>
          <button className="btn-secondary" onClick={() => nav('/stock/new/opening')}><PackagePlus size={16} /> Opening</button>
        </>} />
      <DataTable rows={data} loading={isLoading} exportName="stock-entries" onRowClick={(r) => nav(`/stock/${r.id}`)}
        toolbar={<>
          <select className="input w-auto py-1" value={type} onChange={(e) => setType(e.target.value)} aria-label="Entry type">
            <option value="">All types</option>
            {Object.entries(ENTRY_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        </>}
        columns={[
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'number', label: 'No.', render: (r) => <span className="font-medium">{r.number}</span> },
          { key: 'type', label: 'Type', value: (r) => ENTRY_TYPES[r.type as keyof typeof ENTRY_TYPES].label, render: (r) => { const t = ENTRY_TYPES[r.type as keyof typeof ENTRY_TYPES]; return <Badge tone={t.tone}>{t.label}</Badge>; } },
          { key: 'store_name', label: 'Store', value: (r) => (r.to_store_name ? `${r.store_name} → ${r.to_store_name}` : r.store_name) },
          { key: 'person', label: 'Person' },
          { key: 'item_count', label: 'Items', num: true },
          { key: 'total_qty', label: 'Total qty', num: true, render: (r) => qty(r.total_qty) },
          { key: 'note', label: 'Note', className: 'max-w-48 truncate' },
        ]} />
    </div>
  );
}
