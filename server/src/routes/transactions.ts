import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { allow, canDelete } from '../auth.js';
import { createEntry, getEntry } from '../services/stock.js';
import {
  CONVERSIONS, DOC_TYPES, createPayment, deleteDocument, getDocument, isDocType, saveDocument, setStatus, type DocType,
} from '../services/documents.js';
import { bad, notFound, round2 } from '../services/util.js';

export const tx = Router();
const id = (v: any) => Number(v);
const num = z.coerce.number();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

// ---------------- stock entries ----------------
const entrySchema = z.object({
  type: z.enum(['in', 'out', 'transfer', 'opening']),
  date, store_id: num, to_store_id: num.optional().nullable(),
  person: z.string().optional(), note: z.string().optional(), number: z.string().optional(),
  lines: z.array(z.object({ item_id: num, qty: num, rate: num.optional() })).min(1, 'Add at least one item'),
});

tx.get('/stock-entries', (req, res) => {
  const where = ['1=1'];
  const params: any[] = [];
  if (req.query.type) { where.push('e.type = ?'); params.push(req.query.type); }
  if (req.query.from) { where.push('e.date >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('e.date <= ?'); params.push(req.query.to); }
  res.json(getDb().all(`SELECT e.*, s.name store_name, t.name to_store_name,
      (SELECT COUNT(DISTINCT item_id) FROM stock_moves m WHERE m.entry_id=e.id) item_count,
      (SELECT ROUND(SUM(ABS(qty)),3) FROM stock_moves m WHERE m.entry_id=e.id AND m.type!='transfer_in') total_qty
    FROM stock_entries e JOIN stores s ON s.id=e.store_id LEFT JOIN stores t ON t.id=e.to_store_id
    WHERE ${where.join(' AND ')} ORDER BY e.date DESC, e.id DESC LIMIT 500`, ...params));
});
tx.get('/stock-entries/:id', (req, res) => {
  const e = getEntry(id(req.params.id));
  if (!e) throw notFound('Stock entry');
  res.json(e);
});
tx.post('/stock-entries', (req, res) => {
  res.json({ id: createEntry(entrySchema.parse(req.body) as any, req.user?.id) });
});
tx.delete('/stock-entries/:id', canDelete, (req, res) => {
  getDb().run('DELETE FROM stock_entries WHERE id=?', id(req.params.id));
  res.json({ ok: true });
});

// ---------------- documents ----------------
const lineSchema = z.object({
  item_id: num.optional().nullable(), description: z.string().optional(), hsn: z.string().optional().nullable(),
  unit: z.string().optional().nullable(), qty: num, rate: num, discount_pct: num.optional(), gst_rate: num.optional(),
});
const docSchema = z.object({
  number: z.string().optional(), date, due_date: z.string().optional().nullable(),
  party_id: num.optional().nullable(), party_name: z.string().optional().nullable(), store_id: num,
  is_gst: z.boolean(), tax_inclusive: z.boolean().optional(), place_of_supply: z.string().optional().nullable(),
  status: z.enum(['open', 'completed', 'cancelled']).optional(), source_doc_id: num.optional().nullable(),
  other_charges: num.optional(), notes: z.string().optional(), terms: z.string().optional(),
  transport: z.string().optional(), vehicle_no: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'Add at least one item'),
  paid_now: num.optional(), account_id: num.optional(),
});

function docType(t: string): DocType {
  if (!isDocType(t)) throw notFound('Document type');
  return t;
}

tx.get('/documents/:type', (req, res) => {
  const type = docType(req.params.type);
  const where = ['d.type = ?'];
  const params: any[] = [type];
  const q = req.query as Record<string, string>;
  if (q.from) { where.push('d.date >= ?'); params.push(q.from); }
  if (q.to) { where.push('d.date <= ?'); params.push(q.to); }
  if (q.party_id) { where.push('d.party_id = ?'); params.push(q.party_id); }
  if (q.status) { where.push('d.status = ?'); params.push(q.status); }
  if (q.search) { where.push('(d.number LIKE ? OR d.party_name LIKE ?)'); params.push(`%${q.search}%`, `%${q.search}%`); }
  const rows = getDb().all<any>(`SELECT d.id, d.type, d.number, d.date, d.due_date, d.party_id, d.party_name, d.status, d.is_gst,
      d.subtotal, d.cgst + d.sgst + d.igst tax, d.total, d.cost_total, s.name store_name,
      CASE WHEN d.party_id IS NULL THEN d.total ELSE COALESCE((SELECT SUM(amount) FROM payment_allocations WHERE doc_id=d.id),0) END paid
    FROM documents d JOIN stores s ON s.id=d.store_id WHERE ${where.join(' AND ')}
    ORDER BY d.date DESC, d.id DESC LIMIT 1000`, ...params);
  res.json(rows.map((r) => ({ ...r, balance: round2(r.total - r.paid), profit: round2(r.subtotal - r.cost_total) })));
});
tx.get('/documents/:type/next-number', (req, res) => {
  const type = docType(req.params.type);
  const rows = getDb().all<{ number: string }>('SELECT number FROM documents WHERE type=?', type);
  let max = 0;
  for (const r of rows) { const m = /(\d+)\s*$/.exec(r.number); if (m) max = Math.max(max, +m[1]); }
  res.json({ number: `${DOC_TYPES[type].prefix}-${String(max + 1).padStart(4, '0')}` });
});
tx.get('/document/:id', (req, res) => {
  const d = getDocument(id(req.params.id));
  if (!d) throw notFound('Document');
  res.json({ ...d, conversions: CONVERSIONS[d.type as DocType] ?? [] });
});
tx.post('/documents/:type', (req, res) => {
  const type = docType(req.params.type);
  res.json({ id: saveDocument(type, docSchema.parse(req.body) as any, undefined, req.user?.id) });
});
tx.put('/document/:id', (req, res) => {
  const existing = getDb().get<any>('SELECT type FROM documents WHERE id=?', id(req.params.id));
  if (!existing) throw notFound('Document');
  res.json({ id: saveDocument(existing.type, docSchema.parse(req.body) as any, id(req.params.id), req.user?.id) });
});
tx.post('/document/:id/status', (req, res) => {
  const { status } = z.object({ status: z.enum(['open', 'completed', 'cancelled']) }).parse(req.body);
  if (status === 'cancelled' && req.user?.role === 'staff') throw bad('Only a manager or owner can cancel');
  setStatus(id(req.params.id), status);
  res.json({ ok: true });
});
tx.delete('/document/:id', canDelete, (req, res) => {
  deleteDocument(id(req.params.id));
  res.json({ ok: true });
});

// ---------------- payments ----------------
const paymentSchema = z.object({
  number: z.string().optional(), direction: z.enum(['in', 'out']), date, party_id: num, account_id: num, amount: num,
  reference: z.string().optional(), note: z.string().optional(),
  allocations: z.array(z.object({ doc_id: num, amount: num })).optional(), auto_allocate: z.boolean().optional(),
});
tx.get('/payments', (req, res) => {
  const where = ['1=1'];
  const params: any[] = [];
  const q = req.query as Record<string, string>;
  if (q.direction) { where.push('y.direction = ?'); params.push(q.direction); }
  if (q.party_id) { where.push('y.party_id = ?'); params.push(q.party_id); }
  if (q.from) { where.push('y.date >= ?'); params.push(q.from); }
  if (q.to) { where.push('y.date <= ?'); params.push(q.to); }
  res.json(getDb().all(`SELECT y.*, p.name party_name, a.name account_name,
      (SELECT GROUP_CONCAT(d.number, ', ') FROM payment_allocations pa JOIN documents d ON d.id=pa.doc_id WHERE pa.payment_id=y.id) bills
    FROM payments y JOIN parties p ON p.id=y.party_id JOIN accounts a ON a.id=y.account_id
    WHERE ${where.join(' AND ')} ORDER BY y.date DESC, y.id DESC LIMIT 1000`, ...params));
});
tx.get('/payments/open-bills', (req, res) => {
  const { party_id, direction } = z.object({ party_id: num, direction: z.enum(['in', 'out']) }).parse(req.query);
  const type = direction === 'in' ? 'sales_invoice' : 'purchase_invoice';
  res.json(getDb().all(`SELECT * FROM (SELECT d.id, d.number, d.date, d.total,
      ROUND(d.total - COALESCE((SELECT SUM(amount) FROM payment_allocations WHERE doc_id=d.id),0),2) due
    FROM documents d WHERE d.party_id=? AND d.type=? AND d.status!='cancelled') WHERE due > 0 ORDER BY date`, party_id, type));
});
tx.post('/payments', (req, res) => {
  res.json({ id: createPayment(paymentSchema.parse(req.body), req.user?.id) });
});
tx.delete('/payments/:id', canDelete, (req, res) => {
  getDb().run('DELETE FROM payments WHERE id=?', id(req.params.id));
  res.json({ ok: true });
});

// ---------------- expenses ----------------
const expenseSchema = z.object({ date, category_id: num.optional().nullable(), account_id: num, amount: num.positive(), note: z.string().optional() });
tx.get('/expenses', allow('owner', 'manager'), (req, res) => {
  const where = ['1=1'];
  const params: any[] = [];
  const q = req.query as Record<string, string>;
  if (q.from) { where.push('e.date >= ?'); params.push(q.from); }
  if (q.to) { where.push('e.date <= ?'); params.push(q.to); }
  if (q.category_id) { where.push('e.category_id = ?'); params.push(q.category_id); }
  res.json(getDb().all(`SELECT e.*, c.name category_name, a.name account_name FROM expenses e
    LEFT JOIN expense_categories c ON c.id=e.category_id JOIN accounts a ON a.id=e.account_id
    WHERE ${where.join(' AND ')} ORDER BY e.date DESC, e.id DESC`, ...params));
});
tx.post('/expenses', allow('owner', 'manager'), (req, res) => {
  res.json({ id: getDb().insert('expenses', { ...expenseSchema.parse(req.body), created_by: req.user?.id }) });
});
tx.delete('/expenses/:id', canDelete, (req, res) => {
  getDb().run('DELETE FROM expenses WHERE id=?', id(req.params.id));
  res.json({ ok: true });
});
