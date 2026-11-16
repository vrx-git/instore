import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { InstoreDb, migrateFromV1, useDatabase, db, addRecord } from '../src/data/db';
import { createItem, updateItem } from '../src/services/items';
import { createUser, setupOwner, verifyPin } from '../src/services/auth';
import { issue, receive, stockOf, deleteMove, history } from '../src/services/stock';
import { FIRST_LOG_ROW, markAllDirty, pendingCount, syncOnce, type LogRow, type SyncBackend, type Views } from '../src/sync/engine';

/** In-memory stand-in for the Google Sheet "log" tab. */
class FakeSheet implements SyncBackend {
  log: LogRow[] = [];
  views: Views | null = null;
  async appendLog(rows: LogRow[]) { this.log.push(...rows.map((r) => ({ ...r }))); }
  async readLog(fromRow: number) {
    const rows = this.log.slice(fromRow - FIRST_LOG_ROW);
    return { rows, nextRow: FIRST_LOG_ROW + this.log.length };
  }
  async writeViews(v: Views) { this.views = v; }
}

let n = 0;
const ITEM = { name: 'Rice 5kg', sku: 'R5', barcode: '890', categoryId: null, unit: 'PCS', hsn: '', gstRate: 5, purchasePrice: 400, salePrice: 480, lowStockQty: 3, location: '' };
const tick = () => new Promise((r) => setTimeout(r, 3));

/** Each simulated phone = its own database + device id. Run `fn` with that phone's db active. */
function phone(name: string) {
  const d = new InstoreDb(`${name}-${++n}`);
  return {
    db: d,
    device: name,
    async run<T>(fn: () => Promise<T>) { useDatabase(d); return fn(); },
    sync(sheet: FakeSheet) { useDatabase(d); return syncOnce(d, sheet, name); },
  };
}

describe('two-phone sync', () => {
  let sheet: FakeSheet;
  let A: ReturnType<typeof phone>, B: ReturnType<typeof phone>;
  let owner = '', store = '', item = '';

  beforeEach(async () => {
    sheet = new FakeSheet();
    A = phone('A'); B = phone('B');
    await A.run(async () => {
      owner = await setupOwner('Priya', '1234', 'Green Mart');
      store = (await db.stores.toCollection().first())!.id;
      item = await createItem(ITEM, { storeId: store, qty: 10, userId: owner });
    });
    await A.sync(sheet);
    await B.sync(sheet); // B restores from the sheet
  });

  it('a new phone gets everything, including users and PINs', async () => {
    await B.run(async () => {
      expect((await db.items.get(item))?.name).toBe('Rice 5kg');
      expect(await stockOf(item, store)).toBe(10);
      expect((await verifyPin(owner, '1234')).name).toBe('Priya');
      expect((await db.settings.get('business_name'))?.value).toBe('Green Mart');
      expect(await pendingCount(db)).toBe(0); // pulled records are not re-uploaded
    });
    expect(sheet.views?.items[1][0]).toBe('Rice 5kg');
  });

  it('offline changes on both phones add up after syncing', async () => {
    await A.run(() => issue(item, store, 3, owner, 'sale A'));
    await B.run(async () => { const ravi = await createUser('Ravi', '5678', 'staff'); await receive(item, store, 5, ravi, 'delivery B'); });
    await A.sync(sheet); await B.sync(sheet); await A.sync(sheet);
    for (const p of [A, B]) await p.run(async () => {
      expect(await stockOf(item, store)).toBe(12);
      expect((await db.users.toArray()).map((u) => u.name).sort()).toEqual(['Priya', 'Ravi']);
      expect((await history(item)).length).toBe(3);
    });
  });

  it('editing the same item on both phones keeps the newer edit', async () => {
    await A.run(() => updateItem(item, { ...ITEM, salePrice: 500 }));
    await tick();
    await B.run(() => updateItem(item, { ...ITEM, salePrice: 520 }));
    await B.sync(sheet); await A.sync(sheet); await B.sync(sheet);
    for (const p of [A, B]) await p.run(async () => expect((await db.items.get(item))?.salePrice).toBe(520));
  });

  it('deletes propagate', async () => {
    let moveId = '';
    await A.run(async () => { moveId = (await receive(item, store, 4, owner)).id; });
    await A.sync(sheet); await B.sync(sheet);
    await B.run(async () => expect(await stockOf(item, store)).toBe(14));
    await B.run(() => deleteMove(moveId));
    await B.sync(sheet); await A.sync(sheet);
    await A.run(async () => expect(await stockOf(item, store)).toBe(10));
  });

  it('only uploads what changed, and nothing when idle', async () => {
    const before = sheet.log.length;
    expect((await A.sync(sheet)).pushed).toBe(0);
    await A.run(() => issue(item, store, 1, owner));
    expect((await A.sync(sheet)).pushed).toBe(1);
    expect(sheet.log.length).toBe(before + 1);
  });

  it('linking a new account re-uploads everything', async () => {
    const fresh = new FakeSheet();
    await A.run(() => markAllDirty(db));
    await A.run(() => db.local.put({ key: 'sync_cursor', value: String(FIRST_LOG_ROW) }));
    await A.sync(fresh);
    const C = phone('C');
    await C.sync(fresh);
    await C.run(async () => expect(await stockOf(item, store)).toBe(10));
  });
});

