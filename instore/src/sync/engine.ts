/**
 * Sync engine: the sheet's `log` tab is an append-only list of record versions.
 * Each device uploads its changed ("dirty") records and reads rows added since its
 * last bookmark. Merge rule: the version with the newest `updatedAt` wins.
 * Works with any SyncBackend, so it can be tested with an in-memory fake.
 */
import type { InstoreDb } from '../data/db';
import { SYNCED_TABLES, type SyncedTable } from '../data/models';

export interface LogRow { time: number; device: string; table: SyncedTable; id: string; deleted: 0 | 1; json: string }

export interface Views { items: (string | number)[][]; activity: (string | number)[][]; invoices: (string | number)[][]; parties: (string | number)[][] }

export interface SyncBackend {
  appendLog(rows: LogRow[]): Promise<void>;
  /** Rows from `fromRow` (1-based sheet row) onward. */
  readLog(fromRow: number): Promise<{ rows: LogRow[]; nextRow: number }>;
  writeViews?(views: Views): Promise<void>;
}

export const FIRST_LOG_ROW = 2; // row 1 is the header
const CHUNK = 400;

export async function syncOnce(target: InstoreDb, backend: SyncBackend, device: string): Promise<{ pulled: number; pushed: number }> {
  const cursor = Number((await target.local.get('sync_cursor'))?.value) || FIRST_LOG_ROW;

  // 1. Pull: apply versions from other devices that are newer than ours.
  const { rows, nextRow } = await backend.readLog(cursor);
  let pulled = 0;
  for (const row of rows) {
    if (row.device === device || !SYNCED_TABLES.includes(row.table)) continue;
    let rec: any;
    try { rec = JSON.parse(row.json); } catch { continue; }
    if (!rec?.id) continue;
    const table = target.synced(row.table);
    const mine = await table.get(rec.id);
    if (mine && mine.updatedAt >= rec.updatedAt) continue;
    await table.put({ ...rec, _remote: true });
    pulled++;
  }
  await target.local.put({ key: 'sync_cursor', value: String(nextRow) });

  // 2. Push: upload every record changed on this device.
  const pending: { table: SyncedTable; id: string; updatedAt: number; row: LogRow }[] = [];
  for (const t of SYNCED_TABLES) {
    for (const r of await target.synced(t).where('dirty').equals(1).toArray()) {
      const { dirty: _d, ...clean } = r;
      pending.push({ table: t, id: r.id, updatedAt: r.updatedAt, row: { time: Date.now(), device, table: t, id: r.id, deleted: r.deleted ? 1 : 0, json: JSON.stringify(clean) } });
    }
  }
  for (let i = 0; i < pending.length; i += CHUNK) {
    const part = pending.slice(i, i + CHUNK);
    await backend.appendLog(part.map((p) => p.row));
    // Clear dirty only if the record wasn't changed again while uploading.
    for (const p of part) await target.synced(p.table).where('id').equals(p.id).and((r) => r.updatedAt === p.updatedAt).modify({ dirty: 0 });
  }

  if (backend.writeViews && (pulled || pending.length || cursor === FIRST_LOG_ROW)) await backend.writeViews(await buildViews(target));
  return { pulled, pushed: pending.length };
}

/** Mark every record for upload (used when linking a new/different Google account). */
export async function markAllDirty(target: InstoreDb) {
  for (const t of SYNCED_TABLES) await target.synced(t).toCollection().modify({ dirty: 1 });
}

export async function pendingCount(target: InstoreDb) {
  let n = 0;
  for (const t of SYNCED_TABLES) n += await target.synced(t).where('dirty').equals(1).count();
  return n;
}

