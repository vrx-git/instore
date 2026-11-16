import { db, setSetting } from '../data/db';

const TABLES = ['users', 'stores', 'categories', 'items', 'moves', 'settings'] as const;

export interface BackupFile {
  app: 'INSTORE';
  version: 1;
  exportedAt: string;
  data: Record<(typeof TABLES)[number], any[]>;
}

export async function exportData(): Promise<BackupFile> {
  const data = {} as BackupFile['data'];
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  return { app: 'INSTORE', version: 1, exportedAt: new Date().toISOString(), data };
}

export async function importData(file: BackupFile) {
  if (file?.app !== 'INSTORE' || !file.data) throw new Error('This is not an INSTORE backup file');
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      if (file.data[t]?.length) await db.table(t).bulkAdd(file.data[t]);
    }
  });
}

/** Save a backup as a .json file (on iPhone this opens the share sheet / Files). */
export async function downloadBackup() {
  const json = JSON.stringify(await exportData());
  const name = `instore-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: any) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: 'INSTORE backup' }); }
    catch (e: any) { if (e?.name === 'AbortError') return false; throw e; }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  await setSetting('last_backup', new Date().toISOString());
  return true;
}
