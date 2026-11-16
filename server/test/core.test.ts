import { beforeEach, describe, expect, it } from 'vitest';
import { Db, setDb, getDb } from '../src/db/db.js';
import { createEntry, stockOf } from '../src/services/stock.js';
import { computeTotals, createPayment, deleteDocument, getDocument, saveDocument, setStatus } from '../src/services/documents.js';
import { partyBalance, partyLedger, accountBalances } from '../src/services/ledger.js';

let main: number, godown: number, itemA: number, itemB: number, localParty: number, otherParty: number, supplier: number, cash: number;

beforeEach(() => {
  setDb(new Db(':memory:'));
  const db = getDb();
  db.setSetting('business_state', 'Tamil Nadu');
  main = db.get<any>('SELECT id FROM stores').id;
  godown = db.insert('stores', { name: 'Godown', kind: 'godown' });
  itemA = db.insert('items', { name: 'A', purchase_price: 50, sale_price: 100, gst_rate: 18 });
  itemB = db.insert('items', { name: 'B', purchase_price: 10, sale_price: 20, gst_rate: 12 });
  localParty = db.insert('parties', { name: 'Local', type: 'customer', state: 'Tamil Nadu' });
  otherParty = db.insert('parties', { name: 'Outside', type: 'customer', state: 'Karnataka', gstin: '29AAAAA0000A1Z5' });
  supplier = db.insert('parties', { name: 'Sup', type: 'supplier', state: 'Tamil Nadu', opening_balance: -1000 });
  cash = db.get<any>("SELECT id FROM accounts WHERE kind='cash'").id;
});

const D = '2026-11-01';

describe('stock ledger', () => {
  it('tracks in, out and transfers per store', () => {
    createEntry({ type: 'in', date: D, store_id: main, lines: [{ item_id: itemA, qty: 10 }] });
    createEntry({ type: 'out', date: D, store_id: main, lines: [{ item_id: itemA, qty: 3 }] });
    createEntry({ type: 'transfer', date: D, store_id: main, to_store_id: godown, lines: [{ item_id: itemA, qty: 4 }] });
    expect(stockOf(itemA, main)).toBe(3);
    expect(stockOf(itemA, godown)).toBe(4);
    expect(stockOf(itemA)).toBe(7);
  });

  it('rejects transfer to the same store', () => {
    expect(() => createEntry({ type: 'transfer', date: D, store_id: main, to_store_id: main, lines: [{ item_id: itemA, qty: 1 }] })).toThrow();
  });

  it('sales, purchases and returns move stock; quotations do not', () => {
    saveDocument('purchase_invoice', { date: D, party_id: supplier, store_id: main, is_gst: true, lines: [{ item_id: itemA, qty: 20, rate: 50, gst_rate: 18 }] });
    saveDocument('quotation', { date: D, party_id: localParty, store_id: main, is_gst: true, lines: [{ item_id: itemA, qty: 5, rate: 100, gst_rate: 18 }] });
    const inv = saveDocument('sales_invoice', { date: D, party_id: localParty, store_id: main, is_gst: true, lines: [{ item_id: itemA, qty: 8, rate: 100, gst_rate: 18 }] });
    expect(stockOf(itemA)).toBe(12);
    saveDocument('sales_return', { date: D, party_id: localParty, store_id: main, is_gst: true, source_doc_id: inv, lines: [{ item_id: itemA, qty: 2, rate: 100, gst_rate: 18 }] });
    expect(stockOf(itemA)).toBe(14);
    setStatus(inv, 'cancelled');
    expect(stockOf(itemA)).toBe(22);
  });

  it('editing a bill rewrites its stock', () => {
    const inv = saveDocument('sales_invoice', { date: D, party_id: localParty, store_id: main, is_gst: false, lines: [{ item_id: itemA, qty: 5, rate: 100 }] });
    expect(stockOf(itemA)).toBe(-5);
    saveDocument('sales_invoice', { date: D, party_id: localParty, store_id: main, is_gst: false, lines: [{ item_id: itemA, qty: 2, rate: 100 }] }, inv);
    expect(stockOf(itemA)).toBe(-2);
    deleteDocument(inv);
    expect(stockOf(itemA)).toBe(0);
  });
});

