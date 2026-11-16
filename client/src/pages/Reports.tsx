import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { api, qs } from '../lib/api';
import { money, qty, fmtDate, monthStart, today, amount } from '../lib/format';
import { DOCS, type DocType } from '../lib/docTypes';
import { DataTable, DateRange, Loading, PageHeader, Stat, Tabs } from '../components/ui';
import { BalanceText } from './Parties';

const TABS = [
  { id: 'profit', label: 'Profit & Loss' },
  { id: 'sales', label: 'Sales' },
  { id: 'purchase', label: 'Purchase' },
  { id: 'stock', label: 'Stock Summary' },
  { id: 'stores', label: 'Store-wise Stock' },
  { id: 'daily', label: 'Daily Stock Flow' },
  { id: 'receivables', label: 'Receivable / Payable' },
  { id: 'gstr1', label: 'GSTR-1' },
  { id: 'gstr2', label: 'GSTR-2' },
  { id: 'pricelist', label: 'Price List' },
  { id: 'all', label: 'All Transactions' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function Reports() {
  const { tab = 'profit' } = useParams() as { tab?: Tab };
  const nav = useNavigate();
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const needsRange = !['stores', 'receivables', 'pricelist'].includes(tab);

  return (
    <div>
      <PageHeader title="Reports" actions={<button className="btn-secondary" onClick={() => window.print()}><Printer size={16} /> Print</button>} />
      <Tabs tabs={TABS as any} value={tab} onChange={(t) => nav(`/reports/${t}`)} />
      {needsRange && <div className="no-print mb-4"><DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} /></div>}
      <div className="print-area">
        <div className="mb-2 hidden text-lg font-semibold print:block">{TABS.find((t) => t.id === tab)?.label} {needsRange && `(${fmtDate(range.from)} – ${fmtDate(range.to)})`}</div>
        {tab === 'profit' && <ProfitLoss range={range} />}
        {tab === 'sales' && <Register type="sales_invoice" range={range} />}
        {tab === 'purchase' && <Register type="purchase_invoice" range={range} />}
        {tab === 'stock' && <StockSummary range={range} />}
        {tab === 'stores' && <StoreStock />}
        {tab === 'daily' && <DailyStock range={range} />}
        {tab === 'receivables' && <Receivables />}
        {tab === 'gstr1' && <Gst kind="gstr1" range={range} />}
        {tab === 'gstr2' && <Gst kind="gstr2" range={range} />}
        {tab === 'pricelist' && <PriceList />}
        {tab === 'all' && <AllTx range={range} />}
      </div>
    </div>
  );
}

type R = { range: { from: string; to: string } };

function ProfitLoss({ range }: R) {
  const { data: d } = useQuery({ queryKey: ['pl', range], queryFn: () => api.get(`/reports/profit-loss${qs(range)}`) });
  if (!d) return <Loading />;
  const line = (l: string, v: number, strong = false, tone = '') => (
    <div className={`flex justify-between border-b border-slate-100 py-2 ${strong ? 'font-semibold' : ''} ${tone}`}><span>{l}</span><span className="tabular-nums">{money(v)}</span></div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <h3 className="mb-2 font-semibold">Trading summary (excluding GST)</h3>
        {line(`Sales (${d.sales.count} bills)`, d.sales.taxable)}
        {line('Less: sales returns', -d.sales_return.taxable)}
        {line('Less: cost of goods sold', -(d.sales.cost - (d.sales_return.cost || 0)))}
        {line('Gross profit', d.gross_profit, true, 'text-emerald-700')}
        {line('Less: expenses', -d.expenses)}
        {line('Net profit', d.net_profit, true, d.net_profit >= 0 ? 'text-emerald-700' : 'text-red-600')}
        <p className="mt-2 text-xs text-slate-500">Cost of goods is based on each item's purchase price at the time of sale.</p>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Sales (with GST)" value={money(d.sales.total)} tone="blue" />
          <Stat label="Purchases (with GST)" value={money(d.purchase.total)} />
          <Stat label="Sales returns" value={money(d.sales_return.total)} />
          <Stat label="Purchase returns" value={money(d.purchase_return.total)} />
        </div>
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Expenses by category</h3>
          {d.expense_by_category.length ? d.expense_by_category.map((e: any) => line(e.category, e.amount)) : <p className="text-sm text-slate-400">No expenses</p>}
        </div>
      </div>
    </div>
  );
}

function Register({ type, range }: R & { type: DocType }) {
  const [group, setGroup] = useState('date');
  const { data, isLoading } = useQuery({ queryKey: ['register', type, group, range], queryFn: () => api.get(`/reports/register${qs({ type, group, ...range })}`) });
  const label = { date: 'Date', month: 'Month', party: 'Party', item: 'Item' }[group]!;
  return (
    <DataTable rows={data} loading={isLoading} rowKey="name" exportName={`${DOCS[type].plural}-by-${group}`}
      toolbar={
        <select className="input w-auto py-1" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group by">
          <option value="date">Day wise</option><option value="month">Month wise</option><option value="party">Party wise</option><option value="item">Item wise</option>
        </select>
      }
      columns={[
        { key: 'name', label, render: (r) => (group === 'date' ? fmtDate(r.name) : r.name) },
        ...(group === 'item' ? [{ key: 'qty', label: 'Qty', num: true, total: true, render: (r: any) => `${qty(r.qty)} ${r.unit ?? ''}` }] : [{ key: 'bills', label: 'Bills', num: true, total: true, render: (r: any) => r.bills }]),
        { key: 'taxable', label: 'Taxable', num: true, total: true, render: (r) => money(r.taxable) },
        { key: 'tax', label: 'GST', num: true, total: true, render: (r) => money(r.tax) },
        { key: 'total', label: 'Total', num: true, total: true, render: (r) => <b>{money(r.total)}</b> },
        ...(type === 'sales_invoice' ? [{ key: 'profit', label: 'Profit', num: true, total: true, render: (r: any) => money(r.profit) }] : []),
      ]} />
  );
}

function StockSummary({ range }: R) {
  const stores = useQuery({ queryKey: ['stores'], queryFn: () => api.get('/stores') });
  const [store, setStore] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['stock-summary', range, store], queryFn: () => api.get(`/reports/stock-summary${qs({ ...range, store_id: store })}`) });
  return (
    <DataTable rows={data} loading={isLoading} exportName="stock-summary"
      toolbar={
        <select className="input w-auto py-1" value={store} onChange={(e) => setStore(e.target.value)} aria-label="Store">
          <option value="">All stores</option>{stores.data?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      }
      columns={[
        { key: 'name', label: 'Item', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'category_name', label: 'Category' },
        { key: 'opening', label: 'Opening', num: true, render: (r) => qty(r.opening) },
        { key: 'qty_in', label: 'In', num: true, render: (r) => <span className="text-emerald-600">{qty(r.qty_in)}</span> },
        { key: 'qty_out', label: 'Out', num: true, render: (r) => <span className="text-red-600">{qty(r.qty_out)}</span> },
        { key: 'closing', label: 'Closing', num: true, render: (r) => <b className={r.low_stock_qty && r.closing <= r.low_stock_qty ? 'text-amber-600' : ''}>{qty(r.closing)} {r.unit}</b> },
        { key: 'value', label: 'Value (cost)', num: true, total: true, render: (r) => money(r.value) },
      ]} />
  );
}

