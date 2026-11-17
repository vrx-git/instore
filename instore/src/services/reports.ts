/** Expenses and reports (computed on the phone). Ported from the PC app's report queries. */
import { db } from '../data/db';
import { newId, type Doc, type DocType, type Expense } from '../data/models';
import { r2 } from './documents';

// ---------------- expenses ----------------
export const EXPENSE_CATEGORIES = ['Rent', 'Salary', 'Electricity', 'Transport', 'Tea & snacks', 'Repairs', 'Other'];

export async function addExpense(e: { date: string; category: string; accountId: string; amount: number; note?: string }, userId: string) {
  if (!(e.amount > 0)) throw new Error('Amount must be more than 0');
  const id = newId();
  await db.expenses.add({ ...e, note: e.note ?? '', id, createdBy: userId, createdAt: Date.now() } as Expense);
  return id;
}
export const deleteExpense = (id: string) => db.expenses.update(id, { deleted: 1 });

// ---------------- reports ----------------
const inRange = (d: { date: string }, from: string, to: string) => d.date >= from && d.date <= to;
const live = (d: Doc) => !d.deleted && d.status !== 'cancelled';

async function docsOf(type: DocType, from: string, to: string) {
  return (await db.docs.where('type').equals(type).toArray()).filter((d) => live(d) && inRange(d, from, to));
}

const sum = (docs: Doc[]) => ({
  count: docs.length,
  total: r2(docs.reduce((s, d) => s + d.total, 0)),
  taxable: r2(docs.reduce((s, d) => s + d.subtotal, 0)),
  tax: r2(docs.reduce((s, d) => s + d.cgst + d.sgst + d.igst, 0)),
  cost: r2(docs.reduce((s, d) => s + d.costTotal, 0)),
});

/** Profit = sales value (excl. GST) − cost of goods sold − returns' margin − expenses. */
export async function profitLoss(from: string, to: string) {
  const [sales, ret, purch, pret, exp] = await Promise.all([
    docsOf('sales_invoice', from, to), docsOf('sales_return', from, to), docsOf('purchase_invoice', from, to), docsOf('purchase_return', from, to),
    db.expenses.filter((e) => !e.deleted && inRange(e, from, to)).toArray(),
  ]);
  const S = sum(sales), R = sum(ret);
  const gross = r2(S.taxable - S.cost - (R.taxable - R.cost));
  const expenses = r2(exp.reduce((s, e) => s + e.amount, 0));
  const byCat = new Map<string, number>();
  for (const e of exp) byCat.set(e.category || 'Other', r2((byCat.get(e.category || 'Other') ?? 0) + e.amount));
  return {
    sales: S, salesReturn: R, purchase: sum(purch), purchaseReturn: sum(pret),
    grossProfit: gross, expenses, netProfit: r2(gross - expenses),
    expenseByCategory: [...byCat.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
  };
}

export type Group = 'date' | 'month' | 'party' | 'item';
export interface RegisterRow { key: string; bills: number; qty: number; taxable: number; tax: number; total: number; profit: number }

/** Sales or purchases grouped by day, month, party or item. */
export async function register(type: DocType, group: Group, from: string, to: string): Promise<RegisterRow[]> {
  const docs = await docsOf(type, from, to);
  const rows = new Map<string, RegisterRow>();
  const add = (key: string, bills: number, qty: number, taxable: number, tax: number, total: number, profit: number) => {
    const r = rows.get(key) ?? { key, bills: 0, qty: 0, taxable: 0, tax: 0, total: 0, profit: 0 };
    r.bills += bills; r.qty += qty; r.taxable += taxable; r.tax += tax; r.total += total; r.profit += profit;
    rows.set(key, r);
  };
  for (const d of docs) {
    if (group === 'item') {
      for (const l of d.lines) add(l.description, 1, l.qty, l.taxable, l.cgst + l.sgst + l.igst, l.amount, l.taxable - l.qty * l.costRate);
    } else {
      const key = group === 'party' ? d.partyName : group === 'month' ? d.date.slice(0, 7) : d.date;
      add(key, 1, d.lines.reduce((s, l) => s + l.qty, 0), d.subtotal, d.cgst + d.sgst + d.igst, d.total, d.subtotal - d.costTotal);
    }
  }
  const out = [...rows.values()].map((r) => ({ ...r, qty: Math.round(r.qty * 1000) / 1000, taxable: r2(r.taxable), tax: r2(r.tax), total: r2(r.total), profit: r2(r.profit) }));
  return group === 'date' || group === 'month' ? out.sort((a, b) => b.key.localeCompare(a.key)) : out.sort((a, b) => b.total - a.total);
}

/** GSTR-1 (sales) or GSTR-2 (purchases) style summary: B2B bills, B2C by state+rate, notes, HSN. */
export async function gstSummary(kind: 'gstr1' | 'gstr2', from: string, to: string) {
  const [invType, retType]: DocType[] = kind === 'gstr1' ? ['sales_invoice', 'sales_return'] : ['purchase_invoice', 'purchase_return'];
  const parties = new Map((await db.parties.toArray()).map((p) => [p.id, p]));
  const inv = (await docsOf(invType, from, to)).filter((d) => d.isGst);
  const notes = (await docsOf(retType, from, to)).filter((d) => d.isGst);
  const gstin = (d: Doc) => (d.partyId ? parties.get(d.partyId)?.gstin ?? '' : '');
  const b2b = inv.filter((d) => gstin(d)).map((d) => ({ ...d, gstin: gstin(d) }));
  const b2cMap = new Map<string, { placeOfSupply: string; gstRate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const d of inv.filter((x) => !gstin(x))) for (const l of d.lines) {
    const k = `${d.placeOfSupply}|${l.gstRate}`;
    const r = b2cMap.get(k) ?? { placeOfSupply: d.placeOfSupply, gstRate: l.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    r.taxable += l.taxable; r.cgst += l.cgst; r.sgst += l.sgst; r.igst += l.igst;
    b2cMap.set(k, r);
  }
  const hsnMap = new Map<string, { hsn: string; gstRate: number; qty: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const [docs, sign] of [[inv, 1], [notes, -1]] as const) for (const d of docs) for (const l of d.lines) {
    const k = `${l.hsn || '-'}|${l.gstRate}`;
    const r = hsnMap.get(k) ?? { hsn: l.hsn || '-', gstRate: l.gstRate, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    r.qty += sign * l.qty; r.taxable += sign * l.taxable; r.cgst += sign * l.cgst; r.sgst += sign * l.sgst; r.igst += sign * l.igst;
    hsnMap.set(k, r);
  }
  const round = <T extends Record<string, any>>(r: T) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v])) as T;
  const totals = (docs: Doc[]) => ({ count: docs.length, taxable: r2(docs.reduce((s, d) => s + d.subtotal, 0)), cgst: r2(docs.reduce((s, d) => s + d.cgst, 0)), sgst: r2(docs.reduce((s, d) => s + d.sgst, 0)), igst: r2(docs.reduce((s, d) => s + d.igst, 0)), total: r2(docs.reduce((s, d) => s + d.total, 0)) });
  return {
    b2b, notes, b2c: [...b2cMap.values()].map(round), hsn: [...hsnMap.values()].map(round).sort((a, b) => a.hsn.localeCompare(b.hsn)),
    summary: { invoices: totals(inv), b2b: totals(b2b), b2c: totals(inv.filter((x) => !gstin(x))), notes: totals(notes) },
  };
}

/** Rows to CSV text (for sharing/exporting a report). */
export function toCsv(header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
