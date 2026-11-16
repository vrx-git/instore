/**
 * Data model for INSTORE. Mirrors the Stock Register server schema
 * (server/src/db/schema.sql) for items/stores/categories, and keeps the same
 * stock-ledger rule: current stock = sum of moves. Each move also records the
 * user who made it, which powers the activity log.
 */
export type Role = 'owner' | 'staff';

export interface User {
  id?: number;
  name: string;
  role: Role;
  pinHash: string;
  salt: string;
  active: 0 | 1;
  createdAt: number;
}

export interface Store {
  id?: number;
  name: string;
  kind: 'store' | 'godown';
  active: 0 | 1;
}

export interface Category {
  id?: number;
  name: string;
}

export interface Item {
  id?: number;
  name: string;
  sku: string;
  barcode: string;
  categoryId: number | null;
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

export interface Move {
  id?: number;
  itemId: number;
  storeId: number;
  qty: number; // +ve adds stock, -ve removes
  type: MoveType;
  userId: number;
  at: number; // epoch ms
  note: string;
  /** links the two halves of a transfer, and items in one quick-entry batch */
  ref: string;
  /** stock of this item in this store right after the move (for the audit trail) */
  balanceAfter: number;
}

export interface Setting {
  key: string;
  value: string;
}

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
