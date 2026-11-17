/** Customers & suppliers, balances and ledger. Ported from the PC app (server/src/services/ledger.ts). */
import { db } from '../data/db';
import { newId, type Doc, type Party, type Payment } from '../data/models';
import { r2 } from './documents';

export class PartyError extends Error {}
export type PartyInput = Omit<Party, 'id' | 'updatedAt' | 'deleted' | 'dirty' | 'createdAt' | 'active'>;

export const blankParty = (type: Party['type'] = 'customer', state = ''): PartyInput =>
  ({ name: '', type, phone: '', email: '', gstin: '', state, address: '', openingBalance: 0 });

export async function createParty(p: PartyInput) {
  if (!p.name.trim()) throw new PartyError('Party name is required');
  const id = newId();
  await db.parties.add({ ...p, name: p.name.trim(), gstin: p.gstin.trim().toUpperCase(), id, active: 1, createdAt: Date.now() } as Party);
  return id;
}

export async function updateParty(id: string, p: PartyInput) {
  if (!p.name.trim()) throw new PartyError('Party name is required');
  await db.parties.update(id, { ...p, name: p.name.trim(), gstin: p.gstin.trim().toUpperCase() });
}

/** Deletes if unused, otherwise hides (keeps history intact). */
export async function removeParty(id: string) {
  const used = (await db.docs.where('partyId').equals(id).filter((d) => !d.deleted).count()) + (await db.payments.where('partyId').equals(id).filter((p) => !p.deleted).count());
  await db.parties.update(id, used ? { active: 0 } : { deleted: 1 });
  return used ? 'hidden' : 'deleted';
}

/** Effect of a bill on the party balance (+ = they owe us more). */
export function docEffect(d: Doc) {
  if (d.deleted || d.status === 'cancelled') return 0;
  switch (d.type) {
    case 'sales_invoice': return d.total;
    case 'sales_return': return -d.total;
    case 'purchase_invoice': return -d.total;
    case 'purchase_return': return d.total;
    default: return 0;
  }
}
export const paymentEffect = (p: Payment) => (p.deleted ? 0 : p.direction === 'in' ? -p.amount : p.amount);

/** All parties with balance: +ve to receive, -ve to pay. */
export async function partyBalances() {
  const [parties, docs, payments] = await Promise.all([db.parties.filter((p) => !p.deleted).toArray(), db.docs.toArray(), db.payments.toArray()]);
  const bal = new Map<string, number>();
  for (const d of docs) if (d.partyId) bal.set(d.partyId, (bal.get(d.partyId) ?? 0) + docEffect(d));
  for (const p of payments) bal.set(p.partyId, (bal.get(p.partyId) ?? 0) + paymentEffect(p));
  return parties.map((p) => ({ ...p, balance: r2(p.openingBalance + (bal.get(p.id) ?? 0)) }));
}

export interface LedgerRow { date: string; kind: string; ref: string; refId: string; debit: number; credit: number; balance: number }

/** Party ledger with running balance. Debit = they owe more; credit = they owe less. */
export async function partyLedger(partyId: string) {
  const party = await db.parties.get(partyId);
  if (!party) return null;
  const docs = (await db.docs.where('partyId').equals(partyId).toArray()).filter((d) => docEffect(d) !== 0);
  const pays = (await db.payments.where('partyId').equals(partyId).toArray()).filter((p) => !p.deleted);
  const entries = [
    ...docs.map((d) => ({ date: d.date, t: d.createdAt, kind: d.type as string, ref: d.number, refId: d.id, eff: docEffect(d) })),
    ...pays.map((p) => ({ date: p.date, t: p.createdAt, kind: p.direction === 'in' ? 'payment_in' : 'payment_out', ref: p.number, refId: p.id, eff: paymentEffect(p) })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t);
  let bal = party.openingBalance;
  const rows: LedgerRow[] = entries.map((e) => {
    bal = r2(bal + e.eff);
    return { date: e.date, kind: e.kind, ref: e.ref, refId: e.refId, debit: e.eff > 0 ? e.eff : 0, credit: e.eff < 0 ? -e.eff : 0, balance: bal };
  });
  return { party, opening: party.openingBalance, closing: bal, rows };
}

/** GSTIN starts with a 2-digit state code. */
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh',
};
export const stateFromGstin = (g: string) => GST_STATE_CODES[g.trim().slice(0, 2)];
