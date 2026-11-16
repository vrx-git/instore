# INSTORE — inventory on your iPhone

INSTORE is the phone version of Stock Register. It's an installable web app (PWA): open it in Safari, add it to your Home Screen, and it runs full-screen and offline like a normal app. All data is stored **on the phone** (IndexedDB). It does not share data with the PC app.

## Screens
- **Home**: total items, stock units and value, low-stock and out-of-stock counts, today's in/out, items that need attention, and recent movements.
- **Items**: search by name, SKU, barcode or shelf; filter by low/out/category/store; live stock badges (green OK, amber low, red out).
- **Item detail**: SKU, barcode, category, location, prices, GST, stock per store, full history. Big **− / +** buttons, plus *Adjust…* (add / remove / count / move between stores).
- **Scan**: camera barcode/QR scanner or typed code (USB/Bluetooth scanners work too). Choose stock in / out / count; "1 per scan" mode for rapid counting; unknown codes offer "Create item".
- **Activity**: audit trail of every change, grouped by day: who, what, which store, ±qty and the resulting stock. Filter by user, type, store and dates.
- **Settings**: stores/godowns, categories, users and PINs, backup/restore (JSON), demo items, install help.

Users log in with a **4-digit PIN**. The app locks after 5 minutes in the background.
- **Owner**: everything.
- **Staff**: view items and record stock only. Staff can't add, edit or archive items, delete history, or manage users and backups.

## Develop

```bash
npm install
npm run dev:instore      # http://localhost:5174
npm run test:instore     # service unit tests
npm run build:instore    # production build in instore/dist
```

To try it on your iPhone on the same Wi-Fi (camera won't work without HTTPS):

```bash
npm run dev:instore -- --host
```

Then open `http://<your-PC-IP>:5174` in Safari.

## Put it on your iPhone (free HTTPS hosting)

The camera and offline install need HTTPS. The included workflow `.github/workflows/instore-pages.yml` builds and publishes INSTORE to **GitHub Pages**:

1. Create an empty repository on GitHub and push this project to it.
2. On GitHub: **Settings → Pages → Source: GitHub Actions**.
3. Every push that changes `instore/` deploys to `https://<your-username>.github.io/<repo-name>/`.
4. On your iPhone, open that address in **Safari** → **Share** → **Add to Home Screen**.

Without GitHub, you can build it yourself (`npm run build:instore`) and drag the `instore/dist` folder onto Netlify Drop (app.netlify.com/drop).

## Keep your data safe
- Use the Home Screen icon. iOS doesn't auto-clear storage for Home Screen apps, but it can for websites opened only in Safari.
- **Settings → Back up now** saves a `.json` file to Files or iCloud Drive. **Restore from backup** brings it back on any phone.

## Code layout

```
src/data/       Dexie database + models (items, stores, categories, moves, users)
src/services/   stock ledger, items, PIN auth, backup, demo data  (no UI)
src/hooks/      live view-model hooks for each screen + session
src/components/ shared UI: tab bar, sheets, scanner, PIN pad, badges
src/screens/    Dashboard, Items, ItemDetail, ItemForm, Scan, Activity, Settings, Login
```

Stock uses the same ledger rule as the PC app: every change is a move, and stock is the sum of moves. Each move also records the user and the resulting balance, which feeds the audit trail.
