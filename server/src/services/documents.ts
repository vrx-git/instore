import { getDb } from '../db/db.js';
import { bad, notFound, nextNumber, round2 } from './util.js';
import type { MoveType } from './stock.js';

export type DocType =
  | 'quotation' | 'sales_order' | 'sales_invoice' | 'delivery_challan' | 'sales_return'
  | 'purchase_order' | 'purchase_invoice' | 'purchase_return';

interface DocConfig { prefix: string; side: 'sales' | 'purchase'; stockSign: 0 | 1 | -1; move?: MoveType }

export const DOC_TYPES: Record<DocType, DocConfig> = {
  quotation:        { prefix: 'QT',  side: 'sales',    stockSign: 0 },
  sales_order:      { prefix: 'SO',  side: 'sales',    stockSign: 0 },
  sales_invoice:    { prefix: 'INV', side: 'sales',    stockSign: -1, move: 'sale' },
  delivery_challan: { prefix: 'DC',  side: 'sales',    stockSign: -1, move: 'challan' },
  sales_return:     { prefix: 'SR',  side: 'sales',    stockSign: 1,  move: 'sale_return' },
  purchase_order:   { prefix: 'PO',  side: 'purchase', stockSign: 0 },
  purchase_invoice: { prefix: 'PUR', side: 'purchase', stockSign: 1,  move: 'purchase' },
  purchase_return:  { prefix: 'PR',  side: 'purchase', stockSign: -1, move: 'purchase_return' },
};

/** Which conversions are allowed (source -> targets). */
export const CONVERSIONS: Partial<Record<DocType, DocType[]>> = {
  quotation: ['sales_order', 'sales_invoice', 'delivery_challan'],
  sales_order: ['sales_invoice', 'delivery_challan'],
  delivery_challan: ['sales_invoice'],
  sales_invoice: ['sales_return'],
  purchase_order: ['purchase_invoice'],
  purchase_invoice: ['purchase_return'],
};

export const isDocType = (t: string): t is DocType => t in DOC_TYPES;

export interface LineInput {
  item_id?: number | null;
  description?: string;
  hsn?: string;
  unit?: string;
  qty: number;
  rate: number;
  discount_pct?: number;
  gst_rate?: number;
}
export interface DocInput {
  number?: string;
  date: string;
  due_date?: string | null;
  party_id?: number | null;
  party_name?: string | null;
  store_id: number;
  is_gst: boolean;
  tax_inclusive?: boolean;
  place_of_supply?: string | null;
  status?: 'open' | 'completed' | 'cancelled';
  source_doc_id?: number | null;
  other_charges?: number;
  notes?: string;
  terms?: string;
  transport?: string;
  vehicle_no?: string;
  lines: LineInput[];
  /** Amount received/paid at the time of creating an invoice. */
  paid_now?: number;
  account_id?: number;
}

export interface ComputedLine extends Required<Omit<LineInput, 'item_id'>> {
  item_id: number | null;
  taxable: number; cgst: number; sgst: number; igst: number; amount: number; cost_rate: number;
}

