import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, ClipboardCheck, PackagePlus, SlidersHorizontal, Receipt, ShoppingCart, Undo2, Truck } from 'lucide-react';
import { MOVE_LABEL, type MoveType } from '../data/models';
import { useActivity, useStores, useUsers, type ActivityRow } from '../hooks/data';
import { clock, dayLabel, qty, signed } from '../lib/format';
import { Empty, Field, List, Page, Row, Sheet } from '../components/ui';

const ICON: Record<MoveType, any> = {
  in: ArrowDownLeft, out: ArrowUpRight, transfer_in: ArrowLeftRight, transfer_out: ArrowLeftRight, adjust: ClipboardCheck, opening: PackagePlus,
  sale: Receipt, purchase: ShoppingCart, sale_return: Undo2, purchase_return: Undo2, challan: Truck,
};

/** One movement line: icon, item, action and ±qty. Shared with the dashboard. */
export function MoveLine({ m, sub }: { m: ActivityRow; sub: string }) {
  const Icon = ICON[m.type];
  const up = m.qty > 0;
  return (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${up ? 'bg-mint text-primary' : 'bg-[#FFEBEE] text-out'}`}><Icon size={18} /></span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{m.itemName}</div>
        <div className="truncate text-xs text-muted">{MOVE_LABEL[m.type]} · {sub}</div>
      </div>
      <div className="text-right">
        <div className={`font-semibold tabular-nums ${up ? 'text-primary' : 'text-out'}`}>{signed(m.qty)}</div>
        <div className="text-[11px] text-muted tabular-nums">= {qty(m.balanceAfter)} {m.unit}</div>
      </div>
    </>
  );
}

export default function Activity() {
  const nav = useNavigate();
  const users = useUsers();
  const stores = useStores(true);
  const [filters, setFilters] = useState<{ userId: string; type: string; storeId: string; from: string; to: string }>({ userId: '', type: '', storeId: '', from: '', to: '' });
  const [open, setOpen] = useState(false);
  const rows = useActivity({ userId: filters.userId || null, type: filters.type, storeId: filters.storeId || null, from: filters.from, to: filters.to });
  const active = Object.values(filters).filter(Boolean).length;

  const groups = useMemo(() => {
    const g: { day: string; rows: ActivityRow[] }[] = [];
    for (const r of rows ?? []) {
      const d = dayLabel(r.at);
      if (g.at(-1)?.day !== d) g.push({ day: d, rows: [] });
      g.at(-1)!.rows.push(r);
    }
    return g;
  }, [rows]);
  const multi = (stores?.length ?? 0) > 1;

  return (
    <Page title="Activity" action={
      <button className="tap relative flex w-11 items-center justify-center text-primary" onClick={() => setOpen(true)} aria-label="Filter">
        <SlidersHorizontal size={22} />{active > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">{active}</span>}
      </button>}>
      {rows === undefined ? null : groups.length ? groups.map((g) => (
        <section key={g.day}>
          <h2 className="section-title">{g.day}</h2>
          <List>
            {g.rows.map((m) => (
              <Row key={m.id} onClick={() => nav(`/items/${m.itemId}`)}>
                <MoveLine m={m} sub={[m.userName, clock(m.at), multi ? m.storeName : '', m.note].filter(Boolean).join(' · ')} />
              </Row>
            ))}
          </List>
        </section>
      )) : <Empty title={active ? 'Nothing matches these filters' : 'No activity yet'}>{active ? <button className="font-medium text-primary" onClick={() => setFilters({ userId: '', type: '', storeId: '', from: '', to: '' })}>Clear filters</button> : 'Every stock change will appear here with who made it and when.'}</Empty>}

      <Sheet open={open} onClose={() => setOpen(false)} title="Filter activity">
        <div className="space-y-4">
          <Field label="User">
            <select className="field" value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })}>
              <option value="">Everyone</option>{users?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select className="field" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">All types</option><option value="in">Stock in</option><option value="out">Stock out</option>
              <option value="adjust">Count adjust</option><option value="transfer">Transfers</option><option value="opening">Opening stock</option>
              <option value="sale">Sales</option><option value="purchase">Purchases</option><option value="sale_return">Sales returns</option><option value="purchase_return">Purchase returns</option><option value="challan">Challans</option>
            </select>
          </Field>
          {multi && (
            <Field label="Store">
              <select className="field" value={filters.storeId} onChange={(e) => setFilters({ ...filters, storeId: e.target.value })}>
                <option value="">All stores</option>{stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><input type="date" className="field" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
            <Field label="To"><input type="date" className="field" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
          </div>
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => setFilters({ userId: '', type: '', storeId: '', from: '', to: '' })}>Clear</button>
            <button className="btn-primary flex-1" onClick={() => setOpen(false)}>Show results</button>
          </div>
        </div>
      </Sheet>
    </Page>
  );
}
