/** Live view-model hooks for billing screens. */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import type { Doc, DocType, Party } from '../data/models';
import { CONVERSIONS, docPaid, duplicateNumbers, paidAmounts, r2 } from '../services/documents';
import { partyBalances, partyLedger } from '../services/parties';
import { accountBalances } from '../services/payments';

export interface DocRow extends Doc { paid: number; due: number; profit: number; duplicate: boolean }

export function useDocs(types: DocType[], search = '') {
  return useLiveQuery(async () => {
    const [docs, paid] = await Promise.all([db.docs.where('type').anyOf(types).toArray(), paidAmounts()]);
    const dups = new Set<string>();
    for (const t of types) for (const id of await duplicateNumbers(t)) dups.add(id);
    const s = search.trim().toLowerCase();
    return docs
      .filter((d) => !d.deleted && (!s || d.number.toLowerCase().includes(s) || d.partyName.toLowerCase().includes(s)))
      .map((d) => { const p = docPaid(d, paid); return { ...d, paid: p, due: r2(d.total - p), profit: r2(d.subtotal - d.costTotal), duplicate: dups.has(d.id) }; })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [types.join(','), search]);
}

export function useDoc(id: string) {
  return useLiveQuery(async () => {
    const doc = await db.docs.get(id);
    if (!doc || doc.deleted) return null;
    const [paid, party, source, children, store, dups] = await Promise.all([
      paidAmounts(), doc.partyId ? db.parties.get(doc.partyId) : undefined, doc.sourceId ? db.docs.get(doc.sourceId) : undefined,
      db.docs.where('sourceId').equals(id).filter((c) => !c.deleted).toArray(), db.stores.get(doc.storeId), duplicateNumbers(doc.type),
    ]);
    const p = docPaid(doc, paid);
    return { doc, paid: p, due: r2(doc.total - p), party: party ?? null, source: source && !source.deleted ? source : null, children, storeName: store?.name ?? '', conversions: CONVERSIONS[doc.type] ?? [], duplicate: dups.has(id) };
  }, [id]);
}

export type PartyRow = Party & { balance: number };
export function useParties(filter: 'all' | 'customer' | 'supplier' = 'all', search = '') {
  return useLiveQuery(async () => {
    const s = search.trim().toLowerCase();
    return (await partyBalances())
      .filter((p) => p.active && (filter === 'all' || p.type === filter || p.type === 'both'))
      .filter((p) => !s || p.name.toLowerCase().includes(s) || p.phone.includes(s) || p.gstin.toLowerCase().includes(s))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filter, search]);
}

export function useParty(id: string) {
  return useLiveQuery(async () => {
    const ledger = await partyLedger(id);
    if (!ledger || ledger.party.deleted) return null;
    const docs = (await db.docs.where('partyId').equals(id).toArray()).filter((d) => !d.deleted).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    return { ...ledger, balance: ledger.closing, docs };
  }, [id]);
}

export const useAccounts = () => useLiveQuery(() => accountBalances());

export function usePayments(direction: '' | 'in' | 'out' = '') {
  return useLiveQuery(async () => {
    const [pays, parties, accounts, docs] = await Promise.all([db.payments.filter((p) => !p.deleted).toArray(), db.parties.toArray(), db.accounts.toArray(), db.docs.toArray()]);
    const pn = new Map(parties.map((p) => [p.id, p.name])), an = new Map(accounts.map((a) => [a.id, a.name])), dn = new Map(docs.map((d) => [d.id, d.number]));
    return pays
      .filter((p) => !direction || p.direction === direction)
      .map((p) => ({ ...p, partyName: pn.get(p.partyId) ?? '—', accountName: an.get(p.accountId) ?? '', bills: p.allocations.map((a) => dn.get(a.docId)).filter(Boolean).join(', ') }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [direction]);
}

export function useExpenses(from: string, to: string) {
  return useLiveQuery(async () => {
    const accounts = new Map((await db.accounts.toArray()).map((a) => [a.id, a.name]));
    return (await db.expenses.filter((e) => !e.deleted && e.date >= from && e.date <= to).toArray())
      .map((e) => ({ ...e, accountName: accounts.get(e.accountId) ?? '' }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [from, to]);
}

export const BUSINESS_KEYS = ['business_name', 'business_phone', 'business_email', 'business_address', 'business_gstin', 'business_state', 'bank_details', 'invoice_terms', 'print_format', 'logo'] as const;
export type Business = Record<(typeof BUSINESS_KEYS)[number], string>;

export function useBusiness(): Business | undefined {
  return useLiveQuery(async () => {
    const rows = await db.settings.bulkGet([...BUSINESS_KEYS]);
    const out = {} as Business;
    BUSINESS_KEYS.forEach((k, i) => { out[k] = rows[i] && !rows[i]!.deleted ? rows[i]!.value : ''; });
    return out;
  });
}

/** Home screen money cards. */
export function useMoneySummary() {
  return useLiveQuery(async () => {
    const t = new Date().toISOString().slice(0, 10);
    const [balances, todays] = await Promise.all([partyBalances(), db.docs.where('date').equals(t).toArray()]);
    const sales = todays.filter((d) => d.type === 'sales_invoice' && !d.deleted && d.status !== 'cancelled');
    return {
      todaySales: r2(sales.reduce((s, d) => s + d.total, 0)), todayBills: sales.length,
      receivable: r2(balances.filter((p) => p.balance > 0).reduce((s, p) => s + p.balance, 0)),
      payable: r2(-balances.filter((p) => p.balance < 0).reduce((s, p) => s + p.balance, 0)),
    };
  });
}
