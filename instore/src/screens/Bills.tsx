import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Receipt, ShoppingCart, FileText, ClipboardList, Truck, Undo2, FileInput, Redo2 } from 'lucide-react';
import type { DocType } from '../data/models';
import { useDocs } from '../hooks/billing';
import { useSession } from '../hooks/session';
import { BILL_GROUPS, DOCS, NEW_BILL_TYPES } from '../lib/docTypes';
import { fmtDate, money } from '../lib/format';
import { Chips, Empty, List, Page, Row, SearchBar, Sheet, StatCard } from '../components/ui';
import { StatusPill } from './BillView';

const ICON: Record<DocType, any> = {
  sales_invoice: Receipt, purchase_invoice: ShoppingCart, quotation: FileText, sales_order: ClipboardList,
  delivery_challan: Truck, purchase_order: FileInput, sales_return: Undo2, purchase_return: Redo2,
};

export default function Bills() {
  const nav = useNavigate();
  const { isOwner } = useSession();
  const [params, setParams] = useSearchParams();
  const group = BILL_GROUPS.find((g) => g.id === params.get('g')) ?? BILL_GROUPS[0];
  const [search, setSearch] = useState('');
  const [choosing, setChoosing] = useState(false);
  const docs = useDocs(group.types, search);
  const live = (docs ?? []).filter((d) => d.status !== 'cancelled');
  const isInv = group.id === 'sales' || group.id === 'purchases';
  const monthStart = new Date().toISOString().slice(0, 8) + '01';
  const month = live.filter((d) => d.date >= monthStart);

  return (
    <Page title="Bills" action={<button className="tap flex w-11 items-center justify-center text-primary" onClick={() => setChoosing(true)} aria-label="New bill"><Plus size={26} /></button>}>
      <div className="pt-2">
        <Chips options={BILL_GROUPS.map((g) => ({ id: g.id, label: g.label }))} value={group.id} onChange={(g) => setParams({ g }, { replace: true })} />
        <SearchBar value={search} onChange={setSearch} placeholder="Number or party" />
      </div>

      {isInv && docs && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <StatCard label="This month" value={money(month.reduce((s, d) => s + d.total, 0))} sub={`${month.length} bills`} tone="green" />
          <StatCard label={group.id === 'sales' ? 'To receive' : 'To pay'} value={money(live.reduce((s, d) => s + Math.max(0, d.due), 0))} sub="unpaid bills" tone={group.id === 'sales' ? 'default' : 'out'} />
        </div>
      )}

      {docs === undefined ? null : docs.length ? (
        <List className="mt-3">
          {docs.map((d) => {
            const Icon = ICON[d.type];
            return (
              <Row key={d.id} onClick={() => nav(`/bills/${d.id}`)}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-primary"><Icon size={18} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.partyName}</div>
                  <div className="truncate text-xs text-muted">{d.number}{d.duplicate ? ' ⚠' : ''} · {fmtDate(d.date)}{group.types.length > 1 ? ` · ${DOCS[d.type].short}` : ''}</div>
                </div>
                <div className="text-right">
                  <div className={`font-semibold tabular-nums ${d.status === 'cancelled' ? 'text-muted line-through' : ''}`}>{money(d.total)}</div>
                  {isInv && d.status !== 'cancelled'
                    ? <div className={`text-xs ${d.due > 0.009 ? 'text-out' : 'text-primary'}`}>{d.due > 0.009 ? `Due ${money(d.due)}` : 'Paid'}</div>
                    : <StatusPill status={d.status} />}
                </div>
              </Row>
            );
          })}
        </List>
      ) : (
        <Empty title={search ? 'No matching bills' : `No ${group.label.toLowerCase()} yet`}>
          {!search && <button className="btn-primary mt-2" onClick={() => nav(`/bills/new/${group.types[0]}`)}><Plus size={18} /> New {DOCS[group.types[0]].short}</button>}
        </Empty>
      )}
      {isOwner && group.id === 'sales' && docs && docs.length > 0 && <p className="px-1 pt-2 text-xs text-muted">Profit this month: {money(month.reduce((s, d) => s + d.profit, 0))}</p>}

      <Sheet open={choosing} onClose={() => setChoosing(false)} title="New bill">
        <List>
          {NEW_BILL_TYPES.map((t) => {
            const Icon = ICON[t];
            return <Row key={t} onClick={() => { setChoosing(false); nav(`/bills/new/${t}`); }}><Icon size={20} className="text-primary" /><span className="flex-1 font-medium">{DOCS[t].label}</span></Row>;
          })}
        </List>
      </Sheet>
    </Page>
  );
}
