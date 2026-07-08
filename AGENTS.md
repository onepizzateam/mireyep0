# AGENTS.md — SignalRent Build Instructions

> **This file is the single source of truth for building SignalRent end to end.**
> Read it completely before writing any code. Follow it in order. Do not skip sections.
> When in doubt, re-read this file before making a decision.

---

## 0. What You Are Building

**SignalRent** is a web application that tells US property owners what their cell tower lease is actually worth and how hard the carrier needs their site.

A landlord enters an address (via search + a draggable map pin to confirm the exact site location — see Section 11), an optional carrier name, and an optional offered/current rent. The app fetches 60 fields from the Mireye API (two parallel 30-field batch requests — Mireye caps single requests at 50 fields), runs a scoring model across four dimensions, and returns:

1. A site score (0–100) with a visual breakdown by dimension
2. A benchmark monthly rent range calibrated to site type and score
3. A plain-English leverage summary (2–3 sentences) explaining negotiating position
4. If a rate was entered: a comparison showing how far above/below market the offer sits
5. If a buyout amount was entered: a fair value range and multiple comparison

The free tier shows all of the above in the browser. A "Get Full Report — $49" button generates a real PDF report server-side (see Section 15) — cover section, full dimension breakdown, benchmark range, field-level table, expanded leverage summary, and data provenance/limitations. Payment is not wired up (button is gated but Stripe integration is out of scope for MVP) — see Section 15.

**Stack**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui. No database for MVP — all computation is stateless per request. Deploy target: Vercel.

---

## 1. Repository Structure

```
signalrent/
├── AGENTS.md                  ← this file
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── .env.local                 ← MIREYE_API_KEY (never commit)
├── .env.example               ← committed, no real values
│
├── src/
│   ├── app/
│   │   ├── layout.tsx         ← root layout, font, metadata
│   │   ├── page.tsx           ← landing page with hero + form
│   │   ├── globals.css
│   │   └── api/
│   │       ├── score/
│   │       │   └── route.ts   ← POST handler: geocode → Mireye → score → response
│   │       └── health/
│   │           └── route.ts   ← GET { ok: true }
│   │
│   ├── components/
│   │   ├── AddressForm.tsx     ← main input form
│   │   ├── ScoreCard.tsx       ← score display + dimension bars
│   │   ├── BenchmarkBand.tsx   ← benchmark range visualization
│   │   ├── LeverageSummary.tsx ← plain-English summary card
│   │   ├── RateComparison.tsx  ← offered vs benchmark comparison
│   │   ├── FieldDisclosure.tsx ← expandable "how we calculated this"
│   │   ├── DataGapBanner.tsx   ← FCC tenancy caveat banner
│   │   └── ui/                ← shadcn components (auto-generated, do not edit)
│   │
│   ├── lib/
│   │   ├── mireye.ts          ← Mireye API client (fetch wrapper)
│   │   ├── geocode.ts         ← address → lat/lng (Nominatim)
│   │   ├── score.ts           ← full scoring model
│   │   ├── benchmark.ts       ← benchmark range calculator
│   │   ├── leverage.ts        ← leverage summary text generator
│   │   └── types.ts           ← all shared TypeScript types
│   │
│   └── constants/
│       ├── fields.ts          ← the 60 Mireye field names as a typed array, split into two 30-field batches
│       ├── weights.ts         ← dimension weights and multiplier thresholds
│       └── benchmarks.ts      ← benchmark range tables by site type and score band
│
└── tests/
    ├── score.test.ts          ← unit tests for scoring model
    └── benchmark.test.ts      ← unit tests for benchmark ranges
```

---

## 2. Environment Variables

```bash
# .env.local (never commit)
MIREYE_API_KEY=your_key_here

# .env.example (commit this)
MIREYE_API_KEY=your_mireye_api_key_here
```

The Mireye API key lives server-side only. It is never sent to the client. All Mireye calls happen inside `src/app/api/score/route.ts`.

---

## 3. The 60 Mireye Fields

These are the exact field names to request. Store them in `src/constants/fields.ts` as two `const` arrays — `MIREYE_FIELDS_BATCH_1` and `MIREYE_FIELDS_BATCH_2`, 30 fields each — and import everywhere; never hard-code field name strings outside this file. Mireye enforces a 50-field cap per `/v1/fetch` call, so the 60 fields must be split and fetched as two parallel requests (fire both with `Promise.all`; wall time is the slower batch, not the sum).

