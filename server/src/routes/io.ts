import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, closeDb, getDb } from '../db/db.js';
import { allow } from '../auth.js';
import { itemSchema, partySchema } from './masters.js';
import { createEntry } from '../services/stock.js';
import { bad, today } from '../services/util.js';

export const io = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const ITEM_COLS = [
  ['name', 'Item Name*'], ['sku', 'Item Code'], ['barcode', 'Barcode'], ['category', 'Category'], ['unit', 'Unit'],
  ['hsn', 'HSN'], ['gst_rate', 'GST %'], ['purchase_price', 'Purchase Price'], ['sale_price', 'Sale Price'],
  ['mrp', 'MRP'], ['low_stock_qty', 'Low Stock Qty'], ['opening_qty', 'Opening Stock'],
] as const;
const PARTY_COLS = [
  ['name', 'Party Name*'], ['type', 'Type (customer/supplier/both)'], ['phone', 'Phone'], ['email', 'Email'],
  ['gstin', 'GSTIN'], ['state', 'State'], ['address', 'Address'], ['opening_balance', 'Opening Balance (+receivable / -payable)'],
] as const;

async function sendSheet(res: any, name: string, cols: readonly (readonly [string, string])[], rows: any[] = []) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name);
  ws.columns = cols.map(([key, header]) => ({ key, header, width: Math.max(14, header.length + 2) }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

async function readSheet(buf: Buffer, cols: readonly (readonly [string, string])[]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const ws = wb.worksheets[0];
  if (!ws) throw bad('The file has no sheet');
  const headerRow = ws.getRow(1);
  const index: Record<string, number> = {};
  headerRow.eachCell((cell, colNo) => {
    const text = String(cell.value ?? '').trim().toLowerCase();
    const match = cols.find(([key, header]) => header.toLowerCase() === text || key === text || header.toLowerCase().replace('*', '') === text);
    if (match) index[match[0]] = colNo;
  });
  if (!index.name) throw bad('Could not find the name column. Please use the downloaded template.');
  const rows: Record<string, any>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const obj: Record<string, any> = { _row: n };
    for (const [key, col] of Object.entries(index)) {
      let v: any = row.getCell(col).value;
      if (v && typeof v === 'object' && 'result' in v) v = v.result;
      if (v && typeof v === 'object' && 'text' in v) v = v.text;
      obj[key] = v === null || v === undefined ? undefined : typeof v === 'number' ? v : String(v).trim();
    }
    if (obj.name) rows.push(obj);
  });
  return rows;
}

io.get('/template/items', (_req, res) => sendSheet(res, 'items-template', ITEM_COLS, [
  { name: 'Sample Item', sku: 'S001', unit: 'PCS', category: 'General', hsn: '8471', gst_rate: 18, purchase_price: 100, sale_price: 130, mrp: 150, low_stock_qty: 5, opening_qty: 20 },
]));
io.get('/template/parties', (_req, res) => sendSheet(res, 'parties-template', PARTY_COLS, [
  { name: 'Sample Customer', type: 'customer', phone: '9876543210', state: 'Tamil Nadu', opening_balance: 0 },
]));

io.get('/export/items', async (_req, res) => {
  const rows = getDb().all<any>(`SELECT i.*, c.name category, COALESCE((SELECT SUM(qty) FROM stock_moves WHERE item_id=i.id),0) opening_qty
    FROM items i LEFT JOIN categories c ON c.id=i.category_id WHERE i.active=1 ORDER BY i.name`);
  await sendSheet(res, 'items', ITEM_COLS.map(([k, h]) => [k, k === 'opening_qty' ? 'Current Stock' : h] as const), rows);
});
io.get('/export/parties', async (_req, res) => {
  const rows = getDb().all('SELECT * FROM parties WHERE active=1 ORDER BY name');
  await sendSheet(res, 'parties', PARTY_COLS, rows);
});

