import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Plus, ScanLine, Trash2, User } from 'lucide-react';
import { db } from '../data/db';
import type { DocLine, DocType, Item, Party } from '../data/models';
import { computeTotals, DOC_TYPES, isIntraState, nextNumber, saveDocument, type LineInput } from '../services/documents';
import { findByCode, matches } from '../services/items';
import { stockTotals } from '../services/stock';
import { useAccounts, useBusiness } from '../hooks/billing';
import { useStores } from '../hooks/data';
import { useUserId } from '../hooks/session';
import { DOCS } from '../lib/docTypes';
import { GST_RATES, INDIAN_STATES, money, qty as fq, todayStr } from '../lib/format';
import { Field, List, Page, QtyInput, Row, SearchBar, Segmented, Sheet, useToast } from '../components/ui';
import { Scanner } from '../components/Scanner';
import { BalanceText, PartyPickerSheet } from '../components/PartySheets';

type Line = LineInput & { key: number; description: string; unit: string; hsn: string; discountPct: number; gstRate: number };
let seq = 1;
const fromDocLine = (l: DocLine): Line => ({ key: seq++, itemId: l.itemId, description: l.description, hsn: l.hsn, unit: l.unit, qty: l.qty, rate: l.rate, discountPct: l.discountPct, gstRate: l.gstRate });

export default function BillEditor() {
  const { id, type: typeParam } = useParams();
  const [params] = useSearchParams();
  const fromId = params.get('from');
  const data = useLiveQuery(async () => {
    const existing = id ? await db.docs.get(id) : undefined;
    const source = fromId ? await db.docs.get(fromId) : undefined;
    const presetParty = params.get('party') ? await db.parties.get(params.get('party')!) : undefined;
    return { existing: existing ?? null, source: source ?? null, presetParty: presetParty ?? null };
  }, [id, fromId]);
  if (!data) return null;
  const type = (data.existing?.type ?? typeParam) as DocType;
  if (!DOC_TYPES[type]) return <Page title="Bill" back><p className="pt-6 text-muted">Unknown bill type.</p></Page>;
  return <Editor key={`${type}-${id ?? 'new'}-${fromId ?? ''}`} type={type} {...data} />;
}