function StoreStock() {
  const { data } = useQuery({ queryKey: ['stock-by-store'], queryFn: () => api.get('/reports/stock-by-store') });
  if (!data) return <Loading />;
  return (
    <DataTable rows={data.rows} exportName="store-wise-stock"
      columns={[
        { key: 'name', label: 'Item', render: (r) => <span className="font-medium">{r.name}</span> },
        ...data.stores.map((s: any) => ({ key: `s${s.id}`, label: s.name, num: true, value: (r: any) => r.per[s.id], render: (r: any) => qty(r.per[s.id]) })),
        { key: 'total', label: 'Total', num: true, render: (r) => <b>{qty(r.total)} {r.unit}</b> },
      ]} />
  );
}

function DailyStock({ range }: R) {
  const { data, isLoading } = useQuery({ queryKey: ['daily-stock', range], queryFn: () => api.get(`/reports/daily-stock${qs(range)}`) });
  return (
    <DataTable rows={data} loading={isLoading} rowKey="_" exportName="daily-stock-flow"
      columns={[
        { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
        { key: 'item_name', label: 'Item' },
        { key: 'qty_in', label: 'In', num: true, render: (r) => <span className="text-emerald-600">{r.qty_in ? qty(r.qty_in) : ''}</span> },
        { key: 'qty_out', label: 'Out', num: true, render: (r) => <span className="text-red-600">{r.qty_out ? qty(r.qty_out) : ''}</span> },
        { key: 'unit', label: 'Unit' },
      ]} />
  );
}

function Receivables() {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['receivables'], queryFn: () => api.get('/reports/receivables') });
  const rows = data ?? [];
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Total to receive" value={money(rows.filter((r: any) => r.balance > 0).reduce((s: number, r: any) => s + r.balance, 0))} tone="green" />
        <Stat label="Total to pay" value={money(-rows.filter((r: any) => r.balance < 0).reduce((s: number, r: any) => s + r.balance, 0))} tone="red" />
      </div>
      <DataTable rows={rows} loading={isLoading} exportName="receivable-payable" onRowClick={(r) => nav(`/parties/${r.id}`)} initialSort={{ key: 'balance', dir: -1 }}
        columns={[
          { key: 'name', label: 'Party', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'phone', label: 'Phone' },
          { key: 'type', label: 'Type' },
          { key: 'balance', label: 'Balance', num: true, render: (r) => <BalanceText value={r.balance} /> },
        ]} />
    </>
  );
}

