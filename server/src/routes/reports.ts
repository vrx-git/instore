import { Router } from 'express';
import { getDb } from '../db/db.js';
import { partyBalances, accountBalances } from '../services/ledger.js';
import { round2, today } from '../services/util.js';

export const reports = Router();

const range = (q: any) => ({ from: (q.from as string) || '0000-01-01', to: (q.to as string) || '9999-12-31' });
const monthStart = () => today().slice(0, 8) + '01';

function docSum(type: string, from: string, to: string) {
  return getDb().get<any>(`SELECT COUNT(*) count, ROUND(COALESCE(SUM(total),0),2) total, ROUND(COALESCE(SUM(subtotal),0),2) taxable,
      ROUND(COALESCE(SUM(cost_total),0),2) cost
    FROM documents WHERE type=? AND status!='cancelled' AND date BETWEEN ? AND ?`, type, from, to);
}

/** Profit = sales taxable value - cost of goods sold - expenses, net of returns. */
function profitBetween(from: string, to: string) {
  const s = docSum('sales_invoice', from, to);
  const r = docSum('sales_return', from, to);
  const exp = getDb().get<any>('SELECT ROUND(COALESCE(SUM(amount),0),2) t FROM expenses WHERE date BETWEEN ? AND ?', from, to).t;
  // Returned goods: reverse their margin using the original cost ratio of the returned lines.
  const returnCost = getDb().get<any>(`SELECT ROUND(COALESCE(SUM(l.qty * l.cost_rate),0),2) c FROM document_lines l
    JOIN documents d ON d.id=l.doc_id WHERE d.type='sales_return' AND d.status!='cancelled' AND d.date BETWEEN ? AND ?`, from, to).c;
  const gross = round2(s.taxable - s.cost - (r.taxable - returnCost));
  return { gross_profit: gross, expenses: exp, net_profit: round2(gross - exp) };
}

reports.get('/dashboard', (_req, res) => {
  const db = getDb();
  const t = today();
  const m = monthStart();
  const balances = partyBalances('p.active = 1');
  const receivable = round2(balances.filter((p) => p.balance > 0).reduce((s, p) => s + p.balance, 0));
  const payable = round2(-balances.filter((p) => p.balance < 0).reduce((s, p) => s + p.balance, 0));
  const stock = db.get<any>(`SELECT ROUND(COALESCE(SUM(m.qty * i.purchase_price),0),2) value, ROUND(COALESCE(SUM(m.qty),0),2) qty
    FROM stock_moves m JOIN items i ON i.id=m.item_id`);
  const low = db.all(`SELECT * FROM (SELECT i.id, i.name, i.unit, i.low_stock_qty, ROUND(COALESCE((SELECT SUM(qty) FROM stock_moves WHERE item_id=i.id),0),3) stock
    FROM items i WHERE i.active=1 AND i.low_stock_qty > 0) WHERE stock <= low_stock_qty ORDER BY stock LIMIT 10`);
  const lowCount = db.get<any>(`SELECT COUNT(*) c FROM (SELECT i.low_stock_qty, COALESCE((SELECT SUM(qty) FROM stock_moves WHERE item_id=i.id),0) stock
    FROM items i WHERE i.active=1 AND i.low_stock_qty > 0) WHERE stock <= low_stock_qty`).c;
  const last30 = db.all(`SELECT date, ROUND(SUM(CASE WHEN type='sales_invoice' THEN total ELSE 0 END),2) sales,
      ROUND(SUM(CASE WHEN type='purchase_invoice' THEN total ELSE 0 END),2) purchase
    FROM documents WHERE status!='cancelled' AND type IN ('sales_invoice','purchase_invoice') AND date >= date(?, '-29 days')
    GROUP BY date ORDER BY date`, t);
  const recent = db.all(`SELECT id, type, number, date, party_name, total FROM documents ORDER BY created_at DESC, id DESC LIMIT 8`);
  res.json({
    today: { sales: docSum('sales_invoice', t, t), purchase: docSum('purchase_invoice', t, t), ...profitBetween(t, t) },
    month: { sales: docSum('sales_invoice', m, t), purchase: docSum('purchase_invoice', m, t), ...profitBetween(m, t) },
    receivable, payable, stock, low, lowCount, accounts: accountBalances(),
    item_count: db.get<any>('SELECT COUNT(*) c FROM items WHERE active=1').c,
    party_count: db.get<any>('SELECT COUNT(*) c FROM parties WHERE active=1').c,
    open_orders: db.get<any>(`SELECT COUNT(*) c FROM documents WHERE status='open' AND type IN ('quotation','sales_order','purchase_order','delivery_challan')`).c,
    last30, recent,
  });
});