describe('migration from INSTORE 1.0', () => {
  it('keeps every item, move and user with the same stock', async () => {
    const oldName = `instore-v1-${++n}`;
    const old = new Dexie(oldName);
    old.version(1).stores({
      users: '++id, name, active', stores: '++id, name, active', categories: '++id, &name',
      items: '++id, name, sku, barcode, categoryId, active', moves: '++id, itemId, storeId, userId, type, at, ref, [itemId+storeId]', settings: 'key',
    });
    await old.table('users').add({ name: 'Owner', role: 'owner', pinHash: 'h', salt: 's', active: 1, createdAt: 1 });
    await old.table('stores').bulkAdd([{ name: 'Main', kind: 'store', active: 1 }, { name: 'Godown', kind: 'godown', active: 1 }]);
    await old.table('categories').add({ name: 'Food' });
    await old.table('items').add({ ...ITEM, categoryId: 1, active: 1, createdAt: 1 });
    await old.table('moves').bulkAdd([
      { itemId: 1, storeId: 1, qty: 10, type: 'opening', userId: 1, at: 1, note: '', ref: 'a', balanceAfter: 10 },
      { itemId: 1, storeId: 1, qty: -4, type: 'transfer_out', userId: 1, at: 2, note: '', ref: 'b', balanceAfter: 6 },
      { itemId: 1, storeId: 2, qty: 4, type: 'transfer_in', userId: 1, at: 2, note: '', ref: 'b', balanceAfter: 4 },
    ]);
    await old.table('settings').bulkAdd([{ key: 'business_name', value: 'Old Shop' }, { key: 'last_user', value: '1' }]);
    old.close();

    const target = new InstoreDb(`v2-${n}`);
    useDatabase(target);
    expect(await migrateFromV1(target, oldName)).toBe(true);
    expect(await migrateFromV1(target, oldName)).toBe(false); // only once

    const [it0] = await db.items.toArray();
    const stores = await db.stores.toArray();
    const main = stores.find((s) => s.name === 'Main')!.id, godown = stores.find((s) => s.name === 'Godown')!.id;
    expect(typeof it0.id).toBe('string');
    expect((await db.categories.get(it0.categoryId!))?.name).toBe('Food');
    expect(await stockOf(it0.id, main)).toBe(6);
    expect(await stockOf(it0.id, godown)).toBe(4);
    const u = (await db.users.toArray())[0];
    expect((await db.moves.toArray()).every((m) => m.userId === u.id)).toBe(true);
    expect((await db.local.get('last_user'))?.value).toBe(u.id);
    expect((await db.settings.get('business_name'))?.value).toBe('Old Shop');
    expect(await pendingCount(db)).toBeGreaterThan(0); // will upload when backup is turned on
    expect(await addRecord(db.categories, { name: 'New' })).toMatch(/-/);
  });
});
