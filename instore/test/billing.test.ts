import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addRecord, InstoreDb, useDatabase, db, setSetting } from '../src/data/db';
import { createItem } from '../src/services/items';
import { setupOwner } from '../src/services/auth';
import { stockOf, deleteMove } from '../src/services/stock';
import {
  computeTotals, saveDocument, setStatus, deleteDocument, nextNumber, duplicateNumbers, renumber, paidAmounts, docPaid, DocError,
} from '../src/services/documents';
import { createParty, blankParty, partyBalances, partyLedger, stateFromGstin } from '../src/services/parties';
import { createPayment, accountBalances, openBills, ensureAccounts } from '../src/services/payments';
import { addExpense, profitLoss, register, gstSummary } from '../src/services/reports';
import { syncOnce, FIRST_LOG_ROW, type LogRow, type SyncBackend } from '../src/sync/engine';

const D = '2026-11-15';
let n = 0;
let owner = '', main = '', godown = '', itemA = '', itemB = '', local = '', other = '', supplier = '';

beforeEach(async () => {
  useDatabase(new InstoreDb(`bill-${++n}`));
  owner = await setupOwner('Owner', '1234', 'Shop');
  await setSetting('business_state', 'Tamil Nadu');
  main = (await db.stores.toCollection().first())!.id;
  godown = await addRecord(db.stores, { name: 'Godown', kind: 'godown', active: 1 });
  const base = { sku: '', barcode: '', categoryId: null, unit: 'PCS', hsn: '8536', location: '', lowStockQty: 0 };
  itemA = await createItem({ ...base, name: 'A', purchasePrice: 50, salePrice: 100, gstRate: 18 });
  itemB = await createItem({ ...base, name: 'B', purchasePrice: 10, salePrice: 20, gstRate: 12 });
  local = await createParty({ ...blankParty('customer'), name: 'Local', state: 'Tamil Nadu' });
  other = await createParty({ ...blankParty('customer'), name: 'Outside', state: 'Karnataka', gstin: '29AAAAA0000A1Z5' });
  supplier = await createParty({ ...blankParty('supplier'), name: 'Sup', state: 'Tamil Nadu', openingBalance: -1000 });
  await ensureAccounts();
});

const line = (itemId: string, qty: number, rate: number, gstRate = 0) => ({ itemId, qty, rate, gstRate });

describe('GST', () => {
  it('splits CGST/SGST within the state and uses IGST across states', async () => {
    expect(computeTotals([{ qty: 2, rate: 100, gstRate: 18 }], { isGst: true, intraState: true })).toMatchObject({ subtotal: 200, cgst: 18, sgst: 18, igst: 0, total: 236 });
    const id = await saveDocument('sales_invoice', { date: D, partyId: other, storeId: main, isGst: true, lines: [line(itemA, 2, 100, 18)] }, owner);
    expect(await db.docs.get(id)).toMatchObject({ igst: 36, cgst: 0, sgst: 0, total: 236, placeOfSupply: 'Karnataka' });
  });
  it('handles tax-inclusive rates, discounts and round off', () => {
    const inc = computeTotals([{ qty: 1, rate: 118, gstRate: 18 }], { isGst: true, intraState: true, taxInclusive: true });
    expect(inc.subtotal).toBe(100); expect(inc.total).toBe(118);
    const d = computeTotals([{ qty: 3, rate: 33.33, discountPct: 10, gstRate: 5 }], { isGst: true, intraState: true });
    expect(d.subtotal).toBe(89.99); expect(d.total).toBe(94); expect(d.roundOff).toBeCloseTo(-0.49, 2);
    expect(computeTotals([{ qty: 1, rate: 100, gstRate: 18 }], { isGst: false, intraState: true }).total).toBe(100);
  });
  it('reads the state from a GSTIN', () => expect(stateFromGstin('33ABCDE1234F1Z5')).toBe('Tamil Nadu'));
});