### Dimension 1 — Coverage Necessity (weight: 40%)
```
antenna_structures_within_500m_count
antenna_structures_within_2km_count
nearest_antenna_structure_distance_m
nearest_antenna_structure_height_m
nearest_antenna_structure_type
mobile_5g_coverage_class
nearest_major_road_distance_m
nearest_major_road_class
elevation
nearest_hospital_distance_m
nearest_school_distance_m
nearest_urban_area_distance_m
```

### Dimension 2 — Subscriber Value (weight: 35%)
```
housing_units_within_1km
housing_units_density_per_km2
poi_count_1km
total_road_length_within_500m_m
nearest_lodging_distance_m
```

### Dimension 3 — Construction Cost (weight: 25%, scored inversely)
```
slope_degrees
bedrock_depth_cm
soil_drainage_class
soil_shrink_swell_class
within_floodplain_polygon
seismic_pga_2pct_50yr_g
seismic_design_category
design_wind_speed_mph
landslide_susceptibility_index
lightning_annual_flash_days
wildfire_annual_frequency
tornado_annual_frequency
nearest_transmission_line_distance_m
nearest_substation_distance_m
nearest_substation_status
fiber_broadband_available
fiber_provider_count
nearest_road_surface
coast_distance_m
mean_annual_relative_humidity_pct
days_above_32c_annual_count
mean_annual_snow_cover_days
mean_annual_dry_bulb_temperature_degc
avg_retail_electricity_price_industrial_usd_per_kwh
intersects_nhd_area
```

### Dimension 4 — Permitting Friction (leverage multiplier, NOT additive)
```
intersects_wetland
wetlands_within_100m_count
nearest_wetland_distance_m
intersects_protected_area
protected_area_gap_status
intersects_conservation_easement
intersects_critical_habitat
critical_habitat_status
land_use_class
parcel_zoning
lcms_class
tree_canopy_pct
surface_management_agency
special_use_airspace_type
nearest_airport_distance_m
golden_eagle_nest_density_index
primary_building_height_m
nearest_class_i_area_distance_m
```

**Total: 60 fields.** Split across two parallel `/v1/fetch` batch requests (30 fields each) to stay under Mireye's 50-field-per-call limit.

---

## 4. Mireye API Integration (`src/lib/mireye.ts`)

### Base URL
```
https://api.mireye.com/v1
```

### Authentication
```
Authorization: Bearer ${process.env.MIREYE_API_KEY}
Content-Type: application/json
```

### Fetch endpoint
```
POST /v1/fetch
Body: {
  "lat": number,
  "lng": number,
  "fields": string[]   // 30 field names per call — fire two calls in parallel, one per batch
}
```

### Response shape (partial — Mireye returns an object with all requested fields)
```typescript
type MireyeResponse = {
  // Each field is keyed by its name. Value is the data + provenance.
  [fieldName: string]: {
    value: number | string | boolean | null;
    source: string;
    updated_at: string;
  }
}
```

### Implementation notes
- Wrap in a typed function `fetchMireyeFields(lat: number, lng: number): Promise<MireyeFields>` — internally fires both 30-field batches in parallel via `Promise.all` and merges the results
- `MireyeFields` is a flat object mapping each of the 60 field names to its value (unwrap the `value` key from the Mireye response object)
- If a field comes back null, the scoring model must handle it gracefully — see Section 5
- Set a per-batch timeout of 45 seconds (observed: batch 2 — permitting/climate fields — can take 20–28s on slow responses); if a batch times out, throw a `MireyeTimeoutError`
- Log the raw response to server console in dev, suppress in production
- Do not retry on failure for MVP — surface the error to the user

---

## 5. Geocoding (`src/lib/geocode.ts`)

Use the **Nominatim** OpenStreetMap geocoder. It's free and requires no API key.

```
GET https://nominatim.openstreetmap.org/search
  ?q={encodeURIComponent(address)}
  &format=json
  &limit=1
  &countrycodes=us
```

**Headers required by Nominatim TOS:**
```
User-Agent: SignalRent/1.0 (contact@signalrent.com)
```

