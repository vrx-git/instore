/** Printable bill layouts (A4, A5, thermal). Ported from the PC app's client/src/components/InvoicePrint.tsx. */
import type { Doc, Party } from '../data/models';
import type { Business } from '../hooks/billing';
import { DOCS } from '../lib/docTypes';
import { amount2 as amount, fmtDate, inWords, qty } from '../lib/format';

export type PrintFormat = 'A4' | 'A5' | 'T2' | 'T3';
export const PRINT_FORMATS: { id: PrintFormat; label: string }[] = [
  { id: 'A4', label: 'A4' }, { id: 'A5', label: 'A5' }, { id: 'T2', label: '2″ thermal' }, { id: 'T3', label: '3″ thermal' },
];
const PAGE: Record<PrintFormat, string> = {
  A4: '@page { size: A4; margin: 10mm; }', A5: '@page { size: A5; margin: 7mm; }',
  T2: '@page { size: 58mm auto; margin: 2mm; }', T3: '@page { size: 80mm auto; margin: 3mm; }',
};
const GREEN = '#388E3C';

interface Props { doc: Doc; party: Party | null; biz: Business; paid: number; format: PrintFormat }

export function InvoicePrint(p: Props) {
  return (
    <>
      <style>{`${PAGE[p.format]} @media print { body * { visibility: hidden; } #bill-print, #bill-print * { visibility: visible; } #bill-print { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      <div id="bill-print">{p.format.startsWith('T') ? <Thermal {...p} /> : <Paper {...p} />}</div>
    </>
  );
}

function Paper({ doc, party, biz, paid, format }: Props) {
  const a5 = format === 'A5';
  const meta = DOCS[doc.type];
  const gst = !!doc.isGst;
  const intra = doc.igst === 0;
  const anyDisc = doc.lines.some((l) => l.discountPct);
  const taxRows = groupTax(doc);
  const isInv = doc.type === 'sales_invoice' || doc.type === 'purchase_invoice';
  return (
    <div className={`mx-auto bg-white text-[#263238] ${a5 ? 'text-[9px]' : 'text-[10px]'}`} style={{ maxWidth: a5 ? '148mm' : '210mm' }}>
      <div className="flex items-start justify-between gap-3 border-b-2 pb-2" style={{ borderColor: GREEN }}>
        <div className="flex items-start gap-2">
          {biz.logo && <img src={biz.logo} alt="" className="h-12 w-12 object-contain" />}
          <div>
            <div className={`${a5 ? 'text-sm' : 'text-lg'} font-bold leading-tight`} style={{ color: GREEN }}>{biz.business_name || 'My Shop'}</div>
            {biz.business_address && <div className="whitespace-pre-line">{biz.business_address}</div>}
            {biz.business_phone && <div>Ph: {biz.business_phone}</div>}
            {biz.business_gstin && <div className="font-semibold">GSTIN: {biz.business_gstin}</div>}
          </div>
        </div>
        <div className="text-right font-bold tracking-wider" style={{ color: GREEN }}>{meta.printTitle(gst)}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-[#C8E6C9] py-2">
        <div>
          <div className="font-semibold uppercase text-[#607D8B]">{meta.side === 'purchase' ? 'Supplier' : 'Bill to'}</div>
          <div className="text-[11px] font-semibold">{doc.partyName}</div>
          {party?.address && <div>{party.address}</div>}
          {party?.phone && <div>Ph: {party.phone}</div>}
          {party?.gstin && <div className="font-medium">GSTIN: {party.gstin}</div>}
          {gst && doc.placeOfSupply && <div>Place of supply: {doc.placeOfSupply}</div>}
        </div>
        <div className="text-right">
          <div>No: <b>{doc.number}</b></div>
          <div>Date: <b>{fmtDate(doc.date)}</b></div>
          {doc.dueDate && <div>{doc.type === 'quotation' ? 'Valid till' : 'Due'}: {fmtDate(doc.dueDate)}</div>}
          {doc.transport && <div>Transport: {doc.transport}</div>}
          {doc.vehicleNo && <div>Vehicle: {doc.vehicleNo}</div>}
        </div>
      </div>
      <table className="w-full border-collapse">
        <thead><tr className="text-left text-white" style={{ background: GREEN }}>
          <th className="p-1">#</th><th className="p-1">Item</th>{gst && <th className="p-1">HSN</th>}<th className="p-1 text-right">Qty</th>
          <th className="p-1 text-right">Rate</th>{anyDisc && <th className="p-1 text-right">Disc</th>}{gst && <th className="p-1 text-right">GST</th>}<th className="p-1 text-right">Amount</th>
        </tr></thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={i} className="border-b border-[#E8F5E9] align-top">
              <td className="p-1">{i + 1}</td><td className="p-1 font-medium">{l.description}</td>{gst && <td className="p-1">{l.hsn}</td>}
              <td className="p-1 text-right">{qty(l.qty)} {l.unit}</td><td className="p-1 text-right">{amount(l.rate)}</td>
              {anyDisc && <td className="p-1 text-right">{l.discountPct ? `${l.discountPct}%` : ''}</td>}
              {gst && <td className="p-1 text-right">{l.gstRate}%</td>}<td className="p-1 text-right">{amount(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 grid grid-cols-5 gap-3">
        <div className="col-span-3 space-y-1.5">
          {gst && taxRows.length > 0 && (
            <table className="w-full border-collapse text-[9px]">
              <thead><tr className="border-b border-[#C8E6C9] text-left"><th>GST</th><th className="text-right">Taxable</th>{intra ? <><th className="text-right">CGST</th><th className="text-right">SGST</th></> : <th className="text-right">IGST</th>}</tr></thead>
              <tbody>{taxRows.map((r) => <tr key={r.rate}><td>{r.rate}%</td><td className="text-right">{amount(r.taxable)}</td>{intra ? <><td className="text-right">{amount(r.cgst)}</td><td className="text-right">{amount(r.sgst)}</td></> : <td className="text-right">{amount(r.igst)}</td>}</tr>)}</tbody>
            </table>
          )}
          <div><span className="text-[#607D8B]">In words: </span><b>{inWords(doc.total)}</b></div>
          {biz.bank_details && doc.type !== 'purchase_invoice' && <div className="whitespace-pre-line"><b>Bank: </b>{biz.bank_details}</div>}
        </div>
        <div className="col-span-2 space-y-0.5">
          <T l="Taxable value" v={doc.subtotal} />
          {doc.discount > 0 && <T l="Discount" v={-doc.discount} />}
          {gst && (intra ? <><T l="CGST" v={doc.cgst} /><T l="SGST" v={doc.sgst} /></> : <T l="IGST" v={doc.igst} />)}
          {doc.otherCharges !== 0 && <T l="Other charges" v={doc.otherCharges} />}
          {doc.roundOff !== 0 && <T l="Round off" v={doc.roundOff} />}
          <div className="flex justify-between border-t-2 border-[#263238] pt-0.5 text-[12px] font-bold"><span>Total</span><span>₹{amount(doc.total)}</span></div>
          {isInv && paid > 0 && doc.partyId && <><T l="Paid" v={paid} /><T l="Balance due" v={doc.total - paid} bold /></>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#C8E6C9] pt-2">
        <div>{doc.notes && <div><b>Notes: </b>{doc.notes}</div>}{doc.terms && <div className="whitespace-pre-line text-[#607D8B]"><b className="text-[#263238]">Terms: </b>{doc.terms}</div>}</div>
        <div className="text-right"><div className="font-semibold">For {biz.business_name || 'My Shop'}</div><div className="h-10" /><div className="text-[#607D8B]">Authorised signatory</div></div>
      </div>
      {doc.status === 'cancelled' && <div className="mt-2 text-center text-base font-bold text-[#D32F2F]">CANCELLED</div>}
    </div>
  );
}

function T({ l, v, bold }: { l: string; v: number; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? 'font-semibold' : ''}`}><span className="text-[#607D8B]">{l}</span><span>{v < 0 ? '−' : ''}{amount(Math.abs(v))}</span></div>;
}

function groupTax(doc: Doc) {
  const m = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const l of doc.lines) {
    const r = m.get(l.gstRate) ?? { rate: l.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    r.taxable += l.taxable; r.cgst += l.cgst; r.sgst += l.sgst; r.igst += l.igst;
    m.set(l.gstRate, r);
  }
  return [...m.values()].filter((r) => r.rate > 0).sort((a, b) => a.rate - b.rate);
}

function Thermal({ doc, party, biz, paid, format }: Props) {
  const small = format === 'T2';
  return (
    <div className={`mx-auto bg-white font-mono text-black ${small ? 'text-[9px]' : 'text-[11px]'}`} style={{ width: small ? '54mm' : '74mm' }}>
      <div className="text-center">
        <div className={`${small ? 'text-[11px]' : 'text-sm'} font-bold`}>{biz.business_name || 'My Shop'}</div>
        {biz.business_address && <div className="whitespace-pre-line">{biz.business_address}</div>}
        {biz.business_phone && <div>Ph: {biz.business_phone}</div>}
        {biz.business_gstin && <div>GSTIN: {biz.business_gstin}</div>}
        <div className="my-1 border-y border-dashed border-black py-0.5 font-bold">{DOCS[doc.type].printTitle(!!doc.isGst)}</div>
      </div>
      <div className="flex justify-between"><span>No: {doc.number}</span><span>{fmtDate(doc.date)}</span></div>
      <div>To: {doc.partyName}</div>
      {party?.gstin && <div>GSTIN: {party.gstin}</div>}
      <div className="my-1 border-t border-dashed border-black" />
      {doc.lines.map((l, i) => (
        <div key={i} className="py-0.5">
          <div>{l.description}</div>
          <div className="flex"><span className="flex-1">{qty(l.qty)} x {amount(l.rate)}{doc.isGst ? ` +${l.gstRate}%` : ''}</span><span>{amount(l.amount)}</span></div>
        </div>
      ))}
      <div className="my-1 border-t border-dashed border-black" />
      <div className="flex justify-between"><span>Subtotal</span><span>{amount(doc.subtotal)}</span></div>
      {doc.isGst ? <div className="flex justify-between"><span>GST</span><span>{amount(doc.cgst + doc.sgst + doc.igst)}</span></div> : null}
      {doc.roundOff ? <div className="flex justify-between"><span>Round off</span><span>{amount(doc.roundOff)}</span></div> : null}
      <div className={`flex justify-between border-t border-dashed border-black pt-0.5 font-bold ${small ? 'text-[11px]' : 'text-sm'}`}><span>TOTAL</span><span>₹{amount(doc.total)}</span></div>
      {paid > 0 && doc.partyId && <div className="flex justify-between"><span>Balance</span><span>{amount(doc.total - paid)}</span></div>}
      <div className="mt-2 text-center">Thank you! Visit again.</div>
    </div>
  );
}
