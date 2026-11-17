/**
 * Bills: invoices, purchases, quotes, orders, challans, returns.
 * Ported from the PC app (server/src/services/documents.ts) to run on the phone with Dexie.
 * A bill keeps its lines inside the record; bills that move stock own stock moves
 * with fixed ids "<docId>:<line#>", so edits update them in place and sync cleanly.
 */
import { db, getSetting } from '../data/db';
import { newId, type Doc, type DocLine, type DocStatus, type DocType, type Move, type MoveType } from '../data/models';
import { createPaymentInTx } from './payments';

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export class DocError extends Error {}

interface DocConfig { prefix: string; side: 'sales' | 'purchase'; stockSign: 0 | 1 | -1; move?: MoveType; tracksStatus: boolean }

export const DOC_TYPES: Record<DocType, DocConfig> = {
  quotation:        { prefix: 'QT',  side: 'sales',    stockSign: 0, tracksStatus: true },
  sales_order:      { prefix: 'SO',  side: 'sales',    stockSign: 0, tracksStatus: true },
  sales_invoice:    { prefix: 'INV', side: 'sales',    stockSign: -1, move: 'sale', tracksStatus: false },
  delivery_challan: { prefix: 'DC',  side: 'sales',    stockSign: -1, move: 'challan', tracksStatus: true },
  sales_return:     { prefix: 'SR',  side: 'sales',    stockSign: 1, move: 'sale_return', tracksStatus: false },
  purchase_order:   { prefix: 'PO',  side: 'purchase', stockSign: 0, tracksStatus: true },
  purchase_invoice: { prefix: 'PUR', side: 'purchase', stockSign: 1, move: 'purchase', tracksStatus: false },
  purchase_return:  { prefix: 'PR',  side: 'purchase', stockSign: -1, move: 'purchase_return', tracksStatus: false },
};

/** Which conversions are allowed (source -> targets). */
export const CONVERSIONS: Partial<Record<DocType, DocType[]>> = {
  quotation: ['sales_invoice', 'sales_order', 'delivery_challan'],
  sales_order: ['sales_invoice', 'delivery_challan'],
  delivery_challan: ['sales_invoice'],
  sales_invoice: ['sales_return'],
  purchase_order: ['purchase_invoice'],
  purchase_invoice: ['purchase_return'],
};

export interface LineInput { itemId?: string | null; description?: string; hsn?: string; unit?: string; qty: number; rate: number; discountPct?: number; gstRate?: number }

/** Pure GST calculation. Within your state = CGST + SGST; other states = IGST. */
export function computeTotals(lines: LineInput[], o: { isGst: boolean; intraState: boolean; taxInclusive?: boolean; otherCharges?: number }) {
  let subtotal = 0, discount = 0, cgst = 0, sgst = 0, igst = 0;
  const out = lines.map((l) => {
    const g = o.isGst ? l.gstRate ?? 0 : 0;
    const gross = (l.qty || 0) * (l.rate || 0);
    const after = gross * (1 - (l.discountPct ?? 0) / 100);
    const taxable = r2(o.taxInclusive ? after / (1 + g / 100) : after);
    const tax = r2((taxable * g) / 100);
    const c = o.intraState ? r2(tax / 2) : 0;
    const s = o.intraState ? r2(tax - c) : 0;
    const i = o.intraState ? 0 : tax;
    subtotal += taxable; discount += gross - after; cgst += c; sgst += s; igst += i;
    return { gstRate: g, taxable, cgst: c, sgst: s, igst: i, amount: r2(taxable + tax) };
  });
  const other = o.otherCharges ?? 0;
  const exact = r2(subtotal + cgst + sgst + igst + other);
  const total = Math.round(exact);
  return { lines: out, subtotal: r2(subtotal), discount: r2(discount), cgst: r2(cgst), sgst: r2(sgst), igst: r2(igst), otherCharges: r2(other), roundOff: r2(total - exact), total };
}

export async function businessState() {
  return (await getSetting('business_state')) || '';
}
export const isIntraState = (placeOfSupply: string, home: string) =>
  !placeOfSupply || !home || placeOfSupply.trim().toLowerCase() === home.trim().toLowerCase();

/** Next number for a bill type, e.g. INV-0007 (highest existing + 1). */
export async function nextNumber(type: DocType) {
  const docs = await db.docs.where('type').equals(type).toArray();
  let max = 0;
  for (const d of docs) { const m = /(\d+)\s*$/.exec(d.number); if (m) max = Math.max(max, parseInt(m[1], 10)); }
  return `${DOC_TYPES[type].prefix}-${String(max + 1).padStart(4, '0')}`;
}

/** Bills sharing a number with an older bill of the same type (can happen when two phones work offline). */
export async function duplicateNumbers(type: DocType): Promise<Set<string>> {
  const docs = (await db.docs.where('type').equals(type).toArray()).filter((d) => !d.deleted).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const d of docs) { if (seen.has(d.number)) dups.add(d.id); else seen.add(d.number); }
  return dups;
}

