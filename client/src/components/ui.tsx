import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { X, Search, Download, Inbox } from 'lucide-react';
import { exportCsv } from '../lib/format';

// ---------------- toasts ----------------
type Toast = { id: number; msg: string; kind: 'ok' | 'error' };
const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 5000 : 2500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} role="status"
            className={`rounded-md px-4 py-2.5 text-sm text-white shadow-lg ${t.kind === 'error' ? 'bg-red-600' : 'bg-slate-800'}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------- layout bits ----------------
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'default', onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'green' | 'red' | 'amber' | 'blue'; onClick?: () => void }) {
  const tones = { default: 'text-slate-900', green: 'text-emerald-600', red: 'text-red-600', amber: 'text-amber-600', blue: 'text-brand' };
  return (
    <div className={`card p-4 ${onClick ? 'cursor-pointer hover:border-brand/50' : ''}`} onClick={onClick}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700',
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status === 'open' ? 'amber' : status === 'completed' ? 'green' : 'red';
  return <Badge tone={tone}>{status[0].toUpperCase() + status.slice(1)}</Badge>;
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'}`} role="dialog" aria-label={title}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button className="btn-ghost p-1" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ children = 'Nothing here yet' }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-sm text-slate-400">
      <Inbox size={28} />
      {children}
    </div>
  );
}

export function Loading() {
  return <div className="py-12 text-center text-sm text-slate-400">Loading…</div>;
}

// ---------------- data table ----------------
export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  num?: boolean;
  /** value used for search, sort and CSV export */
  value?: (row: T) => any;
  total?: boolean;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  rows, columns, onRowClick, searchable = true, exportName, toolbar, empty, loading, rowKey = 'id', selectable, selected, onSelect, initialSort,
}: {
  rows: T[] | undefined; columns: Column<T>[]; onRowClick?: (r: T) => void; searchable?: boolean; exportName?: string;
  toolbar?: ReactNode; empty?: ReactNode; loading?: boolean; rowKey?: string;
  selectable?: boolean; selected?: Set<any>; onSelect?: (s: Set<any>) => void; initialSort?: { key: string; dir: 1 | -1 };
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(initialSort ?? null);
  const val = (c: Column<T>, r: T) => (c.value ? c.value(r) : r[c.key]);

  const shown = useMemo(() => {
    let out = rows ?? [];
    if (search) {
      const s = search.toLowerCase();
      out = out.filter((r) => columns.some((c) => String(val(c, r) ?? '').toLowerCase().includes(s)));
    }
    if (sort) {
      const c = columns.find((x) => x.key === sort.key);
      if (c) out = [...out].sort((a, b) => {
        const va = val(c, a), vb = val(c, b);
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir;
        return String(va ?? '').localeCompare(String(vb ?? '')) * sort.dir;
      });
    }
    return out;
  }, [rows, search, sort, columns]);

  const hasTotals = columns.some((c) => c.total);
  const allSelected = !!selectable && shown.length > 0 && shown.every((r) => selected?.has(r[rowKey]));

  return (
    <div className="card overflow-hidden">
      {(searchable || exportName || toolbar) && (
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-slate-200 p-2.5">
          {searchable && (
            <div className="relative min-w-48 flex-1 sm:max-w-xs">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-8" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          )}
          {toolbar}
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            {shown.length} {shown.length === 1 ? 'row' : 'rows'}
            {exportName && (
              <button className="btn-secondary py-1" onClick={() => exportCsv(exportName, columns.map((c) => ({ key: c.key, label: c.label })),
                shown.map((r) => Object.fromEntries(columns.map((c) => [c.key, val(c, r)]))))}>
                <Download size={14} /> CSV
              </button>
            )}
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {selectable && (
                <th className="w-8"><input type="checkbox" checked={allSelected} aria-label="Select all"
                  onChange={() => onSelect?.(allSelected ? new Set() : new Set(shown.map((r) => r[rowKey])))} /></th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={`cursor-pointer select-none ${c.num ? 'num' : ''} ${c.className ?? ''}`}
                  onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 }))}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r[rowKey] ?? i} className={onRowClick ? 'cursor-pointer' : ''} onClick={() => onRowClick?.(r)}>
                {selectable && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={!!selected?.has(r[rowKey])} aria-label="Select row" onChange={() => {
                      const s = new Set(selected);
                      if (s.has(r[rowKey])) s.delete(r[rowKey]); else s.add(r[rowKey]);
                      onSelect?.(s);
                    }} />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={`${c.num ? 'num' : ''} ${c.className ?? ''}`}>{c.render ? c.render(r) : r[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {hasTotals && shown.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                {selectable && <td />}
                {columns.map((c, i) => {
                  if (!c.total) return <td key={c.key} className="px-3 py-2">{i === 0 ? 'Total' : ''}</td>;
                  const sum = shown.reduce((s, r) => s + (Number(val(c, r)) || 0), 0);
                  return <td key={c.key} className="num px-3 py-2">{c.render ? c.render({ ...shown[0], [c.key]: sum } as T) : sum.toFixed(2)}</td>;
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {loading ? <Loading /> : !shown.length && <Empty>{empty}</Empty>}
    </div>
  );
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input type="date" className="input w-auto py-1" value={from} onChange={(e) => onChange(e.target.value, to)} aria-label="From date" />
      <span className="text-xs text-slate-400">to</span>
      <input type="date" className="input w-auto py-1" value={to} onChange={(e) => onChange(from, e.target.value)} aria-label="To date" />
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${value === t.id ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function confirmAction(msg: string) {
  return window.confirm(msg);
}
