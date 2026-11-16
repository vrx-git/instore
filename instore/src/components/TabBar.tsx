import { NavLink } from 'react-router-dom';
import { LayoutGrid, Package, ScanLine, History, Settings } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Home', icon: LayoutGrid },
  { to: '/items', label: 'Items', icon: Package },
  { to: '/scan', label: 'Scan', icon: ScanLine, primary: true },
  { to: '/activity', label: 'Activity', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-safe backdrop-blur" aria-label="Main">
      <div className="mx-auto flex max-w-lg">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'}
            className={({ isActive }) => `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? 'text-primary' : 'text-muted'}`}>
            {({ isActive }) => t.primary ? (
              <>
                <span className={`flex h-9 w-12 items-center justify-center rounded-xl ${isActive ? 'bg-primary text-white' : 'bg-mint text-primary'}`}><t.icon size={22} /></span>
                {t.label}
              </>
            ) : (
              <>
                <span className="flex h-9 w-12 items-center justify-center"><t.icon size={24} strokeWidth={isActive ? 2.3 : 1.8} /></span>
                {t.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
