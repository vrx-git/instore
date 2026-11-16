import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, X, PackageOpen } from 'lucide-react';
import type { StockStatus } from '../data/models';

// ---------- toast ----------
const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; kind: 'ok' | 'error'; id: number } | null>(null);
  const show = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now();
    setT({ msg, kind, id });
    setTimeout(() => setT((cur) => (cur?.id === id ? null : cur)), kind === 'error' ? 3500 : 1800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div role="status" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center pt-safe">
          <div className={`mt-2 rounded-full px-4 py-2 text-sm font-medium text-white ${t.kind === 'error' ? 'bg-out' : 'bg-ink'}`}>{t.msg}</div>
        </div>
      )}
    </ToastCtx.Provider>
  );
}

// ---------- page chrome ----------
export function Page({ title, back, action, children, large = true }: { title: string; back?: boolean | string; action?: ReactNode; children: ReactNode; large?: boolean }) {
  const nav = useNavigate();
  return (
    <div className="min-h-full pb-28">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-bg/95 px-4 pb-2 pt-safe backdrop-blur">
        <div className="flex h-9 items-center justify-between">
          {back ? (
            <button className="tap -ml-2 flex items-center pr-2 text-primary" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} aria-label="Back">
              <ChevronLeft size={26} /> <span className="text-[17px]">Back</span>
            </button>
          ) : <span />}
          {!large && <h1 className="absolute left-1/2 max-w-[55%] -translate-x-1/2 truncate text-[17px] font-semibold">{title}</h1>}
          <div className="flex items-center gap-1">{action}</div>
        </div>
        {large && <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight">{title}</h1>}
      </header>
      <main className="px-4">{children}</main>
    </div>
  );
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const C = onClick ? 'button' : 'div';
  return <C onClick={onClick} className={`card block w-full text-left ${onClick ? 'tap' : ''} ${className}`}>{children}</C>;
}

export function StatCard({ label, value, sub, tone = 'default', onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'green' | 'low' | 'out'; onClick?: () => void }) {
  const tones = { default: 'bg-white', green: 'bg-mint', low: 'bg-[#FFF8E1]', out: 'bg-[#FFEBEE]' };
  const text = { default: 'text-ink', green: 'text-primary', low: 'text-[#8D6E00]', out: 'text-out' };
  return (
    <button onClick={onClick} className={`tap rounded-2xl border border-line p-3.5 text-left ${tones[tone]}`}>
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className={`mt-1 text-[24px] font-bold leading-tight tabular-nums ${text[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </button>
  );
}

export function StockBadge({ status, qty, unit }: { status: StockStatus; qty?: string; unit?: string }) {
  const s = { ok: 'bg-mint text-primary', low: 'bg-[#FFF8E1] text-[#8D6E00]', out: 'bg-[#FFEBEE] text-out' }[status];
  const dot = { ok: 'bg-primary-light', low: 'bg-low', out: 'bg-out' }[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums ${s}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {qty !== undefined ? `${qty}${unit ? ` ${unit}` : ''}` : status === 'ok' ? 'In stock' : status === 'low' ? 'Low' : 'Out'}
    </span>
  );
}

export function SearchBar({ value, onChange, placeholder = 'Search', autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input type="search" inputMode="search" className="field rounded-xl bg-mint/60 py-2 pl-9 pr-9" placeholder={placeholder} value={value} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} aria-label="Search" />
      {value && <button className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted" onClick={() => onChange('')} aria-label="Clear search"><X size={16} /></button>}
    </div>
  );
}

export function Chips<T extends string | number>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-2">
      {options.map((o) => (
        <button key={String(o.id)} onClick={() => onChange(o.id)}
          className={`tap shrink-0 rounded-full border px-3.5 text-sm font-medium ${value === o.id ? 'border-primary bg-primary text-white' : 'border-line bg-white text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-mint p-1">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`min-h-9 flex-1 rounded-lg text-sm font-semibold ${value === o.id ? 'bg-white text-primary ring-1 ring-line' : 'text-muted'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet modal. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-bg pb-safe">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line/70 bg-bg px-4 py-3">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button className="tap flex w-11 items-center justify-end text-muted" onClick={onClose} aria-label="Close"><X size={22} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block min-w-0 ${className}`}><span className="label">{label}</span>{children}</label>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-muted">
      <PackageOpen size={36} strokeWidth={1.5} />
      <div className="font-semibold text-ink">{title}</div>
      {children && <div className="text-sm">{children}</div>}
    </div>
  );
}

/** Grouped list rows, iOS settings style. */
export function List({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card divide-y divide-line/70 overflow-hidden ${className}`}>{children}</div>;
}
export function Row({ children, onClick, className = '' }: { children: ReactNode; onClick?: () => void; className?: string }) {
  const C = onClick ? 'button' : 'div';
  return <C onClick={onClick} className={`flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left ${onClick ? 'active:bg-mint' : ''} ${className}`}>{children}</C>;
}

/** +/- number input with big tap targets. */
export function QtyInput({ value, onChange, min = 0, label = 'Quantity' }: { value: number; onChange: (n: number) => void; min?: number; label?: string }) {
  return (
    <div className="flex items-stretch gap-2">
      <button type="button" className="btn-soft w-14 text-2xl" onClick={() => onChange(Math.max(min, +(value - 1).toFixed(3)))} aria-label="Decrease">−</button>
      <input type="number" inputMode="decimal" className="field text-center text-xl font-semibold tabular-nums" value={Number.isNaN(value) ? '' : value} aria-label={label}
        onFocus={(e) => e.target.select()} onChange={(e) => onChange(e.target.valueAsNumber)} />
      <button type="button" className="btn-soft w-14 text-2xl" onClick={() => onChange(+((Number.isNaN(value) ? 0 : value) + 1).toFixed(3))} aria-label="Increase">+</button>
    </div>
  );
}
