/** Minimal Google Sheets + Drive client used as the sync backend. */
import { SHEET_TITLE } from './config';
import { AuthExpired } from './google';
import { FIRST_LOG_ROW, type LogRow, type SyncBackend, type Views } from './engine';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const LOG_HEADER = ['time', 'device', 'table', 'id', 'deleted', 'json'];

async function call(token: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (r.status === 401) throw new AuthExpired();
  if (!r.ok) {
    let msg = `${r.status}`;
    try { msg = (await r.json()).error?.message ?? msg; } catch { /* ignore */ }
    if (r.status === 403 && /has not been used|is disabled/i.test(msg)) msg = 'Google Sheets/Drive API is not enabled in the Google Cloud project.';
    throw new Error(`Google: ${msg}`);
  }
  return r.status === 204 ? null : r.json();
}

/** Find the INSTORE spreadsheet this app created in the user's Drive (drive.file only sees those). */
export async function findSheet(token: string): Promise<string | null> {
  for (const q of [`appProperties has { key='instore' and value='data' } and trashed=false`, `name='${SHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`]) {
    const res = await call(token, `${DRIVE}?${new URLSearchParams({ q, fields: 'files(id,name,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: '10' })}`);
    if (res.files?.length) return res.files[0].id;
  }
  return null;
}

export async function createSheet(token: string): Promise<string> {
  const res = await call(token, SHEETS, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: SHEET_TITLE },
      sheets: [
        { properties: { title: 'Items', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'Activity', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'log', gridProperties: { frozenRowCount: 1 } } },
      ],
    }),
  });
  const id: string = res.spreadsheetId;
  await call(token, `${SHEETS}/${id}/values/log!A1:F1?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [LOG_HEADER] }) });
  // Tag it so other devices find it even if it gets renamed.
  await call(token, `${DRIVE}/${id}`, { method: 'PATCH', body: JSON.stringify({ appProperties: { instore: 'data' }, description: 'INSTORE inventory data. The "log" tab is used for syncing — please do not edit it.' }) });
  return id;
}

export const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

export class SheetsBackend implements SyncBackend {
  constructor(private token: string, private sheetId: string) {}

  async appendLog(rows: LogRow[]) {
    if (!rows.length) return;
    await call(this.token, `${SHEETS}/${this.sheetId}/values/log!A:F:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values: rows.map((r) => [r.time, r.device, r.table, r.id, r.deleted, r.json]) }),
    });
  }

  async readLog(fromRow: number) {
    // Open-ended range (A{row}:F) returns everything from that row on, without hitting grid limits.
    const start = Math.max(fromRow, FIRST_LOG_ROW);
    const res = await call(this.token, `${SHEETS}/${this.sheetId}/values/log!A${start}:F?valueRenderOption=UNFORMATTED_VALUE`);
    const values: any[][] = res.values ?? [];
    const rows: LogRow[] = values.map((v) => ({ time: Number(v[0]), device: String(v[1] ?? ''), table: v[2], id: String(v[3] ?? ''), deleted: Number(v[4]) ? 1 : 0, json: String(v[5] ?? '') }));
    return { rows, nextRow: start + values.length };
  }

  async writeViews(v: Views) {
    await call(this.token, `${SHEETS}/${this.sheetId}/values:batchClear`, { method: 'POST', body: JSON.stringify({ ranges: ['Items', 'Activity'] }) });
    await call(this.token, `${SHEETS}/${this.sheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data: [{ range: 'Items!A1', values: v.items }, { range: 'Activity!A1', values: v.activity }] }),
    });
  }
}
