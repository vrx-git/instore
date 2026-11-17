import { db } from '../data/db';
import { newId, type Move, type MoveType } from '../data/models';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export class StockError extends Error {}

const live = (m: Move) => !m.deleted;

/** Current stock of an item, in one store or across all stores. */
export async function stockOf(itemId: string, storeId?: string): Promise<number> {
  const moves = storeId
    ? await db.moves.where('[itemId+storeId]').equals([itemId, storeId]).toArray()
    : await db.moves.where('itemId').equals(itemId).toArray();
  return r3(moves.filter(live).reduce((s, m) => s + m.qty, 0));
}

/** Stock per store for one item: { storeId: qty }. */
export async function stockByStore(itemId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await db.moves.where('itemId').equals(itemId).each((m) => {
    if (live(m)) out[m.storeId] = r3((out[m.storeId] ?? 0) + m.qty);
  });
  return out;
}

/** Total stock for every item (optionally one store): Map<itemId, qty>. */
export async function stockTotals(storeId?: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const coll = storeId ? db.moves.where('storeId').equals(storeId) : db.moves.toCollection();
  await coll.each((m) => { if (live(m)) out.set(m.itemId, r3((out.get(m.itemId) ?? 0) + m.qty)); });
  return out;
}

/**
 * Running balance after each move, per item+store, in time order.
 * Computed on read (not stored) so moves synced from other phones still show correct balances.
 */
export function balancesAfter(moves: Move[]): Map<string, number> {
  const sorted = moves.filter(live).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const running = new Map<string, number>();
  const out = new Map<string, number>();
  for (const m of sorted) {
    const k = `${m.itemId}|${m.storeId}`;
    const v = r3((running.get(k) ?? 0) + m.qty);
    running.set(k, v);
    out.set(m.id, v);
  }
  return out;
}

interface MoveInput { itemId: string; storeId: string; qty: number; type: MoveType; userId: string; note?: string; ref?: string; at?: number }

async function addMove(m: MoveInput): Promise<Move> {
  const move = {
    id: newId(), itemId: m.itemId, storeId: m.storeId, qty: r3(m.qty), type: m.type, userId: m.userId,
    note: m.note ?? '', ref: m.ref ?? newId(), at: m.at ?? Date.now(),
  } as Move;
  await db.moves.add(move);
  return move;
}

function check(qty: number) {
  if (!Number.isFinite(qty) || qty <= 0) throw new StockError('Quantity must be more than 0');
}

/** Stock received into a store. */
export async function receive(itemId: string, storeId: string, qty: number, userId: string, note = '', ref?: string) {
  check(qty);
  return db.transaction('rw', db.moves, () => addMove({ itemId, storeId, qty, type: 'in', userId, note, ref }));
}

/** Stock issued out of a store (sold, used, damaged...). */
export async function issue(itemId: string, storeId: string, qty: number, userId: string, note = '', ref?: string) {
  check(qty);
  return db.transaction('rw', db.moves, () => addMove({ itemId, storeId, qty: -qty, type: 'out', userId, note, ref }));
}

/** Opening stock when an item is first added. */
export async function opening(itemId: string, storeId: string, qty: number, userId: string) {
  check(qty);
  return db.transaction('rw', db.moves, () => addMove({ itemId, storeId, qty, type: 'opening', userId, note: 'Opening stock' }));
}

/** Physical count: sets stock to `counted` by recording the difference. Returns null if nothing changed. */
export async function setCount(itemId: string, storeId: string, counted: number, userId: string, note = '', ref?: string) {
  if (!Number.isFinite(counted) || counted < 0) throw new StockError('Count cannot be negative');
  return db.transaction('rw', db.moves, async () => {
    const diff = r3(counted - (await stockOf(itemId, storeId)));
    if (diff === 0) return null;
    return addMove({ itemId, storeId, qty: diff, type: 'adjust', userId, note: note || `Counted ${counted}`, ref });
  });
}

/** Move stock from one store to another (two linked moves). */
export async function transfer(itemId: string, fromStoreId: string, toStoreId: string, qty: number, userId: string, note = '') {
  check(qty);
  if (fromStoreId === toStoreId) throw new StockError('Choose a different store to transfer to');
  return db.transaction('rw', db.moves, async () => {
    const ref = newId();
    const out = await addMove({ itemId, storeId: fromStoreId, qty: -qty, type: 'transfer_out', userId, note, ref });
    const inn = await addMove({ itemId, storeId: toStoreId, qty, type: 'transfer_in', userId, note, ref });
    return [out, inn] as const;
  });
}

/** Quick +/- from the item screen: +1 is "in", -1 is "out". */
export function quickAdjust(itemId: string, storeId: string, delta: number, userId: string) {
  return delta > 0 ? receive(itemId, storeId, delta, userId, 'Quick +') : issue(itemId, storeId, -delta, userId, 'Quick −');
}

/** Item history, newest first, each with the balance after it. */
export async function history(itemId: string, limit = 200) {
  const moves = (await db.moves.where('itemId').equals(itemId).toArray()).filter(live);
  const bal = balancesAfter(moves);
  return moves
    .sort((a, b) => b.at - a.at || b.id.localeCompare(a.id))
    .slice(0, limit)
    .map((m) => ({ ...m, balanceAfter: bal.get(m.id) ?? 0 }));
}

/** Undo a move (soft delete so it syncs), and its transfer partner. Owner only — enforced in the UI. */
export async function deleteMove(id: string) {
  await db.transaction('rw', db.moves, async () => {
    const m = await db.moves.get(id);
    if (!m) return;
    if (m.docId) throw new StockError('This entry belongs to a bill. Edit or cancel the bill instead.');
    if (m.type === 'transfer_in' || m.type === 'transfer_out') await db.moves.where('ref').equals(m.ref).modify({ deleted: 1 });
    else await db.moves.update(id, { deleted: 1 });
  });
}
