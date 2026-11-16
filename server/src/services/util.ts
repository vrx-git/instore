import { getDb } from '../db/db.js';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const today = () => new Date().toISOString().slice(0, 10);

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export const bad = (msg: string) => new HttpError(400, msg);
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);

/** Next running number like INV-0007 for a table/prefix, scoped by an optional WHERE. */
export function nextNumber(prefix: string, table: string, where = '1=1', ...params: any[]): string {
  const db = getDb();
  const rows = db.all<{ number: string }>(`SELECT number FROM ${table} WHERE ${where}`, ...params);
  let max = 0;
  for (const r of rows) {
    const m = /(\d+)\s*$/.exec(r.number);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}
