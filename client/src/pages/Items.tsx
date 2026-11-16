import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Plus, Tags, Pencil, Upload, Trash2 } from 'lucide-react';
import { api, qs } from '../lib/api';
import { money, qty, GST_RATES } from '../lib/format';
import { useSave, useSession } from '../lib/session';
import { DataTable, Field, Modal, PageHeader, Stat, Badge, confirmAction } from '../components/ui';
import { ItemForm } from '../components/ItemForm';

export default function Items() {
  const nav = useNavigate();
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const store = params.get('store') ?? '';
  const category = params.get('category') ?? '';
  const low = params.get('low') === '1';
  const [adding, setAdding] = useState(false);
  const [cats, setCats] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const stores = useQuery({ queryKey: ['stores'], queryFn: () => api.get('/stores') });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories') });
  const items = useQuery({ queryKey: ['items', store, category, low], queryFn: () => api.get(`/items${qs({ store_id: store, category_id: category, low: low ? 1 : '' })}`) });

  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const rows = items.data ?? [];
  const totalValue = rows.reduce((s: number, r: any) => s + (r.stock > 0 ? r.stock_value : 0), 0);
  const lowCount = rows.filter((r: any) => r.low_stock_qty > 0 && r.stock <= r.low_stock_qty).length;

  return (
    <div>
      <PageHeader title="Items" subtitle="All products with live stock"
        actions={<>
          <Link to="/import" className="btn-secondary"><Upload size={16} /> Import Excel</Link>
          <button className="btn-secondary" onClick={() => setCats(true)}><Tags size={16} /> Categories</button>
          <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add item</button>
        </>} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Items" value={rows.length} />
        <Stat label="Stock value (at cost)" value={money(totalValue)} />
        <Stat label="Low stock" value={lowCount} tone={lowCount ? 'amber' : 'default'} onClick={() => setParam('low', low ? '' : '1')} />
      </div>

      <DataTable
        rows={rows} loading={items.isLoading} exportName="items" onRowClick={(r) => nav(`/items/${r.id}`)}
        selectable={can('delete')} selected={selected} onSelect={setSelected}
        empty={<span>No items. <button className="text-brand underline" onClick={() => setAdding(true)}>Add your first item</button></span>}
        toolbar={<>
          <select className="input w-auto py-1" value={store} onChange={(e) => setParam('store', e.target.value)} aria-label="Store">
            <option value="">All stores</option>
            {stores.data?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input w-auto py-1" value={category} onChange={(e) => setParam('category', e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={low} onChange={(e) => setParam('low', e.target.checked ? '1' : '')} /> Low stock only</label>
          {selected.size > 0 && <button className="btn-secondary py-1" onClick={() => setBulk(true)}><Pencil size={14} /> Bulk edit ({selected.size})</button>}
        </>}
        columns={[
          { key: 'name', label: 'Item', render: (r) => <div><div className="font-medium text-slate-900">{r.name}</div><div className="text-xs text-slate-500">{[r.sku, r.category_name].filter(Boolean).join(' · ')}</div></div> },
          { key: 'hsn', label: 'HSN' },
          { key: 'gst_rate', label: 'GST', num: true, render: (r) => `${r.gst_rate}%` },
          { key: 'purchase_price', label: 'Purchase', num: true, render: (r) => money(r.purchase_price) },
          { key: 'sale_price', label: 'Sale', num: true, render: (r) => money(r.sale_price) },
          {
            key: 'stock', label: 'Stock', num: true,
            render: (r) => {
              const isLow = r.low_stock_qty > 0 && r.stock <= r.low_stock_qty;
              return <span className={r.stock < 0 ? 'font-medium text-red-600' : isLow ? 'font-medium text-amber-600' : 'font-medium'}>{qty(r.stock)} <span className="text-xs font-normal text-slate-500">{r.unit}</span>{isLow && <> <Badge tone="amber">Low</Badge></>}</span>;
            },
          },
          { key: 'stock_value', label: 'Value', num: true, total: true, render: (r) => money(r.stock_value) },
        ]}
      />

      {adding && <ItemForm open onClose={() => setAdding(false)} />}
      {cats && <CategoriesModal onClose={() => setCats(false)} />}
      {bulk && <BulkEdit ids={[...selected]} onClose={() => { setBulk(false); setSelected(new Set()); }} />}
    </div>
  );
}

function CategoriesModal({ onClose }: { onClose: () => void }) {
  const { can } = useSession();
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories') });
  const [name, setName] = useState('');
  const add = useSave(() => api.post('/categories', { name }), { onDone: () => setName('') });
  const rename = useSave((c: any) => api.put(`/categories/${c.id}`, { name: c.name }), { success: 'Renamed' });
  const del = useSave((id: number) => api.del(`/categories/${id}`), { success: 'Deleted' });
  return (
    <Modal open onClose={onClose} title="Categories">
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(undefined); }}>
        <input className="input" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary">Add</button>
      </form>
      <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
        {cats.data?.map((c: any) => (
          <div key={c.id} className="flex items-center justify-between py-2 text-sm">
            <span>{c.name} <span className="text-xs text-slate-400">({c.item_count} items)</span></span>
            <div className="flex gap-1">
              <button className="btn-ghost p-1" aria-label="Rename" onClick={() => { const n = window.prompt('Rename category', c.name); if (n) rename.mutate({ id: c.id, name: n }); }}><Pencil size={14} /></button>
              {can('delete') && <button className="btn-ghost p-1 text-red-600" aria-label="Delete" onClick={() => confirmAction(`Delete category "${c.name}"? Items stay, without a category.`) && del.mutate(c.id)}><Trash2 size={14} /></button>}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function BulkEdit({ ids, onClose }: { ids: number[]; onClose: () => void }) {
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories') });
  const [f, setF] = useState<any>({});
  const save = useSave(() => {
    const changes: any = {};
    for (const [k, v] of Object.entries(f)) if (v !== '' && v !== undefined) changes[k] = k === 'active' ? v === '1' : ['category_id', 'gst_rate', 'low_stock_qty', 'sale_price_pct', 'purchase_price_pct'].includes(k) ? Number(v) : v;
    return api.post('/items/bulk', { ids, changes });
  }, { success: `${ids.length} items updated`, onDone: onClose });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={`Bulk edit ${ids.length} items`}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => save.mutate(undefined)}>Apply</button></>}>
      <p className="mb-3 text-sm text-slate-500">Leave a field empty to keep it unchanged.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category"><select className="input" value={f.category_id ?? ''} onChange={set('category_id')}><option value="">—</option>{cats.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="GST %"><select className="input" value={f.gst_rate ?? ''} onChange={set('gst_rate')}><option value="">—</option>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></Field>
        <Field label="Unit"><input className="input" value={f.unit ?? ''} onChange={set('unit')} /></Field>
        <Field label="HSN"><input className="input" value={f.hsn ?? ''} onChange={set('hsn')} /></Field>
        <Field label="Low stock alert at"><input className="input" type="number" value={f.low_stock_qty ?? ''} onChange={set('low_stock_qty')} /></Field>
        <Field label="Status"><select className="input" value={f.active ?? ''} onChange={set('active')}><option value="">—</option><option value="1">Active</option><option value="0">Inactive</option></select></Field>
        <Field label="Change sale price by %"><input className="input" type="number" placeholder="e.g. 5 or -10" value={f.sale_price_pct ?? ''} onChange={set('sale_price_pct')} /></Field>
        <Field label="Change purchase price by %"><input className="input" type="number" value={f.purchase_price_pct ?? ''} onChange={set('purchase_price_pct')} /></Field>
      </div>
    </Modal>
  );
}
