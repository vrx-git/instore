import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Lock, ChevronRight } from 'lucide-react';
import { getSetting } from '../data/db';
import { useDashboard } from '../hooks/data';
import { useSession } from '../hooks/session';
import { money, qty, timeAgo } from '../lib/format';
import { Empty, List, Page, Row, StatCard, StockBadge } from '../components/ui';
import { MoveLine } from './Activity';
import { SyncIcon } from '../components/SyncUI';

export default function Dashboard() {
  const d = useDashboard();
  const nav = useNavigate();
  const { user, lock } = useSession();
  const business = useLiveQuery(() => getSetting('business_name'));
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <Page title={business || 'INSTORE'} action={<><SyncIcon /><button className="tap flex w-11 items-center justify-center text-primary" onClick={lock} aria-label="Lock"><Lock size={20} /></button></>}>
      <p className="-mt-1 mb-3 text-sm text-muted">{greet}, {user?.name.split(' ')[0]}</p>
      {!d ? null : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total items" value={d.itemCount} sub={`${qty(d.units)} units in stock`} tone="green" onClick={() => nav('/items')} />
            <StatCard label="Stock value" value={money(d.value)} sub="at purchase price" onClick={() => nav('/items')} />
            <StatCard label="Low stock" value={d.lowCount} sub="at or below alert level" tone={d.lowCount ? 'low' : 'default'} onClick={() => nav('/items?status=low')} />
            <StatCard label="Out of stock" value={d.outCount} sub="zero or less" tone={d.outCount ? 'out' : 'default'} onClick={() => nav('/items?status=out')} />
          </div>
          <div className="mt-3 flex gap-3">
            <div className="flex-1 rounded-2xl border border-line bg-white px-3.5 py-2.5 text-sm"><span className="text-muted">Today in </span><b className="text-primary tabular-nums">{d.todayIn ? `+${qty(d.todayIn)}` : 0}</b></div>
            <div className="flex-1 rounded-2xl border border-line bg-white px-3.5 py-2.5 text-sm"><span className="text-muted">Today out </span><b className="text-out tabular-nums">{d.todayOut ? `−${qty(d.todayOut)}` : 0}</b></div>
          </div>

          <div className="flex items-end justify-between"><h2 className="section-title">Needs attention</h2>
            {d.low.length > 0 && <button className="pb-2 text-sm font-medium text-primary" onClick={() => nav('/items?status=low')}>See all</button>}</div>
          {d.low.length ? (
            <List>
              {d.low.map((i) => (
                <Row key={i.id} onClick={() => nav(`/items/${i.id}`)}>
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{i.name}</div><div className="text-xs text-muted">Alert at {qty(i.lowStockQty)} {i.unit}</div></div>
                  <StockBadge status={i.status} qty={qty(i.stock)} unit={i.unit} />
                </Row>
              ))}
            </List>
          ) : <div className="card px-4 py-5 text-center text-sm text-muted">All items are above their alert level.</div>}

          <div className="flex items-end justify-between"><h2 className="section-title">Recent movements</h2>
            <button className="pb-2 text-sm font-medium text-primary" onClick={() => nav('/activity')}>Activity</button></div>
          {d.recent.length ? (
            <List>
              {d.recent.map((m) => (
                <Row key={m.id} onClick={() => nav(`/items/${m.itemId}`)}>
                  <MoveLine m={m} sub={`${m.userName} · ${timeAgo(m.at)}`} />
                  <ChevronRight size={16} className="text-line" />
                </Row>
              ))}
            </List>
          ) : (
            <div className="card"><Empty title="No stock movements yet">Add items, then use Scan or the + / − buttons to record stock.</Empty></div>
          )}
        </>
      )}
    </Page>
  );
}
