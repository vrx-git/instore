/** Payments, Expenses and Reports screens. */
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDownLeft, ArrowUpRight, Plus, Trash2, Share2 } from 'lucide-react';
import { useAccounts, useExpenses, usePayments } from '../hooks/billing';
import { useSession, useUserId } from '../hooks/session';
import { deletePayment } from '../services/payments';
import { addExpense, deleteExpense, EXPENSE_CATEGORIES, gstSummary, profitLoss, register, toCsv, type Group } from '../services/reports';
import { fmtDate, money, qty, shareFile, todayStr } from '../lib/format';
import { Chips, Empty, Field, List, Page, Row, Segmented, Sheet, StatCard, useToast } from '../components/ui';
import { PaymentSheet } from '../components/PaymentSheet';

const monthStart = () => todayStr().slice(0, 8) + '01';

function Range({ from, to, onChange }: { from: string; to: string; onChange: (f: string, t: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input type="date" className="field py-2" value={from} onChange={(e) => onChange(e.target.value, to)} aria-label="From" />
      <input type="date" className="field py-2" value={to} onChange={(e) => onChange(from, e.target.value)} aria-label="To" />
    </div>
  );
}

// ---------------------------------------------------------------- payments
export function PaymentsScreen() {
  const toast = useToast();
  const { isOwner } = useSession();
  const [dir, setDir] = useState<'' | 'in' | 'out'>('');
  const [sheet, setSheet] = useState<'in' | 'out' | null>(null);
  const pays = usePayments(dir);
  const accounts = useAccounts();
  return (
    <Page title="Payments" back>
      <div className="mt-2 grid grid-cols-2 gap-3">{accounts?.map((a) => <StatCard key={a.id} label={a.name} value={money(a.balance)} tone={a.id === 'cash' ? 'green' : 'default'} />)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn-primary" onClick={() => setSheet('in')}><ArrowDownLeft size={18} /> Received</button>
        <button className="btn-soft" onClick={() => setSheet('out')}><ArrowUpRight size={18} /> Paid</button>
      </div>
      <Chips options={[{ id: '', label: 'All' }, { id: 'in', label: 'Received' }, { id: 'out', label: 'Paid' }]} value={dir} onChange={setDir} />
      {pays === undefined ? null : pays.length ? (
        <List>{pays.map((p) => (
          <Row key={p.id}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${p.direction === 'in' ? 'bg-mint text-primary' : 'bg-[#FFEBEE] text-out'}`}>{p.direction === 'in' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span>
            <div className="min-w-0 flex-1"><div className="truncate font-medium">{p.partyName}</div><div className="truncate text-xs text-muted">{fmtDate(p.date)} · {p.accountName}{p.bills ? ` · ${p.bills}` : ''}{p.reference ? ` · ${p.reference}` : ''}</div></div>
            <span className={`font-semibold tabular-nums ${p.direction === 'in' ? 'text-primary' : 'text-out'}`}>{money(p.amount)}</span>
            {isOwner && <button className="flex h-9 w-8 items-center justify-center text-muted" aria-label="Delete payment" onClick={() => window.confirm('Delete this payment?') && deletePayment(p.id).then(() => toast('Payment deleted'))}><Trash2 size={15} /></button>}
          </Row>
        ))}</List>
      ) : <Empty title="No payments yet" />}
      <PaymentSheet open={!!sheet} onClose={() => setSheet(null)} direction={sheet ?? 'in'} />
    </Page>
  );
}

// ---------------------------------------------------------------- expenses
export function ExpensesScreen() {
  const toast = useToast();
  const userId = useUserId();
  const accounts = useAccounts();
  const [range, setRange] = useState({ from: monthStart(), to: todayStr() });
  const rows = useExpenses(range.from, range.to);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: todayStr(), category: 'Rent', accountId: 'cash', amount: '', note: '' });
  const save = async () => {
    try { await addExpense({ ...f, amount: Number(f.amount) }, userId); toast('Expense added'); setOpen(false); setF({ ...f, amount: '', note: '' }); }
    catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <Page title="Expenses" back action={<button className="tap flex w-11 items-center justify-center text-primary" onClick={() => setOpen(true)} aria-label="Add expense"><Plus size={26} /></button>}>
      <div className="space-y-3 pt-2">
        <Range from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        <StatCard label="Total" value={money((rows ?? []).reduce((s, e) => s + e.amount, 0))} tone="out" />
        {rows === undefined ? null : rows.length ? (
          <List>{rows.map((e) => (
            <Row key={e.id}>
              <div className="min-w-0 flex-1"><div className="font-medium">{e.category}</div><div className="truncate text-xs text-muted">{fmtDate(e.date)} · {e.accountName}{e.note ? ` · ${e.note}` : ''}</div></div>
              <span className="font-semibold tabular-nums">{money(e.amount)}</span>
              <button className="flex h-9 w-8 items-center justify-center text-muted" aria-label="Delete expense" onClick={() => window.confirm('Delete this expense?') && deleteExpense(e.id)}><Trash2 size={15} /></button>
            </Row>
          ))}</List>
        ) : <Empty title="No expenses in this period" />}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add expense">
        <div className="space-y-3">
          <Field label="Amount ₹"><input className="field text-lg font-semibold" type="number" inputMode="decimal" autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Category">
            <input className="field" list="exp-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
            <datalist id="exp-cats">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><input className="field" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Paid from"><select className="field" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>{accounts?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          </div>
          <Field label="Note"><input className="field" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          <button className="btn-primary w-full" disabled={!(Number(f.amount) > 0)} onClick={save}>Save expense</button>
        </div>
      </Sheet>
    </Page>
  );
}

// ---------------------------------------------------------------- reports
type Tab = 'profit' | 'sales' | 'purchase' | 'gstr1' | 'gstr2';

export function ReportsScreen() {
  const [tab, setTab] = useState<Tab>('profit');
  const [range, setRange] = useState({ from: monthStart(), to: todayStr() });
  return (
    <Page title="Reports" back>
      <div className="space-y-3 pt-2">
        <Chips options={[{ id: 'profit', label: 'Profit & loss' }, { id: 'sales', label: 'Sales' }, { id: 'purchase', label: 'Purchases' }, { id: 'gstr1', label: 'GSTR-1' }, { id: 'gstr2', label: 'GSTR-2' }]} value={tab} onChange={setTab} />
        <Range from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        {tab === 'profit' && <Profit {...range} />}
        {(tab === 'sales' || tab === 'purchase') && <Register type={tab === 'sales' ? 'sales_invoice' : 'purchase_invoice'} {...range} />}
        {(tab === 'gstr1' || tab === 'gstr2') && <Gst kind={tab} {...range} />}
      </div>
    </Page>
  );
}

function Line({ l, v, strong, tone = '' }: { l: string; v: number; strong?: boolean; tone?: string }) {
  return <Row><span className={`flex-1 ${strong ? 'font-semibold' : ''}`}>{l}</span><span className={`tabular-nums ${strong ? 'font-bold' : ''} ${tone}`}>{money(v)}</span></Row>;
}

function Profit({ from, to }: { from: string; to: string }) {
  const d = useLiveQuery(() => profitLoss(from, to), [from, to]);
  if (!d) return null;
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Sales (with GST)" value={money(d.sales.total)} sub={`${d.sales.count} bills`} tone="green" />
        <StatCard label="Net profit" value={money(d.netProfit)} tone={d.netProfit >= 0 ? 'green' : 'out'} />
      </div>
      <List>
        <Line l="Sales (excl. GST)" v={d.sales.taxable} />
        <Line l="Less: sales returns" v={-d.salesReturn.taxable} />
        <Line l="Less: cost of goods sold" v={-(d.sales.cost - d.salesReturn.cost)} />
        <Line l="Gross profit" v={d.grossProfit} strong tone="text-primary" />
        <Line l="Less: expenses" v={-d.expenses} />
        <Line l="Net profit" v={d.netProfit} strong tone={d.netProfit >= 0 ? 'text-primary' : 'text-out'} />
      </List>
      <List>
        <Line l="Purchases (with GST)" v={d.purchase.total} />
        <Line l="Purchase returns" v={d.purchaseReturn.total} />
        {d.expenseByCategory.map((e) => <Line key={e.category} l={`Expense: ${e.category}`} v={e.amount} />)}
      </List>
      <p className="px-1 text-xs text-muted">Cost of goods uses each item's purchase price at the time of sale.</p>
    </>
  );
}

function Register({ type, from, to }: { type: 'sales_invoice' | 'purchase_invoice'; from: string; to: string }) {
  const [group, setGroup] = useState<Group>('date');
  const rows = useLiveQuery(() => register(type, group, from, to), [type, group, from, to]);
  const total = (rows ?? []).reduce((s, r) => s + r.total, 0);
  const share = () => rows && shareFile(`${type === 'sales_invoice' ? 'sales' : 'purchases'}-${group}-${from}-${to}.csv`,
    toCsv([group, 'Bills', 'Qty', 'Taxable', 'GST', 'Total', 'Profit'], rows.map((r) => [r.key, r.bills, r.qty, r.taxable, r.tax, r.total, r.profit])));
  return (
    <>
      <Segmented options={[{ id: 'date', label: 'Day' }, { id: 'month', label: 'Month' }, { id: 'party', label: 'Party' }, { id: 'item', label: 'Item' }]} value={group} onChange={setGroup} />
      <div className="flex items-center justify-between px-1"><span className="font-semibold">Total {money(total)}</span><button className="flex items-center gap-1 text-sm font-medium text-primary" onClick={share}><Share2 size={16} /> Share CSV</button></div>
      {rows?.length ? (
        <List>{rows.map((r) => (
          <Row key={r.key}>
            <div className="min-w-0 flex-1"><div className="truncate font-medium">{group === 'date' ? fmtDate(r.key) : r.key}</div><div className="text-xs text-muted">{group === 'item' ? `${qty(r.qty)} qty` : `${r.bills} bills`} · GST {money(r.tax)}{type === 'sales_invoice' ? ` · profit ${money(r.profit)}` : ''}</div></div>
            <span className="font-semibold tabular-nums">{money(r.total)}</span>
          </Row>
        ))}</List>
      ) : <Empty title="Nothing in this period" />}
    </>
  );
}

function Gst({ kind, from, to }: { kind: 'gstr1' | 'gstr2'; from: string; to: string }) {
  const d = useLiveQuery(() => gstSummary(kind, from, to), [kind, from, to]);
  if (!d) return null;
  const s = d.summary.invoices;
  const share = () => shareFile(`${kind}-hsn-${from}-${to}.csv`, toCsv(['HSN', 'GST %', 'Qty', 'Taxable', 'CGST', 'SGST', 'IGST'], d.hsn.map((h) => [h.hsn, h.gstRate, h.qty, h.taxable, h.cgst, h.sgst, h.igst])));
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Taxable value" value={money(s.taxable)} sub={`${s.count} bills`} />
        <StatCard label="Total GST" value={money(s.cgst + s.sgst + s.igst)} sub={`IGST ${money(s.igst)}`} tone="green" />
      </div>
      <h3 className="section-title">{kind === 'gstr1' ? 'B2B (registered customers)' : 'From registered suppliers'} · {d.summary.b2b.count}</h3>
      {d.b2b.length ? <List>{d.b2b.map((b) => <Row key={b.id}><div className="min-w-0 flex-1"><div className="truncate font-medium">{b.partyName}</div><div className="text-xs text-muted">{b.number} · {b.gstin}</div></div><span className="tabular-nums">{money(b.total)}</span></Row>)}</List> : <p className="px-1 text-sm text-muted">None</p>}
      <h3 className="section-title">{kind === 'gstr1' ? 'B2C by state & rate' : 'Unregistered'}</h3>
      {d.b2c.length ? <List>{d.b2c.map((r) => <Row key={`${r.placeOfSupply}${r.gstRate}`}><span className="flex-1">{r.placeOfSupply} · {r.gstRate}%</span><span className="tabular-nums">{money(r.taxable)}</span></Row>)}</List> : <p className="px-1 text-sm text-muted">None</p>}
      <div className="flex items-end justify-between"><h3 className="section-title">HSN summary</h3><button className="pb-2 text-sm font-medium text-primary" onClick={share}><Share2 size={14} className="inline" /> Share CSV</button></div>
      {d.hsn.length ? <List>{d.hsn.map((h) => <Row key={`${h.hsn}${h.gstRate}`}><span className="flex-1">{h.hsn} · {h.gstRate}%</span><span className="text-sm text-muted">{qty(h.qty)}</span><span className="tabular-nums">{money(h.taxable)}</span></Row>)}</List> : <p className="px-1 text-sm text-muted">None</p>}
      <p className="px-1 text-xs text-muted">Use these totals when filing on the GST portal; check with your accountant before filing.</p>
    </>
  );
}
