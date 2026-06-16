# Self-Hosting Outfit Font

The app now uses a locally-hosted version of the Outfit typeface for offline use in the native app.

## Setup (one-time)

Run the font download script on your Mac:

```bash
cd nutrition-goal-tracker
bash download-fonts.sh
```

This fetches the Outfit woff2 files (weights 400, 500, 600, 700) from Google Fonts and places them in `public/fonts/`.

Then rebuild:

```bash
npm run build && npm run ios:sync
```

## What changed

- **index.html** — Removed Google Fonts links (were blocking)
- **src/fonts.css** — New file with @font-face rules pointing to local files
- **src/index.css** — Now imports fonts.css before Tailwind
- **public/fonts/** — Font files (created by script)

## Result

The app no longer needs network access for typography — Outfit loads from the bundle. Works offline and is faster on first load.
