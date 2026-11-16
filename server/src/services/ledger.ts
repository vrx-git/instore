import { getDb } from '../db/db.js';
import { round2 } from './util.js';

/**
 * Party balance, positive = receivable (they owe us), negative = payable (we owe them).
 * balance = opening + sales invoices - sales returns - purchase invoices + purchase returns
 *           - payments received + payments made
 */
const BALANCE_SQL = `
  p.opening_balance
  + COALESCE((SELECT SUM(CASE d.type
        WHEN 'sales_invoice' THEN d.total WHEN 'sales_return' THEN -d.total
        WHEN 'purchase_invoice' THEN -d.total WHEN 'purchase_return' THEN d.total ELSE 0 END)
      FROM documents d WHERE d.party_id = p.id AND d.status != 'cancelled'), 0)
  + COALESCE((SELECT SUM(CASE y.direction WHEN 'in' THEN -y.amount ELSE y.amount END)
      FROM payments y WHERE y.party_id = p.id), 0)`;

export function partyBalances(where = '1=1', ...params: any[]) {
  return getDb().all<any>(`SELECT p.*, ROUND(${BALANCE_SQL}, 2) balance FROM parties p WHERE ${where} ORDER BY p.name`, ...params);
}

export function partyBalance(partyId: number): number {
  return round2(getDb().get<{ b: number }>(`SELECT ${BALANCE_SQL} b FROM parties p WHERE p.id = ?`, partyId)?.b ?? 0);
}

export interface LedgerRow { date: string; kind: string; ref: string; ref_id: number | null; debit: number; credit: number; balance: number }

/** Party ledger with running balance. Debit increases receivable, credit decreases it. */
export function partyLedger(partyId: number, from?: string, to?: string) {
  const db = getDb();
  const party = db.get<any>('SELECT * FROM parties WHERE id=?', partyId);
  if (!party) return undefined;
  const rows = db.all<any>(
    `SELECT date, type kind, number ref, id ref_id,
        CASE WHEN type IN ('sales_invoice','purchase_return') THEN total ELSE 0 END debit,
        CASE WHEN type IN ('purchase_invoice','sales_return') THEN total ELSE 0 END credit, created_at
     FROM documents WHERE party_id=? AND status!='cancelled'
       AND type IN ('sales_invoice','sales_return','purchase_invoice','purchase_return')
     UNION ALL
     SELECT date, CASE direction WHEN 'in' THEN 'payment_in' ELSE 'payment_out' END, number, id,
        CASE direction WHEN 'out' THEN amount ELSE 0 END, CASE direction WHEN 'in' THEN amount ELSE 0 END, created_at
     FROM payments WHERE party_id=?
     ORDER BY date, created_at`, partyId, partyId);
  let bal = party.opening_balance;
  let opening = bal;
  const out: LedgerRow[] = [];
  for (const r of rows) {
    bal = round2(bal + r.debit - r.credit);
    if (from && r.date < from) { opening = bal; continue; }
    if (to && r.date > to) continue;
    out.push({ date: r.date, kind: r.kind, ref: r.ref, ref_id: r.ref_id, debit: r.debit, credit: r.credit, balance: bal });
  }
  const closing = out.length ? out[out.length - 1].balance : opening;
  return { party, opening: round2(opening), closing, rows: out };
}

export function accountBalances() {
  return getDb().all<any>(`
    SELECT a.*, ROUND(a.opening_balance
      + COALESCE((SELECT SUM(CASE direction WHEN 'in' THEN amount ELSE -amount END) FROM payments WHERE account_id=a.id),0)
      - COALESCE((SELECT SUM(amount) FROM expenses WHERE account_id=a.id),0)
      -- counter (walk-in) sales without a party go to the main cash account
      + CASE WHEN a.id = (SELECT MIN(id) FROM accounts WHERE kind='cash') THEN COALESCE((SELECT SUM(CASE type WHEN 'sales_invoice' THEN total ELSE -total END)
          FROM documents WHERE party_id IS NULL AND status!='cancelled' AND type IN ('sales_invoice','sales_return')),0) ELSE 0 END, 2) balance
    FROM accounts a ORDER BY a.id`);
}
