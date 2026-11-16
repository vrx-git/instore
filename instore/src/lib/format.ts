const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const q = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

export const money = (n: number) => `₹${inr.format(n || 0)}`;
export const qty = (n: number) => q.format(n || 0);
export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${q.format(Math.abs(n))}`;
export const todayStr = () => new Date().toISOString().slice(0, 10);

export function timeAgo(ms: number) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
export const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function dayLabel(ms: number) {
  const d = new Date(ms); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t.getTime() - d.getTime()) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
}

export const UNITS = ['PCS', 'NOS', 'BOX', 'KG', 'GM', 'LTR', 'ML', 'MTR', 'FT', 'DOZ', 'SET', 'PAIR', 'BAG', 'ROLL', 'PKT'];
export const GST_RATES = [0, 3, 5, 12, 18, 28];

/** Short vibration on supported phones (iPhone ignores it, Android buzzes). */
export const buzz = () => { try { navigator.vibrate?.(15); } catch { /* ignore */ } };
