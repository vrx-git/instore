import { db } from '../data/db';
import type { Move, MoveType } from '../data/models';

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const newRef = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export class StockError extends Error {}

/** Current stock of an item, in one store or across all stores. */
export async function stockOf(itemId: number, storeId?: number): Promise<number> {
  const moves = storeId
    ? await db.moves.where('[itemId+storeId]').equals([itemId, storeId]).toArray()
    : await db.moves.where('itemId').equals(itemId).toArray();
  return r3(moves.reduce((s, m) => s + m.qty, 0));
}

/** Stock per store for one item: { storeId: qty }. */
export async function stockByStore(itemId: number): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  await db.moves.where('itemId').equals(itemId).each((m) => {
    out[m.storeId] = r3((out[m.storeId] ?? 0) + m.qty);
  });
  return out;
}

/** Total stock for every item (optionally one store): Map<itemId, qty>. */
export async function stockTotals(storeId?: number): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const coll = storeId ? db.moves.where('storeId').equals(storeId) : db.moves.toCollection();
  await coll.each((m) => out.set(m.itemId, r3((out.get(m.itemId) ?? 0) + m.qty)));
  return out;
}

interface MoveInput {
  itemId: number;
  storeId: number;
  qty: number;
  type: MoveType;
  userId: number;
  note?: string;
  ref?: string;
  at?: number;
}

async function addMove(m: MoveInput): Promise<Move> {
  const before = await stockOf(m.itemId, m.storeId);
  const move: Move = {
    itemId: m.itemId, storeId: m.storeId, qty: r3(m.qty), type: m.type, userId: m.userId,
    note: m.note ?? '', ref: m.ref ?? newRef(), at: m.at ?? Date.now(), balanceAfter: r3(before + m.qty),
  };
  move.id = await db.moves.add(move);
  return move;
}

function check(qty: number) {
  if (!Number.isFinite(qty) || qty <= 0) throw new StockError('Quantity must be more than 0');
}

/** Stock received into a store. */
export async function receive(itemId: number, storeId: number, qty: number, userId: number, note = '', ref?: string) {
  check(qty);
  return db.transaction('rw', db.moves, () => addMove({ itemId, storeId, qty, type: 'in', userId, note, ref }));
}

/** Stock issued out of a store (sold, used, damaged...). */
export async function issue(itemId: number, storeId: number, qty: number, userId: number, note = '', ref?: string) {
  check(qty);
  return db.transaction('rw', db.moves, () => addMove({ itemId, storeId, qty: -qty, type: 'out', userId, note, ref }));
}

/** Opening stock when an item is first added. */
export async function opening(itemId: number, storeId: number, qty: number, userId: number) {
  check(qty);
  return db.transaction('rw', db.moves, () => addMove({ itemId, storeId, qty, type: 'opening', userId, note: 'Opening stock' }));
}

/** Physical count: sets stock to `counted` by recording the difference. Returns null if nothing changed. */
export async function setCount(itemId: number, storeId: number, counted: number, userId: number, note = '', ref?: string) {
  if (!Number.isFinite(counted) || counted < 0) throw new StockError('Count cannot be negative');
  return db.transaction('rw', db.moves, async () => {
    const diff = r3(counted - (await stockOf(itemId, storeId)));
    if (diff === 0) return null;
    return addMove({ itemId, storeId, qty: diff, type: 'adjust', userId, note: note || `Counted ${counted}`, ref });
  });
}

/** Move stock from one store to another (two linked moves). */
export async function transfer(itemId: number, fromStoreId: number, toStoreId: number, qty: number, userId: number, note = '') {
  check(qty);
  if (fromStoreId === toStoreId) throw new StockError('Choose a different store to transfer to');
  return db.transaction('rw', db.moves, async () => {
    const ref = newRef();
    const out = await addMove({ itemId, storeId: fromStoreId, qty: -qty, type: 'transfer_out', userId, note, ref });
    const inn = await addMove({ itemId, storeId: toStoreId, qty, type: 'transfer_in', userId, note, ref });
    return [out, inn] as const;
  });
}

/** Quick +/- from the item screen: +1 is "in", -1 is "out". */
export function quickAdjust(itemId: number, storeId: number, delta: number, userId: number) {
  return delta > 0 ? receive(itemId, storeId, delta, userId, 'Quick +') : issue(itemId, storeId, -delta, userId, 'Quick −');
}

/** Item history, newest first. */
export function history(itemId: number, limit = 200) {
  return db.moves.where('itemId').equals(itemId).reverse().sortBy('at').then((m) => m.slice(0, limit));
}

/** Undo a move by deleting it (and its transfer partner). Owner only — enforced in the UI. */
export async function deleteMove(id: number) {
  await db.transaction('rw', db.moves, async () => {
    const m = await db.moves.get(id);
    if (!m) return;
    if (m.type === 'transfer_in' || m.type === 'transfer_out') await db.moves.where('ref').equals(m.ref).delete();
    else await db.moves.delete(id);
  });
}
