import { db } from '../data/db';
import type { Item } from '../data/models';
import { opening } from './stock';

export type ItemInput = Omit<Item, 'id' | 'createdAt' | 'active'> & { active?: 0 | 1 };

export const blankItem = (): ItemInput => ({
  name: '', sku: '', barcode: '', categoryId: null, unit: 'PCS', hsn: '', gstRate: 18,
  purchasePrice: 0, salePrice: 0, lowStockQty: 0, location: '',
});

export class ItemError extends Error {}

async function checkUnique(input: ItemInput, id?: number) {
  if (!input.name.trim()) throw new ItemError('Item name is required');
  for (const field of ['sku', 'barcode'] as const) {
    const v = input[field].trim();
    if (!v) continue;
    const other = await db.items.where(field).equals(v).first();
    if (other && other.id !== id) throw new ItemError(`${field === 'sku' ? 'SKU' : 'Barcode'} ${v} is already used by ${other.name}`);
  }
}

const tidy = (i: ItemInput): ItemInput => ({ ...i, name: i.name.trim(), sku: i.sku.trim(), barcode: i.barcode.trim(), unit: i.unit.trim() || 'PCS' });

export async function createItem(input: ItemInput, open?: { storeId: number; qty: number; userId: number }) {
  const data = tidy(input);
  await checkUnique(data);
  return db.transaction('rw', db.items, db.moves, async () => {
    const id = await db.items.add({ ...data, active: 1, createdAt: Date.now() });
    if (open && open.qty > 0) await opening(id, open.storeId, open.qty, open.userId);
    return id;
  });
}

export async function updateItem(id: number, input: ItemInput) {
  const data = tidy(input);
  await checkUnique(data, id);
  await db.items.update(id, data);
}

export const archiveItem = (id: number, active: 0 | 1 = 0) => db.items.update(id, { active });

/** Exact match on barcode or SKU (case-insensitive SKU). */
export async function findByCode(code: string): Promise<Item | undefined> {
  const c = code.trim();
  if (!c) return undefined;
  const byBarcode = await db.items.where('barcode').equals(c).first();
  if (byBarcode) return byBarcode;
  return db.items.filter((i) => i.sku.toLowerCase() === c.toLowerCase()).first();
}

export function matches(item: Item, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return item.name.toLowerCase().includes(s) || item.sku.toLowerCase().includes(s) || item.barcode === q.trim() || item.location.toLowerCase().includes(s);
}
