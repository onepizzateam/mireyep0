HeatPriority — Phase 0

This repo contains Phase 0 artifacts for the HeatPriority Mireye take-home.

Quick commands:

- Fetch Phoenix tracts (Maricopa county):

```bash
node scripts/fetch_phoenix_tracts.js
```

- Verify Mireye `/v1/fetch` for Phoenix:

```bash
node scripts/verify_mireye_fetch.js
```

Notes:
- Place your `MIREYE_API_TOKEN` in `.env.local` (or export it in your shell) before running `verify`.
- Outputs are written to `outputs/` and tract GeoJSON to `data/tracts/`.

Run the local frontend (Phase 1 UI):

```bash
npm install
npm run dev
```

The frontend serves a Mapbox choropleth and a side panel at `http://localhost:3000`.

Phase 1 → 3 developer notes
- Fetch tracts (robust):

```bash
# Phoenix
node scripts/fetch_tracts_robust.js "Phoenix, AZ"
# Baltimore
node scripts/fetch_tracts_robust.js "Baltimore, MD"
```

- Run scoring (uses `data/tracts/<city>.geojson` when present, otherwise grid fallback):

```bash
npm run score
```

- Fetch demo cities (both Phoenix and Baltimore):

```bash
npm run fetch-demos
```
