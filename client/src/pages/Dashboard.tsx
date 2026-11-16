import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { money, qty, fmtDate, daysAgo } from '../lib/format';
import { useSession } from '../lib/session';
import { DOCS, type DocType } from '../lib/docTypes';
import { PageHeader, Stat, Loading, Empty } from '../components/ui';

export default function Dashboard() {
  const { can } = useSession();
  const nav = useNavigate();
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/reports/dashboard'), enabled: can('reports') });
  const items = useQuery({ queryKey: ['items', 'low'], queryFn: () => api.get('/items?low=1'), enabled: !can('reports') });

  const quick = (
    <>
      <Link to="/sales/new" className="btn-primary"><Plus size={16} /> Sales Invoice</Link>
      <Link to="/purchases/new" className="btn-secondary"><Plus size={16} /> Purchase</Link>
      <Link to="/stock/new/in" className="btn-secondary"><Plus size={16} /> Stock In</Link>
      <Link to="/stock/new/out" className="btn-secondary"><Plus size={16} /> Stock Out</Link>
    </>
  );

  if (!can('reports')) {
    return (
      <div>
        <PageHeader title="Dashboard" actions={quick} />
        <LowStock rows={items.data?.filter((i: any) => i.low_stock_qty > 0)} />
      </div>
    );
  }
  if (!data) return <Loading />;

  // last 30 days chart data (fill missing days)
  const byDate = new Map<string, any>(data.last30.map((r: any) => [r.date, r]));
  const days = Array.from({ length: 30 }, (_, i) => daysAgo(29 - i)).map((d) => ({ date: d, sales: byDate.get(d)?.sales ?? 0, purchase: byDate.get(d)?.purchase ?? 0 }));
  const max = Math.max(1, ...days.map((d) => Math.max(d.sales, d.purchase)));

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" subtitle="Your business at a glance" actions={quick} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today's sales" value={money(data.today.sales.total)} sub={`${data.today.sales.count} bills · profit ${money(data.today.gross_profit)}`} tone="blue" onClick={() => nav('/sales')} />
        <Stat label="This month's sales" value={money(data.month.sales.total)} sub={`${data.month.sales.count} bills`} onClick={() => nav('/reports/sales')} />
        <Stat label="This month's purchase" value={money(data.month.purchase.total)} sub={`${data.month.purchase.count} bills`} onClick={() => nav('/purchases')} />
        <Stat label="Month net profit" value={money(data.month.net_profit)} sub={`gross ${money(data.month.gross_profit)} − exp ${money(data.month.expenses)}`} tone={data.month.net_profit >= 0 ? 'green' : 'red'} onClick={() => nav('/reports/profit')} />
        <Stat label="To receive" value={money(data.receivable)} tone="green" sub="from customers" onClick={() => nav('/reports/receivables')} />
        <Stat label="To pay" value={money(data.payable)} tone="red" sub="to suppliers" onClick={() => nav('/reports/receivables')} />
        <Stat label="Stock value" value={money(data.stock.value)} sub={`${data.item_count} items · ${qty(data.stock.qty)} qty`} onClick={() => nav('/reports/stock')} />
        <Stat label="Low stock items" value={data.lowCount} tone={data.lowCount ? 'amber' : 'default'} sub={`${data.open_orders} open orders/quotes`} onClick={() => nav('/items?low=1')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Last 30 days</h2>
            <div className="flex gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand" /> Sales</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Purchase</span>
            </div>
          </div>
          <div className="flex h-44 items-end gap-[3px]">
            {days.map((d) => (
              <div key={d.date} className="group relative flex h-full flex-1 items-end gap-px" title={`${fmtDate(d.date)}\nSales ${money(d.sales)}\nPurchase ${money(d.purchase)}`}>
                <div className="flex-1 rounded-t-sm bg-brand" style={{ height: `${(d.sales / max) * 100}%` }} />
                <div className="flex-1 rounded-t-sm bg-slate-300" style={{ height: `${(d.purchase / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-slate-400"><span>{fmtDate(days[0].date)}</span><span>Today</span></div>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Cash & bank</h2>
          <div className="space-y-2">
            {data.accounts.map((a: any) => (
              <div key={a.id} className="flex justify-between text-sm"><span className="text-slate-600">{a.name}</span><span className="font-medium tabular-nums">{money(a.balance)}</span></div>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
              <span>Total</span><span className="tabular-nums">{money(data.accounts.reduce((s: number, a: any) => s + a.balance, 0))}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LowStock rows={data.low} />
        <div className="card">
          <h2 className="border-b border-slate-200 px-4 py-3 font-semibold">Recent activity</h2>
          {data.recent.length ? (
            <table className="table">
              <tbody>
                {data.recent.map((r: any) => (
                  <tr key={r.id} className="cursor-pointer" onClick={() => nav(`/doc/${r.id}`)}>
                    <td><div className="font-medium">{r.number}</div><div className="text-xs text-slate-500">{DOCS[r.type as DocType].label}</div></td>
                    <td className="text-slate-600">{r.party_name}</td>
                    <td className="text-slate-500">{fmtDate(r.date)}</td>
                    <td className="num font-medium">{money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No bills yet</Empty>}
        </div>
      </div>
    </div>
  );
}

function LowStock({ rows }: { rows?: any[] }) {
  const nav = useNavigate();
  return (
    <div className="card">
      <h2 className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 font-semibold"><AlertTriangle size={16} className="text-amber-500" /> Low stock</h2>
      {rows?.length ? (
        <table className="table">
          <thead><tr><th>Item</th><th className="num">In stock</th><th className="num">Alert at</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer" onClick={() => nav(`/items/${r.id}`)}>
                <td className="font-medium">{r.name}</td>
                <td className={`num ${r.stock <= 0 ? 'text-red-600' : 'text-amber-600'}`}>{qty(r.stock)} {r.unit}</td>
                <td className="num text-slate-500">{qty(r.low_stock_qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Empty>All items are above their low-stock level</Empty>}
    </div>
  );
}
