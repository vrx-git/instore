import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { createPayment, openBills } from '../services/payments';
import { useAccounts, useParties } from '../hooks/billing';
import { useUserId } from '../hooks/session';
import { fmtDate, money, todayStr } from '../lib/format';
import { Field, List, Row, Segmented, Sheet, useToast } from './ui';

/** Record money received from a customer or paid to a supplier, optionally against bills. */
export function PaymentSheet({ open, onClose, direction: initialDir = 'in', partyId, docId }: {
  open: boolean; onClose: () => void; direction?: 'in' | 'out'; partyId?: string | null; docId?: string;
}) {
  const toast = useToast();
  const userId = useUserId();
  const accounts = useAccounts();
  const [direction, setDirection] = useState<'in' | 'out'>(initialDir);
  const parties = useParties(direction === 'in' ? 'customer' : 'supplier');
  const [f, setF] = useState({ partyId: partyId ?? '', date: todayStr(), amount: '', accountId: 'cash', reference: '', note: '' });
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const bills = useLiveQuery(() => (f.partyId ? openBills(f.partyId, direction) : Promise.resolve([])), [f.partyId, direction]);
  const party = parties?.find((p) => p.id === f.partyId);

  useEffect(() => {
    if (!open) return;
    setDirection(initialDir);
    setF({ partyId: partyId ?? '', date: todayStr(), amount: '', accountId: 'cash', reference: '', note: '' });
    setAlloc({});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Paying one bill: pre-fill its due.
  useEffect(() => {
    if (!open || !docId || !bills) return;
    const b = bills.find((x) => x.doc.id === docId);
    if (b) { setAlloc({ [b.doc.id]: b.due }); setF((x) => ({ ...x, amount: x.amount || String(b.due) })); }
  }, [open, docId, bills]);

  const spread = (amount: number) => {
    let left = amount;
    const next: Record<string, number> = {};
    for (const b of bills ?? []) { if (left <= 0) break; const a = Math.min(b.due, left); next[b.doc.id] = Math.round(a * 100) / 100; left -= a; }
    setAlloc(next);
  };

  const save = async () => {
    try {
      await createPayment({
        direction, date: f.date, partyId: f.partyId, accountId: f.accountId, amount: Number(f.amount), reference: f.reference, note: f.note,
        allocations: Object.entries(alloc).filter(([, v]) => v > 0).map(([d, amount]) => ({ docId: d, amount })),
      }, userId);
      toast(direction === 'in' ? 'Payment received' : 'Payment recorded');
      onClose();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={direction === 'in' ? 'Receive payment' : 'Make payment'}>
      <div className="space-y-3">
        {!partyId && <Segmented options={[{ id: 'in', label: 'Received (in)' }, { id: 'out', label: 'Paid (out)' }]} value={direction} onChange={(v) => { setDirection(v); setF((x) => ({ ...x, partyId: '' })); setAlloc({}); }} />}
        <Field label={direction === 'in' ? 'Customer' : 'Supplier'}>
          <select className="field" value={f.partyId} disabled={!!partyId} onChange={(e) => { setF({ ...f, partyId: e.target.value }); setAlloc({}); }}>
            <option value="">Choose…</option>{parties?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {party && <span className="mt-1 block text-xs text-muted">Balance: {party.balance >= 0 ? `${money(party.balance)} to receive` : `${money(-party.balance)} to pay`}</span>}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount ₹"><input className="field text-lg font-semibold" type="number" inputMode="decimal" min="0" value={f.amount} onChange={(e) => { setF({ ...f, amount: e.target.value }); spread(Number(e.target.value) || 0); }} /></Field>
          <Field label="Date"><input className="field" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        <Field label="Mode">
          <Segmented options={(accounts ?? []).map((a) => ({ id: a.id, label: a.name }))} value={f.accountId} onChange={(v) => setF({ ...f, accountId: v })} />
        </Field>
        <Field label="Reference (UPI / cheque no.)"><input className="field" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        {!!bills?.length && (
          <div>
            <div className="label">Settle against bills</div>
            <List>
              {bills.map((b) => (
                <Row key={b.doc.id}>
                  <div className="min-w-0 flex-1"><div className="font-medium">{b.doc.number}</div><div className="text-xs text-muted">{fmtDate(b.doc.date)} · due {money(b.due)}</div></div>
                  <input className="field w-28 py-2 text-right" type="number" inputMode="decimal" min="0" value={alloc[b.doc.id] ?? ''} aria-label={`Amount for ${b.doc.number}`}
                    onChange={(e) => setAlloc({ ...alloc, [b.doc.id]: Math.min(b.due, e.target.valueAsNumber || 0) })} />
                </Row>
              ))}
            </List>
            <p className="mt-1 text-xs text-muted">Anything not set against a bill stays as advance.</p>
          </div>
        )}
        <button className="btn-primary w-full text-[17px]" disabled={!f.partyId || !(Number(f.amount) > 0)} onClick={save}>Save payment</button>
      </div>
    </Sheet>
  );
}
