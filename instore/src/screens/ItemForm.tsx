import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { db } from '../data/db';
import { useCategories, useStores } from '../hooks/data';
import { useUserId } from '../hooks/session';
import { blankItem, createItem, updateItem, type ItemInput } from '../services/items';
import { GST_RATES, UNITS } from '../lib/format';
import { Field, Page, QtyInput, Sheet, useToast } from '../components/ui';
import { Scanner } from '../components/Scanner';

export default function ItemForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const userId = useUserId();
  const cats = useCategories();
  const stores = useStores();
  const editing = !!id;
  const [f, setF] = useState<ItemInput>(() => ({ ...blankItem(), barcode: params.get('barcode') ?? '' }));
  const [openQty, setOpenQty] = useState(0);
  const [openStore, setOpenStore] = useState<number | undefined>();
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    db.items.get(Number(id)).then((i) => { if (i) { const { id: _i, createdAt: _c, ...rest } = i; setF(rest); } });
  }, [id]);

  const set = <K extends keyof ItemInput>(k: K, v: ItemInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const num = (k: keyof ItemInput) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.valueAsNumber || 0) as any);

  const newCategory = async () => {
    const name = window.prompt('New category name')?.trim();
    if (!name) return;
    const existing = await db.categories.where('name').equals(name).first();
    set('categoryId', existing?.id ?? (await db.categories.add({ name })));
  };

  const save = async () => {
    setBusy(true);
    try {
      if (editing) { await updateItem(Number(id), f); toast('Item saved'); nav(-1); }
      else {
        const sid = openStore ?? stores?.[0]?.id;
        const newId = await createItem(f, sid && openQty > 0 ? { storeId: sid, qty: openQty, userId } : undefined);
        toast('Item added');
        nav(`/items/${newId}`, { replace: true });
      }
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const margin = f.purchasePrice > 0 && f.salePrice > 0 ? Math.round(((f.salePrice - f.purchasePrice) / f.purchasePrice) * 100) : null;

  return (
    <Page title={editing ? 'Edit item' : 'New item'} back large={false}
      action={<button className="tap px-1 font-semibold text-primary disabled:opacity-40" disabled={busy || !f.name.trim()} onClick={save}>Save</button>}>
      <form className="space-y-4 pt-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Item name *"><input className="field" autoFocus={!editing} value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU / code"><input className="field" autoCapitalize="characters" value={f.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
          <Field label="Barcode">
            <div className="relative">
              <input className="field pr-11" inputMode="numeric" value={f.barcode} onChange={(e) => set('barcode', e.target.value)} />
              <button type="button" className="absolute right-0 top-0 flex h-full w-11 items-center justify-center text-primary" onClick={() => setScan(true)} aria-label="Scan barcode"><ScanLine size={20} /></button>
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select className="field" value={f.categoryId ?? ''} onChange={(e) => (e.target.value === 'new' ? newCategory() : set('categoryId', e.target.value ? Number(e.target.value) : null))}>
              <option value="">None</option>
              {cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="new">+ New category…</option>
            </select>
          </Field>
          <Field label="Unit">
            <input className="field" list="units" value={f.unit} onChange={(e) => set('unit', e.target.value.toUpperCase())} />
            <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          </Field>
        </div>
        <Field label="Location / shelf"><input className="field" placeholder="e.g. Rack A1" value={f.location} onChange={(e) => set('location', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase price ₹"><input className="field" type="number" inputMode="decimal" min="0" step="0.01" value={f.purchasePrice || ''} onChange={num('purchasePrice')} /></Field>
          <Field label={`Sale price ₹${margin !== null ? ` · ${margin}%` : ''}`}><input className="field" type="number" inputMode="decimal" min="0" step="0.01" value={f.salePrice || ''} onChange={num('salePrice')} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="GST %">
            <select className="field" value={f.gstRate} onChange={(e) => set('gstRate', Number(e.target.value))}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select>
          </Field>
          <Field label="HSN"><input className="field" inputMode="numeric" value={f.hsn} onChange={(e) => set('hsn', e.target.value)} /></Field>
          <Field label="Low alert at"><input className="field" type="number" inputMode="decimal" min="0" value={f.lowStockQty || ''} onChange={num('lowStockQty')} /></Field>
        </div>
        {!editing && (
          <div className="card space-y-3 p-4">
            <div className="font-semibold">Opening stock</div>
            <QtyInput value={openQty} onChange={setOpenQty} label="Opening stock" />
            {(stores?.length ?? 0) > 1 && (
              <select className="field" value={openStore ?? stores?.[0]?.id} onChange={(e) => setOpenStore(Number(e.target.value))} aria-label="Opening stock store">
                {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        )}
        <button className="btn-primary w-full text-[17px]" disabled={busy || !f.name.trim()}>{editing ? 'Save changes' : 'Add item'}</button>
      </form>
      <Sheet open={scan} onClose={() => setScan(false)} title="Scan barcode">
        {scan && <Scanner onCode={(c) => { set('barcode', c); setScan(false); toast(`Scanned ${c}`); }} />}
      </Sheet>
    </Page>
  );
}
