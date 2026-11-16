import { useSession } from '../lib/session';

/** Business letterhead used on all printouts. */
export function PrintHeader({ title, compact }: { title: string; compact?: boolean }) {
  const { settings: s } = useSession();
  const color = s.theme_color || '#2563eb';
  return (
    <div className={`flex items-start justify-between gap-4 border-b-2 ${compact ? 'pb-2' : 'pb-3'}`} style={{ borderColor: color }}>
      <div className="flex items-start gap-3">
        {s.logo && <img src={s.logo} alt="" className={compact ? 'h-10 w-10 object-contain' : 'h-14 w-14 object-contain'} />}
        <div>
          <div className={`${compact ? 'text-base' : 'text-xl'} font-bold`} style={{ color }}>{s.business_name}</div>
          {s.business_address && <div className="whitespace-pre-line text-xs text-slate-600">{s.business_address}</div>}
          <div className="text-xs text-slate-600">
            {[s.business_phone && `Ph: ${s.business_phone}`, s.business_email].filter(Boolean).join(' · ')}
          </div>
          {s.business_gstin && <div className="text-xs font-medium">GSTIN: {s.business_gstin} · State: {s.business_state}</div>}
        </div>
      </div>
      <div className={`${compact ? 'text-sm' : 'text-lg'} font-bold tracking-wide text-slate-700`}>{title}</div>
    </div>
  );
}
