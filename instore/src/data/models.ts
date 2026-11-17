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

export type MoveType = 'opening' | 'in' | 'out' | 'transfer_in' | 'transfer_out' | 'adjust'
  | 'sale' | 'purchase' | 'sale_return' | 'purchase_return' | 'challan';

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
  /** set when the move was created by a bill (invoice, purchase, return, challan) */
  docId?: string | null;
}

// ---------------------------------------------------------------- billing
export type PartyType = 'customer' | 'supplier' | 'both';

export interface Party extends Synced {
  name: string;
  type: PartyType;
  phone: string;
  email: string;
  gstin: string;
  state: string;
  address: string;
  /** +ve = they owe us (to receive), -ve = we owe them (to pay) */
  openingBalance: number;
  active: 0 | 1;
  createdAt: number;
}

export type DocType =
  | 'sales_invoice' | 'quotation' | 'sales_order' | 'delivery_challan' | 'sales_return'
  | 'purchase_invoice' | 'purchase_order' | 'purchase_return';
export type DocStatus = 'open' | 'completed' | 'cancelled';

export interface DocLine {
  itemId: string | null;
  description: string;
  hsn: string;
  unit: string;
  qty: number;
  rate: number;
  discountPct: number;
  gstRate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  amount: number;
  /** item purchase price when the bill was made (for profit) */
  costRate: number;
}

export interface Doc extends Synced {
  type: DocType;
  number: string;
  date: string; // YYYY-MM-DD
  dueDate: string;
  partyId: string | null;
  partyName: string;
  storeId: string;
  isGst: 0 | 1;
  taxInclusive: 0 | 1;
  placeOfSupply: string;
  status: DocStatus;
  sourceId: string | null;
  lines: DocLine[];
  subtotal: number;
  discount: number;
  cgst: number;
  sgst: number;
  igst: number;
  otherCharges: number;
  roundOff: number;
  total: number;
  costTotal: number;
  notes: string;
  terms: string;
  transport: string;
  vehicleNo: string;
  createdBy: string;
  createdAt: number;
}

export interface Allocation { docId: string; amount: number }

export interface Payment extends Synced {
  direction: 'in' | 'out';
  number: string;
  date: string;
  partyId: string;
  accountId: string;
  amount: number;
  reference: string;
  note: string;
  allocations: Allocation[];
  createdBy: string;
  createdAt: number;
}

export interface Account extends Synced {
  name: string;
  kind: 'cash' | 'bank';
  openingBalance: number;
}

export interface Expense extends Synced {
  date: string;
  category: string;
  accountId: string;
  amount: number;
  note: string;
  createdBy: string;
  createdAt: number;
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

export const SYNCED_TABLES = ['users', 'stores', 'categories', 'items', 'moves', 'settings', 'parties', 'docs', 'payments', 'accounts', 'expenses'] as const;
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
  sale: 'Sale',
  purchase: 'Purchase',
  sale_return: 'Sales return',
  purchase_return: 'Purchase return',
  challan: 'Delivery challan',
};

export type StockStatus = 'ok' | 'low' | 'out';
export function stockStatus(qty: number, lowStockQty: number): StockStatus {
  if (qty <= 0) return 'out';
  if (lowStockQty > 0 && qty <= lowStockQty) return 'low';
  return 'ok';
}

export const newId = () => crypto.randomUUID();
