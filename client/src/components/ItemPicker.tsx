import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, Plus, ScanLine } from 'lucide-react';
import { api, qs } from '../lib/api';
import { money, qty } from '../lib/format';
import { ItemForm } from './ItemForm';
import { Modal } from './ui';

/**
 * Search box for picking items. Type a name/code, or scan a barcode with a USB scanner
 * (it types the code + Enter) or the camera. Calls onPick(item).
 */
export function ItemPicker({ storeId, onPick, priceField = 'sale_price' }: { storeId?: number | string; onPick: (item: any) => void; priceField?: 'sale_price' | 'purchase_price' }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const items = useQuery({ queryKey: ['items', String(storeId ?? ''), '', false], queryFn: () => api.get(`/items${qs({ store_id: storeId })}`) });

  const matches = useMemo(() => {
    const s = text.trim().toLowerCase();
    const all = items.data ?? [];
    if (!s) return all.slice(0, 30);
    return all.filter((i: any) => i.name.toLowerCase().includes(s) || i.sku?.toLowerCase().includes(s) || i.barcode === text.trim()).slice(0, 30);
  }, [text, items.data]);

  const pick = (item: any) => {
    onPick(item);
    setText('');
    setOpen(false);
    setActive(0);
    ref.current?.focus();
  };

  const byCode = async (code: string) => {
    const exact = (items.data ?? []).find((i: any) => i.barcode === code || i.sku?.toLowerCase() === code.toLowerCase());
    if (exact) return pick(exact);
    try { pick(await api.get(`/items/barcode/${encodeURIComponent(code)}`)); } catch { /* not a code; leave text */ }
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input ref={ref} className="input pl-8" placeholder="Search item by name / code, or scan barcode…" value={text}
            onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter') {
                e.preventDefault();
                const exact = matches.find((m: any) => m.barcode === text.trim() || m.sku === text.trim());
                if (exact) pick(exact);
                else if (matches[active] && text) pick(matches[active]);
                else if (text) byCode(text.trim());
              }
              if (e.key === 'Escape') setOpen(false);
            }} />
        </div>
        <button type="button" className="btn-secondary" onClick={() => setScanning(true)} title="Scan with camera"><Camera size={16} /></button>
        <button type="button" className="btn-secondary" onClick={() => setAdding(true)} title="New item"><Plus size={16} /> New</button>
      </div>
      {open && matches.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {matches.map((m: any, i: number) => (
            <button type="button" key={m.id} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === active ? 'bg-brand/10' : 'hover:bg-slate-50'}`}>
              <span><span className="font-medium">{m.name}</span> <span className="text-xs text-slate-500">{m.sku}</span></span>
              <span className="text-xs text-slate-500">
                <span className={m.stock <= 0 ? 'text-red-600' : ''}>{qty(m.stock)} {m.unit}</span> · {money(m[priceField])}
              </span>
            </button>
          ))}
        </div>
      )}
      {adding && <ItemForm open onClose={() => setAdding(false)} onSaved={async (id) => { await items.refetch(); pick(await api.get(`/items/${id}`)); }} />}
      {scanning && <CameraScanner onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); byCode(c); }} />}
    </div>
  );
}

export function CameraScanner({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const [error, setError] = useState('');
  useEffect(() => {
    let scanner: any;
    let stopped = false;
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (stopped) return;
      scanner = new Html5Qrcode('sr-scanner');
      scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 140 } },
        (code: string) => { scanner.stop().catch(() => {}); onCode(code); }, () => {})
        .catch((e: any) => setError(String(e?.message || e || 'Camera not available')));
    });
    return () => { stopped = true; scanner?.isScanning && scanner.stop().catch(() => {}); };
  }, [onCode]);
  return (
    <Modal open onClose={onClose} title="Scan barcode">
      <div id="sr-scanner" className="overflow-hidden rounded-md bg-black" />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-slate-500">Point the camera at the barcode. A USB barcode scanner also works directly in the search box.</p>
    </Modal>
  );
}
