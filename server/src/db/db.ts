import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = resolve(here, '../../../data');

type Row = Record<string, any>;

export class Db {
  raw: DatabaseSync;
  private depth = 0;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.raw.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
    this.seedDefaults();
  }

  all<T = Row>(sql: string, ...params: any[]): T[] {
    return this.raw.prepare(sql).all(...params.map(clean)) as T[];
  }
  get<T = Row>(sql: string, ...params: any[]): T | undefined {
    return this.raw.prepare(sql).get(...params.map(clean)) as T | undefined;
  }
  run(sql: string, ...params: any[]) {
    const r = this.raw.prepare(sql).run(...params.map(clean));
    return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
  }
  /** Insert an object as a row; returns new id. */
  insert(table: string, obj: Row): number {
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
    const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
    return this.run(sql, ...keys.map((k) => obj[k])).id;
  }
  update(table: string, id: number, obj: Row) {
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
    if (!keys.length) return;
    this.run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => obj[k]), id);
  }
  /** Run fn inside a transaction (nested calls use savepoints). */
  tx<T>(fn: () => T): T {
    const sp = `sp${this.depth}`;
    this.raw.exec(this.depth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
    this.depth++;
    try {
      const out = fn();
      this.depth--;
      this.raw.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
      return out;
    } catch (e) {
      this.depth--;
      this.raw.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw e;
    }
  }

  getSettings(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of this.all<{ key: string; value: string }>('SELECT key, value FROM settings')) out[r.key] = r.value;
    return out;
  }
  setSetting(key: string, value: string) {
    this.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  }

  private seedDefaults() {
    const defaults: Record<string, string> = {
      business_name: 'My Business',
      business_phone: '',
      business_email: '',
      business_address: '',
      business_gstin: '',
      business_state: 'Tamil Nadu',
      logo: '',
      theme_color: '#2563eb',
      print_format: 'A4',
      invoice_terms: 'Goods once sold will not be taken back.',
      bank_details: '',
      currency_symbol: '₹',
    };
    for (const [k, v] of Object.entries(defaults)) {
      this.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', k, v);
    }
    if (!this.get('SELECT id FROM stores LIMIT 1')) this.run("INSERT INTO stores (name, kind) VALUES ('Main Store', 'store')");
    if (!this.get('SELECT id FROM accounts LIMIT 1')) {
      this.run("INSERT INTO accounts (name, kind) VALUES ('Cash', 'cash')");
      this.run("INSERT INTO accounts (name, kind) VALUES ('Bank', 'bank')");
    }
    if (!this.get('SELECT id FROM expense_categories LIMIT 1')) {
      for (const n of ['Rent', 'Salary', 'Electricity', 'Transport', 'Other']) this.run('INSERT INTO expense_categories (name) VALUES (?)', n);
    }
  }
}

function clean(v: any) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

let instance: Db | null = null;
export function getDb(): Db {
  if (!instance) instance = new Db(process.env.DB_FILE || join(DATA_DIR, 'stockregister.db'));
  return instance;
}
export function setDb(db: Db) {
  instance = db;
}
export function closeDb() {
  instance?.raw.close();
  instance = null;
}
