import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { allow, canDelete, hashPassword } from '../auth.js';
import { createEntry } from '../services/stock.js';
import { partyBalances, partyLedger, accountBalances } from '../services/ledger.js';
import { bad, notFound, today } from '../services/util.js';

export const masters = Router();
const id = (v: any) => Number(v);
const optStr = z.string().trim().optional().nullable().transform((v) => (v ? v : null));
const num = z.coerce.number();

// ---------------- stores ----------------
const storeSchema = z.object({ name: z.string().trim().min(1), kind: z.enum(['store', 'godown']).default('store'), address: optStr, active: z.boolean().optional() });
masters.get('/stores', (_req, res) => {
  res.json(getDb().all(`SELECT s.*, (SELECT COUNT(DISTINCT item_id) FROM stock_moves m WHERE m.store_id=s.id) item_count,
    (SELECT ROUND(COALESCE(SUM(m.qty * i.purchase_price),0),2) FROM stock_moves m JOIN items i ON i.id=m.item_id WHERE m.store_id=s.id) stock_value
    FROM stores s ORDER BY s.id`));
});
masters.post('/stores', allow('owner', 'manager'), (req, res) => {
  res.json({ id: getDb().insert('stores', storeSchema.parse(req.body)) });
});
masters.put('/stores/:id', allow('owner', 'manager'), (req, res) => {
  getDb().update('stores', id(req.params.id), storeSchema.partial().parse(req.body));
  res.json({ ok: true });
});
masters.delete('/stores/:id', canDelete, (req, res) => {
  const db = getDb();
  const sid = id(req.params.id);
  if (db.get('SELECT id FROM stock_moves WHERE store_id=? LIMIT 1', sid) || db.get('SELECT id FROM documents WHERE store_id=? LIMIT 1', sid))
    throw bad('This store has stock or bills. Mark it inactive instead.');
  if ((db.get<any>('SELECT COUNT(*) c FROM stores')?.c ?? 0) <= 1) throw bad('At least one store is needed');
  db.run('DELETE FROM stores WHERE id=?', sid);
  res.json({ ok: true });
});

// ---------------- categories ----------------
masters.get('/categories', (_req, res) => {
  res.json(getDb().all('SELECT c.*, (SELECT COUNT(*) FROM items i WHERE i.category_id=c.id) item_count FROM categories c ORDER BY name'));
});
masters.post('/categories', (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1) }).parse(req.body);
  res.json({ id: getDb().insert('categories', { name }) });
});
masters.put('/categories/:id', (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1) }).parse(req.body);
  getDb().update('categories', id(req.params.id), { name });
  res.json({ ok: true });
});
masters.delete('/categories/:id', canDelete, (req, res) => {
  getDb().run('DELETE FROM categories WHERE id=?', id(req.params.id));
  res.json({ ok: true });
});

// ---------------- items ----------------
export const itemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required'),
  sku: optStr, barcode: optStr, hsn: optStr, description: optStr,
  category_id: z.coerce.number().optional().nullable(),
  unit: z.string().trim().default('PCS'),
  gst_rate: num.default(0), purchase_price: num.default(0), sale_price: num.default(0), mrp: num.default(0),
  low_stock_qty: num.default(0), active: z.boolean().optional(),
});

/** Item list with stock (optionally for one store). */
export function listItems(q: { store_id?: number; search?: string; category_id?: number; low?: boolean; include_inactive?: boolean }) {
  const db = getDb();
  const where: string[] = [];
  const params: any[] = [];
  if (!q.include_inactive) where.push('i.active = 1');
  if (q.search) {
    where.push('(i.name LIKE ? OR i.sku LIKE ? OR i.barcode = ? OR i.hsn LIKE ?)');
    params.push(`%${q.search}%`, `%${q.search}%`, q.search, `%${q.search}%`);
  }
  if (q.category_id) { where.push('i.category_id = ?'); params.push(q.category_id); }
  const storeFilter = q.store_id ? 'AND m.store_id = ?' : '';
  const sql = `SELECT * FROM (SELECT i.*, c.name category_name,
      ROUND(COALESCE((SELECT SUM(qty) FROM stock_moves m WHERE m.item_id = i.id ${storeFilter}), 0), 3) stock
    FROM items i LEFT JOIN categories c ON c.id = i.category_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}) x
    ${q.low ? 'WHERE x.stock <= x.low_stock_qty' : ''} ORDER BY x.name`;
  return db.all(sql, ...(q.store_id ? [q.store_id] : []), ...params).map((r: any) => ({ ...r, stock_value: Math.round(r.stock * r.purchase_price * 100) / 100 }));
}

