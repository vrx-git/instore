import { db, setLocal } from '../data/db';
import { SYNCED_TABLES } from '../data/models';

export interface BackupFile {
  app: 'INSTORE';
  version: 2;
  exportedAt: string;
  data: Record<(typeof SYNCED_TABLES)[number], any[]>;
}

export async function exportData(): Promise<BackupFile> {
  const data = {} as BackupFile['data'];
  for (const t of SYNCED_TABLES) data[t] = (await db.table(t).toArray()).map(({ dirty: _d, ...r }) => r);
  return { app: 'INSTORE', version: 2, exportedAt: new Date().toISOString(), data };
}

/**
 * Replace all data with a backup file. Restored records count as new local
 * changes, so if Google backup is on they are uploaded and win over older data.
 */
export async function importData(file: BackupFile) {
  if (file?.app !== 'INSTORE' || !file.data) throw new Error('This is not an INSTORE backup file');
  if (file.version !== 2) throw new Error('This backup is from an older INSTORE version. Please make a new backup from that phone.');
  await db.transaction('rw', SYNCED_TABLES.map((t) => db.table(t)), async () => {
    for (const t of SYNCED_TABLES) {
      await db.table(t).clear();
      if (file.data[t]?.length) await db.table(t).bulkAdd(file.data[t].map(({ updatedAt: _u, dirty: _d, ...r }) => r));
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
  await setLocal('last_backup', new Date().toISOString());
  return true;
}
