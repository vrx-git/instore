import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Lock, Store as StoreIcon, Tags, Users, Download, Upload, Sparkles, Smartphone, KeyRound, Building2 } from 'lucide-react';
import { addRecord, db, getSetting, setSetting } from '../data/db';
import type { Role, Store, User } from '../data/models';
import { useCategories, useStores, useUsers } from '../hooks/data';
import { useSession } from '../hooks/session';
import { changePin, createUser, setUserActive } from '../services/auth';
import { downloadBackup, importData } from '../services/backup';
import { seedDemo } from '../services/seed';
import { Field, List, Page, Row, Segmented, Sheet, useToast } from '../components/ui';
import { PinPad } from '../components/PinPad';
import { Avatar } from './Login';
import { BackupEmailSection } from '../components/SyncUI';

type Panel = 'business' | 'stores' | 'categories' | 'users' | 'pin' | 'install' | null;

export default function Settings() {
  const { user, isOwner, lock } = useSession();
  const toast = useToast();
  const [panel, setPanel] = useState<Panel>(null);
  const business = useLiveQuery(() => getSetting('business_name'));
  const lastBackup = useLiveQuery(() => getSetting('last_backup'));
  const itemCount = useLiveQuery(() => db.items.filter((i) => !i.deleted).count());
  const stores = useStores(true);
  const cats = useCategories();
  const users = useUsers();
  const backupAge = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 864e5) : null;

  const restore = async (file?: File) => {
    if (!file) return;
    if (!window.confirm('Replace ALL data on this phone with this backup?')) return;
    try { await importData(JSON.parse(await file.text())); toast('Backup restored'); lock(); }
    catch (e: any) { toast(e.message || 'Could not read backup', 'error'); }
  };

  return (
    <Page title="Settings">
      <List className="mt-2">
        <Row>
          <Avatar name={user?.name ?? '?'} />
          <div className="flex-1"><div className="font-semibold">{user?.name}</div><div className="text-xs capitalize text-muted">{user?.role}</div></div>
          <button className="btn-soft min-h-9 px-3 text-sm" onClick={lock}><Lock size={16} /> Lock</button>
        </Row>
        <Item icon={<KeyRound size={18} />} label="Change my PIN" onClick={() => setPanel('pin')} />
      </List>

      {isOwner && (
        <>
          <h2 className="section-title">Shop</h2>
          <List>
            <Item icon={<Building2 size={18} />} label="Business name" value={business || '—'} onClick={() => setPanel('business')} />
            <Item icon={<StoreIcon size={18} />} label="Stores & godowns" value={String(stores?.length ?? 0)} onClick={() => setPanel('stores')} />
            <Item icon={<Tags size={18} />} label="Categories" value={String(cats?.length ?? 0)} onClick={() => setPanel('categories')} />
            <Item icon={<Users size={18} />} label="Users & PINs" value={String(users?.filter((u) => u.active).length ?? 0)} onClick={() => setPanel('users')} />
          </List>

          <h2 className="section-title">Backup email (Google Sheets)</h2>
          <BackupEmailSection />

          <h2 className="section-title">Backup file</h2>
          <List>
            <Item icon={<Download size={18} />} label="Back up now" value={backupAge === null ? 'Never' : backupAge === 0 ? 'Today' : `${backupAge}d ago`}
              warn={backupAge === null || backupAge > 7}
              onClick={async () => { try { if (await downloadBackup()) toast('Backup saved'); } catch (e: any) { toast(e.message, 'error'); } }} />
            <label className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 py-2.5 active:bg-mint">
              <span className="text-primary"><Upload size={18} /></span><span className="flex-1">Restore from backup</span>
              <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => restore(e.target.files?.[0])} />
              <ChevronRight size={16} className="text-line" />
            </label>
          </List>
          <p className="px-1 pt-2 text-xs text-muted">A backup file is a one-off copy you can keep in Files or iCloud Drive.</p>

          {itemCount === 0 && (
            <List className="mt-4">
              <Item icon={<Sparkles size={18} />} label="Load demo items" onClick={async () => { if (user?.id && (await seedDemo(user.id))) toast('Demo items added'); }} />
            </List>
          )}
        </>
      )}

      <h2 className="section-title">App</h2>
      <List>
        <Item icon={<Smartphone size={18} />} label="Install on iPhone" onClick={() => setPanel('install')} />
        <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 px-4 py-2.5 active:bg-mint">
          <span className="flex-1">Privacy policy</span><ChevronRight size={16} className="text-line" />
        </a>
        <Row><span className="flex-1 text-muted">Version</span><span className="text-sm">INSTORE 1.1</span></Row>
      </List>

      <BusinessSheet open={panel === 'business'} onClose={() => setPanel(null)} current={business ?? ''} />
      <StoresSheet open={panel === 'stores'} onClose={() => setPanel(null)} stores={stores ?? []} />
      <CategoriesSheet open={panel === 'categories'} onClose={() => setPanel(null)} />
      <UsersSheet open={panel === 'users'} onClose={() => setPanel(null)} users={users ?? []} />
      <PinSheet open={panel === 'pin'} onClose={() => setPanel(null)} userId={user?.id} />
      <Sheet open={panel === 'install'} onClose={() => setPanel(null)} title="Install on iPhone">
        <ol className="list-decimal space-y-3 pl-5 text-[15px]">
          <li>Open INSTORE in <b>Safari</b>.</li>
          <li>Tap the <b>Share</b> button (square with an arrow).</li>
          <li>Scroll and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
          <li>Open INSTORE from the Home Screen icon. It works offline and keeps your data safe from automatic clearing.</li>
        </ol>
      </Sheet>
    </Page>
  );
}

