import { useEffect, useState } from 'react';
import { UserPlus, Store as StoreIcon } from 'lucide-react';
import type { Party } from '../data/models';
import { blankParty, createParty, stateFromGstin, updateParty, type PartyInput } from '../services/parties';
import { useBusiness, useParties } from '../hooks/billing';
import { INDIAN_STATES, money } from '../lib/format';
import { Field, List, Row, SearchBar, Segmented, Sheet, useToast } from './ui';

export function BalanceText({ value, small }: { value: number; small?: boolean }) {
  if (Math.abs(value) < 0.01) return <span className="text-muted">Settled</span>;
  return value > 0
    ? <span className={`font-semibold text-primary ${small ? 'text-sm' : ''}`}>{money(value)} <span className="text-xs font-normal">to receive</span></span>
    : <span className={`font-semibold text-out ${small ? 'text-sm' : ''}`}>{money(-value)} <span className="text-xs font-normal">to pay</span></span>;
}

/** Add / edit a customer or supplier. */
export function PartyFormSheet({ open, onClose, party, defaultType = 'customer', onSaved }: {
  open: boolean; onClose: () => void; party?: Party | null; defaultType?: Party['type']; onSaved?: (id: string) => void;
}) {
  const toast = useToast();
  const biz = useBusiness();
  const [f, setF] = useState<PartyInput>(blankParty(defaultType));
  const [owe, setOwe] = useState<'receive' | 'pay'>('receive');
  useEffect(() => {
    if (!open) return;
    if (party) { const { id: _i, updatedAt: _u, deleted: _d, dirty: _y, createdAt: _c, active: _a, ...rest } = party; setF(rest); setOwe(party.openingBalance < 0 ? 'pay' : 'receive'); }
    else { setF(blankParty(defaultType, biz?.business_state ?? '')); setOwe(defaultType === 'supplier' ? 'pay' : 'receive'); }
  }, [open, party?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof PartyInput>(k: K, v: PartyInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    try {
      const amt = Math.abs(Number(f.openingBalance) || 0);
      const body = { ...f, openingBalance: owe === 'pay' ? -amt : amt };
      const id = party ? (await updateParty(party.id, body), party.id) : await createParty(body);
      toast(party ? 'Saved' : `${f.name} added`);
      onSaved?.(id);
      onClose();
    } catch (e: any) { toast(e.message, 'error'); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={party ? 'Edit party' : f.type === 'supplier' ? 'New supplier' : 'New customer'}>
      <div className="space-y-3">
        <Segmented options={[{ id: 'customer', label: 'Customer' }, { id: 'supplier', label: 'Supplier' }, { id: 'both', label: 'Both' }]} value={f.type} onChange={(v) => set('type', v)} />
        <Field label="Name *"><input className="field" autoFocus value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Phone"><input className="field" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="GSTIN (optional)">
          <input className="field uppercase" maxLength={15} autoCapitalize="characters" value={f.gstin}
            onChange={(e) => { const g = e.target.value.toUpperCase(); setF((x) => ({ ...x, gstin: g, state: stateFromGstin(g) ?? x.state })); }} />
        </Field>
        <Field label="State (decides CGST+SGST or IGST)">
          <select className="field" value={f.state} onChange={(e) => set('state', e.target.value)}>
            <option value="">—</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Address"><input className="field" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opening balance ₹"><input className="field" type="number" inputMode="decimal" min="0" value={Math.abs(f.openingBalance) || ''} onChange={(e) => set('openingBalance', e.target.valueAsNumber || 0)} /></Field>
          <Field label="Balance type">
            <select className="field" value={owe} onChange={(e) => setOwe(e.target.value as 'receive' | 'pay')}>
              <option value="receive">They owe me</option><option value="pay">I owe them</option>
            </select>
          </Field>
        </div>
        <button className="btn-primary w-full" disabled={!f.name.trim()} onClick={save}>Save</button>
      </div>
    </Sheet>
  );
}

/** Choose a customer/supplier for a bill (search, add new, or cash sale). */
export function PartyPickerSheet({ open, onClose, side, allowCash, onPick }: {
  open: boolean; onClose: () => void; side: 'sales' | 'purchase'; allowCash?: boolean; onPick: (p: Party | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const parties = useParties(side === 'sales' ? 'customer' : 'supplier', search);
  return (
    <>
      <Sheet open={open && !adding} onClose={onClose} title={side === 'sales' ? 'Choose customer' : 'Choose supplier'}>
        <div className="space-y-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Name, phone or GSTIN" />
          <List>
            {allowCash && <Row onClick={() => { onPick(null); onClose(); }}><StoreIcon size={18} className="text-primary" /><span className="flex-1 font-medium">Cash sale (walk-in)</span></Row>}
            <Row onClick={() => setAdding(true)}><UserPlus size={18} className="text-primary" /><span className="flex-1 font-medium text-primary">Add new {side === 'sales' ? 'customer' : 'supplier'}</span></Row>
            {parties?.map((p) => (
              <Row key={p.id} onClick={() => { onPick(p); onClose(); }}>
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{p.name}</div><div className="truncate text-xs text-muted">{[p.phone, p.state].filter(Boolean).join(' · ')}</div></div>
                <BalanceText value={p.balance} small />
              </Row>
            ))}
          </List>
        </div>
      </Sheet>
      <PartyFormSheet open={adding} onClose={() => setAdding(false)} defaultType={side === 'sales' ? 'customer' : 'supplier'}
        onSaved={async (id) => { const { db } = await import('../data/db'); const p = await db.parties.get(id); if (p) { onPick(p); onClose(); } }} />
    </>
  );
}
