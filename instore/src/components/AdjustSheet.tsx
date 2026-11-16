import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Item } from '../data/models';
import { useStores } from '../hooks/data';
import { useUserId } from '../hooks/session';
import { issue, receive, setCount, stockOf, transfer } from '../services/stock';
import { qty as fq, buzz } from '../lib/format';
import { Field, QtyInput, Segmented, Sheet, useToast } from './ui';

export type AdjustMode = 'in' | 'out' | 'count' | 'transfer';

/** Sheet for a stock change on one item: in / out / physical count / transfer. */
export function AdjustSheet({ item, open, onClose, initialMode = 'in', initialStoreId, onDone }: {
  item: Item | null; open: boolean; onClose: () => void; initialMode?: AdjustMode; initialStoreId?: number;
  onDone?: (summary: { mode: AdjustMode; qty: number; itemName: string }) => void;
}) {
  const stores = useStores();
  const userId = useUserId();
  const toast = useToast();
  const [mode, setMode] = useState<AdjustMode>(initialMode);
  const [storeId, setStoreId] = useState<number | undefined>(initialStoreId);
  const [toStoreId, setToStoreId] = useState<number | undefined>();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode); setQty(1); setNote(''); setStoreId(initialStoreId);
  }, [open, item?.id, initialMode, initialStoreId]);

  const sid = storeId ?? stores?.[0]?.id;
  const tid = toStoreId && toStoreId !== sid ? toStoreId : stores?.find((s) => s.id !== sid)?.id;
  const current = useLiveQuery(() => (item?.id && sid ? stockOf(item.id, sid) : Promise.resolve(0)), [item?.id, sid]) ?? 0;
  useEffect(() => { if (mode === 'count') setQty(Math.max(0, current)); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null;
  const after = mode === 'in' ? current + (qty || 0) : mode === 'out' || mode === 'transfer' ? current - (qty || 0) : qty || 0;

  const save = async () => {
    if (!sid) return;
    setBusy(true);
    try {
      if (mode === 'in') await receive(item.id!, sid, qty, userId, note);
      else if (mode === 'out') await issue(item.id!, sid, qty, userId, note);
      else if (mode === 'transfer') { if (!tid) throw new Error('Add a second store in Settings to transfer'); await transfer(item.id!, sid, tid, qty, userId, note); }
      else await setCount(item.id!, sid, qty, userId, note);
      buzz();
      toast(mode === 'count' ? `Count saved: ${fq(qty)} ${item.unit}` : `${mode === 'in' ? 'Added' : mode === 'out' ? 'Removed' : 'Moved'} ${fq(qty)} ${item.unit}`);
      onDone?.({ mode, qty, itemName: item.name });
      onClose();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally { setBusy(false); }
  };

  const modes: { id: AdjustMode; label: string }[] = [
    { id: 'in', label: 'Add' }, { id: 'out', label: 'Remove' }, { id: 'count', label: 'Count' },
    ...((stores?.length ?? 0) > 1 ? [{ id: 'transfer' as AdjustMode, label: 'Move' }] : []),
  ];

  return (
    <Sheet open={open} onClose={onClose} title={item.name}>
      <div className="space-y-4">
        <Segmented options={modes} value={mode} onChange={setMode} />
        {(stores?.length ?? 0) > 1 && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={mode === 'transfer' ? 'From' : 'Store'} className={mode === 'transfer' ? '' : 'col-span-2'}>
              <select className="field" value={sid} onChange={(e) => setStoreId(Number(e.target.value))}>
                {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            {mode === 'transfer' && (
              <Field label="To">
                <select className="field" value={tid} onChange={(e) => setToStoreId(Number(e.target.value))}>
                  {stores?.filter((s) => s.id !== sid).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            )}
          </div>
        )}
        <Field label={mode === 'count' ? `Counted quantity (${item.unit})` : `Quantity (${item.unit})`}>
          <QtyInput value={qty} onChange={setQty} />
        </Field>
        <div className="flex justify-between rounded-xl bg-mint px-4 py-3 text-sm">
          <span className="text-muted">Now <b className="text-ink tabular-nums">{fq(current)}</b></span>
          <span className="text-muted">After <b className={`tabular-nums ${after < 0 ? 'text-out' : 'text-primary'}`}>{fq(after)}</b> {item.unit}</span>
        </div>
        <Field label="Note (optional)">
          <input className="field" placeholder={mode === 'out' ? 'e.g. sold, damaged, sent to site' : mode === 'in' ? 'e.g. supplier delivery' : ''} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button className="btn-primary w-full text-[17px]" disabled={busy || !(qty > 0 || (mode === 'count' && qty >= 0))} onClick={save}>
          {mode === 'in' ? 'Add stock' : mode === 'out' ? 'Remove stock' : mode === 'transfer' ? 'Move stock' : 'Save count'}
        </button>
      </div>
    </Sheet>
  );
}
