/** View-model hooks: live Dexie queries shaped for each screen. Soft-deleted records are hidden. */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import { stockStatus, type Item, type Move, type StockStatus } from '../data/models';
import { matches } from '../services/items';
import { balancesAfter } from '../services/stock';

export interface ItemRow extends Item { stock: number; status: StockStatus; value: number; categoryName: string }
export interface ItemFilter { search?: string; status?: 'all' | 'low' | 'out'; categoryId?: string | null; storeId?: string | null }

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const liveMoves = () => db.moves.filter((m) => !m.deleted).toArray();

async function totals(storeId?: string | null) {
  const out = new Map<string, number>();
  const coll = storeId ? db.moves.where('storeId').equals(storeId) : db.moves.toCollection();
  await coll.each((m) => { if (!m.deleted) out.set(m.itemId, r3((out.get(m.itemId) ?? 0) + m.qty)); });
  return out;
}

export function useItems(f: ItemFilter = {}): ItemRow[] | undefined {
  return useLiveQuery(async () => {
    const [items, cats, stock] = await Promise.all([db.items.toArray(), db.categories.toArray(), totals(f.storeId)]);
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    return items
      .filter((i) => i.active && !i.deleted)
      .filter((i) => !f.categoryId || i.categoryId === f.categoryId)
      .filter((i) => matches(i, f.search ?? ''))
      .map((i) => {
        const q = stock.get(i.id) ?? 0;
        return { ...i, stock: q, status: stockStatus(q, i.lowStockQty), value: Math.round(q * i.purchasePrice * 100) / 100, categoryName: i.categoryId ? catName.get(i.categoryId) ?? '' : '' };
      })
      .filter((i) => !f.status || f.status === 'all' || (f.status === 'low' ? i.status === 'low' : i.status === 'out'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [f.search, f.status, f.categoryId, f.storeId]);
}

export function useItem(id: string) {
  return useLiveQuery(async () => {
    const item = await db.items.get(id);
    if (!item || item.deleted) return null;
    const [all, stores, cat] = await Promise.all([
      db.moves.where('itemId').equals(id).toArray(),
      db.stores.filter((s) => !s.deleted).toArray(),
      item.categoryId ? db.categories.get(item.categoryId) : undefined,
    ]);
    const moves0 = all.filter((m) => !m.deleted);
    const bal = balancesAfter(moves0);
    const perStore = stores.map((s) => ({ ...s, stock: r3(moves0.filter((m) => m.storeId === s.id).reduce((t, m) => t + m.qty, 0)) }));
    const stock = r3(moves0.reduce((t, m) => t + m.qty, 0));
    const moves = moves0.map((m) => ({ ...m, balanceAfter: bal.get(m.id) ?? 0 })).sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
    return { item, stock, status: stockStatus(stock, item.lowStockQty), perStore, moves, categoryName: cat && !cat.deleted ? cat.name : '' };
  }, [id]);
}

export interface ActivityRow extends Move { itemName: string; unit: string; storeName: string; userName: string; balanceAfter: number }
export interface ActivityFilter { userId?: string | null; type?: string; storeId?: string | null; from?: string; to?: string; itemId?: string; limit?: number }

/** Lookup maps so activity rows can show names. */
async function names() {
  const [items, stores, users] = await Promise.all([db.items.toArray(), db.stores.toArray(), db.users.toArray()]);
  return {
    item: new Map(items.map((i) => [i.id, i])),
    store: new Map(stores.map((s) => [s.id, s.name])),
    user: new Map(users.map((u) => [u.id, u.name])),
  };
}

function decorate(moves: Move[], n: Awaited<ReturnType<typeof names>>, bal: Map<string, number>): ActivityRow[] {
  return moves.map((m) => ({
    ...m, itemName: n.item.get(m.itemId)?.name ?? 'Deleted item', unit: n.item.get(m.itemId)?.unit ?? '',
    storeName: n.store.get(m.storeId) ?? '—', userName: n.user.get(m.userId) ?? 'Unknown', balanceAfter: bal.get(m.id) ?? 0,
  }));
}

export function useActivity(f: ActivityFilter = {}) {
  return useLiveQuery(async () => {
    const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : 0;
    const to = f.to ? new Date(`${f.to}T23:59:59.999`).getTime() : Number.MAX_SAFE_INTEGER;
    const all = await liveMoves();
    const bal = balancesAfter(all);
    const moves = all
      .filter((m) => m.at >= from && m.at <= to)
      .filter((m) =>
        (!f.userId || m.userId === f.userId) && (!f.storeId || m.storeId === f.storeId) && (!f.itemId || m.itemId === f.itemId) &&
        (!f.type || (f.type === 'transfer' ? m.type.startsWith('transfer') : m.type === f.type)))
      .sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
    return decorate(moves.slice(0, f.limit ?? 500), await names(), bal);
  }, [f.userId, f.type, f.storeId, f.from, f.to, f.itemId, f.limit]);
}

export function useDashboard() {
  return useLiveQuery(async () => {
    const [items, all, n] = await Promise.all([db.items.filter((i) => !!i.active && !i.deleted).toArray(), liveMoves(), names()]);
    const stock = new Map<string, number>();
    for (const m of all) stock.set(m.itemId, r3((stock.get(m.itemId) ?? 0) + m.qty));
    let units = 0, value = 0, outCount = 0, lowCount = 0;
    const low: ItemRow[] = [];
    for (const i of items) {
      const q = stock.get(i.id) ?? 0;
      const st = stockStatus(q, i.lowStockQty);
      units += Math.max(0, q);
      value += Math.max(0, q) * i.purchasePrice;
      if (st === 'out') outCount++;
      if (st === 'low') lowCount++;
      if (st !== 'ok') low.push({ ...i, stock: q, status: st, value: 0, categoryName: '' });
    }
    low.sort((a, b) => a.stock - b.stock);
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const today = all.filter((m) => m.at >= startOfDay.getTime() && !m.type.startsWith('transfer'));
    const recent = [...all].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id)).slice(0, 10);
    return {
      itemCount: items.length, units: r3(units), value: Math.round(value * 100) / 100, lowCount, outCount,
      low: low.slice(0, 8), recent: decorate(recent, n, balancesAfter(all)),
      todayIn: r3(today.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0)),
      todayOut: r3(-today.filter((m) => m.qty < 0).reduce((s, m) => s + m.qty, 0)),
    };
  });
}

export const useStores = (all = false) => useLiveQuery(() => db.stores.filter((s) => !s.deleted && (all || !!s.active)).toArray());
export const useCategories = () => useLiveQuery(() => db.categories.orderBy('name').filter((c) => !c.deleted).toArray());
export const useUsers = () => useLiveQuery(() => db.users.filter((u) => !u.deleted).toArray());