Return type:
```typescript
type GeocodedAddress = {
  lat: number;
  lng: number;
  displayName: string;  // Nominatim's formatted address
}
```

Throw `GeocodingFailedError` if no results. Do not use the Google Maps API — no key, no cost.

---

## 6. Scoring Model (`src/lib/score.ts`)

This is the core of the product. Implement it exactly as described.

### Types

```typescript
export type DimensionScore = {
  raw: number;       // 0–100
  label: string;     // "Coverage Necessity", etc.
  weight: number;    // 0.40, 0.35, 0.25
  topFields: FieldContribution[];  // top 3 fields driving this dimension
};

export type FieldContribution = {
  fieldName: string;
  value: number | string | boolean | null;
  impact: "high" | "medium" | "low";
  direction: "positive" | "negative" | "neutral";
  explanation: string;  // one sentence, plain English
};

export type SiteScore = {
  baseline: number;         // 0–100, weighted sum of dim 1–3
  multiplier: number;       // 0.5–2.0 from permitting friction
  final: number;            // baseline × multiplier, clamped 0–100
  dimensions: {
    coverageNecessity: DimensionScore;
    subscriberValue: DimensionScore;
    constructionCost: DimensionScore;
  };
  permittingFriction: {
    multiplierRaw: number;
    flags: string[];         // list of friction flags that fired, plain English
  };
  siteType: "urban" | "suburban" | "rural";
  dataGaps: string[];        // list of null fields that affected scoring
};
```

### Step 1 — Classify site type

Used to select the benchmark range table and to calibrate dimension scoring.

```
siteType = "urban"    if nearest_urban_area_distance_m < 5000
            AND housing_units_density_per_km2 > 2000

siteType = "suburban" if nearest_urban_area_distance_m < 25000
            AND housing_units_density_per_km2 > 400

siteType = "rural"    otherwise (both fields present, neither urban nor suburban condition met)
```

**Implementation note (this bit a real build — enforce it in code review):** `SITE_TYPE_THRESHOLDS` in `constants/weights.ts` must define explicit `rural` thresholds, not just `urban`/`suburban` with rural left as an implicit code comment. The classification function must have three distinct return paths — a site that fails both the urban and suburban checks must explicitly return `"rural"`, not silently fall through to the same code path as the null-data case below. Rural has historically been unreachable when this was implemented as "return suburban unless X or Y," so write it as an explicit if/else-if/else-if/else chain with `rural` as its own branch, not as the shared fallback.

If either `nearest_urban_area_distance_m` or `housing_units_density_per_km2` is null, this is a *separate* case from genuine rural classification — fall back to `"suburban"` (the safest default given no location signal) and add both field names to `dataGaps`, clearly distinguishing "we don't know" from "we checked and it's rural."

### Step 2 — Score Dimension 1: Coverage Necessity (0–100)

Compute a sub-score for each field group below, then average them (equal weight within the dimension).

**Group A — Competitive density (most important)**
```
antenna_structures_within_500m_count:
  0 structures  → 100
  1             → 75
  2             → 45
  3+            → 20

antenna_structures_within_2km_count:
  0             → 100
  1–2           → 80
  3–5           → 55
  6+            → 30

nearest_antenna_structure_distance_m:
  > 2000m       → 100
  1000–2000m    → 80
  500–1000m     → 55
  < 500m        → 30

nearest_antenna_structure_type:
  null/unknown  → 50 (neutral, flag in dataGaps)
  "guyed"       → 40 (has capacity, bad for landlord — but caveat FCC tenancy gap)
  "monopole"    → 65 (limited capacity)
  "building"    → 70 (limited capacity)
```

**Group B — Network coverage urgency**
```
mobile_5g_coverage_class:
  "No coverage"     → 100
  "Partial"         → 70
  "Coverage"        → 40
  null              → 50 (flag in dataGaps)
```

**Group C — Highway necessity**
```
nearest_major_road_class:
  "motorway"        → 90  (carrier must cover this)
  "trunk"           → 70
  "primary"         → 50
  "secondary"       → 30
  other/null        → 20

nearest_major_road_distance_m:
  < 200m            → 100
  200–500m          → 80
  500–2000m         → 55
  > 2000m           → 25
```

