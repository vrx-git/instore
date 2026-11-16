import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Pencil, Trash2, Barcode, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { money, qty, fmtDate } from '../lib/format';
import { useSave, useSession } from '../lib/session';
import { DataTable, Loading, PageHeader, Stat, confirmAction } from '../components/ui';
import { ItemForm } from '../components/ItemForm';

const MOVE_LABEL: Record<string, string> = {
  opening: 'Opening stock', in: 'Stock in', out: 'Stock out', transfer_in: 'Transfer in', transfer_out: 'Transfer out',
  sale: 'Sale', purchase: 'Purchase', sale_return: 'Sales return', purchase_return: 'Purchase return', challan: 'Delivery challan',
};

export default function ItemDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useSession();
  const [editing, setEditing] = useState(false);
  const { data: item } = useQuery({ queryKey: ['item', id], queryFn: () => api.get(`/items/${id}`) });
  const del = useSave(() => api.del(`/items/${id}`), { success: 'Item removed', onDone: () => nav('/items') });
  if (!item) return <Loading />;

  return (
    <div className="space-y-4">
      <PageHeader title={item.name} subtitle={<Link to="/items" className="inline-flex items-center gap-1 hover:text-brand"><ArrowLeft size={14} /> All items</Link>}
        actions={<>
          <Link to={`/barcodes?item=${item.id}`} className="btn-secondary"><Barcode size={16} /> Labels</Link>
          <button className="btn-secondary" onClick={() => setEditing(true)}><Pencil size={16} /> Edit</button>
          {can('delete') && <button className="btn-secondary text-red-600" onClick={() => confirmAction('Delete this item? If it is used in bills it will be marked inactive instead.') && del.mutate(undefined)}><Trash2 size={16} /></button>}
        </>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total stock" value={`${qty(item.stock)} ${item.unit}`} tone={item.stock <= item.low_stock_qty ? 'amber' : 'default'} sub={item.low_stock_qty ? `alert at ${qty(item.low_stock_qty)}` : undefined} />
        <Stat label="Stock value" value={money(item.stock * item.purchase_price)} />
        <Stat label="Purchase price" value={money(item.purchase_price)} />
        <Stat label="Sale price" value={money(item.sale_price)} sub={item.mrp ? `MRP ${money(item.mrp)}` : undefined} />
        <Stat label="GST / HSN" value={`${item.gst_rate}%`} sub={item.hsn || 'No HSN'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card">
          <h2 className="border-b border-slate-200 px-4 py-3 font-semibold">Stock by store</h2>
          <table className="table"><tbody>
            {item.stores.map((s: any) => <tr key={s.id}><td>{s.name}</td><td className="num font-medium">{qty(s.stock)} {item.unit}</td></tr>)}
          </tbody></table>
          <div className="space-y-1 p-4 text-sm text-slate-600">
            {item.sku && <div>Code: <b>{item.sku}</b></div>}
            {item.barcode && <div>Barcode: <b>{item.barcode}</b></div>}
            {item.category_name && <div>Category: <b>{item.category_name}</b></div>}
            {item.description && <div>{item.description}</div>}
          </div>
        </div>
        <div className="lg:col-span-2">
          <h2 className="mb-2 font-semibold">Stock movement</h2>
          <DataTable rows={item.moves} exportName={`${item.name}-movement`}
            onRowClick={(m) => m.doc_id ? nav(`/doc/${m.doc_id}`) : m.entry_id && nav(`/stock/${m.entry_id}`)}
            columns={[
              { key: 'date', label: 'Date', render: (m) => fmtDate(m.date) },
              { key: 'type', label: 'Type', value: (m) => MOVE_LABEL[m.type] },
              { key: 'ref', label: 'Ref', value: (m) => m.note || m.entry_number, render: (m) => <span>{m.note || m.entry_number}{m.party_name ? <span className="text-slate-500"> · {m.party_name}</span> : null}</span> },
              { key: 'store_name', label: 'Store' },
              { key: 'in', label: 'In', num: true, value: (m) => (m.qty > 0 ? m.qty : ''), render: (m) => m.qty > 0 ? <span className="text-emerald-600">+{qty(m.qty)}</span> : '' },
              { key: 'out', label: 'Out', num: true, value: (m) => (m.qty < 0 ? -m.qty : ''), render: (m) => m.qty < 0 ? <span className="text-red-600">−{qty(-m.qty)}</span> : '' },
            ]} />
        </div>
      </div>
      {editing && <ItemForm open item={item} onClose={() => setEditing(false)} />}
    </div>
  );
}
