import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus, SlidersHorizontal, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { useItem, useUsers, useStores } from '../hooks/data';
import { useSession, useUserId } from '../hooks/session';
import { archiveItem } from '../services/items';
import { deleteMove, quickAdjust } from '../services/stock';
import { MOVE_LABEL } from '../data/models';
import { money, qty, signed, timeAgo, buzz } from '../lib/format';
import { Empty, List, Page, Row, StockBadge, useToast } from '../components/ui';
import { AdjustSheet, type AdjustMode } from '../components/AdjustSheet';

export default function ItemDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const data = useItem(id ?? '');
  const users = useUsers();
  const stores = useStores();
  const userId = useUserId();
  const { isOwner } = useSession();
  const [storeId, setStoreId] = useState<string | undefined>();
  const [sheet, setSheet] = useState<AdjustMode | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (data === undefined) return null;
  if (data === null) return <Page title="Item" back><Empty title="Item not found" /></Page>;
  const { item, stock, status, perStore, moves, categoryName } = data;
  const sid = storeId ?? stores?.[0]?.id;
  const multi = (stores?.length ?? 0) > 1;
  const userName = (uid: string) => users?.find((u) => u.id === uid)?.name ?? 'Unknown';
  const storeName = (s: string) => perStore.find((p) => p.id === s)?.name ?? '';

  const quick = async (delta: number) => {
    if (!sid) return;
    try { await quickAdjust(item.id!, sid, delta, userId); buzz(); }
    catch (e: any) { toast(e.message, 'error'); }
  };

  const details: [string, string][] = [
    ['SKU', item.sku || '—'], ['Barcode', item.barcode || '—'], ['Category', categoryName || '—'], ['Location', item.location || '—'],
    ['Unit', item.unit], ['Purchase price', money(item.purchasePrice)], ['Sale price', money(item.salePrice)],
    ['GST', `${item.gstRate}%`], ['HSN', item.hsn || '—'], ['Low stock alert', item.lowStockQty ? `${qty(item.lowStockQty)} ${item.unit}` : 'Off'],
    ['Stock value', money(Math.max(0, stock) * item.purchasePrice)],
  ];

  return (
    <Page title={item.name} back large={false}
      action={isOwner && <button className="tap flex w-11 items-center justify-center text-primary" onClick={() => nav(`/items/${item.id}/edit`)} aria-label="Edit item"><Pencil size={20} /></button>}>
      <div className="pt-4 text-center">
        {!item.active && <div className="mb-2 inline-block rounded-full bg-[#FFEBEE] px-3 py-1 text-xs font-semibold text-out">Archived</div>}
        <h2 className="text-[22px] font-bold leading-tight">{item.name}</h2>
        <div className="mt-1 text-sm text-muted">{[item.sku, categoryName].filter(Boolean).join(' · ')}</div>
        <div className="mt-4 text-[48px] font-bold leading-none tabular-nums text-ink">{qty(multi && sid ? perStore.find((p) => p.id === sid)?.stock ?? 0 : stock)}<span className="ml-1 text-lg font-medium text-muted">{item.unit}</span></div>
        <div className="mt-2"><StockBadge status={status} /></div>
        {multi && <div className="mt-1 text-xs text-muted">{qty(stock)} {item.unit} across all stores</div>}
      </div>

      {multi && (
        <select className="field mt-4" value={sid} onChange={(e) => setStoreId(e.target.value)} aria-label="Store for quick actions">
          {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}

      <div className="mt-4 grid grid-cols-[1fr_1fr] gap-3">
        <button className="btn h-16 border border-out/25 bg-white text-out" onClick={() => quick(-1)} aria-label="Remove one"><Minus size={28} /></button>
        <button className="btn h-16 bg-primary text-white" onClick={() => quick(1)} aria-label="Add one"><Plus size={28} /></button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button className="btn-soft" onClick={() => setSheet('in')}><SlidersHorizontal size={18} /> Adjust…</button>
        <button className="btn-soft" onClick={() => setSheet('count')}>Stock count</button>
      </div>

      {multi && (
        <>
          <h3 className="section-title">Stock by location</h3>
          <List>{perStore.map((s) => (
            <Row key={s.id}><span className="flex-1">{s.name}</span><span className="font-semibold tabular-nums">{qty(s.stock)} {item.unit}</span></Row>
          ))}</List>
        </>
      )}

      <h3 className="section-title">Details</h3>
      <List>{details.map(([k, v]) => <Row key={k}><span className="flex-1 text-muted">{k}</span><span className="font-medium">{v}</span></Row>)}</List>

      <h3 className="section-title">History</h3>
      {moves.length ? (
        <List>
          {(showAll ? moves : moves.slice(0, 15)).map((m) => (
            <Row key={m.id}>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{MOVE_LABEL[m.type]}{multi && <span className="font-normal text-muted"> · {storeName(m.storeId)}</span>}</div>
                <div className="truncate text-xs text-muted">{userName(m.userId)} · {timeAgo(m.at)}{m.note ? ` · ${m.note}` : ''}</div>
              </div>
              <div className="text-right">
                <div className={`font-semibold tabular-nums ${m.qty > 0 ? 'text-primary' : 'text-out'}`}>{signed(m.qty)}</div>
                <div className="text-xs text-muted tabular-nums">= {qty(m.balanceAfter)}</div>
              </div>
              {isOwner && !m.docId && (
                <button className="flex h-9 w-8 items-center justify-center text-muted" aria-label="Delete entry"
                  onClick={() => window.confirm('Delete this entry? Stock will be recalculated.') && deleteMove(m.id!).then(() => toast('Entry deleted'))}>
                  <Trash2 size={15} />
                </button>
              )}
            </Row>
          ))}
          {moves.length > 15 && !showAll && <Row onClick={() => setShowAll(true)} className="justify-center font-medium text-primary">Show all {moves.length}</Row>}
        </List>
      ) : <div className="card px-4 py-5 text-center text-sm text-muted">No stock movements yet.</div>}

      {isOwner && (
        <button className="btn-outline mt-6 w-full text-muted" onClick={async () => { await archiveItem(item.id!, item.active ? 0 : 1); toast(item.active ? 'Item archived' : 'Item restored'); if (item.active) nav('/items'); }}>
          {item.active ? <><Archive size={18} /> Archive item</> : <><ArchiveRestore size={18} /> Restore item</>}
        </button>
      )}

      <AdjustSheet item={item} open={!!sheet} initialMode={sheet ?? 'in'} initialStoreId={sid} onClose={() => setSheet(null)} />
    </Page>
  );
}