export async function renumber(id: string) {
  const d = await db.docs.get(id);
  if (!d) return;
  await db.docs.update(id, { number: await nextNumber(d.type) });
}

const at = (date: string, createdAt: number) => {
  const t = new Date(createdAt);
  const d = new Date(`${date}T${t.toTimeString().slice(0, 8)}`);
  return Number.isNaN(d.getTime()) ? createdAt : d.getTime();
};

/** Make the bill's stock moves match its lines (fixed ids, so edits update in place). */
export async function rebuildDocMoves(docId: string) {
  const doc = await db.docs.get(docId);
  const existing = await db.moves.where('docId').equals(docId).toArray();
  const want = new Map<string, Move>();
  if (doc && !doc.deleted && doc.status !== 'cancelled') {
    const cfg = DOC_TYPES[doc.type];
    // A challan that became an invoice no longer holds stock — the invoice does.
    const handedOver = doc.type === 'delivery_challan' && (await db.docs.where('sourceId').equals(docId).toArray())
      .some((c) => c.type === 'sales_invoice' && !c.deleted && c.status !== 'cancelled');
    if (cfg.stockSign && !handedOver) {
      doc.lines.forEach((l, i) => {
        if (!l.itemId || !l.qty) return;
        want.set(`${docId}:${i}`, {
          id: `${docId}:${i}`, itemId: l.itemId, storeId: doc.storeId, qty: cfg.stockSign * l.qty, type: cfg.move!, userId: doc.createdBy,
          at: at(doc.date, doc.createdAt), note: `${doc.number}${doc.partyName ? ` · ${doc.partyName}` : ''}`, ref: docId, docId,
        } as Move);
      });
    }
  }
  for (const m of existing) {
    const w = want.get(m.id);
    if (!w) { if (!m.deleted) await db.moves.update(m.id, { deleted: 1 }); continue; }
    const same = m.itemId === w.itemId && m.storeId === w.storeId && m.qty === w.qty && m.type === w.type && m.at === w.at && m.note === w.note && !m.deleted;
    if (!same) await db.moves.update(m.id, { itemId: w.itemId, storeId: w.storeId, qty: w.qty, type: w.type, at: w.at, note: w.note, userId: w.userId, deleted: 0 });
    want.delete(m.id);
  }
  for (const w of want.values()) await db.moves.add(w);
}

export interface DocInput {
  number?: string;
  date: string;
  dueDate?: string;
  partyId?: string | null;
  partyName?: string;
  storeId: string;
  isGst: boolean;
  taxInclusive?: boolean;
  placeOfSupply?: string;
  status?: DocStatus;
  sourceId?: string | null;
  otherCharges?: number;
  notes?: string;
  terms?: string;
  transport?: string;
  vehicleNo?: string;
  lines: LineInput[];
  /** amount received/paid at the counter when creating an invoice */
  paidNow?: number;
  accountId?: string;
}

const defaultStatus = (t: DocType): DocStatus => (DOC_TYPES[t].tracksStatus ? 'open' : 'completed');

