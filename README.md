# Stock Register — Inventory & GST Billing

A local-first inventory and billing app for Indian shops, godowns and small manufacturers, modelled on the features of stockregister.in. It runs on your PC and opens in the browser; all data stays in one SQLite file (`data/stockregister.db`).

## Run it

Needs Node.js 22.5 or newer (uses the built-in `node:sqlite`).

```bash
npm install
npm run dev        # server on :4000 + app on http://localhost:5173
```

On first start the app asks you to create the **owner account**.

To run it as a single app (no dev tools):

```bash
npm run build
npm start          # http://localhost:4000
```

Other staff on the same Wi-Fi can open `http://<your-PC-IP>:4000` and log in with their own accounts.

### Demo data

```bash
npm run seed
```

Adds a sample business, stores, items, parties, bills and payments **only if the database has no items yet**. If no user exists, it also creates a demo owner login: username `admin`, password `admin123`. Change it under Settings → My Password.

To try the demo without touching your real data, use a separate database file:

```bash
DB_FILE=data/demo.db npm run seed
DB_FILE=data/demo.db PORT=4100 npm start
```

(In PowerShell: `$env:DB_FILE="data/demo.db"; npm run seed`, then `$env:PORT="4100"; npm start`.)

## Features

**Inventory**
- Unlimited items with category, unit, HSN, GST %, purchase/sale price, MRP, barcode and low-stock alert
- Multiple stores and godowns, each with its own stock
- Stock In, Stock Out, Transfer between stores, Opening stock; printable issue/receive receipts
- Item stock movement history, store-wise stock, stock value, low-stock list
- Bulk edit (category, GST, unit, % price change), Excel import/export
- Barcode label printing (38/50/64 mm) and barcode scanning (USB scanner or phone/laptop camera)

**Billing**
- GST and non-GST sales invoices and purchase bills; CGST+SGST within your state, IGST for other states
- Rates with or without GST included, line discount, other charges, automatic round-off
- Quotation, Sales Order, Delivery Challan, Purchase Order, Sales Return (credit note), Purchase Return (debit note)
- Open/completed status and one-click convert: quotation → order/challan/invoice, PO → purchase bill, invoice → return
- Print A4, A5 and 2"/3"/4" thermal; logo, theme colour, bank details, amount in words, original/duplicate/triplicate copy labels; save as PDF from the print dialog; WhatsApp share link
- Walk-in cash sales without a customer

**Accounts**
- Customers and suppliers with opening balance, GSTIN (state filled automatically)
- Payment in/out against bills (or as advance), cash and bank accounts
- Party ledger with running balance (printable), total receivable/payable
- Expenses by category

**Reports**
- Dashboard: today/month sales, purchase, profit, receivable, payable, stock value, low stock, 30-day chart
- Profit & loss, bill-wise profit; sales/purchase by day, month, party or item
- Stock summary (opening/in/out/closing), store-wise stock, daily stock flow, price list, all transactions
- GSTR-1 (B2B, B2C summary, credit notes, HSN summary) and GSTR-2 summaries
- CSV export on every table

**Staff & safety**
- Roles: Owner (everything), Manager (no settings/staff), Staff (day-to-day entries only, no delete/reports)
- Backup download and restore (a safety copy is kept in `data/backups` before restoring)

## How stock is calculated

Every stock change is one row in `stock_moves` (opening, in, out, transfer, sale, purchase, returns, challans). Current stock is the sum of those rows, so reports can never drift out of sync. Editing, cancelling or deleting a bill rewrites its stock rows. A delivery challan that is converted to an invoice hands its stock over to the invoice, so stock is not reduced twice.

## Project layout

```
server/   Express API (TypeScript, node:sqlite)
  src/db/schema.sql        tables
  src/services/            stock ledger, documents & GST, party ledger
  src/routes/              REST endpoints
  test/                    unit tests (npm test)
client/   React + Vite + Tailwind app
data/     your database and backups (not in git)
```

## Not included

Android app, cloud sync, e-way bill / e-invoice (IRN) generation, sending WhatsApp/SMS automatically.