/** Pure GST calculation. Intra-state = CGST+SGST split, inter-state = IGST. */
export function computeTotals(lines: LineInput[], opts: { isGst: boolean; intraState: boolean; taxInclusive?: boolean; otherCharges?: number }) {
  const out: Omit<ComputedLine, 'description' | 'hsn' | 'unit' | 'cost_rate' | 'item_id'>[] = [];
  let subtotal = 0, discount = 0, cgst = 0, sgst = 0, igst = 0;
  for (const l of lines) {
    const gstRate = opts.isGst ? l.gst_rate ?? 0 : 0;
    const disc = l.discount_pct ?? 0;
    const gross = l.qty * l.rate;
    let afterDisc = gross * (1 - disc / 100);
    const taxable = round2(opts.taxInclusive ? afterDisc / (1 + gstRate / 100) : afterDisc);
    const tax = round2((taxable * gstRate) / 100);
    const lc = opts.intraState ? round2(tax / 2) : 0;
    const ls = opts.intraState ? round2(tax - lc) : 0;
    const li = opts.intraState ? 0 : tax;
    out.push({ qty: l.qty, rate: l.rate, discount_pct: disc, gst_rate: gstRate, taxable, cgst: lc, sgst: ls, igst: li, amount: round2(taxable + tax) });
    subtotal += taxable; discount += gross - afterDisc; cgst += lc; sgst += ls; igst += li;
  }
  const other = opts.otherCharges ?? 0;
  const exact = round2(subtotal + cgst + sgst + igst + other);
  const total = Math.round(exact);
  return {
    lines: out,
    subtotal: round2(subtotal), discount: round2(discount), cgst: round2(cgst), sgst: round2(sgst), igst: round2(igst),
    other_charges: round2(other), round_off: round2(total - exact), total,
  };
}

function isIntraState(placeOfSupply: string | null | undefined) {
  const businessState = getDb().getSettings().business_state || '';
  if (!placeOfSupply || !businessState) return true;
  return placeOfSupply.trim().toLowerCase() === businessState.trim().toLowerCase();
}

/** Delete and re-create the stock moves for a document from its lines. */
export function rebuildMoves(docId: number) {
  const db = getDb();
  const doc = db.get<any>('SELECT * FROM documents WHERE id=?', docId);
  if (!doc) return;
  db.run('DELETE FROM stock_moves WHERE doc_id=?', docId);
  const cfg = DOC_TYPES[doc.type as DocType];
  if (!cfg.stockSign || doc.status === 'cancelled') return;
  // A challan that has been converted to an invoice no longer holds stock: the invoice does.
  if (doc.type === 'delivery_challan' && db.get("SELECT id FROM documents WHERE source_doc_id=? AND type='sales_invoice' AND status!='cancelled'", docId)) return;
  for (const l of db.all<any>('SELECT * FROM document_lines WHERE doc_id=? AND item_id IS NOT NULL', docId)) {
    db.insert('stock_moves', {
      item_id: l.item_id, store_id: doc.store_id, qty: cfg.stockSign * l.qty,
      rate: cfg.side === 'purchase' ? l.taxable / (l.qty || 1) : l.cost_rate,
      type: cfg.move, doc_id: docId, date: doc.date, note: doc.number,
    });
  }
}