export async function saveDocument(type: DocType, input: DocInput, userId: string, id?: string): Promise<string> {
  if (!input.lines?.length) throw new DocError('Add at least one item');
  if (!input.storeId) throw new DocError('Choose a store');
  if (!input.partyId && type !== 'sales_invoice') throw new DocError(`Choose a ${DOC_TYPES[type].side === 'purchase' ? 'supplier' : 'customer'}`);
  for (const l of input.lines) {
    if (!(l.qty > 0)) throw new DocError('Quantity must be more than 0');
    if (l.rate < 0) throw new DocError('Rate cannot be negative');
  }
  const home = await businessState();

  return db.transaction('rw', [db.docs, db.moves, db.items, db.parties, db.payments, db.settings], async () => {
    const existing = id ? await db.docs.get(id) : undefined;
    if (id && (!existing || existing.deleted)) throw new DocError('Bill not found');
    const party = input.partyId ? await db.parties.get(input.partyId) : undefined;
    if (input.partyId && !party) throw new DocError('Party not found');
    const pos = input.placeOfSupply || party?.state || home;
    const t = computeTotals(input.lines, { isGst: input.isGst, intraState: isIntraState(pos, home), taxInclusive: input.taxInclusive, otherCharges: input.otherCharges });

    const lines: DocLine[] = [];
    for (let i = 0; i < input.lines.length; i++) {
      const l = input.lines[i];
      const item = l.itemId ? await db.items.get(l.itemId) : undefined;
      lines.push({
        itemId: l.itemId ?? null, description: l.description || item?.name || 'Item', hsn: l.hsn ?? item?.hsn ?? '', unit: l.unit ?? item?.unit ?? '',
        qty: l.qty, rate: l.rate, discountPct: l.discountPct ?? 0, ...t.lines[i], costRate: item?.purchasePrice ?? 0,
      });
    }
    const number = input.number?.trim() || existing?.number || (await nextNumber(type));
    const docId = existing?.id ?? newId();
    const record = {
      type, number, date: input.date, dueDate: input.dueDate ?? '', partyId: input.partyId ?? null,
      partyName: party ? party.name : input.partyName?.trim() || 'Cash Sale', storeId: input.storeId,
      isGst: input.isGst ? 1 : 0, taxInclusive: input.taxInclusive ? 1 : 0, placeOfSupply: pos,
      status: input.status ?? existing?.status ?? defaultStatus(type), sourceId: input.sourceId ?? existing?.sourceId ?? null, lines,
      subtotal: t.subtotal, discount: t.discount, cgst: t.cgst, sgst: t.sgst, igst: t.igst, otherCharges: t.otherCharges, roundOff: t.roundOff, total: t.total,
      costTotal: r2(lines.reduce((s, l) => s + l.qty * l.costRate, 0)),
      notes: input.notes ?? '', terms: input.terms ?? '', transport: input.transport ?? '', vehicleNo: input.vehicleNo ?? '',
    } as const;
    if (existing) await db.docs.update(docId, record as Partial<Doc>);
    else await db.docs.add({ ...record, id: docId, createdBy: userId, createdAt: Date.now() } as Doc);
    await rebuildDocMoves(docId);

    // Converting: complete the source (returns leave their invoice alone) and release challan stock.
    if (!existing && record.sourceId && !type.endsWith('_return')) {
      const src = await db.docs.get(record.sourceId);
      if (src && src.status === 'open') await db.docs.update(src.id, { status: 'completed' });
      await rebuildDocMoves(record.sourceId);
    }

    // Money taken at the counter.
    if (!existing && input.paidNow && input.paidNow > 0 && party && (type === 'sales_invoice' || type === 'purchase_invoice')) {
      const amount = Math.min(input.paidNow, t.total);
      await createPaymentInTx({
        direction: type === 'sales_invoice' ? 'in' : 'out', date: input.date, partyId: party.id, accountId: input.accountId || 'cash',
        amount, allocations: [{ docId, amount }], note: `Against ${number}`,
      }, userId);
    }
    return docId;
  });
}

export async function setStatus(id: string, status: DocStatus) {
  await db.transaction('rw', [db.docs, db.moves, db.payments], async () => {
    const doc = await db.docs.get(id);
    if (!doc) throw new DocError('Bill not found');
    await db.docs.update(id, { status });
    if (status === 'cancelled') {
      // Free up payments that were set against this bill (they stay as advance).
      const pays = (await db.payments.where('partyId').equals(doc.partyId ?? '').toArray()).filter((p) => p.allocations.some((a) => a.docId === id));
      for (const p of pays) await db.payments.update(p.id, { allocations: p.allocations.filter((a) => a.docId !== id) });
    }
    await rebuildDocMoves(id);
    if (doc.sourceId) await rebuildDocMoves(doc.sourceId);
  });
}

export async function deleteDocument(id: string) {
  await db.transaction('rw', [db.docs, db.moves, db.payments], async () => {
    const doc = await db.docs.get(id);
    if (!doc) return;
    await db.docs.update(id, { deleted: 1 });
    const pays = (await db.payments.where('partyId').equals(doc.partyId ?? '').toArray()).filter((p) => p.allocations.some((a) => a.docId === id));
    for (const p of pays) await db.payments.update(p.id, { allocations: p.allocations.filter((a) => a.docId !== id) });
    await rebuildDocMoves(id);
    if (doc.sourceId) {
      const others = (await db.docs.where('sourceId').equals(doc.sourceId).toArray()).some((c) => c.id !== id && !c.deleted && c.status !== 'cancelled');
      if (!others && !doc.type.endsWith('_return')) {
        const src = await db.docs.get(doc.sourceId);
        if (src?.status === 'completed' && DOC_TYPES[src.type].tracksStatus) await db.docs.update(src.id, { status: 'open' });
      }
      await rebuildDocMoves(doc.sourceId);
    }
  });
}

/** Amount paid against a bill. Walk-in cash sales (no party) count as fully paid. */
export async function paidAmounts(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await db.payments.each((p) => {
    if (p.deleted) return;
    for (const a of p.allocations) out.set(a.docId, r2((out.get(a.docId) ?? 0) + a.amount));
  });
  return out;
}

export function docPaid(doc: Doc, paid: Map<string, number>) {
  if (!doc.partyId && doc.type === 'sales_invoice') return doc.total;
  return paid.get(doc.id) ?? 0;
}

export const isInvoice = (t: DocType) => t === 'sales_invoice' || t === 'purchase_invoice';
export const today = () => new Date().toISOString().slice(0, 10);
