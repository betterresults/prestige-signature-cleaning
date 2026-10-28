# Prestige Signature Cleaning website

Live: https://prestigesignaturecleaning.co.uk · Editor: https://prestigesignaturecleaning.co.uk/admin/

## How it works
- `content/` holds everything you edit: `site.json` (colours, business details), `services.json` (categories and services), `pages.json` (page titles and Google descriptions) and `pages/*.html` (the body of each page).
- Automatic parts are placeholders such as `<!--@svcards:all-->`, `<!--@related-->`, `<!--@catsections-->`. They are filled in from `services.json` on every build.
- `npm run build` runs `scripts/build.mjs`, which builds every page into `dist/` using `admin/render.mjs`. Netlify runs it on every push to `main`.
- The visual editor (`admin/`) uses the same `render.mjs`, so what you see in the editor is what gets published.
- Saving stores a draft in Netlify Blobs (no deploy). Publish makes one commit with all changes, which triggers one deploy.

## Netlify environment variables
`ADMIN_PASSWORD`, `ADMIN_SECRET`, `GITHUB_TOKEN` (Contents read and write on this repo), `GITHUB_REPO`.
