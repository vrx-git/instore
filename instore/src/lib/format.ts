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

export function fmtDate(d?: string | null) {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}
export const amount2 = (n: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`);
const three = (n: number) => (n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + two(n % 100) : ''}` : two(n));
/** Indian-system amount in words: 1,23,456 → One Lakh Twenty Three Thousand … */
export function inWords(value: number) {
  let n = Math.floor(Math.abs(value));
  const paise = Math.round((Math.abs(value) - n) * 100);
  if (n === 0 && paise === 0) return 'Zero Rupees Only';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  let s = `${parts.join(' ')} Rupees`;
  if (paise) s += ` and ${two(paise)} Paise`;
  return `${s} Only`;
}

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

/** Share text or a file via the phone's share sheet, falling back to download. */
export async function shareFile(name: string, text: string, type = 'text/csv') {
  const file = new File([text], name, { type });
  const nav = navigator as Navigator & { canShare?: (d: any) => boolean };
  if (nav.canShare?.({ files: [file] })) { try { await nav.share({ files: [file], title: name }); } catch { /* cancelled */ } return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
