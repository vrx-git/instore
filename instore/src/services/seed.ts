import { db } from '../data/db';
import { createItem } from './items';
import { issue, receive, transfer } from './stock';

/** Sample items (same as the Stock Register demo). Only runs when there are no items. */
export async function seedDemo(userId: number) {
  if (await db.items.count()) return false;
  const main = (await db.stores.toCollection().first())?.id ?? (await db.stores.add({ name: 'Main Store', kind: 'store', active: 1 }));
  const godown = await db.stores.add({ name: 'Godown', kind: 'godown', active: 1 });
  const cat = async (name: string) => (await db.categories.where('name').equals(name).first())?.id ?? db.categories.add({ name });
  const elec = await cat('Electronics'), acc = await cat('Accessories'), hw = await cat('Hardware');
  const rows = [
    { name: 'LED Bulb 9W', sku: 'LED9', barcode: '8901000000011', categoryId: elec, unit: 'PCS', hsn: '8539', gstRate: 12, purchasePrice: 55, salePrice: 89, lowStockQty: 20, location: 'Rack A1', qty: 40 },
    { name: 'Extension Board 4-way', sku: 'EXT4', barcode: '8901000000028', categoryId: elec, unit: 'PCS', hsn: '8536', gstRate: 18, purchasePrice: 180, salePrice: 260, lowStockQty: 5, location: 'Rack A2', qty: 12 },
    { name: 'USB-C Cable 1m', sku: 'USBC1', barcode: '8901000000035', categoryId: acc, unit: 'PCS', hsn: '8544', gstRate: 18, purchasePrice: 60, salePrice: 149, lowStockQty: 15, location: 'Counter', qty: 30 },
    { name: 'Mobile Cover', sku: 'MC01', barcode: '8901000000042', categoryId: acc, unit: 'PCS', hsn: '3926', gstRate: 18, purchasePrice: 40, salePrice: 99, lowStockQty: 10, location: 'Counter', qty: 8 },
    { name: 'PVC Pipe 1 inch', sku: 'PVC1', barcode: '8901000000059', categoryId: hw, unit: 'MTR', hsn: '3917', gstRate: 18, purchasePrice: 32, salePrice: 48, lowStockQty: 50, location: 'Yard', qty: 120 },
    { name: 'Wall Screws (box)', sku: 'SCR50', barcode: '8901000000066', categoryId: hw, unit: 'BOX', hsn: '7318', gstRate: 18, purchasePrice: 70, salePrice: 110, lowStockQty: 8, location: 'Rack B1', qty: 0 },
  ];
  const ids: number[] = [];
  for (const { qty, ...r } of rows) ids.push(await createItem(r, { storeId: main, qty, userId }));
  await receive(ids[0], godown, 50, userId, 'Supplier delivery');
  await transfer(ids[0], godown, main, 20, userId, 'Shop refill');
  await issue(ids[2], main, 6, userId, 'Counter sale');
  return true;
}
