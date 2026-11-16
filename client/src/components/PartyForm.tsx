import { useState } from 'react';
import { api } from '../lib/api';
import { INDIAN_STATES } from '../lib/format';
import { useSave, useSession } from '../lib/session';
import { Field, Modal } from './ui';

export function PartyForm({ party, defaultType = 'customer', onClose, onSaved }: { party?: any; defaultType?: string; onClose: () => void; onSaved?: (id: number) => void }) {
  const { settings } = useSession();
  const [f, setF] = useState<any>(party ?? { name: '', type: defaultType, phone: '', email: '', gstin: '', state: settings.business_state || '', address: '', opening_balance: 0 });
  const [owe, setOwe] = useState<'receive' | 'pay'>((party?.opening_balance ?? 0) < 0 ? 'pay' : defaultType === 'supplier' ? 'pay' : 'receive');
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  const save = useSave(async () => {
    const amt = Math.abs(Number(f.opening_balance) || 0);
    const body = { ...f, opening_balance: owe === 'pay' ? -amt : amt };
    if (party?.id) { await api.put(`/parties/${party.id}`, body); return party.id; }
    return (await api.post('/parties', body)).id;
  }, { success: 'Party saved', onDone: (id) => { onSaved?.(id); onClose(); } });

  // GSTIN's first two digits are the state code — fill state automatically.
  const onGstin = (v: string) => {
    const code = parseInt(v.slice(0, 2), 10);
    const codes: Record<number, string> = { 1: 'Jammu and Kashmir', 2: 'Himachal Pradesh', 3: 'Punjab', 4: 'Chandigarh', 5: 'Uttarakhand', 6: 'Haryana', 7: 'Delhi', 8: 'Rajasthan', 9: 'Uttar Pradesh', 10: 'Bihar', 11: 'Sikkim', 12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur', 15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya', 18: 'Assam', 19: 'West Bengal', 20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat', 26: 'Dadra and Nagar Haveli and Daman and Diu', 27: 'Maharashtra', 29: 'Karnataka', 30: 'Goa', 31: 'Lakshadweep', 32: 'Kerala', 33: 'Tamil Nadu', 34: 'Puducherry', 35: 'Andaman and Nicobar Islands', 36: 'Telangana', 37: 'Andhra Pradesh', 38: 'Ladakh' };
    setF({ ...f, gstin: v.toUpperCase(), state: codes[code] ?? f.state });
  };

  return (
    <Modal open onClose={onClose} title={party?.id ? 'Edit party' : 'Add party'} wide
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!f.name || save.isPending} onClick={() => save.mutate(undefined)}>Save</button></>}>
      <form className="grid grid-cols-2 gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
        <Field label="Party name *" className="col-span-2"><input className="input" autoFocus value={f.name} onChange={set('name')} /></Field>
        <Field label="Type">
          <select className="input" value={f.type} onChange={set('type')}><option value="customer">Customer</option><option value="supplier">Supplier</option><option value="both">Both</option></select>
        </Field>
        <Field label="Phone"><input className="input" value={f.phone ?? ''} onChange={set('phone')} /></Field>
        <Field label="Email"><input className="input" type="email" value={f.email ?? ''} onChange={set('email')} /></Field>
        <Field label="GSTIN"><input className="input uppercase" maxLength={15} value={f.gstin ?? ''} onChange={(e) => onGstin(e.target.value)} /></Field>
        <Field label="State">
          <select className="input" value={f.state ?? ''} onChange={set('state')}>
            <option value="">—</option>
            {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Address" className="col-span-2"><input className="input" value={f.address ?? ''} onChange={set('address')} /></Field>
        <Field label="Opening balance"><input className="input" type="number" step="0.01" min="0" value={Math.abs(f.opening_balance)} onChange={set('opening_balance')} /></Field>
        <Field label="Balance type" className="col-span-2">
          <div className="flex gap-4 pt-1 text-sm">
            <label className="flex items-center gap-1.5"><input type="radio" checked={owe === 'receive'} onChange={() => setOwe('receive')} /> I will receive (they owe me)</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={owe === 'pay'} onChange={() => setOwe('pay')} /> I will pay (I owe them)</label>
          </div>
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
