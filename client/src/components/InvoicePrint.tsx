import { useSession } from '../lib/session';
import { DOCS, type DocType } from '../lib/docTypes';
import { amount, fmtDate, inWords, qty } from '../lib/format';

export type PrintFormat = 'A4' | 'A5' | 'T2' | 'T3' | 'T4';
export const PRINT_FORMATS: { id: PrintFormat; label: string }[] = [
  { id: 'A4', label: 'A4' }, { id: 'A5', label: 'A5' },
  { id: 'T2', label: 'Thermal 2" (58mm)' }, { id: 'T3', label: 'Thermal 3" (80mm)' }, { id: 'T4', label: 'Thermal 4" (104mm)' },
];
const PAGE_CSS: Record<PrintFormat, string> = {
  A4: '@page { size: A4; margin: 10mm; }',
  A5: '@page { size: A5; margin: 7mm; }',
  T2: '@page { size: 58mm auto; margin: 2mm; }',
  T3: '@page { size: 80mm auto; margin: 3mm; }',
  T4: '@page { size: 104mm auto; margin: 3mm; }',
};
const THERMAL_WIDTH: Record<string, string> = { T2: '54mm', T3: '74mm', T4: '98mm' };

export function InvoicePrint({ doc, format, copy }: { doc: any; format: PrintFormat; copy?: string }) {
  const meta = DOCS[doc.type as DocType];
  const title = meta.printTitle(!!doc.is_gst);
  return (
    <>
      <style>{PAGE_CSS[format]}</style>
      {format.startsWith('T')
        ? <Thermal doc={doc} title={title} width={THERMAL_WIDTH[format]} small={format === 'T2'} />
        : <Paper doc={doc} title={title} copy={copy} a5={format === 'A5'} />}
    </>
  );
}