function Gst({ kind, range }: R & { kind: 'gstr1' | 'gstr2' }) {
  const nav = useNavigate();
  const { data: d } = useQuery({ queryKey: [kind, range], queryFn: () => api.get(`/reports/${kind}${qs(range)}`) });
  if (!d) return <Loading />;
  const s = d.summary;
  const docCols = [
    { key: 'date', label: 'Date', render: (r: any) => fmtDate(r.date) },
    { key: 'number', label: 'No.' },
    { key: 'party_name', label: 'Party' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'place_of_supply', label: 'POS' },
    { key: 'taxable', label: 'Taxable', num: true, total: true, render: (r: any) => amount(r.taxable) },
    { key: 'cgst', label: 'CGST', num: true, total: true, render: (r: any) => amount(r.cgst) },
    { key: 'sgst', label: 'SGST', num: true, total: true, render: (r: any) => amount(r.sgst) },
    { key: 'igst', label: 'IGST', num: true, total: true, render: (r: any) => amount(r.igst) },
    { key: 'total', label: 'Invoice value', num: true, total: true, render: (r: any) => amount(r.total) },
  ];
  const taxCols = (extra: any[]) => [
    ...extra,
    { key: 'taxable', label: 'Taxable', num: true, total: true, render: (r: any) => amount(r.taxable) },
    { key: 'cgst', label: 'CGST', num: true, total: true, render: (r: any) => amount(r.cgst) },
    { key: 'sgst', label: 'SGST', num: true, total: true, render: (r: any) => amount(r.sgst) },
    { key: 'igst', label: 'IGST', num: true, total: true, render: (r: any) => amount(r.igst) },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={kind === 'gstr1' ? 'Invoices' : 'Bills'} value={s.invoices.count} />
        <Stat label="Taxable value" value={money(s.invoices.taxable)} />
        <Stat label="CGST + SGST" value={money(s.invoices.cgst + s.invoices.sgst)} />
        <Stat label="IGST" value={money(s.invoices.igst)} />
        <Stat label={kind === 'gstr1' ? 'Credit notes' : 'Debit notes'} value={money(s.notes.total)} sub={`${s.notes.count} returns`} />
      </div>
      <section>
        <h3 className="mb-2 font-semibold">{kind === 'gstr1' ? 'B2B invoices (registered customers)' : 'Bills from registered suppliers'} — {s.b2b.count}</h3>
        <DataTable rows={d.b2b} columns={docCols} exportName={`${kind}-b2b`} onRowClick={(r) => nav(`/doc/${r.id}`)} />
      </section>
      <section>
        <h3 className="mb-2 font-semibold">{kind === 'gstr1' ? 'B2C (unregistered) — summary by place of supply & rate' : 'Unregistered suppliers — summary'}</h3>
        <DataTable rows={d.b2c} rowKey="_" searchable={false} exportName={`${kind}-b2c`}
          columns={taxCols([{ key: 'place_of_supply', label: 'Place of supply' }, { key: 'gst_rate', label: 'Rate', num: true, render: (r: any) => `${r.gst_rate}%` }])} />
      </section>
      <section>
        <h3 className="mb-2 font-semibold">{kind === 'gstr1' ? 'Credit notes (sales returns)' : 'Debit notes (purchase returns)'}</h3>
        <DataTable rows={d.notes} columns={docCols} exportName={`${kind}-notes`} onRowClick={(r) => nav(`/doc/${r.id}`)} />
      </section>
      <section>
        <h3 className="mb-2 font-semibold">HSN-wise summary</h3>
        <DataTable rows={d.hsn} rowKey="_" exportName={`${kind}-hsn`}
          columns={taxCols([{ key: 'hsn', label: 'HSN' }, { key: 'unit', label: 'UQC' }, { key: 'qty', label: 'Qty', num: true, render: (r: any) => qty(r.qty) }, { key: 'gst_rate', label: 'Rate', num: true, render: (r: any) => `${r.gst_rate}%` }])} />
      </section>
      <p className="text-xs text-slate-500">These summaries help you fill the GST return on the GST portal. Please verify with your accountant before filing.</p>
    </div>
  );
}

