import Dexie, { type Table } from 'dexie';
import type { Category, Item, Move, Setting, Store, User } from './models';

export class InstoreDb extends Dexie {
  users!: Table<User, number>;
  stores!: Table<Store, number>;
  categories!: Table<Category, number>;
  items!: Table<Item, number>;
  moves!: Table<Move, number>;
  settings!: Table<Setting, string>;

  constructor(name = 'instore') {
    super(name);
    this.version(1).stores({
      users: '++id, name, active',
      stores: '++id, name, active',
      categories: '++id, &name',
      items: '++id, name, sku, barcode, categoryId, active',
      moves: '++id, itemId, storeId, userId, type, at, ref, [itemId+storeId]',
      settings: 'key',
    });
  }
}

export let db = new InstoreDb();

/** Tests swap in a fresh database. */
export function useDatabase(next: InstoreDb) {
  db = next;
}

export async function getSetting(key: string): Promise<string | undefined> {
  return (await db.settings.get(key))?.value;
}
export async function setSetting(key: string, value: string) {
  await db.settings.put({ key, value });
}

/** Ask the browser not to evict our data (helps on iPhone). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}