reports.get('/profit-loss', (req, res) => {
  const { from, to } = range(req.query);
  const db = getDb();
  res.json({
    from, to,
    sales: docSum('sales_invoice', from, to), sales_return: docSum('sales_return', from, to),
    purchase: docSum('purchase_invoice', from, to), purchase_return: docSum('purchase_return', from, to),
    ...profitBetween(from, to),
    expense_by_category: db.all(`SELECT COALESCE(c.name,'Uncategorised') category, ROUND(SUM(e.amount),2) amount FROM expenses e
      LEFT JOIN expense_categories c ON c.id=e.category_id WHERE e.date BETWEEN ? AND ? GROUP BY c.name ORDER BY amount DESC`, from, to),
  });
});

/** Stock summary per item: opening, in, out, closing for a date range (optionally one store). */
reports.get('/stock-summary', (req, res) => {
  const { from, to } = range(req.query);
  const store = req.query.store_id ? Number(req.query.store_id) : null;
  const sf = store ? 'AND m.store_id = ?' : '';
  const p = (...a: any[]) => (store ? [...a, store] : a);
  const rows = getDb().all<any>(`SELECT i.id, i.name, i.sku, i.unit, i.purchase_price, i.sale_price, i.low_stock_qty, c.name category_name,
      COALESCE((SELECT SUM(qty) FROM stock_moves m WHERE m.item_id=i.id AND m.date < ? ${sf}),0) opening,
      COALESCE((SELECT SUM(qty) FROM stock_moves m WHERE m.item_id=i.id AND m.qty > 0 AND m.date BETWEEN ? AND ? ${sf}),0) qty_in,
      COALESCE((SELECT -SUM(qty) FROM stock_moves m WHERE m.item_id=i.id AND m.qty < 0 AND m.date BETWEEN ? AND ? ${sf}),0) qty_out
    FROM items i LEFT JOIN categories c ON c.id=i.category_id WHERE i.active=1 ORDER BY i.name`,
    ...p(from), ...p(from, to), ...p(from, to));
  res.json(rows.map((r) => {
    const closing = round2(r.opening + r.qty_in - r.qty_out);
    return { ...r, opening: round2(r.opening), qty_in: round2(r.qty_in), qty_out: round2(r.qty_out), closing, value: round2(closing * r.purchase_price) };
  }));
});

/** Item x store stock matrix. */
reports.get('/stock-by-store', (_req, res) => {
  const db = getDb();
  const stores = db.all<any>('SELECT id, name FROM stores WHERE active=1 ORDER BY id');
  const cells = db.all<any>('SELECT item_id, store_id, ROUND(SUM(qty),3) q FROM stock_moves GROUP BY item_id, store_id');
  const items = db.all<any>('SELECT id, name, unit FROM items WHERE active=1 ORDER BY name');
  const map = new Map<string, number>();
  for (const c of cells) map.set(`${c.item_id}:${c.store_id}`, c.q);
  res.json({
    stores,
    rows: items.map((i) => {
      const per: Record<number, number> = {};
      let total = 0;
      for (const s of stores) { const q = map.get(`${i.id}:${s.id}`) ?? 0; per[s.id] = q; total += q; }
      return { ...i, per, total: round2(total) };
    }),
  });
});

