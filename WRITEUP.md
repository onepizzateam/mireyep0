HeatPriority — short writeup

What it does
- Ranks census tracts in a US city by a transparent heat-risk index (HRI) using Mireye `/v1/fetch` fields.

Why Mireye
- Mireye provides per-coordinate environmental and land-cover fields (tree canopy, NDVI change, land use, slope, soil, water proximity) that let us build an interpretable composite without training labels.

Key implementation notes
- Phase 0: verification script (`scripts/verify_mireye_fetch.js`) to confirm the field catalog and retrieve sample values.
- Phase 1: centroid scoring and choropleth UI; `scripts/score_phoenix.js` reads `data/tracts/<city>.geojson` when present, otherwise falls back to a grid sample.
- Phase 2: areal 3x3 sampling per tract, partial_failure retry logic, `built_fraction` derived proxy, `coverage_pct` reporting, and session-level climate availability handling.

Limitations
- `built_fraction` is a simplified proxy.
- Climate field is coarse and CONUS-only.
- Tract-level results are triage-focused, not street-resolution.

How to run locally
- See README.md for detailed commands.
