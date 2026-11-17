import Dexie, { type Table } from 'dexie';
import { newId, SYNCED_TABLES, type Account, type Category, type Doc, type Expense, type Item, type LocalValue, type Move, type New, type Party, type Payment, type Setting, type Store, type Synced, type SyncedTable, type User } from './models';

/** Called whenever a local (not remote) change is written — the sync engine listens to schedule an upload. */
let changeListener: () => void = () => {};
export function onLocalChange(fn: () => void) {
  changeListener = fn;
}

export class InstoreDb extends Dexie {
  users!: Table<User, string>;
  stores!: Table<Store, string>;
  categories!: Table<Category, string>;
  items!: Table<Item, string>;
  moves!: Table<Move, string>;
  settings!: Table<Setting, string>;
  local!: Table<LocalValue, string>;
  parties!: Table<Party, string>;
  docs!: Table<Doc, string>;
  payments!: Table<Payment, string>;
  accounts!: Table<Account, string>;
  expenses!: Table<Expense, string>;

  constructor(name = 'instore2') {
    super(name);
    this.version(1).stores({
      users: 'id, dirty',
      stores: 'id, dirty',
      categories: 'id, name, dirty',
      items: 'id, sku, barcode, categoryId, dirty',
      moves: 'id, itemId, storeId, userId, at, ref, dirty, [itemId+storeId]',
      settings: 'id, dirty',
      local: 'key',
    });
    // v2: billing (bills keep their lines inside the record; moves can belong to a bill)
    this.version(2).stores({
      moves: 'id, itemId, storeId, userId, at, ref, dirty, docId, [itemId+storeId]',
      parties: 'id, name, dirty',
      docs: 'id, type, partyId, date, sourceId, dirty',
      payments: 'id, partyId, date, dirty',
      accounts: 'id, dirty',
      expenses: 'id, date, dirty',
    });

    // Change tracking: stamp updatedAt + dirty on local writes. Records arriving from
    // the sheet carry a transient `_remote` flag and are stored as-is (not dirty).
    for (const t of SYNCED_TABLES) {
      const table = this.table(t);
      table.hook('creating', (_pk, obj: any) => {
        if (obj._remote) {
          delete obj._remote;
          obj.dirty = 0;
          return obj.id;
        }
        if (!obj.id) obj.id = newId();
        obj.updatedAt = Date.now();
        obj.deleted = obj.deleted ?? 0;
        obj.dirty = 1;
        changeListener();
        return obj.id;
      });
      table.hook('updating', (mods: any) => {
        if ('_remote' in mods) return { _remote: undefined, dirty: 0 };
        if (Object.keys(mods).every((k) => k === 'dirty')) return undefined;
        changeListener();
        return { updatedAt: Date.now(), dirty: 1 };
      });
    }
  }

  synced(name: SyncedTable): Table<Synced & Record<string, any>, string> {
    return this.table(name);
  }
}

export let db = new InstoreDb();

/** Add a new synced record (id, updatedAt, dirty are filled in automatically). Returns its id. */
export async function addRecord<T extends Synced>(table: Table<T, string>, obj: New<T>): Promise<string> {
  const id = obj.id ?? newId();
  await table.add({ ...obj, id } as unknown as T);
  return id;
}

/** Tests swap in a fresh database. */
export function useDatabase(next: InstoreDb) {
  db = next;
}

// ---- shared settings (synced) ----
export async function getSetting(key: string): Promise<string | undefined> {
  const s = await db.settings.get(key);
  return s && !s.deleted ? s.value : undefined;
}
export async function setSetting(key: string, value: string) {
  const existing = await db.settings.get(key);
  if (existing) await db.settings.update(key, { value, deleted: 0 });
  else await db.settings.add({ id: key, value } as Setting);
}

// ---- per-device values (never synced) ----
export async function getLocal(key: string): Promise<string | undefined> {
  return (await db.local.get(key))?.value;
}
export async function setLocal(key: string, value: string) {
  await db.local.put({ key, value });
}
export async function deleteLocal(key: string) {
  await db.local.delete(key);
}
export async function deviceId() {
  let id = await getLocal('device_id');
  if (!id) { id = newId(); await setLocal('device_id', id); }
  return id;
}

/** Ask the browser not to evict our data (helps on iPhone). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}

// ---------------------------------------------------------------------------
// One-time migration from INSTORE 1.0 (database "instore", numeric ids).
// Old ids are mapped to new random ids, including references between records.
// The old database is left in place as a safety copy.
// ---------------------------------------------------------------------------
class V1Db extends Dexie {
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      users: '++id, name, active', stores: '++id, name, active', categories: '++id, &name',
      items: '++id, name, sku, barcode, categoryId, active', moves: '++id, itemId, storeId, userId, type, at, ref, [itemId+storeId]', settings: 'key',
    });
  }
}

export async function migrateFromV1(target: InstoreDb = db, oldName = 'instore'): Promise<boolean> {
  if (await target.local.get('migrated_v1')) return false;
  if (!(await Dexie.exists(oldName))) {
    await target.local.put({ key: 'migrated_v1', value: 'none' });
    return false;
  }
  const old = new V1Db(oldName);
  try {
    const [users, stores, categories, items, moves, settings] = await Promise.all(
      ['users', 'stores', 'categories', 'items', 'moves', 'settings'].map((t) => old.table(t).toArray()),
    );
    const map = (prefix: string) => {
      const m = new Map<number, string>();
      return { get: (n: number | null | undefined) => (n == null ? null : m.get(n) ?? (m.set(n, newId()), m.get(n)!)), m, prefix };
    };
    const U = map('u'), S = map('s'), C = map('c'), I = map('i');
    await target.transaction('rw', [target.users, target.stores, target.categories, target.items, target.moves, target.settings, target.local], async () => {
      for (const u of users) { const { id, ...r } = u; await target.users.add({ ...r, id: U.get(id)! }); }
      for (const s of stores) { const { id, ...r } = s; await target.stores.add({ ...r, id: S.get(id)! }); }
      for (const c of categories) { const { id, ...r } = c; await target.categories.add({ ...r, id: C.get(id)! }); }
      for (const i of items) { const { id, ...r } = i; await target.items.add({ ...r, id: I.get(id)!, categoryId: C.get(i.categoryId) }); }
      for (const m of moves) {
        const { id: _id, balanceAfter: _b, ...r } = m;
        await target.moves.add({ ...r, id: newId(), itemId: I.get(m.itemId)!, storeId: S.get(m.storeId)!, userId: U.get(m.userId)! });
      }
      for (const s of settings) {
        if (s.key === 'business_name') await target.settings.add({ id: 'business_name', value: s.value } as Setting);
        if (s.key === 'last_user' && U.m.has(Number(s.value))) await target.local.put({ key: 'last_user', value: U.get(Number(s.value))! });
        if (s.key === 'last_backup') await target.local.put({ key: 'last_backup', value: s.value });
      }
      await target.local.put({ key: 'migrated_v1', value: new Date().toISOString() });
    });
    return true;
  } finally {
    old.close();
  }
}