/** Daily stock flow: totals in/out per day. */
reports.get('/daily-stock', (req, res) => {
  const { from, to } = range(req.query);
  res.json(getDb().all(`SELECT m.date, i.name item_name, i.unit,
      ROUND(SUM(CASE WHEN m.qty>0 THEN m.qty ELSE 0 END),3) qty_in, ROUND(SUM(CASE WHEN m.qty<0 THEN -m.qty ELSE 0 END),3) qty_out
    FROM stock_moves m JOIN items i ON i.id=m.item_id WHERE m.date BETWEEN ? AND ?
    GROUP BY m.date, m.item_id ORDER BY m.date DESC, i.name`, from, to));
});

/** Sales/purchase grouped by day, party or item. */
reports.get('/register', (req, res) => {
  const { from, to } = range(req.query);
  const type = (req.query.type as string) || 'sales_invoice';
  const group = (req.query.group as string) || 'date';
  const db = getDb();
  if (group === 'item') {
    return res.json(db.all(`SELECT l.description name, l.unit, ROUND(SUM(l.qty),3) qty, ROUND(SUM(l.taxable),2) taxable,
        ROUND(SUM(l.cgst+l.sgst+l.igst),2) tax, ROUND(SUM(l.amount),2) total, ROUND(SUM(l.taxable - l.qty*l.cost_rate),2) profit
      FROM document_lines l JOIN documents d ON d.id=l.doc_id WHERE d.type=? AND d.status!='cancelled' AND d.date BETWEEN ? AND ?
      GROUP BY COALESCE(l.item_id, l.description) ORDER BY total DESC`, type, from, to));
  }
  const key = group === 'party' ? 'd.party_name' : group === 'month' ? "substr(d.date,1,7)" : 'd.date';
  res.json(db.all(`SELECT ${key} name, COUNT(*) bills, ROUND(SUM(d.subtotal),2) taxable, ROUND(SUM(d.cgst+d.sgst+d.igst),2) tax,
      ROUND(SUM(d.total),2) total, ROUND(SUM(d.subtotal - d.cost_total),2) profit
    FROM documents d WHERE d.type=? AND d.status!='cancelled' AND d.date BETWEEN ? AND ?
    GROUP BY ${key} ORDER BY ${group === 'party' ? 'total DESC' : 'name DESC'}`, type, from, to));
});

reports.get('/receivables', (_req, res) => {
  res.json(partyBalances('p.active = 1').filter((p) => Math.abs(p.balance) >= 0.01));
});

/** GSTR-1 style outward summary: B2B invoices, B2C summary, HSN summary, credit notes. */
reports.get('/gstr1', (req, res) => {
  const { from, to } = range(req.query);
  res.json(gstReport(['sales_invoice', 'sales_return'], from, to));
});
/** GSTR-2 style inward summary from purchase bills. */
reports.get('/gstr2', (req, res) => {
  const { from, to } = range(req.query);
  res.json(gstReport(['purchase_invoice', 'purchase_return'], from, to));
});

