import { getDb } from '../db/db.js';
import { bad, nextNumber, round2 } from './util.js';

export type MoveType =
  | 'opening' | 'in' | 'out' | 'transfer_in' | 'transfer_out'
  | 'sale' | 'purchase' | 'sale_return' | 'purchase_return' | 'challan';

export interface EntryLine { item_id: number; qty: number; rate?: number }
export interface EntryInput {
  type: 'in' | 'out' | 'transfer' | 'opening';
  date: string;
  store_id: number;
  to_store_id?: number | null;
  person?: string;
  note?: string;
  number?: string;
  lines: EntryLine[];
}

const ENTRY_PREFIX = { in: 'SIN', out: 'SOUT', transfer: 'TRF', opening: 'OPN' } as const;

export function stockOf(itemId: number, storeId?: number): number {
  const db = getDb();
  const r = storeId
    ? db.get<{ q: number }>('SELECT COALESCE(SUM(qty),0) q FROM stock_moves WHERE item_id=? AND store_id=?', itemId, storeId)
    : db.get<{ q: number }>('SELECT COALESCE(SUM(qty),0) q FROM stock_moves WHERE item_id=?', itemId);
  return round2(r?.q ?? 0);
}

export function createEntry(input: EntryInput, userId?: number) {
  const db = getDb();
  if (!input.lines?.length) throw bad('Add at least one item');
  if (input.type === 'transfer') {
    if (!input.to_store_id) throw bad('Choose the store to transfer to');
    if (input.to_store_id === input.store_id) throw bad('From and To store must be different');
  }
  for (const l of input.lines) {
    if (!(l.qty > 0)) throw bad('Quantity must be greater than 0');
  }
  return db.tx(() => {
    const number = input.number || nextNumber(ENTRY_PREFIX[input.type], 'stock_entries', 'type = ?', input.type);
    const entryId = db.insert('stock_entries', {
      number, type: input.type, date: input.date, store_id: input.store_id,
      to_store_id: input.type === 'transfer' ? input.to_store_id : null,
      person: input.person, note: input.note, created_by: userId,
    });
    for (const l of input.lines) {
      const item = db.get<{ purchase_price: number }>('SELECT purchase_price FROM items WHERE id=?', l.item_id);
      if (!item) throw bad(`Item ${l.item_id} not found`);
      const rate = l.rate ?? item.purchase_price;
      const base = { item_id: l.item_id, rate, entry_id: entryId, date: input.date, note: input.note };
      switch (input.type) {
        case 'in': db.insert('stock_moves', { ...base, store_id: input.store_id, qty: l.qty, type: 'in' }); break;
        case 'opening': db.insert('stock_moves', { ...base, store_id: input.store_id, qty: l.qty, type: 'opening' }); break;
        case 'out': db.insert('stock_moves', { ...base, store_id: input.store_id, qty: -l.qty, type: 'out' }); break;
        case 'transfer':
          db.insert('stock_moves', { ...base, store_id: input.store_id, qty: -l.qty, type: 'transfer_out' });
          db.insert('stock_moves', { ...base, store_id: input.to_store_id, qty: l.qty, type: 'transfer_in' });
          break;
      }
    }
    return entryId;
  });
}

export function getEntry(id: number) {
  const db = getDb();
  const entry = db.get(
    `SELECT e.*, s.name store_name, t.name to_store_name FROM stock_entries e
     JOIN stores s ON s.id = e.store_id LEFT JOIN stores t ON t.id = e.to_store_id WHERE e.id = ?`, id);
  if (!entry) return undefined;
  const lines = db.all(
    `SELECT m.item_id, i.name item_name, i.unit, ABS(m.qty) qty, m.rate FROM stock_moves m JOIN items i ON i.id = m.item_id
     WHERE m.entry_id = ? AND m.type NOT IN ('transfer_in') ORDER BY m.id`, id);
  return { ...entry, lines };
}
