import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { GST_RATES, UNITS } from '../lib/format';
import { useSave } from '../lib/session';
import { Field, Modal } from './ui';

const blank = { name: '', sku: '', barcode: '', category_id: '', unit: 'PCS', hsn: '', gst_rate: 18, purchase_price: 0, sale_price: 0, mrp: 0, low_stock_qty: 0, description: '', opening_qty: 0, opening_store_id: '' };

export function ItemForm({ open, onClose, item, onSaved }: { open: boolean; onClose: () => void; item?: any; onSaved?: (id: number) => void }) {
  const [f, setF] = useState<any>(() => (item ? { ...blank, ...item, category_id: item.category_id ?? '' } : blank));
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories') });
  const stores = useQuery({ queryKey: ['stores'], queryFn: () => api.get('/stores') });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'number' ? e.target.valueAsNumber || 0 : e.target.value });

  const save = useSave(async () => {
    let category_id = f.category_id;
    if (category_id === '__new') {
      const name = window.prompt('New category name');
      if (!name) throw new Error('Category name is required');
      category_id = (await api.post('/categories', { name })).id;
    }
    const body = { ...f, category_id: category_id ? Number(category_id) : null, opening_store_id: f.opening_store_id ? Number(f.opening_store_id) : undefined };
    if (item?.id) { await api.put(`/items/${item.id}`, body); return item.id; }
    return (await api.post('/items', body)).id;
  }, { success: item?.id ? 'Item updated' : 'Item added', onDone: (id) => { onSaved?.(id); onClose(); } });

  const margin = f.sale_price && f.purchase_price ? (((f.sale_price - f.purchase_price) / f.purchase_price) * 100).toFixed(1) : null;

  return (
    <Modal open={open} onClose={onClose} title={item?.id ? 'Edit item' : 'Add item'} wide
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={save.isPending || !f.name} onClick={() => save.mutate(undefined)}>Save item</button></>}>
      <form className="grid grid-cols-2 gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
        <Field label="Item name *" className="col-span-2"><input className="input" autoFocus required value={f.name} onChange={set('name')} /></Field>
        <Field label="Item code / SKU"><input className="input" value={f.sku ?? ''} onChange={set('sku')} /></Field>
        <Field label="Barcode"><input className="input" value={f.barcode ?? ''} onChange={set('barcode')} placeholder="Scan or type" /></Field>
        <Field label="Category">
          <select className="input" value={f.category_id} onChange={set('category_id')}>
            <option value="">— None —</option>
            {cats.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new">+ New category…</option>
          </select>
        </Field>
        <Field label="Unit">
          <input className="input" list="units" value={f.unit} onChange={set('unit')} />
          <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        </Field>
        <Field label="HSN / SAC"><input className="input" value={f.hsn ?? ''} onChange={set('hsn')} /></Field>
        <Field label="GST %">
          <select className="input" value={f.gst_rate} onChange={(e) => setF({ ...f, gst_rate: Number(e.target.value) })}>
            {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
          </select>
        </Field>
        <Field label="Purchase price"><input className="input" type="number" step="0.01" min="0" value={f.purchase_price} onChange={set('purchase_price')} /></Field>
        <Field label={`Sale price${margin ? ` (${margin}% margin)` : ''}`}><input className="input" type="number" step="0.01" min="0" value={f.sale_price} onChange={set('sale_price')} /></Field>
        <Field label="MRP"><input className="input" type="number" step="0.01" min="0" value={f.mrp} onChange={set('mrp')} /></Field>
        <Field label="Low stock alert at"><input className="input" type="number" step="any" min="0" value={f.low_stock_qty} onChange={set('low_stock_qty')} /></Field>
        {!item?.id && (
          <>
            <Field label="Opening stock"><input className="input" type="number" step="any" min="0" value={f.opening_qty} onChange={set('opening_qty')} /></Field>
            <Field label="In store">
              <select className="input" value={f.opening_store_id} onChange={set('opening_store_id')}>
                {stores.data?.filter((s: any) => s.active).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label="Description" className="col-span-2 sm:col-span-4"><input className="input" value={f.description ?? ''} onChange={set('description')} /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
