import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Phone, MessageCircle, Wallet, Receipt, Pencil, Trash2, Printer } from 'lucide-react';
import { useParties, useParty } from '../hooks/billing';
import { useSession } from '../hooks/session';
import { removeParty } from '../services/parties';
import { DOCS } from '../lib/docTypes';
import { fmtDate, money } from '../lib/format';
import { Chips, Empty, List, Page, Row, SearchBar, Segmented, StatCard, useToast } from '../components/ui';
import { BalanceText, PartyFormSheet } from '../components/PartySheets';
import { PaymentSheet } from '../components/PaymentSheet';

export function PartiesScreen() {
  const nav = useNavigate();
  const [filter, setFilter] = useState<'all' | 'customer' | 'supplier'>('all');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const rows = useParties(filter, search);
  const receive = (rows ?? []).filter((p) => p.balance > 0).reduce((s, p) => s + p.balance, 0);
  const pay = -(rows ?? []).filter((p) => p.balance < 0).reduce((s, p) => s + p.balance, 0);
  return (
    <Page title="Parties" back action={<button className="tap flex w-11 items-center justify-center text-primary" onClick={() => setAdding(true)} aria-label="Add party"><Plus size={26} /></button>}>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <StatCard label="To receive" value={money(receive)} tone="green" />
        <StatCard label="To pay" value={money(pay)} tone={pay ? 'out' : 'default'} />
      </div>
      <Chips options={[{ id: 'all', label: 'All' }, { id: 'customer', label: 'Customers' }, { id: 'supplier', label: 'Suppliers' }]} value={filter} onChange={setFilter} />
      <SearchBar value={search} onChange={setSearch} placeholder="Name, phone or GSTIN" />
      {rows === undefined ? null : rows.length ? (
        <List className="mt-3">
          {rows.map((p) => (
            <Row key={p.id} onClick={() => nav(`/parties/${p.id}`)}>
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{p.name}</div><div className="truncate text-xs capitalize text-muted">{[p.type, p.phone].filter(Boolean).join(' · ')}</div></div>
              <BalanceText value={p.balance} small />
            </Row>
          ))}
        </List>
      ) : <Empty title="No parties yet"><button className="btn-primary mt-2" onClick={() => setAdding(true)}><Plus size={18} /> Add customer or supplier</button></Empty>}
      <PartyFormSheet open={adding} onClose={() => setAdding(false)} defaultType={filter === 'supplier' ? 'supplier' : 'customer'} onSaved={(id) => nav(`/parties/${id}`)} />
    </Page>
  );
}

const KIND: Record<string, string> = { payment_in: 'Payment received', payment_out: 'Payment made', ...Object.fromEntries(Object.entries(DOCS).map(([k, v]) => [k, v.label])) };
const bal = (b: number) => (Math.abs(b) < 0.01 ? '0' : `${money(Math.abs(b))} ${b > 0 ? 'Dr' : 'Cr'}`);

