import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Printer, Trash2, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDate, qty, money } from '../lib/format';
import { useSave, useSession } from '../lib/session';
import { Loading, PageHeader, confirmAction } from '../components/ui';
import { PrintHeader } from '../components/PrintHeader';
import { ENTRY_TYPES } from './StockEntries';

export default function StockEntryView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useSession();
  const { data: e } = useQuery({ queryKey: ['stock-entry', id], queryFn: () => api.get(`/stock-entries/${id}`) });
  const del = useSave(() => api.del(`/stock-entries/${id}`), { success: 'Entry deleted, stock reversed', onDone: () => nav('/stock') });
  if (!e) return <Loading />;
  const t = ENTRY_TYPES[e.type as keyof typeof ENTRY_TYPES];
  const totalQty = e.lines.reduce((s: number, l: any) => s + l.qty, 0);
  const totalValue = e.lines.reduce((s: number, l: any) => s + l.qty * l.rate, 0);

  return (
    <div className="max-w-3xl">
      <PageHeader title={`${t.label} ${e.number}`} subtitle={<Link to="/stock" className="inline-flex items-center gap-1 hover:text-brand"><ArrowLeft size={14} /> Stock entries</Link>}
        actions={<>
          <button className="btn-primary" onClick={() => window.print()}><Printer size={16} /> Print receipt</button>
          {can('delete') && <button className="btn-secondary text-red-600" onClick={() => confirmAction('Delete this entry? The stock change will be reversed.') && del.mutate(undefined)}><Trash2 size={16} /></button>}
        </>} />
      <div className="card print-area bg-white p-6">
        <style>{'@page { size: A4; margin: 12mm; }'}</style>
        <PrintHeader title={t.receipt} />
        <div className="my-4 grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-slate-500">No:</span> <b>{e.number}</b></div>
          <div className="text-right"><span className="text-slate-500">Date:</span> <b>{fmtDate(e.date)}</b></div>
          <div><span className="text-slate-500">{e.type === 'transfer' ? 'From:' : 'Store:'}</span> <b>{e.store_name}</b></div>
          {e.to_store_name && <div className="text-right"><span className="text-slate-500">To:</span> <b>{e.to_store_name}</b></div>}
          {e.person && <div><span className="text-slate-500">{e.type === 'out' ? 'Issued to:' : 'Person:'}</span> <b>{e.person}</b></div>}
        </div>
        <table className="w-full border-collapse text-sm">
          <thead><tr className="border-y border-slate-300 bg-slate-50 text-left">
            <th className="p-2">#</th><th className="p-2">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Value</th>
          </tr></thead>
          <tbody>
            {e.lines.map((l: any, i: number) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="p-2">{i + 1}</td><td className="p-2">{l.item_name}</td>
                <td className="p-2 text-right">{qty(l.qty)} {l.unit}</td><td className="p-2 text-right">{money(l.rate)}</td><td className="p-2 text-right">{money(l.qty * l.rate)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-semibold"><td className="p-2" colSpan={2}>Total</td><td className="p-2 text-right">{qty(totalQty)}</td><td /><td className="p-2 text-right">{money(totalValue)}</td></tr></tfoot>
        </table>
        {e.note && <p className="mt-3 text-sm"><span className="text-slate-500">Note:</span> {e.note}</p>}
        <div className="mt-16 grid grid-cols-2 text-center text-xs text-slate-600">
          <div><div className="mx-auto w-40 border-t border-slate-400 pt-1">{e.type === 'out' ? 'Received by' : 'Delivered by'}</div></div>
          <div><div className="mx-auto w-40 border-t border-slate-400 pt-1">Authorised signatory</div></div>
        </div>
      </div>
    </div>
  );
}