Combine Groups B and C: average them, then average with Group A giving Group A double weight.
`dim1_score = (groupA × 2 + groupB + groupC) / 4`

Clamp to 0–100. Log the top 3 contributing fields.

**Elevation bonus** (applied after clamping):
```
elevation:
  > 1500m    → add 8 points (expand coverage radius significantly)
  > 800m     → add 4 points
  else       → 0
```
Re-clamp after bonus.

If `nearest_antenna_structure_type = "guyed"` and structures are present, add a flag to `dataGaps`:
`"FCC tenancy unknown: nearest structure is a guyed tower — actual co-location capacity not verifiable from available data"`

### Step 3 — Score Dimension 2: Subscriber Value (0–100)

```
housing_units_density_per_km2:
  > 5000     → 100
  2000–5000  → 80
  500–2000   → 55
  100–500    → 35
  < 100      → 15
  null       → 40 (flag in dataGaps)

housing_units_within_1km:
  > 3000     → 100
  1000–3000  → 75
  300–1000   → 50
  < 300      → 25
  null       → 40

poi_count_1km:
  > 200      → 100
  50–200     → 75
  10–50      → 50
  < 10       → 25
  null       → 35

total_road_length_within_500m_m:
  > 5000     → 100
  2000–5000  → 75
  500–2000   → 50
  < 500      → 25
  null       → 40

nearest_lodging_distance_m:
  < 500m     → 90  (hotel/motel = high-ARPU data users)
  500–2000m  → 65
  > 2000m    → 40
  null       → 40
```

`dim2_score = average of all five sub-scores`

### Step 4 — Score Dimension 3: Construction Cost (0–100, INVERTED)

Higher construction complexity → lower score (harder for carrier to replace, but also less desirable to build — net effect depends on alternatives, handled by the multiplier). Score represents construction ease; a hard site scores low.

```
slope_degrees:
  < 2°       → 100 (flat)
  2–10°      → 75
  10–25°     → 40
  > 25°      → 15
  null       → 60

bedrock_depth_cm:
  > 200cm    → 100 (deep bedrock, easy foundation)
  100–200cm  → 75
  50–100cm   → 45
  < 50cm     → 20 (must blast)
  null       → 60

soil_drainage_class:
  "Well drained"          → 100
  "Moderately drained"    → 75
  "Somewhat poorly"       → 50
  "Poorly" or "Very poorly" → 25
  null                    → 60

within_floodplain_polygon:
  false / null            → 100
  true                    → 30

seismic_pga_2pct_50yr_g:
  < 0.05     → 100
  0.05–0.15  → 80
  0.15–0.40  → 55
  > 0.40     → 25
  null       → 65

landslide_susceptibility_index:
  < 10       → 100
  10–30      → 75
  30–60      → 45
  > 60       → 20
  null       → 65

fiber_broadband_available:
  true       → 100 (cheap backhaul)
  false      → 50
  null       → 60

nearest_transmission_line_distance_m:
  < 500m     → 100
  500–2000m  → 75
  2000–5000m → 50
  > 5000m    → 25
  null       → 60
```

For remaining Dimension 3 fields (`design_wind_speed_mph`, `lightning_annual_flash_days`, `wildfire_annual_frequency`, etc.) that are less commonly null, apply similar ordinal scoring. If a field is null, use 60 as a neutral fallback and add to `dataGaps`.

`dim3_score = average of all sub-scores`

> Note: this dimension is NOT inverted in the final score. A score of 100 means "easy to build" — which is GOOD for the landlord if there are no alternatives, but BAD if the carrier can easily build elsewhere. The multiplier in Stage 2 handles this interaction; do not pre-invert dim3.

### Step 5 — Compute Baseline Score

```typescript
const baseline = (
  dim1_score * 0.40 +
  dim2_score * 0.35 +
  dim3_score * 0.25
);
// clamp 0–100
```

### Step 6 — Compute Permitting Friction Multiplier

The friction dimension does NOT add to the baseline. It multiplies it. Start at `multiplier = 1.0` and apply the bonuses below. Cap at 2.0, floor at 0.5.

Each flag that fires adds to the multiplier AND adds a human-readable string to `permittingFriction.flags`.

