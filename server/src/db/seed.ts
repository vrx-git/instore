/**
 * Demo data: `npm run seed`. Creates a demo owner login (see README) only if no users exist,
 * plus sample stores, items, parties, bills and payments.
 */
import bcrypt from 'bcryptjs';
import { getDb } from './db.js';
import { createEntry } from '../services/stock.js';
import { createPayment, saveDocument } from '../services/documents.js';

export const DEMO_USER = { username: 'admin', password: 'admin123' };

const db = getDb();
if (db.get('SELECT id FROM items LIMIT 1')) {
  console.log('Database already has items — seed skipped.');
  process.exit(0);
}

const d = (offset: number) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);

db.tx(() => {
  if (!db.get('SELECT id FROM users LIMIT 1')) {
    db.insert('users', { name: 'Owner', username: DEMO_USER.username, password_hash: bcrypt.hashSync(DEMO_USER.password, 10), role: 'owner' });
  }
  db.setSetting('business_name', 'Sri Lakshmi Traders');
  db.setSetting('business_gstin', '33ABCDE1234F1Z5');
  db.setSetting('business_state', 'Tamil Nadu');
  db.setSetting('business_address', '12, Gandhi Road, Coimbatore - 641001');
  db.setSetting('business_phone', '9876543210');

  const main = db.get<any>('SELECT id FROM stores ORDER BY id LIMIT 1').id;
  const godown = db.insert('stores', { name: 'Godown', kind: 'godown' });

  const cat = (name: string) => db.insert('categories', { name });
  const elec = cat('Electronics'), acc = cat('Accessories'), hw = cat('Hardware');

  const items = [
    { name: 'LED Bulb 9W', sku: 'LED9', barcode: '8901000000011', category_id: elec, unit: 'PCS', hsn: '8539', gst_rate: 12, purchase_price: 55, sale_price: 89, mrp: 120, low_stock_qty: 20 },
    { name: 'Extension Board 4-way', sku: 'EXT4', barcode: '8901000000028', category_id: elec, unit: 'PCS', hsn: '8536', gst_rate: 18, purchase_price: 180, sale_price: 260, mrp: 320, low_stock_qty: 5 },
    { name: 'USB-C Cable 1m', sku: 'USBC1', barcode: '8901000000035', category_id: acc, unit: 'PCS', hsn: '8544', gst_rate: 18, purchase_price: 60, sale_price: 149, mrp: 199, low_stock_qty: 15 },
    { name: 'Mobile Cover', sku: 'MC01', barcode: '8901000000042', category_id: acc, unit: 'PCS', hsn: '3926', gst_rate: 18, purchase_price: 40, sale_price: 99, mrp: 149, low_stock_qty: 10 },
    { name: 'PVC Pipe 1 inch', sku: 'PVC1', barcode: '8901000000059', category_id: hw, unit: 'MTR', hsn: '3917', gst_rate: 18, purchase_price: 32, sale_price: 48, mrp: 55, low_stock_qty: 50 },
    { name: 'Wall Screws (box)', sku: 'SCR50', barcode: '8901000000066', category_id: hw, unit: 'BOX', hsn: '7318', gst_rate: 18, purchase_price: 70, sale_price: 110, mrp: 130, low_stock_qty: 8 },
  ].map((i) => ({ ...i, id: db.insert('items', i) }));

  createEntry({ type: 'opening', date: d(30), store_id: main, note: 'Opening stock', lines: items.map((i, n) => ({ item_id: i.id, qty: [40, 12, 30, 25, 120, 6][n], rate: i.purchase_price })) });
  createEntry({ type: 'opening', date: d(30), store_id: godown, note: 'Opening stock', lines: items.slice(0, 3).map((i) => ({ item_id: i.id, qty: 50, rate: i.purchase_price })) });
  createEntry({ type: 'transfer', date: d(10), store_id: godown, to_store_id: main, person: 'Ravi', lines: [{ item_id: items[0].id, qty: 20 }] });

  const party = (p: any) => db.insert('parties', p);
  const kumar = party({ name: 'Kumar Electricals', type: 'customer', phone: '9840012345', gstin: '33AAACK1234L1Z2', state: 'Tamil Nadu', address: 'RS Puram, Coimbatore' });
  const blr = party({ name: 'Bangalore Mobiles', type: 'customer', phone: '9900011111', gstin: '29AABCB5678M1Z9', state: 'Karnataka', address: 'MG Road, Bengaluru' });
  party({ name: 'Walk-in Customer', type: 'customer', state: 'Tamil Nadu' });
  const sup = party({ name: 'Supreme Distributors', type: 'supplier', phone: '9443300000', gstin: '33AADCS9999K1Z1', state: 'Tamil Nadu', opening_balance: -5000 });

  saveDocument('purchase_invoice', { date: d(20), party_id: sup, store_id: main, is_gst: true, lines: [{ item_id: items[1].id, qty: 10, rate: 180, gst_rate: 18 }, { item_id: items[3].id, qty: 20, rate: 40, gst_rate: 18 }] });
  const inv1 = saveDocument('sales_invoice', { date: d(5), party_id: kumar, store_id: main, is_gst: true, lines: [{ item_id: items[0].id, qty: 25, rate: 89, gst_rate: 12 }, { item_id: items[1].id, qty: 4, rate: 260, gst_rate: 18 }] });
  saveDocument('sales_invoice', { date: d(2), party_id: blr, store_id: main, is_gst: true, lines: [{ item_id: items[2].id, qty: 20, rate: 149, gst_rate: 18 }, { item_id: items[3].id, qty: 15, rate: 99, gst_rate: 18 }] });
  saveDocument('sales_invoice', { date: d(0), party_name: 'Cash Sale', store_id: main, is_gst: true, tax_inclusive: true, lines: [{ item_id: items[4].id, qty: 30, rate: 48, gst_rate: 18 }] });
  saveDocument('quotation', { date: d(1), party_id: kumar, store_id: main, is_gst: true, lines: [{ item_id: items[5].id, qty: 10, rate: 110, gst_rate: 18 }] });
  saveDocument('purchase_order', { date: d(1), party_id: sup, store_id: godown, is_gst: true, lines: [{ item_id: items[4].id, qty: 200, rate: 32, gst_rate: 18 }] });

  const cash = db.get<any>("SELECT id FROM accounts WHERE kind='cash'").id;
  createPayment({ direction: 'in', date: d(3), party_id: kumar, account_id: cash, amount: 2000, allocations: [{ doc_id: inv1, amount: 2000 }] });
  createPayment({ direction: 'out', date: d(4), party_id: sup, account_id: cash, amount: 3000, auto_allocate: true });
  const rent = db.get<any>("SELECT id FROM expense_categories WHERE name='Rent'").id;
  db.insert('expenses', { date: d(6), category_id: rent, account_id: cash, amount: 8000, note: 'Shop rent' });
});

console.log('Demo data added. Log in with the demo account listed in README.md.');