describe('GST', () => {
  it('splits CGST/SGST within the state', () => {
    const t = computeTotals([{ qty: 2, rate: 100, gst_rate: 18 }], { isGst: true, intraState: true });
    expect(t).toMatchObject({ subtotal: 200, cgst: 18, sgst: 18, igst: 0, total: 236 });
  });
  it('uses IGST for other states', () => {
    const id = saveDocument('sales_invoice', { date: D, party_id: otherParty, store_id: main, is_gst: true, lines: [{ item_id: itemA, qty: 2, rate: 100, gst_rate: 18 }] });
    const doc = getDocument(id);
    expect(doc).toMatchObject({ igst: 36, cgst: 0, sgst: 0, total: 236, place_of_supply: 'Karnataka' });
  });
  it('handles discounts, tax-inclusive rates and round off', () => {
    const t = computeTotals([{ qty: 1, rate: 118, gst_rate: 18 }], { isGst: true, intraState: true, taxInclusive: true });
    expect(t.subtotal).toBe(100);
    expect(t.total).toBe(118);
    const d = computeTotals([{ qty: 3, rate: 33.33, discount_pct: 10, gst_rate: 5 }], { isGst: true, intraState: true });
    expect(d.subtotal).toBe(89.99);
    expect(d.total).toBe(94);
    expect(d.round_off).toBeCloseTo(-0.49, 2);
  });
  it('non-GST bills have no tax', () => {
    const t = computeTotals([{ qty: 1, rate: 100, gst_rate: 18 }], { isGst: false, intraState: true });
    expect(t.total).toBe(100);
  });
});

describe('conversions', () => {
  it('quotation -> invoice completes the quotation', () => {
    const q = saveDocument('quotation', { date: D, party_id: localParty, store_id: main, is_gst: true, lines: [{ item_id: itemA, qty: 1, rate: 100, gst_rate: 18 }] });
    expect(getDocument(q).status).toBe('open');
    const inv = saveDocument('sales_invoice', { date: D, party_id: localParty, store_id: main, is_gst: true, source_doc_id: q, lines: [{ item_id: itemA, qty: 1, rate: 100, gst_rate: 18 }] });
    expect(getDocument(q).status).toBe('completed');
    deleteDocument(inv);
    expect(getDocument(q).status).toBe('open');
  });
  it('challan stock moves to the invoice without double counting', () => {
    const dc = saveDocument('delivery_challan', { date: D, party_id: localParty, store_id: main, is_gst: false, lines: [{ item_id: itemB, qty: 5, rate: 20 }] });
    expect(stockOf(itemB)).toBe(-5);
    const inv = saveDocument('sales_invoice', { date: D, party_id: localParty, store_id: main, is_gst: false, source_doc_id: dc, lines: [{ item_id: itemB, qty: 5, rate: 20 }] });
    expect(stockOf(itemB)).toBe(-5);
    setStatus(inv, 'cancelled');
    expect(stockOf(itemB)).toBe(-5); // challan holds the stock again
  });
});

describe('party balances & payments', () => {
  it('computes receivable after partial payment and ledger running balance', () => {
    const inv = saveDocument('sales_invoice', { date: D, party_id: localParty, store_id: main, is_gst: true, lines: [{ item_id: itemA, qty: 10, rate: 100, gst_rate: 18 }], paid_now: 500, account_id: cash });
    expect(partyBalance(localParty)).toBe(680);
    expect(getDocument(inv).balance).toBe(680);
    createPayment({ direction: 'in', date: D, party_id: localParty, account_id: cash, amount: 180, auto_allocate: true });
    expect(partyBalance(localParty)).toBe(500);
    const l = partyLedger(localParty)!;
    expect(l.rows.map((r) => r.balance)).toEqual([1180, 680, 500]);
    expect(accountBalances().find((a) => a.id === cash).balance).toBe(680);
  });
  it('supplier opening balance and purchase make a payable', () => {
    saveDocument('purchase_invoice', { date: D, party_id: supplier, store_id: main, is_gst: false, lines: [{ item_id: itemB, qty: 10, rate: 10 }] });
    expect(partyBalance(supplier)).toBe(-1100);
    createPayment({ direction: 'out', date: D, party_id: supplier, account_id: cash, amount: 600 });
    expect(partyBalance(supplier)).toBe(-500);
  });
  it('payment allocation is capped at the bill due', () => {
    const inv = saveDocument('sales_invoice', { date: D, party_id: localParty, store_id: main, is_gst: false, lines: [{ item_id: itemB, qty: 1, rate: 100 }] });
    createPayment({ direction: 'in', date: D, party_id: localParty, account_id: cash, amount: 300, allocations: [{ doc_id: inv, amount: 300 }] });
    expect(getDocument(inv).paid).toBe(100);
    expect(partyBalance(localParty)).toBe(-200); // advance
  });
});