/** Human-readable report tabs written to the sheet after each sync (not read back). */
export async function buildViews(target: InstoreDb): Promise<Views> {
  const [items, cats, stores, users, moves] = await Promise.all([
    target.items.filter((i) => !i.deleted).toArray(), target.categories.toArray(), target.stores.toArray(),
    target.users.toArray(), target.moves.filter((m) => !m.deleted).toArray(),
  ]);
  const name = <T extends { id: string; name: string }>(list: T[]) => new Map(list.map((x) => [x.id, x.name]));
  const catName = name(cats), storeName = name(stores), userName = name(users), itemName = name(items);
  const stock = new Map<string, number>();
  for (const m of moves) stock.set(m.itemId, (stock.get(m.itemId) ?? 0) + m.qty);
  const r3 = (n: number) => Math.round(n * 1000) / 1000;

  const itemRows: (string | number)[][] = [['Item', 'SKU', 'Barcode', 'Category', 'Location', 'Unit', 'Stock', 'Low alert', 'Purchase price', 'Sale price', 'Stock value', 'Status']];
  for (const i of items.sort((a, b) => a.name.localeCompare(b.name))) {
    const q = r3(stock.get(i.id) ?? 0);
    itemRows.push([i.name, i.sku, i.barcode, i.categoryId ? catName.get(i.categoryId) ?? '' : '', i.location, i.unit, q, i.lowStockQty,
      i.purchasePrice, i.salePrice, Math.round(Math.max(0, q) * i.purchasePrice * 100) / 100, !i.active ? 'Archived' : q <= 0 ? 'Out' : i.lowStockQty > 0 && q <= i.lowStockQty ? 'Low' : 'OK']);
  }

  // Running balance per item+store, then newest first.
  const sorted = [...moves].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const run = new Map<string, number>();
  const bal = new Map<string, number>();
  for (const m of sorted) { const k = `${m.itemId}|${m.storeId}`; run.set(k, r3((run.get(k) ?? 0) + m.qty)); bal.set(m.id, run.get(k)!); }
  const activity: (string | number)[][] = [['Date & time', 'User', 'Item', 'Action', 'Qty', 'Balance after', 'Store', 'Note']];
  for (const m of sorted.reverse().slice(0, 2000)) {
    activity.push([new Date(m.at).toLocaleString('en-IN'), userName.get(m.userId) ?? '', itemName.get(m.itemId) ?? '(deleted item)', m.type.replace('_', ' '),
      m.qty, bal.get(m.id) ?? 0, storeName.get(m.storeId) ?? '', m.note]);
  }
  // Bills and parties (readable report tabs).
  const [docs, parties, payments] = await Promise.all([target.docs.filter((d) => !d.deleted).toArray(), target.parties.filter((p) => !p.deleted).toArray(), target.payments.filter((p) => !p.deleted).toArray()]);
  const paid = new Map<string, number>();
  for (const p of payments) for (const a of p.allocations) paid.set(a.docId, (paid.get(a.docId) ?? 0) + a.amount);
  const LABEL: Record<string, string> = { sales_invoice: 'Sales invoice', purchase_invoice: 'Purchase bill', quotation: 'Quotation', sales_order: 'Sales order', delivery_challan: 'Delivery challan', sales_return: 'Sales return', purchase_order: 'Purchase order', purchase_return: 'Purchase return' };
  const invoices: (string | number)[][] = [['Date', 'Type', 'Number', 'Party', 'Taxable', 'GST', 'Total', 'Paid', 'Due', 'Status']];
  for (const d of docs.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)) {
    const isInv = d.type === 'sales_invoice' || d.type === 'purchase_invoice';
    const pd = !d.partyId && d.type === 'sales_invoice' ? d.total : paid.get(d.id) ?? 0;
    invoices.push([d.date, LABEL[d.type] ?? d.type, d.number, d.partyName, d.subtotal, Math.round((d.cgst + d.sgst + d.igst) * 100) / 100, d.total,
      isInv ? Math.round(pd * 100) / 100 : '', isInv ? Math.round((d.total - pd) * 100) / 100 : '', d.status]);
  }
  const partyBal = new Map<string, number>();
  const eff: Record<string, number> = { sales_invoice: 1, sales_return: -1, purchase_invoice: -1, purchase_return: 1 };
  for (const d of docs) if (d.partyId && d.status !== 'cancelled' && eff[d.type]) partyBal.set(d.partyId, (partyBal.get(d.partyId) ?? 0) + eff[d.type] * d.total);
  for (const p of payments) partyBal.set(p.partyId, (partyBal.get(p.partyId) ?? 0) + (p.direction === 'in' ? -p.amount : p.amount));
  const partyRows: (string | number)[][] = [['Name', 'Type', 'Phone', 'GSTIN', 'State', 'Balance', 'To receive / pay']];
  for (const p of parties.sort((a, b) => a.name.localeCompare(b.name))) {
    const b = Math.round((p.openingBalance + (partyBal.get(p.id) ?? 0)) * 100) / 100;
    partyRows.push([p.name, p.type, p.phone, p.gstin, p.state, b, b > 0 ? 'To receive' : b < 0 ? 'To pay' : 'Settled']);
  }
  return { items: itemRows, activity, invoices, parties: partyRows };
}
