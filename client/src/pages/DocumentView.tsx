import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Printer, Pencil, Trash2, Ban, CheckCircle2, RotateCcw, Wallet, ArrowRightLeft, ArrowLeft, MessageCircle } from 'lucide-react';
import { api } from '../lib/api';
import { money, fmtDate } from '../lib/format';
import { DOCS, docPath, type DocType } from '../lib/docTypes';
import { useSave, useSession } from '../lib/session';
import { Loading, PageHeader, StatusBadge, confirmAction } from '../components/ui';
import { InvoicePrint, PRINT_FORMATS, type PrintFormat } from '../components/InvoicePrint';
import { PaymentForm } from './Payments';

const COPIES = ['', 'Original for recipient', 'Duplicate for transporter', 'Triplicate for supplier'];

export default function DocumentView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can, settings } = useSession();
  const { data: doc } = useQuery({ queryKey: ['doc', id], queryFn: () => api.get(`/document/${id}`) });
  const [format, setFormat] = useState<PrintFormat>((settings.print_format as PrintFormat) || 'A4');
  const [copy, setCopy] = useState('');
  const [paying, setPaying] = useState(false);
  const status = useSave((s: string) => api.post(`/document/${id}/status`, { status: s }), { success: 'Status updated' });
  const del = useSave(() => api.del(`/document/${id}`), { success: 'Deleted', onDone: () => nav(docPath(doc.type)) });
  if (!doc) return <Loading />;

  const meta = DOCS[doc.type as DocType];
  const isInvoice = doc.type === 'sales_invoice' || doc.type === 'purchase_invoice';
  const waText = encodeURIComponent(`${meta.label} ${doc.number} dated ${fmtDate(doc.date)}\nAmount: ${money(doc.total)}${isInvoice && doc.balance > 0 ? `\nBalance due: ${money(doc.balance)}` : ''}\n- ${settings.business_name}`);
  const waPhone = (doc.party_phone || '').replace(/\D/g, '').replace(/^(\d{10})$/, '91$1');

  return (
    <div>
      <PageHeader
        title={`${meta.label} ${doc.number}`}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Link to={docPath(doc.type)} className="inline-flex items-center gap-1 hover:text-brand"><ArrowLeft size={14} /> {meta.plural}</Link>
          <StatusBadge status={doc.status} />
          {doc.source_number && <span>from <Link className="text-brand hover:underline" to={`/doc/${doc.source_doc_id}`}>{doc.source_number}</Link></span>}
          {doc.children.map((c: any) => <span key={c.id}>→ <Link className="text-brand hover:underline" to={`/doc/${c.id}`}>{DOCS[c.type as DocType].label} {c.number}</Link></span>)}
        </span>}
        actions={<>
          {isInvoice && doc.party_id && doc.balance > 0.009 && doc.status !== 'cancelled' && (
            <button className="btn-primary" onClick={() => setPaying(true)}><Wallet size={16} /> {doc.type === 'sales_invoice' ? 'Receive payment' : 'Make payment'}</button>
          )}
          {doc.status !== 'cancelled' && doc.conversions.map((t: DocType) => (
            <button key={t} className="btn-secondary" onClick={() => nav(`${docPath(t)}/new?from=${doc.id}`)}><ArrowRightLeft size={16} /> {DOCS[t].label}</button>
          ))}
          <button className="btn-secondary" onClick={() => nav(`/doc/${doc.id}/edit`)}><Pencil size={16} /> Edit</button>
          {meta.hasStatus && doc.status === 'open' && <button className="btn-secondary" onClick={() => status.mutate('completed')}><CheckCircle2 size={16} /> Mark completed</button>}
          {doc.status !== 'open' && meta.hasStatus && <button className="btn-secondary" onClick={() => status.mutate('open')}><RotateCcw size={16} /> Re-open</button>}
          {doc.status === 'cancelled' && !meta.hasStatus && <button className="btn-secondary" onClick={() => status.mutate('completed')}><RotateCcw size={16} /> Restore</button>}
          {can('delete') && doc.status !== 'cancelled' && <button className="btn-secondary" onClick={() => confirmAction('Cancel this document? Stock and balances will be reversed but the number is kept.') && status.mutate('cancelled')}><Ban size={16} /> Cancel</button>}
          {can('delete') && <button className="btn-secondary text-red-600" aria-label="Delete" onClick={() => confirmAction('Delete permanently? This cannot be undone.') && del.mutate(undefined)}><Trash2 size={16} /></button>}
        </>}
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={format} onChange={(e) => setFormat(e.target.value as PrintFormat)} aria-label="Print format">
          {PRINT_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        {!format.startsWith('T') && (
          <select className="input w-auto" value={copy} onChange={(e) => setCopy(e.target.value)} aria-label="Copy label">
            {COPIES.map((c) => <option key={c} value={c}>{c || 'No copy label'}</option>)}
          </select>
        )}
        <button className="btn-primary" onClick={() => window.print()}><Printer size={16} /> Print / Save PDF</button>
        <a className="btn-secondary" target="_blank" rel="noreferrer" href={`https://wa.me/${waPhone}?text=${waText}`}><MessageCircle size={16} /> WhatsApp</a>
        {isInvoice && (
          <div className="ml-auto flex gap-4 text-sm">
            <span>Total <b>{money(doc.total)}</b></span>
            <span>Paid <b className="text-emerald-600">{money(doc.paid)}</b></span>
            <span>Due <b className={doc.balance > 0 ? 'text-red-600' : ''}>{money(doc.balance)}</b></span>
            {doc.type === 'sales_invoice' && can('reports') && <span>Profit <b>{money(doc.subtotal - doc.cost_total)}</b></span>}
          </div>
        )}
      </div>

      <div className={`card print-area overflow-x-auto p-6 ${format.startsWith('T') ? 'mx-auto w-fit' : ''}`}>
        <InvoicePrint doc={doc} format={format} copy={copy} />
      </div>

      {paying && <PaymentForm direction={doc.type === 'sales_invoice' ? 'in' : 'out'} partyId={doc.party_id} docId={doc.id} onClose={() => setPaying(false)} />}
    </div>
  );
}
