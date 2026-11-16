import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { InstoreDb, useDatabase, db } from '../src/data/db';
import { createItem, findByCode, ItemError, updateItem } from '../src/services/items';
import { history, issue, quickAdjust, receive, setCount, stockByStore, stockOf, stockTotals, transfer, deleteMove, StockError } from '../src/services/stock';
import { AuthError, changePin, createUser, setupOwner, setUserActive, verifyPin } from '../src/services/auth';
import { exportData, importData } from '../src/services/backup';
import { seedDemo } from '../src/services/seed';

let n = 0;
let owner: number, staff: number, main: number, godown: number, item: number;

beforeEach(async () => {
  useDatabase(new InstoreDb(`test-${++n}`));
  owner = await setupOwner('Owner', '1234', 'Test Shop');
  staff = await createUser('Ravi', '5678', 'staff');
  main = (await db.stores.toCollection().first())!.id!;
  godown = await db.stores.add({ name: 'Godown', kind: 'godown', active: 1 });
  item = await createItem({ name: 'Bulb', sku: 'B1', barcode: '111', categoryId: null, unit: 'PCS', hsn: '', gstRate: 12, purchasePrice: 10, salePrice: 15, lowStockQty: 5, location: 'A1' }, { storeId: main, qty: 10, userId: owner });
});

describe('stock ledger', () => {
  it('tracks in, out, transfer and counts per store', async () => {
    await receive(item, main, 5, staff);
    await issue(item, main, 3, staff);
    await transfer(item, main, godown, 4, owner);
    expect(await stockOf(item, main)).toBe(8);
    expect(await stockOf(item, godown)).toBe(4);
    expect(await stockOf(item)).toBe(12);
    const adj = await setCount(item, main, 6, staff);
    expect(adj?.qty).toBe(-2);
    expect(await setCount(item, main, 6, staff)).toBeNull();
    expect(await stockByStore(item)).toEqual({ [main]: 6, [godown]: 4 });
    expect((await stockTotals()).get(item)).toBe(10);
    expect((await stockTotals(godown)).get(item)).toBe(4);
  });

  it('records user, balance after and newest-first history', async () => {
    await quickAdjust(item, main, 1, staff);
    await quickAdjust(item, main, -1, owner);
    const h = await history(item);
    expect(h.map((m) => m.type)).toEqual(['out', 'in', 'opening']);
    expect(h.map((m) => m.userId)).toEqual([owner, staff, owner]);
    expect(h.map((m) => m.balanceAfter)).toEqual([10, 11, 10]);
  });

  it('validates quantities and transfers', async () => {
    await expect(receive(item, main, 0, owner)).rejects.toBeInstanceOf(StockError);
    await expect(transfer(item, main, main, 1, owner)).rejects.toBeInstanceOf(StockError);
    await expect(setCount(item, main, -1, owner)).rejects.toBeInstanceOf(StockError);
  });

  it('deleting one half of a transfer removes both', async () => {
    const [out] = await transfer(item, main, godown, 2, owner);
    await deleteMove(out.id!);
    expect(await stockOf(item, main)).toBe(10);
    expect(await stockOf(item, godown)).toBe(0);
  });
});

describe('items', () => {
  it('finds by barcode or SKU and blocks duplicates', async () => {
    expect((await findByCode('111'))?.id).toBe(item);
    expect((await findByCode('b1'))?.id).toBe(item);
    await expect(createItem({ name: 'X', sku: 'B1', barcode: '', categoryId: null, unit: '', hsn: '', gstRate: 0, purchasePrice: 0, salePrice: 0, lowStockQty: 0, location: '' })).rejects.toBeInstanceOf(ItemError);
    await updateItem(item, { name: 'Bulb 9W', sku: 'B1', barcode: '111', categoryId: null, unit: 'PCS', hsn: '', gstRate: 12, purchasePrice: 10, salePrice: 15, lowStockQty: 5, location: 'A1' });
    expect((await db.items.get(item))?.name).toBe('Bulb 9W');
  });
});

describe('auth', () => {
  it('checks PINs and keeps an owner', async () => {
    expect((await verifyPin(staff, '5678')).name).toBe('Ravi');
    await expect(verifyPin(staff, '0000')).rejects.toBeInstanceOf(AuthError);
    await changePin(staff, '4321');
    await expect(verifyPin(staff, '4321')).resolves.toBeTruthy();
    await expect(createUser('Bad', '12', 'staff')).rejects.toBeInstanceOf(AuthError);
    await expect(setUserActive(owner, 0)).rejects.toBeInstanceOf(AuthError);
    await expect(setupOwner('Again', '1111', '')).rejects.toBeInstanceOf(AuthError);
  });
});

describe('backup', () => {
  it('round-trips all data', async () => {
    await receive(item, main, 3, staff);
    const file = await exportData();
    useDatabase(new InstoreDb(`test-${++n}`));
    expect(await db.items.count()).toBe(0);
    await importData(JSON.parse(JSON.stringify(file)));
    expect(await stockOf(item, main)).toBe(13);
    expect((await verifyPin(staff, '5678')).name).toBe('Ravi');
    await expect(importData({} as any)).rejects.toThrow();
  });
});

describe('demo data', () => {
  it('seeds only when empty', async () => {
    useDatabase(new InstoreDb(`test-${++n}`));
    const o = await setupOwner('O', '1111', '');
    expect(await seedDemo(o)).toBe(true);
    expect(await db.items.count()).toBe(6);
    expect(await seedDemo(o)).toBe(false);
  });
});
