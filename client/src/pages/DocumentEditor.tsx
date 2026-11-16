import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Trash2, UserPlus } from 'lucide-react';
import { api } from '../lib/api';
import { money, qty as fq, today, GST_RATES, INDIAN_STATES } from '../lib/format';
import { DOCS, docBySlug, type DocType } from '../lib/docTypes';
import { computeTotals } from '../lib/gst';
import { useSave, useSession } from '../lib/session';
import { Field, Loading, PageHeader } from '../components/ui';
import { ItemPicker } from '../components/ItemPicker';
import { PartyForm } from '../components/PartyForm';

interface Line { key: number; item_id: number | null; description: string; hsn: string; unit: string; qty: number; rate: number; discount_pct: number; gst_rate: number; stock?: number }
let seq = 1;

export default function DocumentEditor() {
  const { slug, id } = useParams();
  const [params] = useSearchParams();
  const fromId = params.get('from');
  const loc = useLocation();
  const nav = useNavigate();
  const { settings } = useSession();

  const existing = useQuery({ queryKey: ['doc', id], queryFn: () => api.get(`/document/${id}`), enabled: !!id });
  const source = useQuery({ queryKey: ['doc', fromId], queryFn: () => api.get(`/document/${fromId}`), enabled: !!fromId });
  const type: DocType | undefined = id ? existing.data?.type : docBySlug(slug ?? '');

  if (!type || (id && !existing.data) || (fromId && !source.data)) return <Loading />;
  return <Editor key={`${type}-${id ?? 'new'}-${fromId ?? ''}`} type={type} doc={existing.data} source={source.data} presetParty={(loc.state as any)?.party_id} settings={settings} onSaved={(nid) => nav(`/doc/${nid}`, { replace: true })} onCancel={() => nav(-1)} />;
}

