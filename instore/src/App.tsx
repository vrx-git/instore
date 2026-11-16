import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './hooks/session';
import { requestPersistence } from './data/db';
import { TabBar } from './components/TabBar';
import Login from './screens/Login';
import Dashboard from './screens/Dashboard';
import Items from './screens/Items';
import ItemDetail from './screens/ItemDetail';
import ItemForm from './screens/ItemForm';
import Scan from './screens/Scan';
import Activity from './screens/Activity';
import Settings from './screens/Settings';

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </>
  );
}
