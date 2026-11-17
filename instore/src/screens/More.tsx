import { useNavigate } from 'react-router-dom';
import { ChevronRight, History, Users, Wallet, IndianRupee, BarChart3, Settings as SettingsIcon, Building2 } from 'lucide-react';
import { useSession } from '../hooks/session';
import { List, Page, Row } from '../components/ui';

export default function More() {
  const nav = useNavigate();
  const { isOwner } = useSession();
  const items = [
    { to: '/parties', label: 'Customers & suppliers', icon: Users },
    { to: '/payments', label: 'Payments', icon: Wallet },
    ...(isOwner ? [{ to: '/expenses', label: 'Expenses', icon: IndianRupee }, { to: '/reports', label: 'Reports & GST', icon: BarChart3 }] : []),
    { to: '/activity', label: 'Stock activity log', icon: History },
  ];
  return (
    <Page title="More">
      <List className="mt-2">
        {items.map((i) => <Row key={i.to} onClick={() => nav(i.to)}><i.icon size={20} className="text-primary" /><span className="flex-1">{i.label}</span><ChevronRight size={16} className="text-line" /></Row>)}
      </List>
      <List className="mt-4">
        {isOwner && <Row onClick={() => nav('/settings/business')}><Building2 size={20} className="text-primary" /><span className="flex-1">Business details (for invoices)</span><ChevronRight size={16} className="text-line" /></Row>}
        <Row onClick={() => nav('/settings')}><SettingsIcon size={20} className="text-primary" /><span className="flex-1">Settings</span><ChevronRight size={16} className="text-line" /></Row>
      </List>
    </Page>
  );
}