describe('bills and stock', () => {
  it('purchases add, sales and returns adjust, quotes do nothing', async () => {
    await saveDocument('purchase_invoice', { date: D, partyId: supplier, storeId: main, isGst: true, lines: [line(itemA, 20, 50, 18)] }, owner);
    await saveDocument('quotation', { date: D, partyId: local, storeId: main, isGst: true, lines: [line(itemA, 5, 100, 18)] }, owner);
    const inv = await saveDocument('sales_invoice', { date: D, partyId: local, storeId: main, isGst: true, lines: [line(itemA, 8, 100, 18)] }, owner);
    expect(await stockOf(itemA)).toBe(12);
    await saveDocument('sales_return', { date: D, partyId: local, storeId: main, isGst: true, sourceId: inv, lines: [line(itemA, 2, 100, 18)] }, owner);
    expect(await stockOf(itemA)).toBe(14);
    await setStatus(inv, 'cancelled');
    expect(await stockOf(itemA)).toBe(22);
    await setStatus(inv, 'completed');
    expect(await stockOf(itemA)).toBe(14);
  });
  it('editing a bill rewrites its stock in place; deleting reverses it', async () => {
    const inv = await saveDocument('sales_invoice', { date: D, partyId: local, storeId: main, isGst: false, lines: [line(itemA, 5, 100), line(itemB, 3, 20)] }, owner);
    expect(await stockOf(itemA)).toBe(-5); expect(await stockOf(itemB)).toBe(-3);
    await saveDocument('sales_invoice', { date: D, partyId: local, storeId: main, isGst: false, lines: [line(itemA, 2, 100)] }, owner, inv);
    expect(await stockOf(itemA)).toBe(-2); expect(await stockOf(itemB)).toBe(0);
    expect((await db.moves.where('docId').equals(inv).toArray()).map((m) => m.id).sort()).toEqual([`${inv}:0`, `${inv}:1`]);
    await deleteDocument(inv);
    expect(await stockOf(itemA)).toBe(0);
  });
  it('bill stock entries cannot be deleted from item history', async () => {
    const inv = await saveDocument('sales_invoice', { date: D, partyId: local, storeId: main, isGst: false, lines: [line(itemA, 1, 100)] }, owner);
    await expect(deleteMove(`${inv}:0`)).rejects.toThrow(/belongs to a bill/);
  });
  it('requires items, quantities and a party', async () => {
    await expect(saveDocument('sales_invoice', { date: D, storeId: main, isGst: false, lines: [] }, owner)).rejects.toBeInstanceOf(DocError);
    await expect(saveDocument('purchase_invoice', { date: D, storeId: main, isGst: false, lines: [line(itemA, 1, 1)] }, owner)).rejects.toBeInstanceOf(DocError);
    await expect(saveDocument('sales_invoice', { date: D, storeId: main, isGst: false, lines: [line(itemA, 0, 1)] }, owner)).rejects.toBeInstanceOf(DocError);
  });
});

describe('conversions', () => {
  it('quote → invoice completes the quote; deleting the invoice re-opens it', async () => {
    const q = await saveDocument('quotation', { date: D, partyId: local, storeId: main, isGst: true, lines: [line(itemA, 1, 100, 18)] }, owner);
    expect((await db.docs.get(q))?.status).toBe('open');
    const inv = await saveDocument('sales_invoice', { date: D, partyId: local, storeId: main, isGst: true, sourceId: q, lines: [line(itemA, 1, 100, 18)] }, owner);
    expect((await db.docs.get(q))?.status).toBe('completed');
    await deleteDocument(inv);
    expect((await db.docs.get(q))?.status).toBe('open');
  });
  it('challan stock moves to the invoice without double counting', async () => {
    const dc = await saveDocument('delivery_challan', { date: D, partyId: local, storeId: main, isGst: false, lines: [line(itemB, 5, 20)] }, owner);
    expect(await stockOf(itemB)).toBe(-5);
    const inv = await saveDocument('sales_invoice', { date: D, partyId: local, storeId: main, isGst: false, sourceId: dc, lines: [line(itemB, 5, 20)] }, owner);
    expect(await stockOf(itemB)).toBe(-5);
    await setStatus(inv, 'cancelled');
    expect(await stockOf(itemB)).toBe(-5); // challan holds the stock again
  });
});

describe('payments and balances', () => {
  it('partial payment at the counter, auto allocation, ledger and cash balance', async () => {
    const inv = await saveDocument('sales_invoice', { date: D, partyId: local, storeId: main, isGst: true, lines: [line(itemA, 10, 100, 18)], paidNow: 500, accountId: 'cash' }, owner);
    const bal = async () => (await partyBalances()).find((p) => p.id === local)!.balance;
    expect(await bal()).toBe(680);
    expect(docPaid((await db.docs.get(inv))!, await paidAmounts())).toBe(500);
    await createPayment({ direction: 'in', date: D, partyId: local, accountId: 'bank', amount: 180, autoAllocate: true }, owner);
    expect(await bal()).toBe(500);
    expect((await openBills(local, 'in'))[0].due).toBe(500);
    const l = (await partyLedger(local))!;
    expect(l.rows.map((r) => r.balance)).toEqual([1180, 680, 500]);
    const acc = await accountBalances();
    expect(acc.find((a) => a.id === 'cash')!.balance).toBe(500);
    expect(acc.find((a) => a.id === 'bank')!.balance).toBe(180);
  });
  it('supplier opening balance and purchases make a payable; overpayment becomes an advance', async () => {
    const pur = await saveDocument('purchase_invoice', { date: D, partyId: supplier, storeId: main, isGst: false, lines: [line(itemB, 10, 10)] }, owner);
    const bal = async (id: string) => (await partyBalances()).find((p) => p.id === id)!.balance;
    expect(await bal(supplier)).toBe(-1100);
    await createPayment({ direction: 'out', date: D, partyId: supplier, accountId: 'cash', amount: 300, allocations: [{ docId: pur, amount: 300 }] }, owner);
    expect(docPaid((await db.docs.get(pur))!, await paidAmounts())).toBe(100); // capped at the bill due
    expect(await bal(supplier)).toBe(-800);
  });
  it('walk-in cash sales count as paid and go to Cash', async () => {
    const inv = await saveDocument('sales_invoice', { date: D, partyName: 'Walk-in', storeId: main, isGst: false, lines: [line(itemB, 2, 20)] }, owner);
    expect(docPaid((await db.docs.get(inv))!, await paidAmounts())).toBe(40);
    expect((await accountBalances()).find((a) => a.id === 'cash')!.balance).toBe(40);
  });
});