```
intersects_wetland = true          → +0.25, flag: "Site intersects wetland (Section 404 permitting applies to alternatives)"
wetlands_within_100m_count > 2     → +0.15, flag: "3+ wetlands within 100m constrain alternative site search ring"
intersects_protected_area = true   → +0.30, flag: "Protected area: new tower construction near-impossible"
protected_area_gap_status = "GAP1" → +0.10 additional (on top of above)
intersects_conservation_easement = true → +0.20, flag: "Conservation easement limits alternative siting in area"
intersects_critical_habitat = true → +0.35, flag: "ESA critical habitat: hardest permitting environment for new construction"
critical_habitat_status = "Final"  → +0.05 additional
special_use_airspace_type != null  → +0.15, flag: "Special use airspace constrains tower height for alternatives"
nearest_airport_distance_m < 5000  → +0.10, flag: "FAA notification zone within 3nm limits alternative tower heights"
surface_management_agency != null  → +0.10, flag: "Federal land management adds regulatory layers to alternative siting"
golden_eagle_nest_density_index > 0.5 → +0.10, flag: "Eagle habitat requires US Fish & Wildlife consultation for new construction"
parcel_zoning = "residential" or "historic" → +0.10, flag: "Residential/historic zoning: community opposition to new tower siting likely"
```

If permitting friction flag list is empty, set multiplier = 0.85 (easy permitting environment means carrier can replace the site — slight leverage discount).

`final_score = clamp(baseline * multiplier, 0, 100)`

---

## 7. Benchmark Range Calculator (`src/lib/benchmark.ts`)

### Source data (hardcode in `src/constants/benchmarks.ts`)

These ranges are calibrated to published industry data and three documented case outcomes. They are a prior, not a statistical fit — the app discloses this to users.

```typescript
// Monthly rent ranges by site type and score band
export const BENCHMARK_TABLE = {
  urban: {
    high:   { min: 3500, max: 6000 },  // score >= 75
    mid:    { min: 2500, max: 3500 },  // score 50–74
    low:    { min: 1500, max: 2500 },  // score < 50
  },
  suburban: {
    high:   { min: 1800, max: 2800 },
    mid:    { min: 1200, max: 1800 },
    low:    { min: 700,  max: 1200 },
  },
  rural: {
    high:   { min: 900,  max: 1500 },
    mid:    { min: 600,  max: 900  },
    low:    { min: 350,  max: 600  },
  },
} as const;

// Buyout multiples by score band
export const BUYOUT_MULTIPLES = {
  high:   { min: 14, max: 18 },   // score >= 75
  mid:    { min: 10, max: 14 },   // score 50–74
  low:    { min: 6,  max: 10 },   // score < 50
} as const;
```

### Output

```typescript
export type BenchmarkResult = {
  monthlyRange: { min: number; max: number };
  annualRange:  { min: number; max: number };
  siteType: "urban" | "suburban" | "rural";
  scoreBand: "high" | "mid" | "low";
  calibrationNote: string;  // always shown to user
};
```

`calibrationNote` should always read:
> "Benchmark range calibrated to published industry data (Steel in the Air, Vertical Consultants, Tower Genius) and three documented negotiated outcomes. This is an informed prior, not a transaction database — actual negotiated rates in your area may vary."

---

## 8. Leverage Summary Generator (`src/lib/leverage.ts`)

Generate 2–3 plain-English sentences summarizing the landlord's position. This is rule-based, not LLM-generated (keeps it fast, deterministic, and free).

### Logic

Pull the top 2 contributing factors across all dimensions and the friction flags, then assemble the summary from templates. Examples:

```typescript
// Coverage necessity is high driver, no alternatives
if (dim1_score > 75 && antenna_structures_within_500m_count === 0) {
  sentences.push(`The carrier has no registered antenna structures within 500 meters — your site is the only viable option in the standard search ring.`)
}

// FCC tenancy gap caveat — always shown if nearest structure type is guyed
if (nearest_antenna_structure_type === "guyed" && antenna_structures_within_2km_count > 0) {
  sentences.push(`The nearest structure is a guyed tower — structure type suggests additional co-location may be possible, but actual tenant count is not publicly verifiable from available data. Confirm with the carrier before conceding on competition.`)
}

// Subscriber value high
if (dim2_score > 70) {
  sentences.push(`This area's population density places it in the top subscriber-value tier for ${siteType} sites — carriers generate significant revenue per site here.`)
}