function Editor({ type, doc, source, presetParty, settings, onSaved, onCancel }: { type: DocType; doc?: any; source?: any; presetParty?: number; settings: Record<string, string>; onSaved: (id: number) => void; onCancel: () => void }) {
  const meta = DOCS[type];
  const purchase = meta.side === 'purchase';
  const isInvoice = type === 'sales_invoice' || type === 'purchase_invoice';
  const base = doc ?? source;

  const stores = useQuery({ queryKey: ['stores'], queryFn: () => api.get('/stores') });
  const parties = useQuery({ queryKey: ['parties', purchase ? 'supplier' : 'customer'], queryFn: () => api.get(`/parties?type=${purchase ? 'supplier' : 'customer'}`) });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api.get('/accounts') });
  const nextNo = useQuery({ queryKey: ['next-number', type], queryFn: () => api.get(`/documents/${type}/next-number`), enabled: !doc });

  const [h, setH] = useState<any>(() => ({
    number: doc?.number ?? '',
    date: doc?.date ?? today(),
    due_date: doc?.due_date ?? '',
    party_id: base?.party_id ?? presetParty ?? '',
    party_name: base?.party_id ? '' : base?.party_name ?? '',
    store_id: base?.store_id ?? '',
    is_gst: base ? !!base.is_gst : !!settings.business_gstin,
    tax_inclusive: base ? !!base.tax_inclusive : false,
    place_of_supply: base?.place_of_supply ?? '',
    other_charges: doc?.other_charges ?? 0,
    notes: base?.notes ?? '',
    terms: base?.terms ?? (type === 'sales_invoice' || type === 'quotation' ? settings.invoice_terms ?? '' : ''),
    transport: base?.transport ?? '',
    vehicle_no: base?.vehicle_no ?? '',
    paid_now: '',
    account_id: '',
  }));
  const [lines, setLines] = useState<Line[]>(() => (base?.lines ?? []).map((l: any) => ({
    key: seq++, item_id: l.item_id, description: l.description, hsn: l.hsn ?? '', unit: l.unit ?? '', qty: l.qty, rate: l.rate, discount_pct: l.discount_pct, gst_rate: l.gst_rate,
  })));
  const [addingParty, setAddingParty] = useState(false);

  useEffect(() => { if (!h.number && nextNo.data) setH((x: any) => ({ ...x, number: nextNo.data.number })); }, [nextNo.data]);
  const activeStores = (stores.data ?? []).filter((s: any) => s.active);
  const storeId = h.store_id || activeStores[0]?.id;
  const party = parties.data?.find((p: any) => p.id === Number(h.party_id));
  const pos = h.place_of_supply || party?.state || settings.business_state;
  const intra = !pos || !settings.business_state || pos.toLowerCase() === settings.business_state.toLowerCase();

  const t = useMemo(() => computeTotals(lines, { isGst: h.is_gst, intraState: intra, taxInclusive: h.tax_inclusive, otherCharges: Number(h.other_charges) || 0 }), [lines, h.is_gst, h.tax_inclusive, h.other_charges, intra]);

  const addItem = (item: any) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.item_id === item.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, {
        key: seq++, item_id: item.id, description: item.name, hsn: item.hsn ?? '', unit: item.unit, qty: 1,
        rate: purchase ? item.purchase_price : item.sale_price, discount_pct: 0, gst_rate: item.gst_rate, stock: item.stock,
      }];
    });
  };
  const upd = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = useSave(() => {
    const body = {
      ...h,
      party_id: h.party_id ? Number(h.party_id) : null,
      party_name: h.party_id ? null : h.party_name || null,
      store_id: Number(storeId),
      other_charges: Number(h.other_charges) || 0,
      place_of_supply: pos,
      due_date: h.due_date || null,
      source_doc_id: source?.id ?? undefined,
      paid_now: Number(h.paid_now) || 0,
      account_id: h.account_id ? Number(h.account_id) : accounts.data?.[0]?.id,
      lines: lines.map(({ key, stock, ...l }) => l),
    };
    return doc ? api.put(`/document/${doc.id}`, body) : api.post(`/documents/${type}`, body);
  }, { success: `${meta.label} saved`, onDone: (r) => onSaved(r.id) });

  const canSave = lines.length > 0 && (h.party_id || (type === 'sales_invoice')) && !save.isPending;

  return (
    <div className="max-w-6xl">
      <PageHeader title={`${doc ? 'Edit' : 'New'} ${meta.label}`} subtitle={source ? `From ${DOCS[source.type as DocType].label} ${source.number}` : undefined} />
      <div className="card space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <Field label={meta.partyLabel} className="col-span-2">
            <div className="flex gap-2">
              <select className="input" value={h.party_id} onChange={(e) => setH({ ...h, party_id: e.target.value, place_of_supply: '' })}>
                <option value="">{type === 'sales_invoice' ? 'Cash sale (walk-in)' : `Choose ${meta.partyLabel.toLowerCase()}…`}</option>
                {parties.data?.map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` · ${p.phone}` : ''}</option>)}
              </select>
              <button type="button" className="btn-secondary" title={`New ${meta.partyLabel.toLowerCase()}`} onClick={() => setAddingParty(true)}><UserPlus size={16} /></button>
            </div>
            {party && <span className="mt-1 block text-xs text-slate-500">{party.gstin ? `GSTIN ${party.gstin} · ` : ''}{party.state}{Math.abs(party.balance) > 0.01 ? ` · Balance ${money(Math.abs(party.balance))} ${party.balance > 0 ? 'to receive' : 'to pay'}` : ''}</span>}
            {!h.party_id && type === 'sales_invoice' && <input className="input mt-1" placeholder="Customer name (optional)" value={h.party_name} onChange={(e) => setH({ ...h, party_name: e.target.value })} />}
          </Field>
          <Field label={`${meta.label} No.`}><input className="input" value={h.number} onChange={(e) => setH({ ...h, number: e.target.value })} /></Field>
          <Field label="Date"><input type="date" className="input" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} /></Field>
          {(isInvoice || type === 'quotation') && <Field label={type === 'quotation' ? 'Valid till' : 'Due date'}><input type="date" className="input" value={h.due_date} onChange={(e) => setH({ ...h, due_date: e.target.value })} /></Field>}
          <Field label="Store">
            <select className="input" value={storeId ?? ''} onChange={(e) => setH({ ...h, store_id: e.target.value })}>
              {activeStores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={h.is_gst} onChange={(e) => setH({ ...h, is_gst: e.target.checked })} /> GST bill</label>
          {h.is_gst && <label className="flex items-center gap-1.5"><input type="checkbox" checked={h.tax_inclusive} onChange={(e) => setH({ ...h, tax_inclusive: e.target.checked })} /> Rates include GST</label>}
          {h.is_gst && (
            <label className="flex items-center gap-1.5">Place of supply
              <select className="input w-auto py-1" value={pos} onChange={(e) => setH({ ...h, place_of_supply: e.target.value })}>
                {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <span className="text-xs text-slate-500">{intra ? '(CGST + SGST)' : '(IGST)'}</span>
            </label>
          )}
        </div>

        <ItemPicker storeId={storeId} onPick={addItem} priceField={purchase ? 'purchase_price' : 'sale_price'} />

        <div className="overflow-x-auto">
          <table className="table min-w-[860px]">
            <thead>
              <tr>
                <th className="w-8">#</th><th className="min-w-56">Item</th><th className="w-24">HSN</th><th className="num w-24">Qty</th><th className="w-20">Unit</th>
                <th className="num w-28">Rate</th><th className="num w-20">Disc %</th>{h.is_gst && <th className="num w-24">GST %</th>}<th className="num w-28">Amount</th><th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.key}>
                  <td className="text-slate-400">{i + 1}</td>
                  <td>
                    <input className="input" value={l.description} onChange={(e) => upd(l.key, { description: e.target.value })} aria-label="Description" />
                    {l.stock !== undefined && meta.side === 'sales' && l.qty > l.stock && <div className="mt-0.5 text-xs text-amber-600">Only {fq(l.stock)} in stock</div>}
                  </td>
                  <td><input className="input" value={l.hsn} onChange={(e) => upd(l.key, { hsn: e.target.value })} aria-label="HSN" /></td>
                  <td><input type="number" min="0" step="any" className="input text-right" value={l.qty} onChange={(e) => upd(l.key, { qty: e.target.valueAsNumber || 0 })} aria-label="Quantity" /></td>
                  <td><input className="input" value={l.unit} onChange={(e) => upd(l.key, { unit: e.target.value })} aria-label="Unit" /></td>
                  <td><input type="number" min="0" step="0.01" className="input text-right" value={l.rate} onChange={(e) => upd(l.key, { rate: e.target.valueAsNumber || 0 })} aria-label="Rate" /></td>
                  <td><input type="number" min="0" max="100" step="0.01" className="input text-right" value={l.discount_pct} onChange={(e) => upd(l.key, { discount_pct: e.target.valueAsNumber || 0 })} aria-label="Discount percent" /></td>
                  {h.is_gst && (
                    <td><select className="input text-right" value={l.gst_rate} onChange={(e) => upd(l.key, { gst_rate: Number(e.target.value) })} aria-label="GST rate">
                      {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select></td>
                  )}
                  <td className="num font-medium">{money(t.lines[i]?.amount)}</td>
                  <td><button className="btn-ghost p-1 text-red-600" aria-label="Remove line" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}><Trash2 size={15} /></button></td>
                </tr>
              ))}
              {!lines.length && <tr><td colSpan={10} className="py-10 text-center text-slate-400">Search or scan items above to add them to the bill</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            {(type === 'delivery_challan' || isInvoice || type === 'sales_order') && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Transport"><input className="input" value={h.transport} onChange={(e) => setH({ ...h, transport: e.target.value })} /></Field>
                <Field label="Vehicle no."><input className="input" value={h.vehicle_no} onChange={(e) => setH({ ...h, vehicle_no: e.target.value })} /></Field>
              </div>
            )}
            <Field label="Notes"><textarea className="input" rows={2} value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} /></Field>
            <Field label="Terms & conditions"><textarea className="input" rows={2} value={h.terms} onChange={(e) => setH({ ...h, terms: e.target.value })} /></Field>
          </div>
          <div className="rounded-md bg-slate-50 p-4 text-sm">
            <Row label="Taxable value" value={money(t.subtotal)} />
            {t.discount > 0 && <Row label="Discount given" value={`− ${money(t.discount)}`} muted />}
            {h.is_gst && (intra ? <><Row label="CGST" value={money(t.cgst)} /><Row label="SGST" value={money(t.sgst)} /></> : <Row label="IGST" value={money(t.igst)} />)}
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-600">Other charges (freight etc.)</span>
              <input type="number" step="0.01" className="input w-28 py-1 text-right" value={h.other_charges} onChange={(e) => setH({ ...h, other_charges: e.target.value })} aria-label="Other charges" />
            </div>
            <Row label="Round off" value={money(t.round_off)} muted />
            <div className="mt-2 flex justify-between border-t border-slate-300 pt-2 text-lg font-semibold"><span>Total</span><span className="tabular-nums">{money(t.total)}</span></div>
            {isInvoice && !doc && h.party_id && (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                <Field label={type === 'sales_invoice' ? 'Amount received now' : 'Amount paid now'}>
                  <div className="flex gap-1">
                    <input type="number" min="0" step="0.01" className="input" value={h.paid_now} onChange={(e) => setH({ ...h, paid_now: e.target.value })} />
                    <button type="button" className="btn-secondary px-2 text-xs" onClick={() => setH({ ...h, paid_now: String(t.total) })}>Full</button>
                  </div>
                </Field>
                <Field label="Mode">
                  <select className="input" value={h.account_id} onChange={(e) => setH({ ...h, account_id: e.target.value })}>
                    {accounts.data?.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </Field>
              </div>
            )}
            {isInvoice && !doc && !h.party_id && <p className="mt-2 text-xs text-slate-500">Cash sale: treated as paid in full. Choose a customer to track credit.</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary px-5" disabled={!canSave} onClick={() => save.mutate(undefined)}>Save {meta.label}</button>
        </div>
      </div>
      {addingParty && <PartyForm defaultType={purchase ? 'supplier' : 'customer'} onClose={() => setAddingParty(false)} onSaved={(pid) => { parties.refetch(); setH((x: any) => ({ ...x, party_id: pid })); }} />}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return <div className={`flex justify-between py-1 ${muted ? 'text-slate-500' : ''}`}><span className="text-slate-600">{label}</span><span className="tabular-nums">{value}</span></div>;
}