export function saveDocument(type: DocType, input: DocInput, id?: number, userId?: number): number {
  const db = getDb();
  const cfg = DOC_TYPES[type];
  if (!input.lines?.length) throw bad('Add at least one item');
  if (!input.store_id) throw bad('Choose a store');
  if (!input.party_id && !input.party_name && type !== 'sales_invoice') throw bad('Choose a party');
  for (const l of input.lines) {
    if (!(l.qty > 0)) throw bad('Quantity must be greater than 0');
    if (l.rate < 0) throw bad('Rate cannot be negative');
  }

  return db.tx(() => {
    let existing: any;
    if (id) {
      existing = db.get('SELECT * FROM documents WHERE id=? AND type=?', id, type);
      if (!existing) throw notFound('Document');
    }
    const party = input.party_id ? db.get<any>('SELECT * FROM parties WHERE id=?', input.party_id) : undefined;
    if (input.party_id && !party) throw bad('Party not found');
    const pos = input.place_of_supply || party?.state || db.getSettings().business_state;
    const totals = computeTotals(input.lines, {
      isGst: input.is_gst, intraState: isIntraState(pos), taxInclusive: input.tax_inclusive, otherCharges: input.other_charges,
    });

    const lines: ComputedLine[] = input.lines.map((l, i) => {
      const item = l.item_id ? db.get<any>('SELECT * FROM items WHERE id=?', l.item_id) : undefined;
      if (l.item_id && !item) throw bad(`Item ${l.item_id} not found`);
      return {
        ...totals.lines[i],
        item_id: l.item_id ?? null,
        description: l.description || item?.name || 'Item',
        hsn: l.hsn ?? item?.hsn ?? '',
        unit: l.unit ?? item?.unit ?? '',
        cost_rate: item?.purchase_price ?? 0,
      };
    });
    const costTotal = round2(lines.reduce((s, l) => s + l.qty * l.cost_rate, 0));

    let number = input.number?.trim() || existing?.number || nextNumber(cfg.prefix, 'documents', 'type = ?', type);
    const dup = db.get<any>('SELECT id FROM documents WHERE type=? AND number=? AND id != ?', type, number, id ?? 0);
    if (dup) throw bad(`Number ${number} is already used`);

    const row = {
      type, number, date: input.date, due_date: input.due_date, party_id: input.party_id ?? null,
      party_name: input.party_id ? party.name : input.party_name || 'Cash Sale',
      store_id: input.store_id, is_gst: input.is_gst, tax_inclusive: !!input.tax_inclusive, place_of_supply: pos,
      status: input.status ?? existing?.status ?? defaultStatus(type),
      source_doc_id: input.source_doc_id ?? existing?.source_doc_id ?? null,
      subtotal: totals.subtotal, discount: totals.discount, cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst,
      other_charges: totals.other_charges, round_off: totals.round_off, total: totals.total, cost_total: costTotal,
      notes: input.notes, terms: input.terms, transport: input.transport, vehicle_no: input.vehicle_no,
    };

    let docId: number;
    if (existing) {
      db.update('documents', existing.id, row);
      docId = existing.id;
      db.run('DELETE FROM document_lines WHERE doc_id=?', docId);
    } else {
      docId = db.insert('documents', { ...row, created_by: userId });
    }
    for (const l of lines) db.insert('document_lines', { ...l, doc_id: docId });
    rebuildMoves(docId);

    // Converting: mark the source as completed (returns leave their source invoice alone).
    if (!existing && row.source_doc_id && !type.endsWith('_return')) {
      db.run("UPDATE documents SET status='completed' WHERE id=? AND status='open'", row.source_doc_id);
      rebuildMoves(row.source_doc_id); // releases challan stock to the invoice
    }

    // Payment taken at the counter when creating the invoice.
    if (!existing && input.paid_now && input.paid_now > 0 && party && (type === 'sales_invoice' || type === 'purchase_invoice')) {
      createPayment({
        direction: type === 'sales_invoice' ? 'in' : 'out', date: input.date, party_id: party.id,
        account_id: input.account_id || db.get<any>("SELECT id FROM accounts WHERE kind='cash' LIMIT 1").id,
        amount: Math.min(input.paid_now, totals.total), allocations: [{ doc_id: docId, amount: Math.min(input.paid_now, totals.total) }],
        note: `Against ${number}`,
      }, userId);
    }
    return docId;
  });
}

function defaultStatus(type: DocType) {
  return ['quotation', 'sales_order', 'purchase_order', 'delivery_challan'].includes(type) ? 'open' : 'completed';
}

export function setStatus(id: number, status: 'open' | 'completed' | 'cancelled') {
  const db = getDb();
  db.tx(() => {
    const doc = db.get<any>('SELECT * FROM documents WHERE id=?', id);
    if (!doc) throw notFound('Document');
    db.run('UPDATE documents SET status=? WHERE id=?', status, id);
    if (status === 'cancelled') db.run('DELETE FROM payment_allocations WHERE doc_id=?', id);
    rebuildMoves(id);
    if (doc.source_doc_id) rebuildMoves(doc.source_doc_id);
  });
}

export function deleteDocument(id: number) {
  const db = getDb();
  db.tx(() => {
    const doc = db.get<any>('SELECT * FROM documents WHERE id=?', id);
    if (!doc) throw notFound('Document');
    db.run('DELETE FROM documents WHERE id=?', id);
    if (doc.source_doc_id) {
      // Re-open the source if nothing else completed it.
      if (!db.get("SELECT id FROM documents WHERE source_doc_id=? AND status!='cancelled'", doc.source_doc_id) && !doc.type.endsWith('_return')) {
        db.run("UPDATE documents SET status='open' WHERE id=? AND status='completed'", doc.source_doc_id);
      }
      rebuildMoves(doc.source_doc_id);
    }
  });
}

