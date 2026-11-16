import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import JsBarcode from 'jsbarcode';
import { Printer, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { useSession } from '../lib/session';
import { PageHeader, Field } from '../components/ui';
import { ItemPicker } from '../components/ItemPicker';

type Row = { item: any; count: number };
const SIZES = { small: { w: '38mm', h: '25mm', cols: 5 }, medium: { w: '50mm', h: '25mm', cols: 4 }, large: { w: '64mm', h: '34mm', cols: 3 } };

export default function BarcodeLabels() {
  const [params] = useSearchParams();
  const preset = params.get('item');
  const { settings } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [size, setSize] = useState<keyof typeof SIZES>('medium');
  const [show, setShow] = useState({ name: true, price: true, mrp: false, business: false });
  const pre = useQuery({ queryKey: ['item', preset], queryFn: () => api.get(`/items/${preset}`), enabled: !!preset });
  useEffect(() => { if (pre.data) setRows([{ item: pre.data, count: 12 }]); }, [pre.data]);

  const add = (item: any) => setRows((r) => (r.some((x) => x.item.id === item.id) ? r : [...r, { item, count: Math.max(1, Math.floor(item.stock) || 1) }]));
  const labels = rows.flatMap((r) => Array.from({ length: r.count }, () => r.item));
  const sz = SIZES[size];

  return (
    <div>
      <PageHeader title="Barcode Labels" subtitle="Print sticker labels for your items (items without a barcode use their code or ID)"
        actions={<button className="btn-primary" disabled={!labels.length} onClick={() => window.print()}><Printer size={16} /> Print {labels.length} labels</button>} />
      <div className="no-print mb-4 grid gap-4 lg:grid-cols-3">
        <div className="card space-y-3 p-4 lg:col-span-2">
          <ItemPicker onPick={add} />
          <table className="table">
            <thead><tr><th>Item</th><th>Code</th><th className="num w-28">Labels</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.item.id}>
                  <td className="font-medium">{r.item.name}</td><td className="text-slate-500">{codeOf(r.item)}</td>
                  <td><input type="number" min="1" className="input text-right" value={r.count} aria-label="Label count" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, count: Math.max(1, e.target.valueAsNumber || 1) } : x)))} /></td>
                  <td><button className="btn-ghost p-1 text-red-600" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} className="py-6 text-center text-slate-400">Add items to print labels</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card space-y-3 p-4">
          <Field label="Label size">
            <select className="input" value={size} onChange={(e) => setSize(e.target.value as any)}>
              <option value="small">Small 38 × 25 mm</option><option value="medium">Medium 50 × 25 mm</option><option value="large">Large 64 × 34 mm</option>
            </select>
          </Field>
          {(['name', 'price', 'mrp', 'business'] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm capitalize"><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} /> Show {k === 'business' ? 'business name' : k}</label>
          ))}
        </div>
      </div>
      <style>{'@page { size: A4; margin: 8mm; }'}</style>
      <div className="print-area flex flex-wrap gap-[2mm] bg-white p-2">
        {labels.map((item, i) => (
          <div key={i} className="flex flex-col items-center justify-center overflow-hidden border border-dashed border-slate-300 px-1 text-center text-[8px] leading-tight print:border-slate-200" style={{ width: sz.w, height: sz.h }}>
            {show.business && <div className="w-full truncate font-semibold">{settings.business_name}</div>}
            {show.name && <div className="w-full truncate font-medium">{item.name}</div>}
            <Barcode value={codeOf(item)} height={size === 'large' ? 40 : 26} />
            <div className="flex gap-2">
              {show.price && <b className="text-[9px]">{money(item.sale_price)}</b>}
              {show.mrp && item.mrp > 0 && <span>MRP {money(item.mrp)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const codeOf = (item: any) => item.barcode || item.sku || `SR${String(item.id).padStart(6, '0')}`;

function Barcode({ value, height }: { value: string; height: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, { format: /^\d{13}$/.test(value) ? 'EAN13' : 'CODE128', height, width: 1.2, fontSize: 9, margin: 0, displayValue: true });
    } catch {
      JsBarcode(ref.current, value, { format: 'CODE128', height, width: 1.2, fontSize: 9, margin: 0 });
    }
  }, [value, height]);
  return <svg ref={ref} className="max-w-full" />;
}
