import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Printer, MessageCircle, Wallet, Pencil, Ban, RotateCcw, Trash2, ArrowRightLeft, CheckCircle2, Hash } from 'lucide-react';
import { useBusiness, useDoc } from '../hooks/billing';
import { useSession } from '../hooks/session';
import { DOC_TYPES, deleteDocument, renumber, setStatus } from '../services/documents';
import { DOCS } from '../lib/docTypes';
import { fmtDate, money } from '../lib/format';
import { Empty, List, Page, Row, Segmented, useToast } from '../components/ui';
import { InvoicePrint, PRINT_FORMATS, type PrintFormat } from '../components/InvoicePrint';
import { PaymentSheet } from '../components/PaymentSheet';

export function StatusPill({ status }: { status: string }) {
  const s = { open: 'bg-[#FFF8E1] text-[#8D6E00]', completed: 'bg-mint text-primary', cancelled: 'bg-[#FFEBEE] text-out' }[status] ?? '';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s}`}>{status[0].toUpperCase() + status.slice(1)}</span>;
}

export default function BillView() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const data = useDoc(id);
  const biz = useBusiness();
  const { isOwner } = useSession();
  const [format, setFormat] = useState<PrintFormat>('A4');
  const [paying, setPaying] = useState(false);
  if (data === undefined || !biz) return null;
  if (data === null) return <Page title="Bill" back="/bills"><Empty title="Bill not found" /></Page>;
  const { doc, paid, due, party, source, children, conversions, duplicate } = data;
  const meta = DOCS[doc.type];
  const isInv = doc.type === 'sales_invoice' || doc.type === 'purchase_invoice';
  const tracks = DOC_TYPES[doc.type].tracksStatus;

  const act = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); } catch (e: any) { toast(e.message, 'error'); } };
  const phone = (party?.phone || '').replace(/\D/g, '').replace(/^(\d{10})$/, '91$1');
  const waText = encodeURIComponent(`${meta.label} ${doc.number} dated ${fmtDate(doc.date)}\nAmount: ${money(doc.total)}${isInv && due > 0.009 && doc.partyId ? `\nBalance due: ${money(due)}` : ''}\n- ${biz.business_name || 'INSTORE'}`);

  return (
    <Page title={`${meta.short} ${doc.number}`} back="/bills" large={false}>
      <div className="space-y-3 pt-3">
        <div className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-muted">{meta.label} · {fmtDate(doc.date)}</div>
              <div className="truncate text-lg font-bold">{doc.partyName}</div>
            </div>
            <StatusPill status={doc.status} />
          </div>
          <div className="mt-3 flex items-end justify-between">
            <div className="text-[28px] font-bold leading-none tabular-nums">{money(doc.total)}</div>
            {isInv && doc.status !== 'cancelled' && (
              <div className="text-right text-sm">
                <div className="text-muted">Paid <b className="text-primary">{money(paid)}</b></div>
                <div className="text-muted">Due <b className={due > 0.009 ? 'text-out' : 'text-primary'}>{money(due)}</b></div>
              </div>
            )}
          </div>
          {isOwner && doc.type === 'sales_invoice' && <div className="mt-1 text-xs text-muted">Profit {money(doc.subtotal - doc.costTotal)}</div>}
          {(source || children.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {source && <button className="text-primary underline" onClick={() => nav(`/bills/${source.id}`)}>From {DOCS[source.type].short} {source.number}</button>}
              {children.map((c) => <button key={c.id} className="text-primary underline" onClick={() => nav(`/bills/${c.id}`)}>→ {DOCS[c.type].short} {c.number}</button>)}
            </div>
          )}
        </div>

        {duplicate && (
          <div className="flex items-center justify-between rounded-xl bg-[#FFF8E1] px-3 py-2 text-sm text-[#8D6E00]">
            <span>Another {meta.short.toLowerCase()} already uses {doc.number}.</span>
            <button className="font-semibold" onClick={() => act(() => renumber(doc.id), 'Renumbered')}><Hash size={14} className="inline" /> Renumber</button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {isInv && doc.partyId && due > 0.009 && doc.status !== 'cancelled' && (
            <button className="btn-primary col-span-2" onClick={() => setPaying(true)}><Wallet size={18} /> {doc.type === 'sales_invoice' ? 'Receive payment' : 'Make payment'}</button>
          )}
          <button className="btn-soft" onClick={() => window.print()}><Printer size={18} /> Print / PDF</button>
          <a className="btn-soft" href={`https://wa.me/${phone}?text=${waText}`} target="_blank" rel="noreferrer"><MessageCircle size={18} /> WhatsApp</a>
        </div>

        {doc.status !== 'cancelled' && conversions.length > 0 && (
          <List>
            {conversions.map((t) => (
              <Row key={t} onClick={() => nav(`/bills/new/${t}?from=${doc.id}`)}><ArrowRightLeft size={18} className="text-primary" /><span className="flex-1">Convert to {DOCS[t].label}</span></Row>
            ))}
          </List>
        )}

        <div>
          <div className="mb-2"><Segmented options={PRINT_FORMATS} value={format} onChange={setFormat} /></div>
          <div className="overflow-x-auto rounded-2xl border border-line bg-white p-3">
            <div className={format.startsWith('T') ? 'w-fit mx-auto' : 'bill-fit min-w-[560px]'}>
              <InvoicePrint doc={doc} party={party} biz={biz} paid={paid} format={format} />
            </div>
          </div>
          <p className="mt-1 px-1 text-xs text-muted">Print / PDF opens the iPhone print screen: tap Share there to save a PDF to Files or send it on WhatsApp.</p>
        </div>

        <List>
          <Row onClick={() => nav(`/bills/${doc.id}/edit`)}><Pencil size={18} className="text-primary" /><span className="flex-1">Edit</span></Row>
          {tracks && doc.status === 'open' && <Row onClick={() => act(() => setStatus(doc.id, 'completed'), 'Marked completed')}><CheckCircle2 size={18} className="text-primary" /><span className="flex-1">Mark completed</span></Row>}
          {tracks && doc.status === 'completed' && <Row onClick={() => act(() => setStatus(doc.id, 'open'), 'Re-opened')}><RotateCcw size={18} className="text-primary" /><span className="flex-1">Re-open</span></Row>}
          {isOwner && doc.status !== 'cancelled' && (
            <Row onClick={() => window.confirm('Cancel this bill? Stock and balances are reversed; the number is kept.') && act(() => setStatus(doc.id, 'cancelled'), 'Bill cancelled')}>
              <Ban size={18} className="text-out" /><span className="flex-1 text-out">Cancel bill</span>
            </Row>
          )}
          {isOwner && doc.status === 'cancelled' && <Row onClick={() => act(() => setStatus(doc.id, tracks ? 'open' : 'completed'), 'Bill restored')}><RotateCcw size={18} className="text-primary" /><span className="flex-1">Restore bill</span></Row>}
          {isOwner && (
            <Row onClick={() => window.confirm('Delete this bill permanently?') && act(async () => { await deleteDocument(doc.id); nav('/bills', { replace: true }); }, 'Bill deleted')}>
              <Trash2 size={18} className="text-out" /><span className="flex-1 text-out">Delete</span>
            </Row>
          )}
        </List>
      </div>
      <PaymentSheet open={paying} onClose={() => setPaying(false)} direction={doc.type === 'sales_invoice' ? 'in' : 'out'} partyId={doc.partyId} docId={doc.id} />
    </Page>
  );
}