function gstReport([invType, retType]: string[], from: string, to: string) {
  const db = getDb();
  const docs = db.all<any>(`SELECT d.id, d.type, d.number, d.date, d.party_name, p.gstin, d.place_of_supply, d.subtotal taxable,
      d.cgst, d.sgst, d.igst, d.total FROM documents d LEFT JOIN parties p ON p.id=d.party_id
    WHERE d.type IN (?, ?) AND d.is_gst=1 AND d.status!='cancelled' AND d.date BETWEEN ? AND ? ORDER BY d.date, d.number`, invType, retType, from, to);
  const invoices = docs.filter((d) => d.type === invType);
  const b2b = invoices.filter((d) => d.gstin);
  const b2cRaw = invoices.filter((d) => !d.gstin);
  const b2cMap = new Map<string, any>();
  for (const d of b2cRaw) {
    const rates = db.all<any>('SELECT gst_rate, SUM(taxable) taxable, SUM(cgst) cgst, SUM(sgst) sgst, SUM(igst) igst FROM document_lines WHERE doc_id=? GROUP BY gst_rate', d.id);
    for (const r of rates) {
      const k = `${d.place_of_supply}|${r.gst_rate}`;
      const cur = b2cMap.get(k) ?? { place_of_supply: d.place_of_supply, gst_rate: r.gst_rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      cur.taxable += r.taxable; cur.cgst += r.cgst; cur.sgst += r.sgst; cur.igst += r.igst;
      b2cMap.set(k, cur);
    }
  }
  const b2c = [...b2cMap.values()].map((r) => ({ ...r, taxable: round2(r.taxable), cgst: round2(r.cgst), sgst: round2(r.sgst), igst: round2(r.igst) }));
  const notes = docs.filter((d) => d.type === retType);
  const hsn = db.all(`SELECT COALESCE(NULLIF(l.hsn,''),'-') hsn, l.unit, l.gst_rate, ROUND(SUM(CASE WHEN d.type=? THEN l.qty ELSE -l.qty END),3) qty,
      ROUND(SUM(CASE WHEN d.type=? THEN l.taxable ELSE -l.taxable END),2) taxable,
      ROUND(SUM(CASE WHEN d.type=? THEN l.cgst ELSE -l.cgst END),2) cgst, ROUND(SUM(CASE WHEN d.type=? THEN l.sgst ELSE -l.sgst END),2) sgst,
      ROUND(SUM(CASE WHEN d.type=? THEN l.igst ELSE -l.igst END),2) igst
    FROM document_lines l JOIN documents d ON d.id=l.doc_id
    WHERE d.type IN (?, ?) AND d.is_gst=1 AND d.status!='cancelled' AND d.date BETWEEN ? AND ?
    GROUP BY l.hsn, l.gst_rate, l.unit ORDER BY l.hsn`, invType, invType, invType, invType, invType, invType, retType, from, to);
  const sum = (rows: any[], k: string) => round2(rows.reduce((s, r) => s + r[k], 0));
  const totals = (rows: any[]) => ({ count: rows.length, taxable: sum(rows, 'taxable'), cgst: sum(rows, 'cgst'), sgst: sum(rows, 'sgst'), igst: sum(rows, 'igst'), total: sum(rows, 'total') });
  return {
    from, to, b2b, b2c, notes, hsn,
    summary: { invoices: totals(invoices), b2b: totals(b2b), b2c: totals(b2cRaw), notes: totals(notes) },
  };
}

reports.get('/price-list', (_req, res) => {
  res.json(getDb().all(`SELECT i.name, i.sku, i.unit, i.hsn, i.gst_rate, i.sale_price, i.mrp, c.name category_name
    FROM items i LEFT JOIN categories c ON c.id=i.category_id WHERE i.active=1 ORDER BY c.name, i.name`));
});

reports.get('/transactions', (req, res) => {
  const { from, to } = range(req.query);
  res.json(getDb().all(`SELECT * FROM (
      SELECT date, type kind, number ref, id ref_id, party_name party, total amount, status, created_at FROM documents WHERE date BETWEEN ? AND ?
      UNION ALL SELECT y.date, 'payment_' || y.direction, y.number, y.id, p.name, y.amount, '', y.created_at FROM payments y JOIN parties p ON p.id=y.party_id WHERE y.date BETWEEN ? AND ?
      UNION ALL SELECT e.date, 'expense', COALESCE(c.name,'Expense'), e.id, e.note, e.amount, '', e.created_at FROM expenses e LEFT JOIN expense_categories c ON c.id=e.category_id WHERE e.date BETWEEN ? AND ?
      UNION ALL SELECT date, 'stock_' || type, number, id, COALESCE(person,''), NULL, '', created_at FROM stock_entries WHERE date BETWEEN ? AND ?
    ) ORDER BY date DESC, created_at DESC LIMIT 2000`, from, to, from, to, from, to, from, to));
});