function Item({ icon, label, value, onClick, warn }: { icon: ReactNode; label: string; value?: string; onClick: () => void; warn?: boolean }) {
  return (
    <Row onClick={onClick}>
      <span className="text-primary">{icon}</span>
      <span className="flex-1">{label}</span>
      {value && <span className={`text-sm ${warn ? 'font-medium text-[#8D6E00]' : 'text-muted'}`}>{value}</span>}
      <ChevronRight size={16} className="text-line" />
    </Row>
  );
}

function BusinessSheet({ open, onClose, current }: { open: boolean; onClose: () => void; current: string }) {
  const [v, setV] = useState(current);
  const toast = useToast();
  return (
    <Sheet open={open} onClose={onClose} title="Business name">
      <input className="field" value={v} onChange={(e) => setV(e.target.value)} placeholder={current || 'Shop name'} autoFocus />
      <button className="btn-primary mt-4 w-full" onClick={async () => { await setSetting('business_name', v.trim()); toast('Saved'); onClose(); }}>Save</button>
    </Sheet>
  );
}

function StoresSheet({ open, onClose, stores }: { open: boolean; onClose: () => void; stores: Store[] }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'store' | 'godown'>('store');
  const add = async () => {
    if (!name.trim()) return;
    await addRecord(db.stores, { name: name.trim(), kind, active: 1 });
    setName(''); toast('Store added');
  };
  return (
    <Sheet open={open} onClose={onClose} title="Stores & godowns">
      <List>
        {stores.map((s) => (
          <Row key={s.id}>
            <div className="flex-1"><div className={`font-medium ${s.active ? '' : 'text-muted line-through'}`}>{s.name}</div><div className="text-xs capitalize text-muted">{s.kind}</div></div>
            <button className="text-sm text-primary" onClick={() => { const n = window.prompt('Rename', s.name)?.trim(); if (n) db.stores.update(s.id!, { name: n }); }}>Rename</button>
            <button className="ml-3 text-sm text-muted" onClick={async () => {
              if (s.active && stores.filter((x) => x.active).length <= 1) return toast('Keep at least one active store', 'error');
              await db.stores.update(s.id!, { active: s.active ? 0 : 1 });
            }}>{s.active ? 'Hide' : 'Show'}</button>
          </Row>
        ))}
      </List>
      <div className="mt-4 space-y-3">
        <Segmented options={[{ id: 'store', label: 'Shop' }, { id: 'godown', label: 'Godown' }]} value={kind} onChange={setKind} />
        <div className="flex gap-2">
          <input className="field" placeholder="New store name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn-primary" disabled={!name.trim()} onClick={add}>Add</button>
        </div>
      </div>
    </Sheet>
  );
}

function CategoriesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cats = useCategories();
  const counts = useLiveQuery(async () => {
    const m = new Map<string, number>();
    await db.items.each((i) => { if (i.categoryId) m.set(i.categoryId, (m.get(i.categoryId) ?? 0) + 1); });
    return m;
  });
  const toast = useToast();
  const [name, setName] = useState('');
  const add = async () => {
    if (cats?.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) return toast('That category already exists', 'error');
    await addRecord(db.categories, { name: name.trim() }); setName('');
  };
  return (
    <Sheet open={open} onClose={onClose} title="Categories">
      <div className="mb-4 flex gap-2">
        <input className="field" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && add()} />
        <button className="btn-primary" disabled={!name.trim()} onClick={add}>Add</button>
      </div>
      {!!cats?.length && (
        <List>
          {cats.map((c) => (
            <Row key={c.id}>
              <span className="flex-1">{c.name} <span className="text-xs text-muted">({counts?.get(c.id!) ?? 0})</span></span>
              <button className="text-sm text-primary" onClick={() => { const n = window.prompt('Rename', c.name)?.trim(); if (n) db.categories.update(c.id!, { name: n }); }}>Rename</button>
              <button className="ml-3 text-sm text-out" onClick={async () => {
                if (!window.confirm(`Delete "${c.name}"? Items keep their stock but lose this category.`)) return;
                await db.transaction('rw', db.items, db.categories, async () => {
                  await db.items.where('categoryId').equals(c.id!).modify({ categoryId: null });
                  await db.categories.update(c.id!, { deleted: 1 });
                });
              }}>Delete</button>
            </Row>
          ))}
        </List>
      )}
    </Sheet>
  );
}

function UsersSheet({ open, onClose, users }: { open: boolean; onClose: () => void; users: User[] }) {
  const toast = useToast();
  const { user: me } = useSession();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<{ name: string; role: Role }>({ name: '', role: 'staff' });
  const [pinFor, setPinFor] = useState<'new' | string | null>(null);

  const onPin = async (pin: string) => {
    try {
      if (pinFor === 'new') { await createUser(f.name, pin, f.role); toast(`${f.name} added`); setAdding(false); setF({ name: '', role: 'staff' }); }
      else if (typeof pinFor === 'string') { await changePin(pinFor, pin); toast('PIN changed'); }
    } catch (e: any) { toast(e.message, 'error'); }
    setPinFor(null);
  };

  return (
    <Sheet open={open} onClose={onClose} title={pinFor ? 'Set a 4-digit PIN' : 'Users & PINs'}>
      {pinFor ? <PinPad onComplete={onPin} /> : (
        <>
          <List>
            {users.map((u) => (
              <Row key={u.id}>
                <Avatar name={u.name} />
                <div className="min-w-0 flex-1"><div className={`truncate font-medium ${u.active ? '' : 'text-muted line-through'}`}>{u.name}{u.id === me?.id ? ' (you)' : ''}</div><div className="text-xs capitalize text-muted">{u.role}</div></div>
                <button className="text-sm text-primary" onClick={() => setPinFor(u.id!)}>PIN</button>
                {u.id !== me?.id && (
                  <button className="ml-3 text-sm text-muted" onClick={() => setUserActive(u.id!, u.active ? 0 : 1).catch((e) => toast(e.message, 'error'))}>{u.active ? 'Disable' : 'Enable'}</button>
                )}
              </Row>
            ))}
          </List>
          {adding ? (
            <div className="mt-4 space-y-3">
              <Field label="Name"><input className="field" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Segmented options={[{ id: 'staff', label: 'Staff' }, { id: 'owner', label: 'Owner' }]} value={f.role} onChange={(role) => setF({ ...f, role })} />
              <p className="text-xs text-muted">Staff can view items and record stock. Owners can also manage items, stores, users and backups.</p>
              <button className="btn-primary w-full" disabled={!f.name.trim()} onClick={() => setPinFor('new')}>Next: set PIN</button>
            </div>
          ) : <button className="btn-soft mt-4 w-full" onClick={() => setAdding(true)}>Add user</button>}
        </>
      )}
    </Sheet>
  );
}

function PinSheet({ open, onClose, userId }: { open: boolean; onClose: () => void; userId?: string }) {
  const toast = useToast();
  return (
    <Sheet open={open} onClose={onClose} title="New PIN">
      {open && <PinPad onComplete={async (p) => { if (userId) { await changePin(userId, p); toast('PIN changed'); } onClose(); }} />}
    </Sheet>
  );
}