masters.get('/items', (req, res) => {
  res.json(listItems({
    store_id: req.query.store_id ? Number(req.query.store_id) : undefined,
    search: (req.query.search as string) || undefined,
    category_id: req.query.category_id ? Number(req.query.category_id) : undefined,
    low: req.query.low === '1',
    include_inactive: req.query.all === '1',
  }));
});
masters.get('/items/barcode/:code', (req, res) => {
  const item = getDb().get('SELECT * FROM items WHERE (barcode = ? OR sku = ?) AND active = 1', req.params.code, req.params.code);
  if (!item) throw notFound('Item with this barcode');
  res.json(item);
});
masters.get('/items/:id', (req, res) => {
  const db = getDb();
  const item = db.get<any>('SELECT i.*, c.name category_name FROM items i LEFT JOIN categories c ON c.id=i.category_id WHERE i.id=?', id(req.params.id));
  if (!item) throw notFound('Item');
  item.stores = db.all(`SELECT s.id, s.name, ROUND(COALESCE(SUM(m.qty),0),3) stock FROM stores s
    LEFT JOIN stock_moves m ON m.store_id = s.id AND m.item_id = ? GROUP BY s.id ORDER BY s.id`, item.id);
  item.stock = item.stores.reduce((s: number, r: any) => s + r.stock, 0);
  item.moves = db.all(`SELECT m.*, s.name store_name, d.type doc_type, d.party_name, e.number entry_number
    FROM stock_moves m JOIN stores s ON s.id=m.store_id LEFT JOIN documents d ON d.id=m.doc_id LEFT JOIN stock_entries e ON e.id=m.entry_id
    WHERE m.item_id=? ORDER BY m.date DESC, m.id DESC LIMIT 200`, item.id);
  res.json(item);
});
masters.post('/items', (req, res) => {
  const db = getDb();
  const body = itemSchema.extend({ opening_qty: num.optional(), opening_store_id: num.optional() }).parse(req.body);
  const { opening_qty, opening_store_id, ...item } = body;
  const newId = db.tx(() => {
    const iid = db.insert('items', item);
    if (opening_qty && opening_qty > 0) {
      const store = opening_store_id || db.get<any>('SELECT id FROM stores ORDER BY id LIMIT 1').id;
      createEntry({ type: 'opening', date: today(), store_id: store, lines: [{ item_id: iid, qty: opening_qty, rate: item.purchase_price }], note: 'Opening stock' }, req.user?.id);
    }
    return iid;
  });
  res.json({ id: newId });
});
masters.put('/items/:id', (req, res) => {
  getDb().update('items', id(req.params.id), itemSchema.partial().parse(req.body));
  res.json({ ok: true });
});
masters.post('/items/bulk', allow('owner', 'manager'), (req, res) => {
  const { ids, changes } = z.object({
    ids: z.array(z.number()).min(1),
    changes: itemSchema.pick({ category_id: true, unit: true, gst_rate: true, low_stock_qty: true, active: true, hsn: true }).partial()
      .extend({ sale_price_pct: num.optional(), purchase_price_pct: num.optional() }),
  }).parse(req.body);
  const db = getDb();
  const { sale_price_pct, purchase_price_pct, ...rest } = changes;
  db.tx(() => {
    for (const iid of ids) {
      db.update('items', iid, rest);
      if (sale_price_pct) db.run('UPDATE items SET sale_price = ROUND(sale_price * (1 + ? / 100.0), 2) WHERE id=?', sale_price_pct, iid);
      if (purchase_price_pct) db.run('UPDATE items SET purchase_price = ROUND(purchase_price * (1 + ? / 100.0), 2) WHERE id=?', purchase_price_pct, iid);
    }
  });
  res.json({ ok: true, count: ids.length });
});
masters.delete('/items/:id', canDelete, (req, res) => {
  const db = getDb();
  const iid = id(req.params.id);
  if (db.get('SELECT id FROM document_lines WHERE item_id=? LIMIT 1', iid)) {
    db.update('items', iid, { active: 0 });
    return res.json({ ok: true, deactivated: true });
  }
  db.run('DELETE FROM items WHERE id=?', iid);
  res.json({ ok: true });
});