function Paper({ doc, title, copy, a5 }: { doc: any; title: string; copy?: string; a5: boolean }) {
  const { settings: s } = useSession();
  const color = s.theme_color || '#2563eb';
  const meta = DOCS[doc.type as DocType];
  const intra = doc.igst === 0;
  const showGst = !!doc.is_gst;
  const showPrice = doc.type !== 'delivery_challan' || doc.total > 0;
  const taxRows = groupTax(doc.lines);
  const txt = a5 ? 'text-[10px]' : 'text-xs';

  return (
    <div className={`mx-auto bg-white text-slate-900 ${a5 ? 'max-w-[148mm]' : 'max-w-[210mm]'} ${txt}`}>
      <div className="flex items-start justify-between gap-3 border-b-2 pb-2" style={{ borderColor: color }}>
        <div className="flex items-start gap-3">
          {s.logo && <img src={s.logo} alt="" className={a5 ? 'h-10 w-10 object-contain' : 'h-16 w-16 object-contain'} />}
          <div>
            <div className={`${a5 ? 'text-base' : 'text-2xl'} font-bold leading-tight`} style={{ color }}>{s.business_name}</div>
            {s.business_address && <div className="whitespace-pre-line text-slate-600">{s.business_address}</div>}
            <div className="text-slate-600">{[s.business_phone && `Ph: ${s.business_phone}`, s.business_email].filter(Boolean).join(' · ')}</div>
            {s.business_gstin && <div className="font-semibold">GSTIN: {s.business_gstin}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className={`${a5 ? 'text-sm' : 'text-lg'} font-bold tracking-wider`} style={{ color }}>{title}</div>
          {copy && <div className="text-[10px] uppercase text-slate-500">{copy}</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-slate-300 py-2">
        <div>
          <div className="font-semibold uppercase text-slate-500">{meta.side === 'purchase' ? 'Supplier' : 'Bill to'}</div>
          <div className={`${a5 ? 'text-xs' : 'text-sm'} font-semibold`}>{doc.party_name}</div>
          {doc.party_address && <div>{doc.party_address}</div>}
          {doc.party_phone && <div>Ph: {doc.party_phone}</div>}
          {doc.party_gstin && <div className="font-medium">GSTIN: {doc.party_gstin}</div>}
          {showGst && doc.place_of_supply && <div>Place of supply: {doc.place_of_supply}</div>}
        </div>
        <div className="space-y-0.5 text-right">
          <div><span className="text-slate-500">{meta.label} No: </span><b>{doc.number}</b></div>
          <div><span className="text-slate-500">Date: </span><b>{fmtDate(doc.date)}</b></div>
          {doc.due_date && <div><span className="text-slate-500">{doc.type === 'quotation' ? 'Valid till' : 'Due date'}: </span>{fmtDate(doc.due_date)}</div>}
          {doc.source_number && <div><span className="text-slate-500">Ref: </span>{doc.source_number}</div>}
          {doc.transport && <div><span className="text-slate-500">Transport: </span>{doc.transport}</div>}
          {doc.vehicle_no && <div><span className="text-slate-500">Vehicle: </span>{doc.vehicle_no}</div>}
        </div>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-white" style={{ background: color }}>
            <th className="p-1.5">#</th><th className="p-1.5">Item</th>{showGst && <th className="p-1.5">HSN</th>}
            <th className="p-1.5 text-right">Qty</th>
            {showPrice && <th className="p-1.5 text-right">Rate</th>}
            {showPrice && doc.lines.some((l: any) => l.discount_pct) && <th className="p-1.5 text-right">Disc</th>}
            {showGst && showPrice && <th className="p-1.5 text-right">GST</th>}
            {showPrice && <th className="p-1.5 text-right">Amount</th>}
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l: any, i: number) => (
            <tr key={l.id} className="border-b border-slate-200 align-top">
              <td className="p-1.5">{i + 1}</td>
              <td className="p-1.5 font-medium">{l.description}</td>
              {showGst && <td className="p-1.5">{l.hsn}</td>}
              <td className="p-1.5 text-right">{qty(l.qty)} {l.unit}</td>
              {showPrice && <td className="p-1.5 text-right">{amount(l.rate)}</td>}
              {showPrice && doc.lines.some((x: any) => x.discount_pct) && <td className="p-1.5 text-right">{l.discount_pct ? `${l.discount_pct}%` : ''}</td>}
              {showGst && showPrice && <td className="p-1.5 text-right">{l.gst_rate}%</td>}
              {showPrice && <td className="p-1.5 text-right">{amount(l.amount)}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-b-2 border-slate-300 font-semibold">
            <td className="p-1.5" colSpan={showGst ? 3 : 2}>Total</td>
            <td className="p-1.5 text-right">{qty(doc.lines.reduce((s: number, l: any) => s + l.qty, 0))}</td>
            {showPrice && <td colSpan={1 + (doc.lines.some((l: any) => l.discount_pct) ? 1 : 0) + (showGst ? 1 : 0)} />}
            {showPrice && <td className="p-1.5 text-right">{amount(doc.lines.reduce((s: number, l: any) => s + l.amount, 0))}</td>}
          </tr>
        </tfoot>
      </table>

      {showPrice && (
        <div className="mt-2 grid grid-cols-5 gap-4">
          <div className="col-span-3 space-y-2">
            {showGst && taxRows.length > 0 && (
              <table className="w-full border-collapse text-[10px]">
                <thead><tr className="border-b border-slate-300 bg-slate-50 text-left">
                  <th className="p-1">GST %</th><th className="p-1 text-right">Taxable</th>
                  {intra ? <><th className="p-1 text-right">CGST</th><th className="p-1 text-right">SGST</th></> : <th className="p-1 text-right">IGST</th>}
                </tr></thead>
                <tbody>{taxRows.map((r) => (
                  <tr key={r.rate} className="border-b border-slate-100"><td className="p-1">{r.rate}%</td><td className="p-1 text-right">{amount(r.taxable)}</td>
                    {intra ? <><td className="p-1 text-right">{amount(r.cgst)}</td><td className="p-1 text-right">{amount(r.sgst)}</td></> : <td className="p-1 text-right">{amount(r.igst)}</td>}</tr>
                ))}</tbody>
              </table>
            )}
            <div><span className="text-slate-500">Amount in words: </span><b>{inWords(doc.total)}</b></div>
            {s.bank_details && (doc.type === 'sales_invoice' || doc.type === 'quotation') && <div className="whitespace-pre-line"><span className="font-semibold">Bank details: </span>{s.bank_details}</div>}
          </div>
          <div className="col-span-2 space-y-0.5">
            <TRow l="Taxable value" v={doc.subtotal} />
            {doc.discount > 0 && <TRow l="Discount" v={-doc.discount} />}
            {showGst && (intra ? <><TRow l="CGST" v={doc.cgst} /><TRow l="SGST" v={doc.sgst} /></> : <TRow l="IGST" v={doc.igst} />)}
            {doc.other_charges !== 0 && <TRow l="Other charges" v={doc.other_charges} />}
            {doc.round_off !== 0 && <TRow l="Round off" v={doc.round_off} />}
            <div className={`flex justify-between border-t-2 border-slate-800 pt-1 ${a5 ? 'text-xs' : 'text-sm'} font-bold`}><span>Grand Total</span><span>₹{amount(doc.total)}</span></div>
            {(doc.type === 'sales_invoice' || doc.type === 'purchase_invoice') && doc.paid > 0 && <><TRow l="Paid" v={doc.paid} /><TRow l="Balance due" v={doc.balance} bold /></>}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-4 border-t border-slate-300 pt-2">
        <div>
          {doc.notes && <div className="mb-1"><span className="font-semibold">Notes: </span>{doc.notes}</div>}
          {doc.terms && <div className="whitespace-pre-line text-slate-600"><span className="font-semibold text-slate-800">Terms: </span>{doc.terms}</div>}
        </div>
        <div className="text-right">
          <div className="font-semibold">For {s.business_name}</div>
          <div className={a5 ? 'h-8' : 'h-14'} />
          <div className="text-slate-600">Authorised signatory</div>
        </div>
      </div>
      {doc.status === 'cancelled' && <div className="mt-2 text-center text-lg font-bold text-red-600">CANCELLED</div>}
    </div>
  );
}

function TRow({ l, v, bold }: { l: string; v: number; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? 'font-semibold' : ''}`}><span className="text-slate-600">{l}</span><span>{v < 0 ? '−' : ''}{amount(Math.abs(v))}</span></div>;
}

function groupTax(lines: any[]) {
  const m = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const l of lines) {
    const r = m.get(l.gst_rate) ?? { rate: l.gst_rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    r.taxable += l.taxable; r.cgst += l.cgst; r.sgst += l.sgst; r.igst += l.igst;
    m.set(l.gst_rate, r);
  }
  return [...m.values()].filter((r) => r.rate > 0).sort((a, b) => a.rate - b.rate);
}

function Thermal({ doc, title, width, small }: { doc: any; title: string; width: string; small: boolean }) {
  const { settings: s } = useSession();
  const tax = doc.cgst + doc.sgst + doc.igst;
  return (
    <div className={`mx-auto bg-white font-mono text-black ${small ? 'text-[9px]' : 'text-[11px]'}`} style={{ width }}>
      <div className="text-center">
        <div className={`${small ? 'text-[11px]' : 'text-sm'} font-bold`}>{s.business_name}</div>
        {s.business_address && <div className="whitespace-pre-line">{s.business_address}</div>}
        {s.business_phone && <div>Ph: {s.business_phone}</div>}
        {s.business_gstin && <div>GSTIN: {s.business_gstin}</div>}
        <div className="my-1 border-y border-dashed border-black py-0.5 font-bold">{title}</div>
      </div>
      <div className="flex justify-between"><span>No: {doc.number}</span><span>{fmtDate(doc.date)}</span></div>
      <div>To: {doc.party_name}</div>
      {doc.party_gstin && <div>GSTIN: {doc.party_gstin}</div>}
      <div className="my-1 border-t border-dashed border-black" />
      <div className="flex font-bold"><span className="flex-1">Item</span><span className="w-[22%] text-right">Qty</span><span className="w-[28%] text-right">Amt</span></div>
      {doc.lines.map((l: any) => (
        <div key={l.id} className="py-0.5">
          <div>{l.description}</div>
          <div className="flex"><span className="flex-1 text-[0.9em]">@{amount(l.rate)}{doc.is_gst ? ` +${l.gst_rate}%` : ''}</span><span className="w-[22%] text-right">{qty(l.qty)}</span><span className="w-[28%] text-right">{amount(l.amount)}</span></div>
        </div>
      ))}
      <div className="my-1 border-t border-dashed border-black" />
      <div className="flex justify-between"><span>Subtotal</span><span>{amount(doc.subtotal)}</span></div>
      {doc.is_gst ? <div className="flex justify-between"><span>GST</span><span>{amount(tax)}</span></div> : null}
      {doc.other_charges ? <div className="flex justify-between"><span>Other</span><span>{amount(doc.other_charges)}</span></div> : null}
      {doc.round_off ? <div className="flex justify-between"><span>Round off</span><span>{amount(doc.round_off)}</span></div> : null}
      <div className={`flex justify-between border-t border-dashed border-black pt-0.5 font-bold ${small ? 'text-[11px]' : 'text-sm'}`}><span>TOTAL</span><span>₹{amount(doc.total)}</span></div>
      {doc.paid > 0 && doc.party_id && <div className="flex justify-between"><span>Balance</span><span>{amount(doc.balance)}</span></div>}
      <div className="mt-2 text-center">Thank you! Visit again.</div>
    </div>
  );
}
