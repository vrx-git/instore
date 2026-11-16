/**
 * Data model for INSTORE. Mirrors the Stock Register server schema
 * (server/src/db/schema.sql) for items/stores/categories, and keeps the same
 * stock-ledger rule: current stock = sum of moves.
 *
 * Every synced record has a random string id (so records made on different
 * phones never clash), `updatedAt` (newest version wins when merging),
 * `deleted` (soft delete, so deletions sync) and `dirty` (not yet uploaded).
 */
export interface Synced {
  id: string;
  updatedAt: number;
  deleted: 0 | 1;
  dirty: 0 | 1;
}

export type Role = 'owner' | 'staff';

export interface User extends Synced {
  name: string;
  role: Role;
  pinHash: string;
  salt: string;
  active: 0 | 1;
  createdAt: number;
}

export interface Store extends Synced {
  name: string;
  kind: 'store' | 'godown';
  active: 0 | 1;
}

export interface Category extends Synced {
  name: string;
}

export interface Item extends Synced {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string | null;
  unit: string;
  hsn: string;
  gstRate: number;
  purchasePrice: number;
  salePrice: number;
  lowStockQty: number;
  location: string; // shelf / rack
  active: 0 | 1;
  createdAt: number;
}

export type MoveType = 'opening' | 'in' | 'out' | 'transfer_in' | 'transfer_out' | 'adjust';

export interface Move extends Synced {
  itemId: string;
  storeId: string;
  qty: number; // +ve adds stock, -ve removes
  type: MoveType;
  userId: string;
  at: number; // epoch ms
  note: string;
  /** links the two halves of a transfer */
  ref: string;
}

/** Shared settings (synced), e.g. business_name. */
export interface Setting extends Synced {
  value: string;
}

/** Per-device values (never synced): session, sync bookmark, backup email... */
export interface LocalValue {
  key: string;
  value: string;
}

export const SYNCED_TABLES = ['users', 'stores', 'categories', 'items', 'moves', 'settings'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** Fields the app fills in; callers create records without them. */
export type New<T extends Synced> = Omit<T, keyof Synced> & Partial<Pick<Synced, 'id'>>;

export const MOVE_LABEL: Record<MoveType, string> = {
  opening: 'Opening stock',
  in: 'Stock in',
  out: 'Stock out',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  adjust: 'Count adjust',
};

export type StockStatus = 'ok' | 'low' | 'out';
export function stockStatus(qty: number, lowStockQty: number): StockStatus {
  if (qty <= 0) return 'out';
  if (lowStockQty > 0 && qty <= lowStockQty) return 'low';
  return 'ok';
}

export const newId = () => crypto.randomUUID();