// ---------------- parties ----------------
export const partySchema = z.object({
  name: z.string().trim().min(1, 'Party name is required'),
  type: z.enum(['customer', 'supplier', 'both']).default('customer'),
  phone: optStr, email: optStr, gstin: optStr, state: optStr, address: optStr,
  opening_balance: num.default(0), active: z.boolean().optional(),
});
masters.get('/parties', (req, res) => {
  const t = req.query.type as string | undefined;
  const search = req.query.search as string | undefined;
  const where = ['p.active = 1'];
  const params: any[] = [];
  if (t === 'customer' || t === 'supplier') { where.push("(p.type = ? OR p.type = 'both')"); params.push(t); }
  if (search) { where.push('(p.name LIKE ? OR p.phone LIKE ? OR p.gstin LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  res.json(partyBalances(where.join(' AND '), ...params));
});
masters.get('/parties/:id', (req, res) => {
  const pid = id(req.params.id);
  const p = partyBalances('p.id = ?', pid)[0];
  if (!p) throw notFound('Party');
  res.json(p);
});
masters.get('/parties/:id/ledger', (req, res) => {
  const l = partyLedger(id(req.params.id), req.query.from as string, req.query.to as string);
  if (!l) throw notFound('Party');
  res.json(l);
});
masters.post('/parties', (req, res) => {
  res.json({ id: getDb().insert('parties', partySchema.parse(req.body)) });
});
masters.put('/parties/:id', (req, res) => {
  getDb().update('parties', id(req.params.id), partySchema.partial().parse(req.body));
  res.json({ ok: true });
});
masters.delete('/parties/:id', canDelete, (req, res) => {
  const db = getDb();
  const pid = id(req.params.id);
  if (db.get('SELECT id FROM documents WHERE party_id=? LIMIT 1', pid) || db.get('SELECT id FROM payments WHERE party_id=? LIMIT 1', pid)) {
    db.update('parties', pid, { active: 0 });
    return res.json({ ok: true, deactivated: true });
  }
  db.run('DELETE FROM parties WHERE id=?', pid);
  res.json({ ok: true });
});

// ---------------- accounts & expense categories ----------------
masters.get('/accounts', (_req, res) => res.json(accountBalances()));
masters.post('/accounts', allow('owner', 'manager'), (req, res) => {
  const body = z.object({ name: z.string().trim().min(1), kind: z.enum(['cash', 'bank']), opening_balance: num.default(0) }).parse(req.body);
  res.json({ id: getDb().insert('accounts', body) });
});
masters.put('/accounts/:id', allow('owner', 'manager'), (req, res) => {
  const body = z.object({ name: z.string().trim().min(1), kind: z.enum(['cash', 'bank']), opening_balance: num }).partial().parse(req.body);
  getDb().update('accounts', id(req.params.id), body);
  res.json({ ok: true });
});
masters.get('/expense-categories', (_req, res) => res.json(getDb().all('SELECT * FROM expense_categories ORDER BY name')));
masters.post('/expense-categories', (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1) }).parse(req.body);
  res.json({ id: getDb().insert('expense_categories', { name }) });
});

// ---------------- settings ----------------
masters.get('/settings', (_req, res) => res.json(getDb().getSettings()));
masters.put('/settings', allow('owner'), (req, res) => {
  const body = z.record(z.string(), z.string()).parse(req.body);
  const db = getDb();
  db.tx(() => { for (const [k, v] of Object.entries(body)) db.setSetting(k, v); });
  res.json({ ok: true });
});

// ---------------- users ----------------
masters.get('/users', allow('owner'), (_req, res) => {
  res.json(getDb().all('SELECT id, name, username, role, active, created_at FROM users ORDER BY id'));
});
masters.post('/users', allow('owner'), (req, res) => {
  const body = z.object({ name: z.string().trim().min(1), username: z.string().trim().min(3), password: z.string().min(6), role: z.enum(['owner', 'manager', 'staff']) }).parse(req.body);
  const db = getDb();
  if (db.get('SELECT id FROM users WHERE username=?', body.username.toLowerCase())) throw bad('Username already taken');
  res.json({ id: db.insert('users', { name: body.name, username: body.username.toLowerCase(), role: body.role, password_hash: hashPassword(body.password) }) });
});
masters.put('/users/:id', allow('owner'), (req, res) => {
  const body = z.object({ name: z.string().trim().min(1), role: z.enum(['owner', 'manager', 'staff']), active: z.boolean(), password: z.string().min(6) }).partial().parse(req.body);
  const db = getDb();
  const uid = id(req.params.id);
  if (uid === req.user!.id && (body.active === false || (body.role && body.role !== 'owner'))) throw bad('You cannot disable or demote yourself');
  const { password, ...rest } = body;
  db.update('users', uid, { ...rest, password_hash: password ? hashPassword(password) : undefined });
  if (body.active === false || password) db.run('DELETE FROM sessions WHERE user_id=?', uid);
  res.json({ ok: true });
});
