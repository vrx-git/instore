import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Warehouse, Store as StoreIcon, ArrowLeftRight } from 'lucide-react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { useSave, useSession } from '../lib/session';
import { Field, Modal, PageHeader, Badge, Loading, confirmAction } from '../components/ui';

export default function Stores() {
  const nav = useNavigate();
  const { can } = useSession();
  const { data } = useQuery({ queryKey: ['stores'], queryFn: () => api.get('/stores') });
  const [edit, setEdit] = useState<any>(null);
  const del = useSave((id: number) => api.del(`/stores/${id}`), { success: 'Store deleted' });

  return (
    <div>
      <PageHeader title="Stores & Godowns" subtitle="Each location keeps its own stock"
        actions={<>
          <button className="btn-secondary" onClick={() => nav('/stock/new/transfer')}><ArrowLeftRight size={16} /> Transfer stock</button>
          {can('masters') && <button className="btn-primary" onClick={() => setEdit({ name: '', kind: 'store', address: '' })}><Plus size={16} /> Add store</button>}
        </>} />
      {!data ? <Loading /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s: any) => (
            <div key={s.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-brand/10 p-2 text-brand">{s.kind === 'godown' ? <Warehouse size={18} /> : <StoreIcon size={18} />}</div>
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs capitalize text-slate-500">{s.kind}{!s.active && <> · <Badge tone="red">Inactive</Badge></>}</div>
                  </div>
                </div>
                {can('masters') && (
                  <div className="flex">
                    <button className="btn-ghost p-1" aria-label="Edit" onClick={() => setEdit(s)}><Pencil size={14} /></button>
                    <button className="btn-ghost p-1 text-red-600" aria-label="Delete" onClick={() => confirmAction(`Delete ${s.name}?`) && del.mutate(s.id)}><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
              {s.address && <p className="mt-2 text-sm text-slate-500">{s.address}</p>}
              <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-500">{s.item_count} items</span>
                <span className="font-medium">{money(s.stock_value)}</span>
              </div>
              <button className="mt-2 text-sm text-brand hover:underline" onClick={() => nav(`/items?store=${s.id}`)}>View stock →</button>
            </div>
          ))}
        </div>
      )}
      {edit && <StoreForm store={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function StoreForm({ store, onClose }: { store: any; onClose: () => void }) {
  const [f, setF] = useState({ name: store.name, kind: store.kind, address: store.address ?? '', active: store.active !== 0 });
  const save = useSave(() => (store.id ? api.put(`/stores/${store.id}`, f) : api.post('/stores', f)), { success: 'Saved', onDone: onClose });
  return (
    <Modal open onClose={onClose} title={store.id ? 'Edit store' : 'Add store'}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!f.name} onClick={() => save.mutate(undefined)}>Save</button></>}>
      <div className="space-y-3">
        <Field label="Name"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Type">
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="store">Store / Shop</option><option value="godown">Godown / Warehouse</option></select>
        </Field>
        <Field label="Address"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        {store.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>}
      </div>
    </Modal>
  );
}