export function getDocument(id: number) {
  const db = getDb();
  const doc = db.get<any>(
    `SELECT d.*, p.phone party_phone, p.gstin party_gstin, p.address party_address, p.state party_state, p.email party_email,
       s.name store_name, src.number source_number, src.type source_type,
       CASE WHEN d.party_id IS NULL THEN d.total ELSE COALESCE((SELECT SUM(amount) FROM payment_allocations WHERE doc_id=d.id),0) END paid
     FROM documents d LEFT JOIN parties p ON p.id=d.party_id JOIN stores s ON s.id=d.store_id
     LEFT JOIN documents src ON src.id=d.source_doc_id WHERE d.id=?`, id);
  if (!doc) return undefined;
  doc.lines = db.all('SELECT * FROM document_lines WHERE doc_id=? ORDER BY id', id);
  doc.children = db.all('SELECT id, type, number, status FROM documents WHERE source_doc_id=?', id);
  doc.balance = round2(doc.total - doc.paid);
  return doc;
}

// ---------- payments (kept here to avoid a circular import with ledger) ----------
export interface PaymentInput {
  number?: string;
  direction: 'in' | 'out';
  date: string;
  party_id: number;
  account_id: number;
  amount: number;
  reference?: string;
  note?: string;
  allocations?: { doc_id: number; amount: number }[];
  auto_allocate?: boolean;
}

export function createPayment(input: PaymentInput, userId?: number): number {
  const db = getDb();
  if (!(input.amount > 0)) throw bad('Amount must be greater than 0');
  return db.tx(() => {
    const number = input.number || nextNumber(input.direction === 'in' ? 'RCPT' : 'PAY', 'payments', 'direction=?', input.direction);
    const id = db.insert('payments', {
      number, direction: input.direction, date: input.date, party_id: input.party_id, account_id: input.account_id,
      amount: round2(input.amount), reference: input.reference, note: input.note, created_by: userId,
    });
    let allocs = input.allocations ?? [];
    if (!allocs.length && input.auto_allocate) allocs = autoAllocations(input.party_id, input.direction, input.amount);
    let used = 0;
    for (const a of allocs) {
      if (!(a.amount > 0)) continue;
      const due = docBalance(a.doc_id);
      const amt = round2(Math.min(a.amount, due, input.amount - used));
      if (amt <= 0) continue;
      db.insert('payment_allocations', { payment_id: id, doc_id: a.doc_id, amount: amt });
      used += amt;
    }
    return id;
  });
}

export function docBalance(docId: number) {
  const r = getDb().get<{ b: number }>(
    'SELECT d.total - COALESCE((SELECT SUM(amount) FROM payment_allocations WHERE doc_id=d.id),0) b FROM documents d WHERE id=?', docId);
  return round2(r?.b ?? 0);
}

function autoAllocations(partyId: number, direction: 'in' | 'out', amount: number) {
  const type = direction === 'in' ? 'sales_invoice' : 'purchase_invoice';
  const open = getDb().all<{ id: number; due: number }>(
    `SELECT d.id, d.total - COALESCE((SELECT SUM(amount) FROM payment_allocations WHERE doc_id=d.id),0) due
     FROM documents d WHERE d.party_id=? AND d.type=? AND d.status!='cancelled' ORDER BY d.date, d.id`, partyId, type);
  const out: { doc_id: number; amount: number }[] = [];
  let left = amount;
  for (const d of open) {
    if (left <= 0) break;
    if (d.due <= 0) continue;
    const a = Math.min(d.due, left);
    out.push({ doc_id: d.id, amount: a });
    left -= a;
  }
  return out;
}