describe('numbering', () => {
  it('numbers per type and flags duplicates from offline phones', async () => {
    expect(await nextNumber('sales_invoice')).toBe('INV-0001');
    const a = await saveDocument('sales_invoice', { date: D, partyId: local, storeId: main, isGst: false, lines: [line(itemB, 1, 20)] }, owner);
    expect((await db.docs.get(a))?.number).toBe('INV-0001');
    const b = await saveDocument('sales_invoice', { number: 'INV-0001', date: D, partyId: local, storeId: main, isGst: false, lines: [line(itemB, 1, 20)] }, owner);
    expect((await duplicateNumbers('sales_invoice')).has(b)).toBe(true);
    await renumber(b);
    expect((await db.docs.get(b))?.number).toBe('INV-0002');
    expect((await duplicateNumbers('sales_invoice')).size).toBe(0);
    expect(await nextNumber('purchase_invoice')).toBe('PUR-0001');
  });
});

describe('reports', () => {
  it('profit, registers and GST summary', async () => {
    await saveDocument('sales_invoice', { date: D, partyId: other, storeId: main, isGst: true, lines: [line(itemA, 2, 100, 18)] }, owner);
    await saveDocument('sales_invoice', { date: D, partyName: 'Walk-in', storeId: main, isGst: true, lines: [line(itemB, 5, 20, 12)] }, owner);
    await addExpense({ date: D, category: 'Rent', accountId: 'cash', amount: 50 }, owner);
    const pl = await profitLoss('2026-11-01', '2026-11-30');
    expect(pl.sales.taxable).toBe(300);
    expect(pl.grossProfit).toBe(300 - (2 * 50 + 5 * 10));
    expect(pl.netProfit).toBe(pl.grossProfit - 50);
    const byItem = await register('sales_invoice', 'item', '2026-11-01', '2026-11-30');
    expect(byItem.map((r) => r.key)).toEqual(['A', 'B']);
    const g = await gstSummary('gstr1', '2026-11-01', '2026-11-30');
    expect(g.summary.b2b.count).toBe(1);
    expect(g.summary.b2b.igst).toBe(36);
    expect(g.b2c[0]).toMatchObject({ placeOfSupply: 'Tamil Nadu', gstRate: 12, taxable: 100, cgst: 6, sgst: 6 });
  });
});

describe('sync of bills between two phones', () => {
  class FakeSheet implements SyncBackend {
    log: LogRow[] = [];
    async appendLog(rows: LogRow[]) { this.log.push(...rows); }
    async readLog(from: number) { return { rows: this.log.slice(from - FIRST_LOG_ROW), nextRow: FIRST_LOG_ROW + this.log.length }; }
  }
  it('bills, payments and stock agree on both phones', async () => {
    const sheet = new FakeSheet();
    const A = db;
    await saveDocument('purchase_invoice', { date: D, partyId: supplier, storeId: main, isGst: false, lines: [line(itemA, 10, 50)] }, owner);
    await syncOnce(A, sheet, 'A');
    const B = new InstoreDb(`bill-B-${n}`);
    await syncOnce(B, sheet, 'B');
    useDatabase(B);
    const inv = await saveDocument('sales_invoice', { date: D, partyId: local, storeId: main, isGst: false, lines: [line(itemA, 4, 100)], paidNow: 100, accountId: 'cash' }, owner);
    await syncOnce(B, sheet, 'B');
    useDatabase(A);
    await syncOnce(A, sheet, 'A');
    for (const d of [A, B]) {
      useDatabase(d);
      expect(await stockOf(itemA, main)).toBe(6);
      expect((await partyBalances()).find((p) => p.id === local)!.balance).toBe(300);
      expect(docPaid((await db.docs.get(inv))!, await paidAmounts())).toBe(100);
      expect(await nextNumber('sales_invoice')).toBe('INV-0002');
    }
  });
});