// Permitting friction high
if (multiplier > 1.4) {
  const topFlag = permittingFriction.flags[0];
  sentences.push(`${topFlag} — this significantly raises the carrier's cost of finding an alternative site.`)
}

// Leverage conclusion
if (final_score > 75) {
  sentences.push(`Overall leverage is high. Open well above the offered rate.`)
} else if (final_score > 55) {
  sentences.push(`Leverage is moderate. You have room to negotiate but the carrier has some alternatives.`)
} else {
  sentences.push(`Leverage is limited. The carrier has viable alternatives — negotiate on terms (escalators, co-location rights) rather than base rate alone.`)
}
```

Cap at 3 sentences. Return as a `string[]`.

### Special case: Buyout mode
If `buyoutAmount` is provided, append:
> "Buyout offers from lease aggregators are opening positions. Counter at the midpoint of the fair value range or request a competing bid before accepting."

---

## 9. Rate Comparison Logic

If `offeredRate` is provided (number, monthly):

```typescript
export type RateComparison = {
  offeredRate: number;
  benchmarkMin: number;
  benchmarkMax: number;
  position: "below" | "within" | "above";
  gapPercent: number;  // how far below mid of range, as %
  gapDollars: number;  // monthly
  thirtyYearCost: number;  // gapDollars * 12 * 30
  message: string;
};
```

`position = "below"` if offeredRate < benchmarkMin
`position = "within"` if offeredRate >= benchmarkMin && <= benchmarkMax
`position = "above"` if offeredRate > benchmarkMax

`gapPercent` = ((benchmarkMid - offeredRate) / benchmarkMid) * 100
(negative if above benchmark)

`thirtyYearCost` — always show this number when position = "below". This is the lifetime cost of signing the first offer.

If `buyoutAmount` is provided instead of/in addition to `offeredRate`:
```typescript
const impliedMultiple = buyoutAmount / (offeredRate * 12);
const fairValueMin = offeredRate * 12 * BUYOUT_MULTIPLES[scoreBand].min;
const fairValueMax = offeredRate * 12 * BUYOUT_MULTIPLES[scoreBand].max;
```

---

## 10. API Route (`src/app/api/score/route.ts`)

### Request schema

```typescript
type ScoreRequest = {
  address: string;           // required
  carrier?: string;          // optional, stored for display only
  offeredRate?: number;      // optional, monthly dollars
  buyoutAmount?: number;     // optional, lump sum
};
```

### Response schema

```typescript
type ScoreResponse = {
  ok: true;
  address: string;
  displayAddress: string;    // from Nominatim
  lat: number;
  lng: number;
  carrier?: string;
  score: SiteScore;
  benchmark: BenchmarkResult;
  leverageSummary: string[];
  rateComparison?: RateComparison;
  buyoutComparison?: BuyoutComparison;
  dataGaps: string[];
  processingMs: number;
};
```

### Error response

```typescript
type ScoreErrorResponse = {
  ok: false;
  error: string;    // user-facing message
  code: "GEOCODING_FAILED" | "MIREYE_ERROR" | "MIREYE_TIMEOUT" | "INVALID_INPUT" | "UNKNOWN";
};
```

### Route implementation notes

- Validate input with zod before calling anything external
- Run geocoding first; if it fails, return `GEOCODING_FAILED` immediately
- Call Mireye with all 60 fields via `fetchMireyeFields()` (two parallel batch requests internally)
- Run scoring, benchmark, leverage, comparison in memory — no async needed after Mireye
- Log timing at each step in dev
- Return HTTP 200 for both success and application-level errors (use `ok` field to distinguish)
- Never expose the Mireye API key in the response or logs

---

## 11. Frontend (`src/app/page.tsx` and components)

### Page layout

```
[Hero: headline + subheadline]
[AddressForm]
        ↓ (on submit, shows skeleton loader)
