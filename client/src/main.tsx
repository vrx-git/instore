import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { ToastProvider, Loading } from './components/ui';
import { SessionProvider } from './lib/session';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Items from './pages/Items';
import ItemDetail from './pages/ItemDetail';
import Stores from './pages/Stores';
import StockEntries from './pages/StockEntries';
import StockEntryForm from './pages/StockEntryForm';
import StockEntryView from './pages/StockEntryView';
import Parties from './pages/Parties';
import PartyDetail from './pages/PartyDetail';
import DocumentList from './pages/DocumentList';
import DocumentEditor from './pages/DocumentEditor';
import DocumentView from './pages/DocumentView';
import Payments from './pages/Payments';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import BarcodeLabels from './pages/BarcodeLabels';
import ImportPage from './pages/Import';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BrowserRouter>
          <SessionProvider>
            {({ user, loading, needsSetup }) =>
              loading ? <Loading /> : !user ? <Login setup={needsSetup} /> : (
                <Routes>
                  <Route element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="items" element={<Items />} />
                    <Route path="items/:id" element={<ItemDetail />} />
                    <Route path="stores" element={<Stores />} />
                    <Route path="stock" element={<StockEntries />} />
                    <Route path="stock/new/:type" element={<StockEntryForm />} />
                    <Route path="stock/:id" element={<StockEntryView />} />
                    <Route path="parties" element={<Parties />} />
                    <Route path="parties/:id" element={<PartyDetail />} />
                    <Route path="doc/:id" element={<DocumentView />} />
                    <Route path="doc/:id/edit" element={<DocumentEditor />} />
                    <Route path=":slug" element={<DocumentList />} />
                    <Route path=":slug/new" element={<DocumentEditor />} />
                    <Route path="payments" element={<Payments />} />
                    <Route path="expenses" element={<Expenses />} />
                    <Route path="reports" element={<Reports />} />
                    <Route path="reports/:tab" element={<Reports />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="settings/:tab" element={<Settings />} />
                    <Route path="barcodes" element={<BarcodeLabels />} />
                    <Route path="import" element={<ImportPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              )
            }
          </SessionProvider>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
