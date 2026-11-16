PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner','manager','staff')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,
  kind    TEXT NOT NULL DEFAULT 'store' CHECK (kind IN ('store','godown')),
  address TEXT,
  active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categories (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS items (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  sku            TEXT UNIQUE,
  barcode        TEXT UNIQUE,
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  unit           TEXT NOT NULL DEFAULT 'PCS',
  hsn            TEXT,
  gst_rate       REAL NOT NULL DEFAULT 0,
  purchase_price REAL NOT NULL DEFAULT 0,
  sale_price     REAL NOT NULL DEFAULT 0,
  mrp            REAL NOT NULL DEFAULT 0,
  low_stock_qty  REAL NOT NULL DEFAULT 0,
  description    TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Single stock ledger: every stock change is a row here. Stock = SUM(qty).
CREATE TABLE IF NOT EXISTS stock_moves (
  id          INTEGER PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  store_id    INTEGER NOT NULL REFERENCES stores(id),
  qty         REAL NOT NULL,
  rate        REAL NOT NULL DEFAULT 0,
  type        TEXT NOT NULL CHECK (type IN ('opening','in','out','transfer_in','transfer_out',
                'sale','purchase','sale_return','purchase_return','challan')),
  entry_id    INTEGER REFERENCES stock_entries(id) ON DELETE CASCADE,
  doc_id      INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  note        TEXT
);
CREATE INDEX IF NOT EXISTS ix_moves_item_store ON stock_moves(item_id, store_id);
CREATE INDEX IF NOT EXISTS ix_moves_date ON stock_moves(date);

-- Manual stock entries (stock in / out / transfer / opening), shown as receipts.
CREATE TABLE IF NOT EXISTS stock_entries (
  id            INTEGER PRIMARY KEY,
  number        TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('in','out','transfer','opening')),
  date          TEXT NOT NULL,
  store_id      INTEGER NOT NULL REFERENCES stores(id),
  to_store_id   INTEGER REFERENCES stores(id),
  person        TEXT,
  note          TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parties (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'customer' CHECK (type IN ('customer','supplier','both')),
  phone           TEXT,
  email           TEXT,
  gstin           TEXT,
  state           TEXT,
  address         TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,  -- +ve = they owe us (receivable), -ve = we owe them
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id              INTEGER PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN ('quotation','sales_order','sales_invoice','delivery_challan',
                    'sales_return','purchase_order','purchase_invoice','purchase_return')),
  number          TEXT NOT NULL,
  date            TEXT NOT NULL,
  due_date        TEXT,
  party_id        INTEGER REFERENCES parties(id),
  party_name      TEXT,           -- for walk-in / cash customers
  store_id        INTEGER NOT NULL REFERENCES stores(id),
  is_gst          INTEGER NOT NULL DEFAULT 1,
  tax_inclusive   INTEGER NOT NULL DEFAULT 0,
  place_of_supply TEXT,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','cancelled')),
  source_doc_id   INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  subtotal        REAL NOT NULL DEFAULT 0,  -- taxable value after line discounts
  discount        REAL NOT NULL DEFAULT 0,  -- line discounts total (info)
  cgst            REAL NOT NULL DEFAULT 0,
  sgst            REAL NOT NULL DEFAULT 0,
  igst            REAL NOT NULL DEFAULT 0,
  other_charges   REAL NOT NULL DEFAULT 0,
  round_off       REAL NOT NULL DEFAULT 0,
  total           REAL NOT NULL DEFAULT 0,
  cost_total      REAL NOT NULL DEFAULT 0,  -- purchase cost of items (for profit)
  notes           TEXT,
  terms           TEXT,
  transport       TEXT,
  vehicle_no      TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (type, number)
);
CREATE INDEX IF NOT EXISTS ix_docs_type_date ON documents(type, date);
CREATE INDEX IF NOT EXISTS ix_docs_party ON documents(party_id);

CREATE TABLE IF NOT EXISTS document_lines (
  id          INTEGER PRIMARY KEY,
  doc_id      INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  item_id     INTEGER REFERENCES items(id),
  description TEXT NOT NULL,
  hsn         TEXT,
  unit        TEXT,
  qty         REAL NOT NULL,
  rate        REAL NOT NULL,
  discount_pct REAL NOT NULL DEFAULT 0,
  gst_rate    REAL NOT NULL DEFAULT 0,
  taxable     REAL NOT NULL DEFAULT 0,
  cgst        REAL NOT NULL DEFAULT 0,
  sgst        REAL NOT NULL DEFAULT 0,
  igst        REAL NOT NULL DEFAULT 0,
  amount      REAL NOT NULL DEFAULT 0,
  cost_rate   REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS accounts (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL CHECK (kind IN ('cash','bank')),
  opening_balance REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY,
  number      TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('in','out')),  -- in = received, out = paid
  date        TEXT NOT NULL,
  party_id    INTEGER NOT NULL REFERENCES parties(id),
  account_id  INTEGER NOT NULL REFERENCES accounts(id),
  amount      REAL NOT NULL,
  reference   TEXT,
  note        TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  doc_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  amount     REAL NOT NULL,
  PRIMARY KEY (payment_id, doc_id)
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS expenses (
  id          INTEGER PRIMARY KEY,
  date        TEXT NOT NULL,
  category_id INTEGER REFERENCES expense_categories(id),
  account_id  INTEGER NOT NULL REFERENCES accounts(id),
  amount      REAL NOT NULL,
  note        TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
