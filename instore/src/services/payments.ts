/** Payments in/out, bill allocations, cash & bank balances. Ported from the PC app. */
import { db } from '../data/db';
import { newId, type Account, type Allocation, type Payment } from '../data/models';
import { docPaid, paidAmounts, r2 } from './documents';

export class PaymentError extends Error {}

export interface PaymentInput {
  direction: 'in' | 'out';
  date: string;
  partyId: string;
  accountId: string;
  amount: number;
  reference?: string;
  note?: string;
  allocations?: Allocation[];
  /** spread the amount over the party's oldest unpaid bills */
  autoAllocate?: boolean;
}

/** Cash and Bank use fixed ids so every phone shares the same two accounts. */
export async function ensureAccounts() {
  if (!(await db.accounts.get('cash'))) await db.accounts.add({ id: 'cash', name: 'Cash', kind: 'cash', openingBalance: 0 } as Account);
  if (!(await db.accounts.get('bank'))) await db.accounts.add({ id: 'bank', name: 'Bank / UPI', kind: 'bank', openingBalance: 0 } as Account);
}

async function nextPaymentNumber(direction: 'in' | 'out') {
  const prefix = direction === 'in' ? 'RCPT' : 'PAY';
  let max = 0;
  await db.payments.each((p) => { if (p.direction === direction) { const m = /(\d+)\s*$/.exec(p.number); if (m) max = Math.max(max, +m[1]); } });
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

/** Unpaid bills for a party: invoices for money in, purchase bills for money out. Oldest first. */
export async function openBills(partyId: string, direction: 'in' | 'out') {
  const type = direction === 'in' ? 'sales_invoice' : 'purchase_invoice';
  const paid = await paidAmounts();
  return (await db.docs.where('partyId').equals(partyId).toArray())
    .filter((d) => d.type === type && !d.deleted && d.status !== 'cancelled')
    .map((d) => ({ doc: d, due: r2(d.total - docPaid(d, paid)) }))
    .filter((x) => x.due > 0.009)
    .sort((a, b) => a.doc.date.localeCompare(b.doc.date) || a.doc.createdAt - b.doc.createdAt);
}

/** Create a payment (call inside an existing transaction that includes docs + payments). */
export async function createPaymentInTx(input: PaymentInput, userId: string): Promise<string> {
  if (!(input.amount > 0)) throw new PaymentError('Amount must be more than 0');
  const bills = await openBills(input.partyId, input.direction);
  const due = new Map(bills.map((b) => [b.doc.id, b.due]));
  let wanted = input.allocations ?? [];
  if (!wanted.length && input.autoAllocate) {
    let left = input.amount;
    wanted = [];
    for (const b of bills) { if (left <= 0) break; const a = Math.min(b.due, left); wanted.push({ docId: b.doc.id, amount: a }); left -= a; }
  }
  // Never allocate more than a bill's due or more than the payment.
  const allocations: Allocation[] = [];
  let used = 0;
  for (const a of wanted) {
    const amt = r2(Math.min(a.amount, due.get(a.docId) ?? 0, input.amount - used));
    if (amt > 0) { allocations.push({ docId: a.docId, amount: amt }); used += amt; }
  }
  const id = newId();
  await db.payments.add({
    id, direction: input.direction, number: await nextPaymentNumber(input.direction), date: input.date, partyId: input.partyId,
    accountId: input.accountId || 'cash', amount: r2(input.amount), reference: input.reference ?? '', note: input.note ?? '',
    allocations, createdBy: userId, createdAt: Date.now(),
  } as Payment);
  return id;
}

export function createPayment(input: PaymentInput, userId: string) {
  return db.transaction('rw', [db.docs, db.payments], () => createPaymentInTx(input, userId));
}

export const deletePayment = (id: string) => db.payments.update(id, { deleted: 1 });

/** Balance of each account: opening + money in − money out − expenses (+ walk-in cash sales into Cash). */
export async function accountBalances() {
  const [stored, payments, expenses, docs] = await Promise.all([
    db.accounts.filter((a) => !a.deleted).toArray(), db.payments.filter((p) => !p.deleted).toArray(),
    db.expenses.filter((e) => !e.deleted).toArray(), db.docs.filter((d) => !d.deleted && d.status !== 'cancelled' && !d.partyId).toArray(),
  ]);
  // Read-only: if Cash/Bank haven't been created yet, show them anyway.
  const accounts: Account[] = [...stored];
  for (const [id, name, kind] of [['cash', 'Cash', 'cash'], ['bank', 'Bank / UPI', 'bank']] as const) {
    if (!accounts.some((a) => a.id === id)) accounts.push({ id, name, kind, openingBalance: 0, updatedAt: 0, deleted: 0, dirty: 0 });
  }
  accounts.sort((a, b) => (a.id === 'cash' ? -1 : b.id === 'cash' ? 1 : a.name.localeCompare(b.name)));
  const counter = docs.reduce((s, d) => s + (d.type === 'sales_invoice' ? d.total : d.type === 'sales_return' ? -d.total : 0), 0);
  return accounts.map((a) => ({
    ...a,
    balance: r2(a.openingBalance
      + payments.filter((p) => p.accountId === a.id).reduce((s, p) => s + (p.direction === 'in' ? p.amount : -p.amount), 0)
      - expenses.filter((e) => e.accountId === a.id).reduce((s, e) => s + e.amount, 0)
      + (a.id === 'cash' ? counter : 0)),
  }));
}