export function PartyDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { isOwner } = useSession();
  const data = useParty(id);
  const [tab, setTab] = useState<'ledger' | 'bills'>('ledger');
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  if (data === undefined) return null;
  if (data === null) return <Page title="Party" back><Empty title="Party not found" /></Page>;
  const { party, balance, rows, docs } = data;
  const supplier = party.type === 'supplier';
  const phone = party.phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1');

  return (
    <Page title={party.name} back large={false} action={<button className="tap flex w-11 items-center justify-center text-primary" onClick={() => setEditing(true)} aria-label="Edit"><Pencil size={20} /></button>}>
      <div className="space-y-3 pt-3">
        <div className="card p-4 text-center">
          <div className="text-xs capitalize text-muted">{party.type}{party.state ? ` · ${party.state}` : ''}{party.gstin ? ` · ${party.gstin}` : ''}</div>
          <div className="mt-2 text-2xl"><BalanceText value={balance} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={() => setPaying(true)}><Wallet size={18} /> {balance < 0 || supplier ? 'Make payment' : 'Receive payment'}</button>
          <button className="btn-soft" onClick={() => nav(`/bills/new/${supplier ? 'purchase_invoice' : 'sales_invoice'}?party=${party.id}`)}><Receipt size={18} /> {supplier ? 'Purchase' : 'Invoice'}</button>
          {party.phone && <a className="btn-soft" href={`tel:${party.phone}`}><Phone size={18} /> Call</a>}
          {party.phone && <a className="btn-soft" target="_blank" rel="noreferrer" href={`https://wa.me/${phone}?text=${encodeURIComponent(balance > 0 ? `Hello ${party.name}, your pending balance is ${money(balance)}. Thank you.` : `Hello ${party.name}`)}`}><MessageCircle size={18} /> WhatsApp</a>}
        </div>

        <Segmented options={[{ id: 'ledger', label: 'Ledger' }, { id: 'bills', label: `Bills (${docs.length})` }]} value={tab} onChange={setTab} />

        {tab === 'ledger' && (
          <>
            <div id="bill-print" className="card overflow-hidden">
              <style>{'@media print { body * { visibility: hidden; } #bill-print, #bill-print * { visibility: visible; } #bill-print { position: absolute; left: 0; top: 0; width: 100%; } }'}</style>
              <div className="hidden px-4 pt-3 font-bold print:block">Party ledger — {party.name}</div>
              <div className="flex justify-between border-b border-line/70 bg-mint/50 px-4 py-2 text-sm"><span>Opening balance</span><span className="font-medium">{bal(data.opening)}</span></div>
              {rows.map((r, i) => (
                <button key={i} className="flex w-full items-center gap-3 border-b border-line/70 px-4 py-2.5 text-left active:bg-mint" onClick={() => !r.kind.startsWith('payment') && nav(`/bills/${r.refId}`)}>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{KIND[r.kind]}</div><div className="text-xs text-muted">{fmtDate(r.date)} · {r.ref}</div></div>
                  <div className="text-right"><div className={`text-sm font-semibold tabular-nums ${r.debit ? 'text-ink' : 'text-primary'}`}>{r.debit ? `+${money(r.debit)}` : `−${money(r.credit)}`}</div><div className="text-[11px] text-muted">{bal(r.balance)}</div></div>
                </button>
              ))}
              <div className="flex justify-between bg-mint/50 px-4 py-2 text-sm font-semibold"><span>Closing balance</span><span>{bal(data.closing)}</span></div>
            </div>
            <div className="flex items-center justify-between px-1 text-xs text-muted">
              <span>Dr = to receive · Cr = to pay</span>
              <button className="flex items-center gap-1 font-medium text-primary" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
            </div>
          </>
        )}
        {tab === 'bills' && (docs.length ? (
          <List>{docs.map((d) => (
            <Row key={d.id} onClick={() => nav(`/bills/${d.id}`)}>
              <div className="min-w-0 flex-1"><div className="font-medium">{d.number}</div><div className="text-xs text-muted">{DOCS[d.type].short} · {fmtDate(d.date)}</div></div>
              <span className={`font-semibold tabular-nums ${d.status === 'cancelled' ? 'text-muted line-through' : ''}`}>{money(d.total)}</span>
            </Row>
          ))}</List>
        ) : <Empty title="No bills yet" />)}

        {isOwner && (
          <button className="btn-outline w-full text-muted" onClick={async () => { if (!window.confirm(`Remove ${party.name}?`)) return; const r = await removeParty(party.id); toast(r === 'hidden' ? 'Hidden (has bills, history kept)' : 'Party deleted'); nav('/parties', { replace: true }); }}>
            <Trash2 size={18} /> Remove party
          </button>
        )}
      </div>
      <PartyFormSheet open={editing} onClose={() => setEditing(false)} party={party} />
      <PaymentSheet open={paying} onClose={() => setPaying(false)} direction={balance < 0 || supplier ? 'out' : 'in'} partyId={party.id} />
    </Page>
  );
}