[ScoreCard]
[BenchmarkBand]
[RateComparison]  ← only if rate was entered
[LeverageSummary]
[DataGapBanner]   ← always shown if dataGaps.length > 0
[FieldDisclosure] ← expandable accordion, collapsed by default
[CTACard: "Get Full Report — $49"]
```

### AddressForm

Fields:
- **Address** (text, required, placeholder: "123 Main St, Springfield, IL") — on selection from the Mapbox geocoder autocomplete, flies the map to that location and drops a draggable pin at the geocoded point
- **Map pin** (Mapbox GL, 300px height, sits below the address input) — user drags the pin to the exact site location (parcel corner, road edge — wherever the tower actually is or would be). The confirmed pin coordinate, not the raw geocoded coordinate, is what gets sent to `/api/score`. Small mono-text coordinate readout below the map. Copy note below the map: "Drag the pin to the exact location — tower leases are typically signed on parcel corners near roads, not address centroids."
- **Carrier / Tower Company** (text, optional, placeholder: "e.g. Crown Castle, Verizon, AT&T")
- **Offered / Current Monthly Rate** (number, optional, placeholder: "$800")
- **Buyout Offer** (number, optional, placeholder: "$95,000")
- Submit button: "Run valuation" — disabled until a pin has been placed

On submit: POST to `/api/score` with the confirmed `lat`/`lng`, show skeleton loader, render results.
On error: show inline error message with `error` field from response.

### ScoreCard

Show the final score as a large number (e.g. "81 / 100") with a horizontal progress bar.
Below it, show three dimension bars (Coverage Necessity, Subscriber Value, Construction Cost) with their raw scores and weights.
Show the permitting friction multiplier separately: "Leverage Multiplier: 1.4×" with a tooltip explaining what it means.

### BenchmarkBand

A horizontal range visualization. Show:
- The benchmark min–max as a colored band
- A marker at the offered rate (if provided)
- Labels: "$1,200/mo" on the left, "$2,800/mo" on the right, "Your Offer: $750/mo" with an arrow

### LeverageSummary

A card with a header "Your Negotiating Position" and the 2–3 sentences from `leverageSummary`. Style with a left border colored by score (green > 70, yellow 45–70, red < 45).

### DataGapBanner

If `dataGaps.length > 0`, show a collapsible amber banner:
> "⚠ Data limitations: [N] fields affecting this score were unavailable or uncertain. [expand to see details]"

Always include the FCC tenancy caveat if it's in dataGaps.

### FieldDisclosure

Expandable accordion. Shows a table: Field Name | Value | Dimension | Impact. One row per field that contributed meaningfully to the score. This is how the user can verify the output.

---

## 12. Data Gap Disclosure (Non-Negotiable)

The following disclosures MUST appear in the UI. They are not optional and must not be removed:

1. **FCC Tenancy Caveat** (show whenever nearest_antenna_structure_type is "guyed" or antenna_structures_within_2km_count > 0):
   > "Structure type data is available but actual co-location tenant counts are not — a nearby tower may appear as competition but could already be at structural capacity. Verify with the carrier."

2. **Benchmark Calibration Note** (always show below the benchmark range):
   > "Benchmark calibrated to published industry ranges and documented case outcomes — not a transaction database. See methodology."

3. **RF Coverage Limitation** (always show in FieldDisclosure or footer):
   > "This tool assesses site potential for coverage necessity using FCC public data. It cannot access carrier-internal RF coverage models or drive-test data."

---

## 13. Styling and Design

- Use **Tailwind CSS** utility classes throughout
- shadcn/ui components for form inputs, cards, accordions, tooltips
- Color palette:
  - Score high (≥ 75): `green-600`
  - Score mid (50–74): `amber-500`
  - Score low (< 50): `red-500`
  - Brand accent: `blue-600`
  - Background: `gray-50`, cards: `white`
- Typography: Inter (via next/font)
- Mobile-first — the form and results must be fully usable on a phone
- No animations or transitions for MVP — keep it fast
- The hero headline: **"Find out what your cell tower lease is actually worth."**
- Subheadline: **"Carriers know exactly what your site is worth. Now you can too."**

---

## 14. Tests (`tests/`)

Write unit tests for the scoring model and benchmark calculator. Do not test the API route or frontend components for MVP.

### `tests/score.test.ts`

Test the following scenarios:

1. **High-leverage rural site**: `antenna_structures_within_500m_count = 0`, `mobile_5g_coverage_class = "No coverage"`, `intersects_critical_habitat = true` → expect `final_score > 75`, `multiplier > 1.5`, `siteType = "rural"`

2. **Low-leverage urban site**: `antenna_structures_within_500m_count = 3`, `housing_units_density_per_km2 = 6000`, no permitting flags → expect `dim1_score < 40`, `dim2_score > 80`, `multiplier < 1.0`

3. **Null field handling**: Pass several key fields as null → expect graceful score, `dataGaps.length > 0`, no crash

4. **FCC tenancy caveat fires**: `nearest_antenna_structure_type = "guyed"`, `antenna_structures_within_2km_count = 1` → expect FCC tenancy string in `dataGaps`

5. **Calibration case — SC suburban**: Set fields to approximate suburban SC macro site (moderate density, 1 structure within 2km, no major permitting flags) → expect `benchmark.monthlyRange` to encompass ~$2,100–$2,700

### `tests/benchmark.test.ts`

1. Urban high score → min $3,500, max $6,000
2. Rural low score → min $350, max $600
3. Buyout multiple, high score → 14–18×

---

## 15. What NOT to Build for MVP

**Update:** PDF report generation has since been built (server-side, `@react-pdf/renderer` or equivalent, generated in an API route from the same scoring output — no duplicated logic). It is gated behind the "Get Full Report — $49" button but not connected to real payment. The remaining items below are still out of scope — stub them with a disabled button or a "coming soon" note:

- Payment / Stripe integration (the report button is gated but doesn't charge anything yet — note in code where Stripe would hook in)
- User accounts / authentication
- Email capture
- Database of any kind
- Admin dashboard
- Outcome feedback loop (user reports what they negotiated)

The core loop that needs to work end-to-end: address in (via pin-confirmed location) → score + benchmark + leverage out, with an optional generated PDF report as the paid deliverable.

---

## 16. Build Order

Follow this order. Do not jump ahead.

1. `src/lib/types.ts` — all types
2. `src/constants/fields.ts`, `weights.ts`, `benchmarks.ts` — constants
3. `src/lib/geocode.ts` — Nominatim wrapper + test it works
4. `src/lib/mireye.ts` — Mireye fetch wrapper + test with a real address
5. `src/lib/score.ts` — scoring model (write tests as you go)
6. `src/lib/benchmark.ts` — benchmark calculator
7. `src/lib/leverage.ts` — leverage summary generator
8. `src/app/api/score/route.ts` — API route wiring everything together
9. `src/components/AddressForm.tsx`
10. `src/components/ScoreCard.tsx`
11. `src/components/BenchmarkBand.tsx`
12. `src/components/LeverageSummary.tsx`
13. `src/components/RateComparison.tsx`
14. `src/components/DataGapBanner.tsx`
15. `src/components/FieldDisclosure.tsx`
16. `src/app/page.tsx` — assemble everything
17. End-to-end test with three real addresses: one rural, one suburban, one urban
18. Deploy to Vercel

---

## 17. Done Criteria

The build is done when:

- [ ] A US address can be entered and produces a score in < 10 seconds
- [ ] The score breakdown shows all three dimensions with field-level explanation
- [ ] The benchmark range is displayed with calibration note
- [ ] If an offered rate is entered, the comparison and 30-year cost are shown
- [ ] If a buyout amount is entered, the fair value range and implied multiple are shown
- [ ] The FCC tenancy caveat fires correctly when guyed towers are present
- [ ] All null fields are handled without crashing
- [ ] Site type classification produces all three of urban/suburban/rural on realistic test addresses (not defaulting to suburban) — verified against synthetic dense-urban, generic-suburban, and remote-rural field sets
- [ ] Benchmark ranges visibly differ by site type and score band — not the same range for every address
- [ ] The address input uses a draggable map pin, and the confirmed pin coordinate (not raw geocoder output) is what's sent to Mireye
- [ ] The $49 report generates a real populated PDF from the same scoring output used on-screen
- [ ] All three disclosures from Section 12 are visible in the UI
- [ ] The app works on mobile
- [ ] Unit tests pass for all five scoring scenarios
- [ ] Deployed and accessible at a public URL

---

*Built on Mireye. 60 fields. Two parallel requests. One negotiation you don't lose.*