function Editor({ type, existing, source, presetParty }: { type: DocType; existing: any; source: any; presetParty: Party | null }) {
  const nav = useNavigate();
  const toast = useToast();
  const userId = useUserId();
  const biz = useBusiness();
  const stores = useStores();
  const accounts = useAccounts();
  const meta = DOCS[type];
  const cfg = DOC_TYPES[type];
  const base = existing ?? source;
  const isInvoice = type === 'sales_invoice' || type === 'purchase_invoice';

  const [party, setParty] = useState<Party | null>(presetParty);
  const [h, setH] = useState(() => ({
    number: existing?.number ?? '', date: existing?.date ?? todayStr(), dueDate: existing?.dueDate ?? '',
    partyName: base && !base.partyId ? base.partyName : '', storeId: base?.storeId ?? '',
    isGst: base ? !!base.isGst : true, taxInclusive: base ? !!base.taxInclusive : false, placeOfSupply: base?.placeOfSupply ?? '',
    otherCharges: existing?.otherCharges ?? 0, notes: base?.notes ?? '', terms: base?.terms ?? '', transport: base?.transport ?? '', vehicleNo: base?.vehicleNo ?? '',
    paidNow: '', accountId: 'cash',
  }));
  const [lines, setLines] = useState<Line[]>(() => (base?.lines ?? []).map(fromDocLine));
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Line | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  // Load the party of an existing/source bill, defaults from business settings, and the next number.
  useEffect(() => {
    (async () => {
      if (base?.partyId && !party) setParty((await db.parties.get(base.partyId)) ?? null);
      if (!existing) { const n = await nextNumber(type); setH((x) => ({ ...x, number: x.number || n })); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (biz && !base) setH((x) => ({ ...x, isGst: !!biz.business_gstin, terms: x.terms || (meta.side === 'sales' ? biz.invoice_terms : '') }));
  }, [biz?.business_gstin]); // eslint-disable-line react-hooks/exhaustive-deps

  const storeId = h.storeId || stores?.[0]?.id || '';
  const home = biz?.business_state ?? '';
  const pos = h.placeOfSupply || party?.state || home;
  const intra = isIntraState(pos, home);
  const stock = useLiveQuery(() => stockTotals(storeId), [storeId]);
  const t = useMemo(() => computeTotals(lines, { isGst: h.isGst, intraState: intra, taxInclusive: h.taxInclusive, otherCharges: Number(h.otherCharges) || 0 }), [lines, h.isGst, h.taxInclusive, h.otherCharges, intra]);

  const addItem = (item: Item) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.itemId === item.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key: seq++, itemId: item.id, description: item.name, hsn: item.hsn, unit: item.unit, qty: 1, rate: cfg.side === 'purchase' ? item.purchasePrice : item.salePrice, discountPct: 0, gstRate: item.gstRate }];
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      const newId = await saveDocument(type, {
        number: h.number, date: h.date, dueDate: h.dueDate, partyId: party?.id ?? null, partyName: h.partyName, storeId,
        isGst: h.isGst, taxInclusive: h.taxInclusive, placeOfSupply: pos, sourceId: source?.id ?? null, otherCharges: Number(h.otherCharges) || 0,
        notes: h.notes, terms: h.terms, transport: h.transport, vehicleNo: h.vehicleNo,
        lines: lines.map(({ key: _k, ...l }) => l), paidNow: Number(h.paidNow) || 0, accountId: h.accountId,
      }, userId, existing?.id);
      toast(`${meta.label} saved`);
      nav(`/bills/${newId}`, { replace: true });
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const needsParty = type !== 'sales_invoice';
  const canSave = lines.length > 0 && (!needsParty || party) && !busy;

  return (
    <Page title={`${existing ? 'Edit' : 'New'} ${meta.short}`} back large={false}
      action={<button className="tap px-1 font-semibold text-primary disabled:opacity-40" disabled={!canSave} onClick={save}>Save</button>}>
      <div className="space-y-4 pt-3">
        {source && <div className="rounded-xl bg-mint px-3 py-2 text-sm text-primary">From {DOCS[source.type as DocType].label} {source.number}</div>}

        <button className="card tap flex w-full items-center gap-3 p-3 text-left" onClick={() => setPicking(true)}>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mint text-primary"><User size={20} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">{meta.partyLabel}</div>
            <div className="truncate font-semibold">{party?.name ?? (type === 'sales_invoice' ? 'Cash sale (walk-in)' : `Choose ${meta.partyLabel.toLowerCase()}`)}</div>
            {party && <div className="text-xs">{'balance' in party && <BalanceText value={(party as any).balance} small />} {party.state && <span className="text-muted">· {party.state}</span>}</div>}
          </div>
          <ChevronRight size={18} className="text-line" />
        </button>
        {!party && type === 'sales_invoice' && <input className="field" placeholder="Customer name (optional)" value={h.partyName} onChange={(e) => setH({ ...h, partyName: e.target.value })} />}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Number"><input className="field" value={h.number} onChange={(e) => setH({ ...h, number: e.target.value })} /></Field>
          <Field label="Date"><input className="field" type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} /></Field>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between"><span className="label mb-0">Items</span><span className="text-xs text-muted">{lines.length} {lines.length === 1 ? 'item' : 'items'}</span></div>
          <List>
            {lines.map((l, i) => {
              const amt = t.lines[i]?.amount ?? 0;
              const have = l.itemId ? stock?.get(l.itemId) ?? 0 : null;
              const short = cfg.stockSign < 0 && have !== null && l.qty > have;
              return (
                <Row key={l.key} onClick={() => setEditing(l)}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{l.description}</div>
                    <div className="text-xs text-muted">{fq(l.qty)} {l.unit} × {money(l.rate)}{l.discountPct ? ` −${l.discountPct}%` : ''}{h.isGst ? ` · GST ${l.gstRate}%` : ''}</div>
                    {short && <div className="text-xs text-[#8D6E00]">Only {fq(have!)} in stock</div>}
                  </div>
                  <span className="font-semibold tabular-nums">{money(amt)}</span>
                </Row>
              );
            })}
            <Row onClick={() => setAdding(true)} className="text-primary"><Plus size={18} /><span className="flex-1 font-medium">Add item</span><ScanLine size={18} /></Row>
          </List>
        </div>

        <List>
          <Row><span className="flex-1">GST bill</span><input type="checkbox" className="h-5 w-5 accent-[#388E3C]" checked={h.isGst} onChange={(e) => setH({ ...h, isGst: e.target.checked })} aria-label="GST bill" /></Row>
          {h.isGst && <Row><span className="flex-1">Rates include GST</span><input type="checkbox" className="h-5 w-5 accent-[#388E3C]" checked={h.taxInclusive} onChange={(e) => setH({ ...h, taxInclusive: e.target.checked })} aria-label="Rates include GST" /></Row>}
          {h.isGst && (
            <Row>
              <span className="flex-1">Place of supply <span className="text-xs text-muted">{intra ? '(CGST+SGST)' : '(IGST)'}</span></span>
              <select className="max-w-[45%] bg-transparent text-right text-sm text-primary outline-none" value={pos} onChange={(e) => setH({ ...h, placeOfSupply: e.target.value })} aria-label="Place of supply">
                {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Row>
          )}
          {(stores?.length ?? 0) > 1 && (
            <Row>
              <span className="flex-1">Store</span>
              <select className="bg-transparent text-right text-sm text-primary outline-none" value={storeId} onChange={(e) => setH({ ...h, storeId: e.target.value })} aria-label="Store">
                {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Row>
          )}
        </List>

        <div className="card space-y-1 p-4 text-sm">
          <Tot l="Taxable value" v={money(t.subtotal)} />
          {t.discount > 0 && <Tot l="Discount given" v={`− ${money(t.discount)}`} muted />}
          {h.isGst && (intra ? <><Tot l="CGST" v={money(t.cgst)} /><Tot l="SGST" v={money(t.sgst)} /></> : <Tot l="IGST" v={money(t.igst)} />)}
          {Number(h.otherCharges) !== 0 && <Tot l="Other charges" v={money(Number(h.otherCharges))} />}
          {t.roundOff !== 0 && <Tot l="Round off" v={money(t.roundOff)} muted />}
          <div className="flex justify-between border-t border-line pt-2 text-lg font-bold"><span>Total</span><span className="tabular-nums">{money(t.total)}</span></div>
        </div>

        {isInvoice && !existing && party && (
          <div className="card space-y-3 p-4">
            <Field label={type === 'sales_invoice' ? 'Received now ₹' : 'Paid now ₹'}>
              <div className="flex gap-2">
                <input className="field" type="number" inputMode="decimal" min="0" value={h.paidNow} onChange={(e) => setH({ ...h, paidNow: e.target.value })} />
                <button className="btn-soft px-3" onClick={() => setH({ ...h, paidNow: String(t.total) })}>Full</button>
              </div>
            </Field>
            {Number(h.paidNow) > 0 && <Segmented options={(accounts ?? []).map((a) => ({ id: a.id, label: a.name }))} value={h.accountId} onChange={(v) => setH({ ...h, accountId: v })} />}
          </div>
        )}
        {isInvoice && !party && type === 'sales_invoice' && <p className="px-1 text-xs text-muted">Cash sale is counted as fully paid. Choose a customer to give credit.</p>}

        <button className="w-full text-left text-sm font-medium text-primary" onClick={() => setMore(!more)}>{more ? '− Hide' : '+ More'}: due date, notes, terms, transport, other charges</button>
        {more && (
          <div className="space-y-3">
            {(isInvoice || type === 'quotation') && <Field label={type === 'quotation' ? 'Valid till' : 'Due date'}><input className="field" type="date" value={h.dueDate} onChange={(e) => setH({ ...h, dueDate: e.target.value })} /></Field>}
            <Field label="Other charges (freight etc.) ₹"><input className="field" type="number" inputMode="decimal" value={h.otherCharges || ''} onChange={(e) => setH({ ...h, otherCharges: e.target.valueAsNumber || 0 })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Transport"><input className="field" value={h.transport} onChange={(e) => setH({ ...h, transport: e.target.value })} /></Field>
              <Field label="Vehicle no."><input className="field" value={h.vehicleNo} onChange={(e) => setH({ ...h, vehicleNo: e.target.value })} /></Field>
            </div>
            <Field label="Notes"><textarea className="field" rows={2} value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} /></Field>
            <Field label="Terms"><textarea className="field" rows={2} value={h.terms} onChange={(e) => setH({ ...h, terms: e.target.value })} /></Field>
          </div>
        )}

        <button className="btn-primary w-full text-[17px]" disabled={!canSave} onClick={save}>Save {meta.short}</button>
      </div>

      <PartyPickerSheet open={picking} onClose={() => setPicking(false)} side={meta.side} allowCash={type === 'sales_invoice'} onPick={(p) => { setParty(p); setH((x) => ({ ...x, placeOfSupply: '' })); }} />
      <AddItemSheet open={adding} onClose={() => setAdding(false)} onPick={addItem} stock={stock} priceField={cfg.side === 'purchase' ? 'purchasePrice' : 'salePrice'} />
      <LineSheet line={editing} isGst={h.isGst} onClose={() => setEditing(null)}
        onSave={(l) => setLines((ls) => ls.map((x) => (x.key === l.key ? l : x)))} onRemove={(key) => setLines((ls) => ls.filter((x) => x.key !== key))} />
    </Page>
  );
}

function Tot({ l, v, muted }: { l: string; v: string; muted?: boolean }) {
  return <div className={`flex justify-between ${muted ? 'text-muted' : ''}`}><span className="text-muted">{l}</span><span className="tabular-nums">{v}</span></div>;
}

/** Search or scan items to add to the bill. Stays open so several items can be added. */
function AddItemSheet({ open, onClose, onPick, stock, priceField }: { open: boolean; onClose: () => void; onPick: (i: Item) => void; stock?: Map<string, number>; priceField: 'salePrice' | 'purchasePrice' }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [scan, setScan] = useState(false);
  const items = useLiveQuery(async () => (await db.items.filter((i) => !i.deleted && !!i.active).toArray()).filter((i) => matches(i, search)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40), [search]);
  const pick = (i: Item) => { onPick(i); toast(`Added ${i.name}`); };
  const byCode = async (code: string) => {
    const i = await findByCode(code);
    if (i) pick(i); else toast(`No item with code ${code}`, 'error');
  };
  return (
    <Sheet open={open} onClose={() => { setScan(false); setSearch(''); onClose(); }} title="Add items">
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Name, SKU or barcode" /></div>
          <button className={`btn px-3 ${scan ? 'bg-primary text-white' : 'bg-mint text-primary'}`} onClick={() => setScan(!scan)} aria-label="Scan barcode"><ScanLine size={20} /></button>
        </div>
        {scan && <Scanner onCode={byCode} />}
        <List>
          {items?.map((i) => (
            <Row key={i.id} onClick={() => pick(i)}>
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{i.name}</div><div className="text-xs text-muted">{i.sku} · stock {fq(stock?.get(i.id) ?? 0)} {i.unit}</div></div>
              <span className="text-sm font-medium tabular-nums">{money(i[priceField])}</span>
            </Row>
          ))}
          {items?.length === 0 && <Row><span className="text-sm text-muted">No items found. Add items in the Items tab first.</span></Row>}
        </List>
        <button className="btn-primary w-full" onClick={() => { setScan(false); setSearch(''); onClose(); }}>Done</button>
      </div>
    </Sheet>
  );
}

function LineSheet({ line, isGst, onClose, onSave, onRemove }: { line: Line | null; isGst: boolean; onClose: () => void; onSave: (l: Line) => void; onRemove: (key: number) => void }) {
  const [l, setL] = useState<Line | null>(line);
  useEffect(() => setL(line), [line]);
  if (!l) return null;
  return (
    <Sheet open={!!line} onClose={onClose} title={l.description}>
      <div className="space-y-3">
        <Field label={`Quantity (${l.unit})`}><QtyInput value={l.qty} onChange={(v) => setL({ ...l, qty: v })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rate ₹"><input className="field" type="number" inputMode="decimal" min="0" value={l.rate} onFocus={(e) => e.target.select()} onChange={(e) => setL({ ...l, rate: e.target.valueAsNumber || 0 })} /></Field>
          <Field label="Discount %"><input className="field" type="number" inputMode="decimal" min="0" max="100" value={l.discountPct || ''} onChange={(e) => setL({ ...l, discountPct: e.target.valueAsNumber || 0 })} /></Field>
        </div>
        {isGst && <Field label="GST %"><Segmented options={GST_RATES.map((r) => ({ id: String(r), label: `${r}%` }))} value={String(l.gstRate)} onChange={(v) => setL({ ...l, gstRate: Number(v) })} /></Field>}
        <Field label="Description"><input className="field" value={l.description} onChange={(e) => setL({ ...l, description: e.target.value })} /></Field>
        <div className="flex gap-2">
          <button className="btn-danger" onClick={() => { onRemove(l.key); onClose(); }} aria-label="Remove item"><Trash2 size={18} /></button>
          <button className="btn-primary flex-1" disabled={!(l.qty > 0)} onClick={() => { onSave(l); onClose(); }}>Done</button>
        </div>
      </div>
    </Sheet>
  );
}
