import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './hooks/session';
import { requestPersistence } from './data/db';
import { TabBar } from './components/TabBar';
import { ReconnectBanner } from './components/SyncUI';
import Login from './screens/Login';
import Dashboard from './screens/Dashboard';
import Items from './screens/Items';
import ItemDetail from './screens/ItemDetail';
import ItemForm from './screens/ItemForm';
import Scan from './screens/Scan';
import Activity from './screens/Activity';
import Settings from './screens/Settings';
import Bills from './screens/Bills';
import BillEditor from './screens/BillEditor';
import BillView from './screens/BillView';
import More from './screens/More';
import BusinessDetails from './screens/BusinessDetails';
import { PartiesScreen, PartyDetail } from './screens/Parties';
import { ExpensesScreen, PaymentsScreen, ReportsScreen } from './screens/Money';

export default function App() {
  const { user, isOwner } = useSession();
  const loc = useLocation();
  useEffect(() => { if (user) requestPersistence(); }, [user]);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  if (!user) return <Login />;
  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/items" element={<Items />} />
        <Route path="/items/new" element={isOwner ? <ItemForm /> : <Navigate to="/items" replace />} />
        <Route path="/items/:id" element={<ItemDetail />} />
        <Route path="/items/:id/edit" element={isOwner ? <ItemForm /> : <Navigate to=".." replace />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/business" element={isOwner ? <BusinessDetails /> : <Navigate to="/settings" replace />} />
        <Route path="/bills" element={<Bills />} />
        <Route path="/bills/new/:type" element={<BillEditor />} />
        <Route path="/bills/:id" element={<BillView />} />
        <Route path="/bills/:id/edit" element={<BillEditor />} />
        <Route path="/more" element={<More />} />
        <Route path="/parties" element={<PartiesScreen />} />
        <Route path="/parties/:id" element={<PartyDetail />} />
        <Route path="/payments" element={<PaymentsScreen />} />
        <Route path="/expenses" element={isOwner ? <ExpensesScreen /> : <Navigate to="/more" replace />} />
        <Route path="/reports" element={isOwner ? <ReportsScreen /> : <Navigate to="/more" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ReconnectBanner />
      <TabBar />
    </>
  );
}
