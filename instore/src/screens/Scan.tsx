import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, CameraOff, Plus, Zap } from 'lucide-react';
import type { Item } from '../data/models';
import { findByCode, matches } from '../services/items';
import { issue, receive } from '../services/stock';
import { db } from '../data/db';
import { useSession, useUserId } from '../hooks/session';
import { useStores } from '../hooks/data';
import { qty, buzz } from '../lib/format';
import { List, Page, Row, Segmented, Sheet, useToast } from '../components/ui';
import { Scanner } from '../components/Scanner';
import { AdjustSheet, type AdjustMode } from '../components/AdjustSheet';

type Tally = { key: number; itemId: number; name: string; unit: string; mode: AdjustMode; qty: number };

export default function Scan() {
  const nav = useNavigate();
  const toast = useToast();
  const userId = useUserId();
  const { isOwner } = useSession();
  const stores = useStores();
  const [camera, setCamera] = useState(true);
  const [mode, setMode] = useState<AdjustMode>('in');
  const [fast, setFast] = useState(false);
  const [storeId, setStoreId] = useState<number | undefined>();
  const [code, setCode] = useState('');
  const [item, setItem] = useState<Item | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [choices, setChoices] = useState<Item[]>([]);
  const [tally, setTally] = useState<Tally[]>([]);
  const sid = storeId ?? stores?.[0]?.id;

  const record = (it: Item, m: AdjustMode, q: number) =>
    setTally((t) => [{ key: Date.now() + Math.random(), itemId: it.id!, name: it.name, unit: it.unit, mode: m, qty: q }, ...t].slice(0, 50));

  const handle = useCallback(async (raw: string) => {
    const c = raw.trim();
    if (!c) return;
    const found = await findByCode(c);
    if (found) {
      if (!found.active) { toast(`${found.name} is archived`, 'error'); return; }
      if (fast && sid && (mode === 'in' || mode === 'out')) {
        try {
          await (mode === 'in' ? receive : issue)(found.id!, sid, 1, userId, 'Scan');
          buzz(); record(found, mode, 1);
          toast(`${mode === 'in' ? '+1' : '−1'} ${found.name}`);
        } catch (e: any) { toast(e.message, 'error'); }
        return;
      }
      setItem(found);
      return;
    }
    // Not a code: try a name search for manual entry.
    const byName = (await db.items.filter((i) => !!i.active).toArray()).filter((i) => matches(i, c)).slice(0, 8);
    if (byName.length === 1) setItem(byName[0]);
    else if (byName.length > 1) setChoices(byName);
    else setUnknown(c);
  }, [fast, mode, sid, userId, toast]);

  const sheetOpen = !!item || !!unknown || choices.length > 0;

  return (
    <Page title="Scan" action={
      <button className="tap flex w-11 items-center justify-center text-primary" onClick={() => setCamera((c) => !c)} aria-label={camera ? 'Turn camera off' : 'Turn camera on'}>
        {camera ? <CameraOff size={22} /> : <Camera size={22} />}
      </button>}>
      <div className="space-y-3 pt-2">
        <Segmented options={[{ id: 'in', label: 'Stock in' }, { id: 'out', label: 'Stock out' }, { id: 'count', label: 'Count' }]} value={mode} onChange={setMode} />
        {camera && <Scanner onCode={handle} paused={sheetOpen} />}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); handle(code); setCode(''); }}>
          <input className="field" placeholder="Type barcode, SKU or name" value={code} onChange={(e) => setCode(e.target.value)} enterKeyHint="go" autoCapitalize="off" aria-label="Code or name" />
          <button className="btn-primary px-5" disabled={!code.trim()}>Go</button>
        </form>
        <div className="flex items-center gap-3">
          {(stores?.length ?? 0) > 1 && (
            <select className="field flex-1 py-2" value={sid} onChange={(e) => setStoreId(Number(e.target.value))} aria-label="Store">
              {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {mode !== 'count' && (
            <label className={`tap flex items-center gap-2 rounded-xl border px-3 text-sm font-medium ${fast ? 'border-primary bg-mint text-primary' : 'border-line bg-white text-muted'}`}>
              <input type="checkbox" className="sr-only" checked={fast} onChange={(e) => setFast(e.target.checked)} />
              <Zap size={16} /> 1 per scan
            </label>
          )}
        </div>
        <p className="px-1 text-xs text-muted">{fast && mode !== 'count' ? `Each scan ${mode === 'in' ? 'adds' : 'removes'} 1 straight away.` : 'Scan or type a code, then enter the quantity.'} Bluetooth/USB barcode scanners type into the box above.</p>
      </div>

      {tally.length > 0 && (
        <>
          <div className="flex items-end justify-between"><h2 className="section-title">This session</h2>
            <button className="pb-2 text-sm text-muted" onClick={() => setTally([])}>Clear</button></div>
          <List>
            {tally.map((t) => (
              <Row key={t.key} onClick={() => nav(`/items/${t.itemId}`)}>
                <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                <span className={`font-semibold tabular-nums ${t.mode === 'out' ? 'text-out' : 'text-primary'}`}>
                  {t.mode === 'count' ? `= ${qty(t.qty)}` : t.mode === 'out' ? `−${qty(t.qty)}` : t.mode === 'transfer' ? `⇄ ${qty(t.qty)}` : `+${qty(t.qty)}`} {t.unit}
                </span>
              </Row>
            ))}
          </List>
        </>
      )}

      <AdjustSheet item={item} open={!!item} initialMode={mode} initialStoreId={sid} onClose={() => setItem(null)}
        onDone={({ mode: m, qty: q }) => item && record(item, m, q)} />

      <Sheet open={!!unknown} onClose={() => setUnknown(null)} title="Not found">
        <p className="mb-4 text-muted">No item has the code <b className="text-ink">{unknown}</b>.</p>
        {isOwner
          ? <button className="btn-primary w-full" onClick={() => { const c = unknown!; setUnknown(null); nav(`/items/new?barcode=${encodeURIComponent(c)}`); }}><Plus size={18} /> Create item with this barcode</button>
          : <p className="mb-2 text-sm text-muted">Ask an owner to add this item.</p>}
        <button className="btn-outline mt-2 w-full" onClick={() => setUnknown(null)}>Scan again</button>
      </Sheet>

      <Sheet open={choices.length > 0} onClose={() => setChoices([])} title="Choose item">
        <List>{choices.map((c) => <Row key={c.id} onClick={() => { setChoices([]); setItem(c); }}><span className="flex-1 font-medium">{c.name}</span><span className="text-sm text-muted">{c.sku}</span></Row>)}</List>
      </Sheet>
    </Page>
  );
}
