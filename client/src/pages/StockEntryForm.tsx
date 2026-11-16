import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { qty, today } from '../lib/format';
import { useSave } from '../lib/session';
import { Field, PageHeader } from '../components/ui';
import { ItemPicker } from '../components/ItemPicker';
import { ENTRY_TYPES } from './StockEntries';

type Line = { item_id: number; name: string; unit: string; stock: number; qty: number; rate: number };

export default function StockEntryForm() {
  const { type = 'in' } = useParams() as { type: keyof typeof ENTRY_TYPES };
  const nav = useNavigate();
  const stores = useQuery({ queryKey: ['stores'], queryFn: () => api.get('/stores') });
  const active = (stores.data ?? []).filter((s: any) => s.active);
  const [f, setF] = useState({ date: today(), store_id: '', to_store_id: '', person: '', note: '' });
  const [lines, setLines] = useState<Line[]>([]);
  const storeId = f.store_id || active[0]?.id;
  const toStore = f.to_store_id || active.find((s: any) => s.id !== Number(storeId))?.id;

  const save = useSave(() => api.post('/stock-entries', {
    type, ...f, store_id: Number(storeId), to_store_id: type === 'transfer' ? Number(toStore) : null,
    lines: lines.map((l) => ({ item_id: l.item_id, qty: l.qty, rate: l.rate })),
  }), { success: `${ENTRY_TYPES[type].label} saved`, onDone: (r) => nav(`/stock/${r.id}`, { replace: true }) });

  const add = (item: any) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.item_id === item.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { item_id: item.id, name: item.name, unit: item.unit, stock: item.stock ?? 0, qty: 1, rate: item.purchase_price }];
    });
  };
  const upd = (i: number, k: keyof Line, v: number) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const reduces = type === 'out' || type === 'transfer';

  return (
    <div className="max-w-4xl">
      <PageHeader title={`New ${ENTRY_TYPES[type].label}`} subtitle={type === 'transfer' ? 'Move stock from one store/godown to another' : type === 'out' ? 'Issue stock out (damage, own use, sent to site…)' : 'Receive stock into a store'} />
      <div className="card space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Date"><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={type === 'transfer' ? 'From store' : 'Store'}>
            <select className="input" value={storeId ?? ''} onChange={(e) => setF({ ...f, store_id: e.target.value })}>
              {active.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          {type === 'transfer' && (
            <Field label="To store">
              <select className="input" value={toStore ?? ''} onChange={(e) => setF({ ...f, to_store_id: e.target.value })}>
                {active.filter((s: any) => s.id !== Number(storeId)).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <Field label={type === 'out' ? 'Issued to' : type === 'in' ? 'Received from' : 'Person'}><input className="input" value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })} /></Field>
        </div>

        <ItemPicker storeId={storeId} onPick={add} priceField="purchase_price" />

        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>#</th><th>Item</th><th className="num">Available</th><th className="num w-32">Qty</th><th className="num w-32">Rate</th><th /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.item_id}>
                  <td className="text-slate-400">{i + 1}</td>
                  <td className="font-medium">{l.name}</td>
                  <td className={`num ${reduces && l.qty > l.stock ? 'text-red-600' : 'text-slate-500'}`}>{qty(l.stock)} {l.unit}</td>
                  <td><input type="number" min="0" step="any" className="input text-right" value={l.qty} onChange={(e) => upd(i, 'qty', e.target.valueAsNumber || 0)} aria-label="Quantity" /></td>
                  <td><input type="number" min="0" step="0.01" className="input text-right" value={l.rate} onChange={(e) => upd(i, 'rate', e.target.valueAsNumber || 0)} aria-label="Rate" /></td>
                  <td><button className="btn-ghost p-1 text-red-600" aria-label="Remove" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 size={15} /></button></td>
                </tr>
              ))}
              {!lines.length && <tr><td colSpan={6} className="py-8 text-center text-slate-400">Search or scan items above to add them</td></tr>}
            </tbody>
          </table>
        </div>
        {reduces && lines.some((l) => l.qty > l.stock) && <p className="text-sm text-amber-600">Some quantities are more than the available stock — stock will go negative.</p>}

        <Field label="Note"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => nav(-1)}>Cancel</button>
          <button className="btn-primary" disabled={!lines.length || save.isPending} onClick={() => save.mutate(undefined)}>Save {ENTRY_TYPES[type].label}</button>
        </div>
      </div>
    </div>
  );
}
