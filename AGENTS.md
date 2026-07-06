# AGENTS.md — HeatPriority

Build target for autonomous coding agents (Claude Code, etc.). Read this whole file before writing code. Work phase by phase, in order. Do not skip to Phase 3 polish while Phase 1 is broken.

## 0. What this is

HeatPriority is a web app that ranks a US city's census tracts by structural urban-heat risk, using the Mireye geospatial API (`api.mireye.com`) as the sole data source, plus free US Census geocoding for tract boundaries. Built for a Mireye take-home assignment. The grading call cares about: (1) does it actually work end-to-end with real API calls, (2) can you explain why Mireye vs alternatives, (3) can you honestly state where the data falls short. A working, honestly-scoped MVP beats an ambitious half-finished build. **Ship Phase 1 completely before starting Phase 2.**

## 1. Non-negotiable ground rules for the agent

- **Never fabricate a statistic, citation, or API behavior.** Every numeric claim in UI copy or code comments about Mireye's API (latency, limits, field semantics) must trace to this file or to a live response you actually fetched. If you're unsure, fetch `GET https://api.mireye.com/v1/meta/fields` (public, no auth) and check, or say "unverified" in a code comment.
- **Never hardcode a plausible-sounding field value.** If `/v1/fetch` fails or a field is null, surface that — do not substitute a guessed number.
- **Do not invent Mireye endpoints, parameters, or response fields** beyond what's documented in Section 3. If something you need isn't in Section 3, stop and flag it rather than guessing the shape.
- Keep the write-up/UI copy honest about limitations (Section 7). Do not oversell.
- Commit early and often with working code at each phase boundary.

## 2. Stack

- **Frontend + backend:** Next.js 14 (App Router), TypeScript, deployed on Vercel. API routes are serverless functions — Mireye calls happen server-side only (token must never reach the client).
- **Styling:** Tailwind CSS.
- **Map:** Mapbox GL JS (needs a free Mapbox token — if unavailable, fall back to Deck.gl or a simple SVG choropleth; do not block Phase 1 on map polish).
- **Boundaries:** US Census Geocoder API (free, no key) for city → bounding box, and TIGERweb/Census tract polygons (free, no key) — pre-fetch and cache as static GeoJSON per demo city rather than re-fetching every request.
- **No database needed.** In-memory/edge KV cache per session is enough for the assignment.

## 3. Mireye API — verified contract (checked live against docs.mireye.ai, July 2026)

### Auth
- Every `/v1/ask` and `/v1/fetch` call needs `Authorization: Bearer <token>`.
- Get a token: sign in at mireye.com → account settings → create API token. It's a JWT, default 90-day lifetime, shown once (re-revealable from dashboard while `recoverable`).
- Store as `MIREYE_API_TOKEN` in Vercel env vars / `.env.local`. Never expose to the client bundle.
- `GET /v1/meta/fields` is public, no token needed — use it for a startup sanity check (Phase 1, Step 0 below).

