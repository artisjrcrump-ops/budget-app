# Budget

A budgeting app for iPhone, built as a web app you add to the home screen. Log each shift's tips, see the week at a glance, and get an estimate of each weekly paycheck after taxes.

All data stays on the phone. Nothing is sent anywhere.

## Use it

1. Open the app's web address in Safari on the iPhone.
2. Tap Share, then **Add to Home Screen**.
3. Open it from the home screen, go to **Settings**, and tap **Import tip tracker file** to load past shifts from a CSV export.
4. Back up from Settings now and then, and keep the file in iCloud Drive.

## Develop

No build step. Serve the folder and open it:

```sh
python3 -m http.server 8000
npm test
```

- `js/tax.js` holds the 2026 withholding tables (federal Pub 15-T, NYS-50-T-NYS, NYC approximated). Update them each January.
- `js/csv.js` reads and writes the tip tracker's CSV layout.
- `js/calc.js` has the week and money math; `js/app.js` draws the screens.
