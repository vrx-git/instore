import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useCategories, useItems, useStores } from '../hooks/data';
import { useSession } from '../hooks/session';
import { qty, money } from '../lib/format';
import { Chips, Empty, List, Page, Row, SearchBar, StockBadge } from '../components/ui';

export default function Items() {
  const nav = useNavigate();
  const { isOwner } = useSession();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as 'all' | 'low' | 'out') || 'all';
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | 0>(0);
  const [storeId, setStoreId] = useState<number | 0>(0);
  const cats = useCategories();
  const stores = useStores();
  const items = useItems({ search, status, categoryId: categoryId || null, storeId: storeId || null });

  const setStatus = (s: string) => setParams(s === 'all' ? {} : { status: s }, { replace: true });

  return (
    <Page title="Items" action={isOwner && <button className="tap flex w-11 items-center justify-center text-primary" onClick={() => nav('/items/new')} aria-label="Add item"><Plus size={26} /></button>}>
      <div className="pb-1 pt-2">
        <SearchBar value={search} onChange={setSearch} placeholder="Name, SKU, barcode or shelf" />
        <Chips<string>
          options={[{ id: 'all', label: 'All' }, { id: 'low', label: 'Low stock' }, { id: 'out', label: 'Out of stock' },
            ...(cats ?? []).map((c) => ({ id: `c${c.id}`, label: c.name }))]}
          value={categoryId ? `c${categoryId}` : status}
          onChange={(v) => { if (v.startsWith('c')) { setCategoryId(categoryId === Number(v.slice(1)) ? 0 : Number(v.slice(1))); } else { setCategoryId(0); setStatus(v); } }} />
        {(stores?.length ?? 0) > 1 && (
          <select className="field mb-1 py-2" value={storeId} onChange={(e) => setStoreId(Number(e.target.value))} aria-label="Store">
            <option value={0}>All stores</option>
            {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {items === undefined ? null : items.length ? (
        <>
          <div className="px-1 pb-2 pt-2 text-xs text-muted">{items.length} {items.length === 1 ? 'item' : 'items'} · {money(items.reduce((s, i) => s + Math.max(0, i.value), 0))}</div>
          <List>
            {items.map((i) => (
              <Row key={i.id} onClick={() => nav(`/items/${i.id}`)}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{i.name}</div>
                  <div className="truncate text-xs text-muted">{[i.sku, i.categoryName, i.location].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <StockBadge status={i.status} qty={qty(i.stock)} unit={i.unit} />
              </Row>
            ))}
          </List>
        </>
      ) : (
        <Empty title={search || status !== 'all' || categoryId ? 'No matching items' : 'No items yet'}>
          {search || status !== 'all' || categoryId ? 'Try a different search or filter.' : isOwner ? <button className="btn-primary mt-2" onClick={() => nav('/items/new')}><Plus size={18} /> Add your first item</button> : 'Ask an owner to add items.'}
        </Empty>
      )}
    </Page>
  );
}
