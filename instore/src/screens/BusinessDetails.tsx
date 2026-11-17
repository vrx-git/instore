import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setSetting } from '../data/db';
import { BUSINESS_KEYS, useBusiness, type Business } from '../hooks/billing';
import { stateFromGstin } from '../services/parties';
import { INDIAN_STATES } from '../lib/format';
import { Field, Page, Segmented, useToast } from '../components/ui';

/** Business details printed on invoices (synced to all devices). */
export default function BusinessDetails() {
  const biz = useBusiness();
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState<Business | null>(null);
  useEffect(() => { if (biz && !f) setF(biz); }, [biz, f]);
  if (!f) return null;
  const set = (k: keyof Business, v: string) => setF({ ...f, [k]: v });

  // Shrink the logo to max 200px so it fits in one Google Sheet cell when syncing.
  const onLogo = (file?: File) => {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 200 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
      if (data.length > 45_000) return toast('That logo is too detailed; try a simpler image', 'error');
      set('logo', data);
    };
    img.onerror = () => toast('Could not read that image', 'error');
    img.src = URL.createObjectURL(file);
  };
  const save = async () => {
    for (const k of BUSINESS_KEYS) if ((biz?.[k] ?? '') !== f[k]) await setSetting(k, f[k].trim());
    toast('Business details saved');
    nav(-1);
  };

  return (
    <Page title="Business details" back large={false} action={<button className="tap px-1 font-semibold text-primary" onClick={save}>Save</button>}>
      <div className="space-y-3 pt-3">
        <Field label="Business name"><input className="field" value={f.business_name} onChange={(e) => set('business_name', e.target.value)} /></Field>
        <Field label="GSTIN (leave empty if not registered)">
          <input className="field uppercase" maxLength={15} autoCapitalize="characters" value={f.business_gstin}
            onChange={(e) => { const g = e.target.value.toUpperCase(); setF({ ...f, business_gstin: g, business_state: stateFromGstin(g) ?? f.business_state }); }} />
        </Field>
        <Field label="State (CGST+SGST within it, IGST outside)">
          <select className="field" value={f.business_state} onChange={(e) => set('business_state', e.target.value)}>
            <option value="">—</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Address"><textarea className="field" rows={2} value={f.business_address} onChange={(e) => set('business_address', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><input className="field" type="tel" value={f.business_phone} onChange={(e) => set('business_phone', e.target.value)} /></Field>
          <Field label="Email"><input className="field" type="email" value={f.business_email} onChange={(e) => set('business_email', e.target.value)} /></Field>
        </div>
        <Field label="Bank / UPI details (printed on invoices)"><textarea className="field" rows={2} placeholder="Bank, A/c no, IFSC, UPI ID" value={f.bank_details} onChange={(e) => set('bank_details', e.target.value)} /></Field>
        <Field label="Default terms"><textarea className="field" rows={2} placeholder="Goods once sold will not be taken back." value={f.invoice_terms} onChange={(e) => set('invoice_terms', e.target.value)} /></Field>
        <Field label="Logo">
          <div className="flex items-center gap-3">
            {f.logo ? <img src={f.logo} alt="Logo" className="h-14 w-14 rounded-xl border border-line object-contain" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-line text-xs text-muted">None</div>}
            <label className="btn-soft cursor-pointer">Choose<input type="file" accept="image/*" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} /></label>
            {f.logo && <button className="text-sm text-muted" onClick={() => set('logo', '')}>Remove</button>}
          </div>
        </Field>
        <Field label="Default print size"><Segmented options={[{ id: 'A4', label: 'A4' }, { id: 'A5', label: 'A5' }, { id: 'T2', label: '2″' }, { id: 'T3', label: '3″' }]} value={f.print_format || 'A4'} onChange={(v) => set('print_format', v)} /></Field>
        <button className="btn-primary w-full" onClick={save}>Save</button>
      </div>
    </Page>
  );
}
