import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, Warehouse, ArrowLeftRight, Users, Receipt, FileText, ClipboardList, Truck, Undo2,
  ShoppingCart, FileInput, Redo2, Wallet, IndianRupee, BarChart3, Settings, Barcode, Upload, LogOut, Menu, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';

type NavItem = { to: string; label: string; icon: any; need?: 'reports' | 'expenses' };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: '', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    group: 'Inventory', items: [
      { to: '/items', label: 'Items', icon: Package },
      { to: '/stock', label: 'Stock In / Out', icon: ArrowLeftRight },
      { to: '/stores', label: 'Stores & Godowns', icon: Warehouse },
      { to: '/barcodes', label: 'Barcode Labels', icon: Barcode },
    ],
  },
  {
    group: 'Sales', items: [
      { to: '/sales', label: 'Sales Invoices', icon: Receipt },
      { to: '/quotations', label: 'Quotations', icon: FileText },
      { to: '/sales-orders', label: 'Sales Orders', icon: ClipboardList },
      { to: '/challans', label: 'Delivery Challans', icon: Truck },
      { to: '/sales-returns', label: 'Sales Returns', icon: Undo2 },
    ],
  },
  {
    group: 'Purchase', items: [
      { to: '/purchases', label: 'Purchase Bills', icon: ShoppingCart },
      { to: '/purchase-orders', label: 'Purchase Orders', icon: FileInput },
      { to: '/purchase-returns', label: 'Purchase Returns', icon: Redo2 },
    ],
  },
  {
    group: 'Accounts', items: [
      { to: '/parties', label: 'Parties', icon: Users },
      { to: '/payments', label: 'Payments', icon: Wallet },
      { to: '/expenses', label: 'Expenses', icon: IndianRupee, need: 'expenses' },
      { to: '/reports', label: 'Reports', icon: BarChart3, need: 'reports' },
    ],
  },
  {
    group: 'Setup', items: [
      { to: '/import', label: 'Excel Import', icon: Upload },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function Layout() {
  const { user, settings, can, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  const logout = async () => {
    await api.post('/auth/logout');
    refresh();
  };

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        {settings.logo
          ? <img src={settings.logo} alt="" className="h-8 w-8 rounded object-contain" />
          : <div className="flex h-8 w-8 items-center justify-center rounded bg-brand text-sm font-bold text-white">SR</div>}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{settings.business_name || 'Stock Register'}</div>
          <div className="text-xs text-slate-500">Inventory & Billing</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.need || can(i.need));
          if (!items.length) return null;
          return (
            <div key={g.group} className="mt-3">
              {g.group && <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.group}</div>}
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === '/'} onClick={() => setOpen(false)}
                  className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${isActive ? 'bg-brand/10 font-medium text-brand' : 'text-slate-600 hover:bg-slate-100'}`}>
                  <i.icon size={16} /> {i.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user?.name}</div>
            <div className="text-xs capitalize text-slate-500">{user?.role}</div>
          </div>
          <button className="btn-ghost p-1.5" onClick={logout} title="Log out" aria-label="Log out"><LogOut size={16} /></button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full">
      <aside className="no-print hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/40" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button className="btn-ghost absolute right-2 top-3 p-1" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5 lg:hidden">
          <button className="btn-ghost p-1" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <span className="font-semibold">{settings.business_name || 'Stock Register'}</span>
        </header>
        <main key={loc.pathname.split('/')[1]} className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