function PriceList() {
  const { data, isLoading } = useQuery({ queryKey: ['price-list'], queryFn: () => api.get('/reports/price-list') });
  return (
    <DataTable rows={data} loading={isLoading} rowKey="name" exportName="price-list"
      columns={[
        { key: 'name', label: 'Item', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'sku', label: 'Code' },
        { key: 'category_name', label: 'Category' },
        { key: 'unit', label: 'Unit' },
        { key: 'hsn', label: 'HSN' },
        { key: 'gst_rate', label: 'GST', num: true, render: (r) => `${r.gst_rate}%` },
        { key: 'mrp', label: 'MRP', num: true, render: (r) => money(r.mrp) },
        { key: 'sale_price', label: 'Price', num: true, render: (r) => <b>{money(r.sale_price)}</b> },
      ]} />
  );
}

const TX_LABEL: Record<string, string> = {
  ...Object.fromEntries(Object.entries(DOCS).map(([k, v]) => [k, v.label])),
  payment_in: 'Payment In', payment_out: 'Payment Out', expense: 'Expense',
  stock_in: 'Stock In', stock_out: 'Stock Out', stock_transfer: 'Stock Transfer', stock_opening: 'Opening Stock',
};

function AllTx({ range }: R) {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['all-tx', range], queryFn: () => api.get(`/reports/transactions${qs(range)}`) });
  return (
    <DataTable rows={data} loading={isLoading} rowKey="_" exportName="all-transactions"
      onRowClick={(r) => (DOCS[r.kind as DocType] ? nav(`/doc/${r.ref_id}`) : r.kind.startsWith('stock_') ? nav(`/stock/${r.ref_id}`) : r.kind === 'expense' ? nav('/expenses') : nav('/payments'))}
      columns={[
        { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
        { key: 'kind', label: 'Type', value: (r) => TX_LABEL[r.kind] ?? r.kind },
        { key: 'ref', label: 'Ref' },
        { key: 'party', label: 'Party / Note' },
        { key: 'status', label: 'Status' },
        { key: 'amount', label: 'Amount', num: true, render: (r) => (r.amount == null ? '' : money(r.amount)) },
      ]} />
  );
}