### `POST /v1/fetch` — deterministic field fetch
- Request: `{ lat: number, lng: number, fields?: string[], preset?: string }`. Need `fields` and/or `preset`. Combined field count capped at **50** after preset expansion (`400 fields_too_many` if exceeded — not a concern here, we're using ~9 fields).
- **One coordinate per request. No batching.** Loop client/server-side across sample points; parallelize with `Promise.all` in your own controlled batch size.
- Response: `{ lat, lng, fetched_at, fields: { [name]: { value, unit, source, source_url, confidence, fetched_at, dataset_vintage, ttl_seconds, notes } }, partial_failures: [{ field, source, error, retryable }] }`.
- Always returns 200 unless the request itself is malformed (bad lat/lng, unknown field name → check `/v1/meta/fields` first if unsure).
- `confidence` is `high` / `medium` / `low` / `unknown` **per field**.
- `partial_failures[].retryable`: `true` = transient, safe to retry with backoff once; `false` = source has no data at that coordinate, don't retry.
- **No documented rate limit or concurrency guidance** ("V1 has no metered quotas"). Do not assume a specific safe concurrency number is API-blessed — start conservative (e.g. 8–10 concurrent in-flight requests), measure actual latency/error rate against a real city, and tune from there. Document what you observed, not what you assumed.
- Coverage: `lat ∈ [18, 72]`, `lng ∈ [-180, -65]` (CONUS + AK/HI/territories) for most fields — but see per-field CONUS-only caveats below.

### `POST /v1/ask` — natural-language Q&A (used for exactly one feature: "explain this tract")
- Request: `{ lat, lng, question (≤2000 chars), include_trace?: boolean }`.
- Response: `{ lat, lng, question, answered_at, answer (prose string), confidence, citations: [{ source, source_url, fields, fetched_at, confidence }], fields_used: [...] }`.
- **Real measured latency: 6–15s steady-state warm path**, hard deadline 110s (`504 ask_timeout` past that). Build a visible loading state for this — do not assume it's fast.
- Errors follow `{"detail": {"error", "message", "retryable"}}`; honor `retryable`, not just status code.
- This endpoint picks its own fields via an internal planner (capped at 15 fields) — you don't control which fields it uses beyond the question text. Don't rely on it for exact field parity with your scoring model; it's for the human-readable explanation panel only.

### Verified field catalog for this build (confirmed live against `/v1/meta/fields`, do not re-derive from memory — re-check if the build behaves unexpectedly)

| Field | Layer | Type | Nullable | CONUS-only? | Notes |
|---|---|---|---|---|---|
| `tree_canopy_pct` | land_cover | float 0-100 | no | no | USFS/NLCD, 30m cell |
| `land_use_class` | land_cover | string enum (Agriculture/Developed/Forest/Other/Rangeland or Pasture/...) | no | no | USFS LCMS |
| `lcms_class` | land_cover | string enum (Tree/Shrub/Grass/Crop/Barren or Impervious/Water/Snow or Ice) | no | no | USFS LCMS |
| `ndvi_change_5y` | land_cover | float | no | no | Sentinel-2, negative = vegetation loss |
| `slope_degrees` | terrain | float | no | no | USGS 3DEP |
| `surface_water_permanence_pct` | terrain | float 0-100 | no | no | JRC GSW, 30m cell |
| `coast_distance_m` | terrain | float | no | no | NOAA CUSP, always populated (large for inland) |
| `soil_drainage_class` | terrain | string | no | no | USDA SSURGO |
| `days_above_32c_annual_count` | climate | int | **yes** | **yes — CONUS only** | NOAA nClimGrid-Daily, ~5km grid, multi-year mean; null outside CONUS or if raster not bootstrapped for a region |

Build the field list as a named constant (`HEAT_RISK_FIELDS`) and fetch all 8 non-climate fields in one `/v1/fetch` call per sample point (single layer-spanning call, no extra latency cost), plus a separate single call per tract centroid for `days_above_32c_annual_count`.

## 4. Scoring model

No ML for v1 — a transparent weighted composite is the right choice (interpretable, defensible to a city council, doesn't need ground-truth training data).

**Derived proxy (not a raw field):** Mireye has no continuous impervious-surface field. Compute `built_fraction` per tract as `(sample points where land_use_class == 'Developed') / (valid sample points)`, cross-checked against the share where `lcms_class == 'Barren or Impervious'`. If the two disagree by more than ~15 percentage points for a tract, flag that tract's `built_fraction` as lower-confidence in the UI.

**Weights** (literature-anchored, state the rationale in the UI, don't just show a number):

| Field | Weight | Direction |
|---|---|---|
| `tree_canopy_pct` | 35% | higher → lower risk |
| `built_fraction` (derived) | 25% | higher → higher risk |
| `days_above_32c_annual_count` | 15% | higher → higher risk (redistribute proportionally across other weights if null/gated for the session — see Phase 2, Step 4) |
| `ndvi_change_5y` | 10% | more negative → higher risk |
| `slope_degrees` | 8% | flatter → higher risk (cold-air drainage) |
| water proximity (`surface_water_permanence_pct` + inverse `coast_distance_m`) | 7% | closer/wetter → lower risk |

`soil_drainage_class` is a **feasibility flag shown alongside the score**, not folded into the weighted sum (it says which intervention is viable, not how hot the tract is).

**Normalization:** min-max within the city being analyzed (relative ranking, not a national scale). State this explicitly in the UI so a 0.9 score isn't misread as "hottest tract in America."

**Tiers:** High ≥0.70, Moderate 0.40–0.69, Lower <0.40.

## 5. Build phases

### Phase 0 — setup & verification (do this first, don't skip)
1. Get a Mireye API token, store in `.env.local` as `MIREYE_API_TOKEN`.
2. Write a tiny throwaway script that calls `/v1/fetch` for one known coordinate (e.g. Phoenix, AZ downtown: lat 33.4484, lng -112.0740) requesting all 9 fields from Section 3. Confirm real values come back, confirm `days_above_32c_annual_count` is non-null for a CONUS city and check its `confidence`. If it's null/gated, note that and build the fallback from Step 4 of Phase 2 now, not later.
3. Confirm the Census Geocoder API returns tract boundaries for the same demo city. Cache as static GeoJSON in the repo (`/data/tracts/phoenix-az.geojson`) rather than fetching live every request.

### Phase 1 — MVP: centroid-only, one hardcoded demo city, working end to end
Goal: a deployed Vercel URL that produces a real, correct-looking result. This is the minimum that satisfies "end to end... produce a result you could put in front of a real user."
1. Hardcode Phoenix, AZ (or your chosen demo city) — skip the city-name input for now.
2. For each tract centroid (not a 3×3 grid yet — just the centroid), call `/v1/fetch` for the 8 land-cover/terrain fields + the separate climate call. Loop with modest concurrency (start at 5–8 concurrent, per Section 3's rate-limit note).
3. Compute the HRI per tract per Section 4, using centroid values directly as the tract's aggregate (no areal sampling yet).
4. Render tracts on a choropleth (Mapbox GL, or a plain SVG map if Mapbox setup is friction — do not block on map polish).
5. Render a ranked table of top 10 highest-risk tracts.
6. Wire up `/v1/ask` for one tract's "explain this tract" panel, with a real loading spinner (6–15s is normal, don't treat it as a bug).
7. Deploy to Vercel. **This is your checkpoint — get this live before touching Phase 2.**

### Phase 2 — accuracy upgrade: areal sampling + city input + honesty features
1. Replace centroid-only with a 3×3 interior sample grid per tract for the 8 land-cover/terrain fields (climate field stays centroid-only — its ~5km grid makes sub-tract sampling pointless).
2. Add city-name input → Census Geocoder → bounding box → tract list, replacing the hardcoded city. Keep the pre-cached demo city as a fast "try it now" default.
3. Handle `partial_failures` per Section 3: retry `retryable: true` once, drop `retryable: false` points from that field's aggregate only, show a `coverage_pct` per tract.
4. Startup/session check: before scoring, fetch `days_above_32c_annual_count` for one known-good CONUS coordinate. If null or `confidence: unknown`, redistribute its 15% weight proportionally across the other five fields for that session and show a UI notice — don't silently score against null.
5. Add the recommendation panel (tree-planting vs cool-pavement vs field-campaign-focus) per tract based on the field combination.
6. Add the honest-limitations panel in the UI itself (not just the write-up) — no continuous imperviousness field, climate field is coarse/CONUS-only, census-tract resolution not block-level, no building-material/albedo data. Keep this to a few concrete sentences, not a restatement of the whole write-up.

### Phase 3 — polish (only after Phase 2 is solid)
- Second demo city (Baltimore, MD is a good pair — has equity/redlining literature to reference).
- Repo README: setup instructions, architecture summary, what's real Mireye data vs derived.
- Trim the write-up to something you'd actually hand someone before a 30-minute call — a page or two, not twelve sections. Lead with: what it does, why Mireye specifically, what you'd say if asked where the data fell short. Cut the market-sizing/red-team/moat sections down to a paragraph each or drop them; that's call material, not write-up material.
- **Before submitting: re-read the write-up for anything that looks like a leaked internal note (names, "what to say when asked X") and remove it.** A write-up handed to the company should not contain stage directions for the call.

## 6. What "done" looks like for submission

- [ ] Live Vercel URL, loads without errors
- [ ] Real `/v1/fetch` calls visible in network tab / server logs, not mocked data
- [ ] Real `/v1/ask` call powering at least one "explain this tract" interaction
- [ ] Choropleth map + ranked table + recommendation panel all populated from live data
- [ ] Repo is public with a clean README
- [ ] Write-up is short, honest, and free of any internal/meta commentary
- [ ] You can personally explain, without notes: why Mireye vs Google Maps/a GIS analyst/a generic LLM; what the built_fraction proxy is and why it's needed; where the data genuinely falls short

## 7. Known, disclosed data gaps (state these, don't hide them)

- No continuous 0–100% impervious-surface field exists in Mireye's catalog — `built_fraction` is a derived two-category proxy, coarser than a real imperviousness raster.
- `days_above_32c_annual_count` is CONUS-only and ~5km resolution — city-level triage weight, not fine-grained.
- No building-material/albedo data — two tracts with identical `built_fraction` could have very different real surface temperatures.
- No live/real-time temperature — all fields are periodic satellite/climate-normal products (`ttl_seconds` ranges from ~1 week to ~1 year depending on field).
- Census-tract + 3×3 sample grid is a discrete approximation, not a continuous field survey — appropriate for budget-allocation triage, not for picking an exact street corner.
