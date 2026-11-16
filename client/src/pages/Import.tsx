import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Download, Upload, FileSpreadsheet } from 'lucide-react';
import { api, download } from '../lib/api';
import { PageHeader, Tabs, Field, useToast } from '../components/ui';

export default function ImportPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'items' | 'parties') || 'items';
  const toast = useToast();
  const qc = useQueryClient();
  const stores = useQuery({ queryKey: ['stores'], queryFn: () => api.get('/stores') });
  const [store, setStore] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (tab === 'items' && store) fd.append('store_id', store);
      const r = await api.post(`/io/import/${tab}`, fd);
      setResult(r);
      qc.invalidateQueries();
      toast(`Imported: ${r.created} new, ${r.updated} updated`);
    } catch (e: any) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const dl = (url: string) => download(url).catch((e) => toast(e.message, 'error'));

  return (
    <div className="max-w-3xl">
      <PageHeader title="Excel Import / Export" subtitle="Add many items or parties at once from an Excel sheet" />
      <Tabs tabs={[{ id: 'items', label: 'Items' }, { id: 'parties', label: 'Parties' }]} value={tab} onChange={(t) => { setParams({ tab: t }); setResult(null); setFile(null); }} />
      <div className="card space-y-4 p-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Download the template and fill one {tab === 'items' ? 'item' : 'party'} per row (keep the header row).</li>
          <li>{tab === 'items' ? 'Rows with an existing Item Code (or same name) update that item; others are added. Opening Stock is added to the chosen store for new items.' : 'Rows with the same party name update the existing party; others are added.'}</li>
          <li>Upload the file below.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => dl(`/io/template/${tab}`)}><FileSpreadsheet size={16} /> Download template</button>
          <button className="btn-secondary" onClick={() => dl(`/io/export/${tab}`)}><Download size={16} /> Export current {tab}</button>
        </div>
        <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
          <Field label="Excel file (.xlsx)"><input type="file" accept=".xlsx" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          {tab === 'items' && (
            <Field label="Opening stock goes to">
              <select className="input" value={store} onChange={(e) => setStore(e.target.value)}>
                {stores.data?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        <button className="btn-primary" disabled={!file || busy} onClick={run}><Upload size={16} /> {busy ? 'Importing…' : 'Import'}</button>
        {result && (
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <div><b>{result.created}</b> added, <b>{result.updated}</b> updated{result.errors.length ? `, ${result.errors.length} rows skipped` : ''}.</div>
            {result.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-red-600">{result.errors.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>}
          </div>
        )}
      </div>
    </div>
  );
}