io.post('/import/items', upload.single('file'), async (req, res) => {
  if (!req.file) throw bad('Choose an Excel file');
  const rows = await readSheet(req.file.buffer, ITEM_COLS);
  const storeId = Number(req.body.store_id) || getDb().get<any>('SELECT id FROM stores ORDER BY id LIMIT 1').id;
  const db = getDb();
  const errors: string[] = [];
  let created = 0, updated = 0;
  db.tx(() => {
    for (const r of rows) {
      try {
        let categoryId: number | null = null;
        if (r.category) {
          const name = String(r.category);
          categoryId = db.get<any>('SELECT id FROM categories WHERE name=?', name)?.id ?? db.insert('categories', { name });
        }
        const item = itemSchema.parse({ ...r, sku: r.sku != null ? String(r.sku) : null, barcode: r.barcode != null ? String(r.barcode) : null, hsn: r.hsn != null ? String(r.hsn) : null, category_id: categoryId, unit: r.unit || 'PCS' });
        const existing = item.sku ? db.get<any>('SELECT id FROM items WHERE sku=?', item.sku) : db.get<any>('SELECT id FROM items WHERE name=?', item.name);
        if (existing) { db.update('items', existing.id, item); updated++; continue; }
        const iid = db.insert('items', item);
        created++;
        const q = Number(r.opening_qty);
        if (q > 0) createEntry({ type: 'opening', date: today(), store_id: storeId, lines: [{ item_id: iid, qty: q, rate: item.purchase_price }], note: 'Excel import' }, req.user?.id);
      } catch (e: any) {
        errors.push(`Row ${r._row}: ${e.issues?.[0]?.message ?? e.message}`);
      }
    }
  });
  res.json({ created, updated, errors });
});

io.post('/import/parties', upload.single('file'), async (req, res) => {
  if (!req.file) throw bad('Choose an Excel file');
  const rows = await readSheet(req.file.buffer, PARTY_COLS);
  const db = getDb();
  const errors: string[] = [];
  let created = 0, updated = 0;
  db.tx(() => {
    for (const r of rows) {
      try {
        const type = String(r.type || 'customer').toLowerCase();
        const p = partySchema.parse({ ...r, type: ['customer', 'supplier', 'both'].includes(type) ? type : 'customer', phone: r.phone != null ? String(r.phone) : null, opening_balance: Number(r.opening_balance) || 0 });
        const existing = db.get<any>('SELECT id FROM parties WHERE name=?', p.name);
        if (existing) { db.update('parties', existing.id, p); updated++; } else { db.insert('parties', p); created++; }
      } catch (e: any) {
        errors.push(`Row ${r._row}: ${e.issues?.[0]?.message ?? e.message}`);
      }
    }
  });
  res.json({ created, updated, errors });
});

// ---------------- backup / restore ----------------
io.get('/backup', allow('owner'), (_req, res) => {
  const dir = join(DATA_DIR, 'backups');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `stockregister-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  getDb().raw.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  res.download(file);
});

io.post('/restore', allow('owner'), upload.single('file'), (req, res) => {
  if (!req.file) throw bad('Choose a backup file');
  const tmp = join(DATA_DIR, 'restore-upload.db');
  writeFileSync(tmp, req.file.buffer);
  try {
    const check = new DatabaseSync(tmp, { readOnly: true });
    const ok = check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('items','documents','users')").all().length === 3;
    check.close();
    if (!ok) throw bad('This is not a Stock Register backup file');
  } catch (e: any) {
    rmSync(tmp, { force: true });
    throw e.status ? e : bad('This is not a valid backup file');
  }
  const target = process.env.DB_FILE || join(DATA_DIR, 'stockregister.db');
  // keep a safety copy of the current data first
  mkdirSync(join(DATA_DIR, 'backups'), { recursive: true });
  getDb().raw.exec(`VACUUM INTO '${join(DATA_DIR, 'backups', `before-restore-${Date.now()}.db`).replace(/'/g, "''")}'`);
  closeDb();
  for (const ext of ['-wal', '-shm']) if (existsSync(target + ext)) rmSync(target + ext);
  copyFileSync(tmp, target);
  rmSync(tmp, { force: true });
  getDb(); // reopen
  res.json({ ok: true });
});
