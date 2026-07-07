# SignalRent
## Cell Tower Lease Intelligence for Landlords
### Built on Mireye

---

## 1. The Problem

There are approximately 400,000 cell tower leases active in the United States. On one side of every negotiation sits a carrier or tower company — American Tower, Crown Castle, SBA Communications, Verizon, AT&T, T-Mobile — with proprietary internal site valuation models, decades of comp data, and professional site acquisition agents who negotiate leases every single day. On the other side sits a farmer, a church treasurer, a strip mall owner, or an heir who has never done this before and will never do it again.

There is no MLS for cell tower leases. Carriers file memoranda of lease that contain no rate information. There is no published standard for what a site is worth. The information asymmetry is structural, intentional, and enormous.

The result: Vertical Consultants, a lease negotiation firm, reports an **average immediate rent increase of 308%** across renewals and new leases they negotiated in 2024. That number is not a sales pitch — it is the size of the gap between what carriers offer and what sites are actually worth. A landlord who signs the first offer on a 30-year lease at $800/month, when the market supports $2,200/month, does not lose $1,400/month. They lose **$756,000** over the life of that lease.

SignalRent exists to close that gap.

---

## 2. The Core Insight

Cell tower rent is not real estate rent. It is not calculated per square foot. It is not benchmarked to comparable properties in the area. It is calculated by the carrier based on **network necessity** — how badly do they need this specific location, and what is the cost to them of not having it?

That calculation has four components:

1. **Coverage necessity**: Is this the only viable site in the carrier's search ring, or do they have alternatives?
2. **Subscriber value**: How many people does this site serve?
3. **Construction and operating cost**: How expensive is this site to build and maintain vs. alternatives?
4. **Permitting friction**: How hard is it for the carrier to build a new tower nearby?

Carriers know all four numbers. Landlords know none of them.

Mireye's field catalog contains the physical, environmental, and infrastructure data needed to compute all four — not perfectly, but well enough to shift a landlord from "I have no idea what this is worth" to "I have a defensible position and I know my leverage."

---

## 3. Why Mireye Specifically

The question every Mireye submission must answer: why this data source vs. Google Maps, a GIS analyst, or a generic LLM?

**Google Maps**: Has POI data and road network. Has none of the physical risk fields, no antenna structure registry, no soil/geology, no conservation/easement/habitat layers, no power infrastructure proximity, no 5G coverage data.

**A GIS analyst**: Could pull most of these fields from individual federal sources — FCC ASR, Census TIGER, USDA SSURGO, FEMA NFHL, USFWS NWI, etc. — but would take hours per site, require specialized skills, and cost $500–$2,000 per analysis. SignalRent's value proposition is that Mireye collapses that into a single API call.

**A generic LLM**: Has no coordinate-level physical data. Can describe cell tower valuation factors in general terms. Cannot tell you that a specific parcel has a landslide susceptibility index of 47, sits 340 meters from the nearest registered antenna structure, and is bordered by a conservation easement that makes alternatives within 600 meters functionally impossible.

Mireye is uniquely suited to this because:
- The FCC ASR antenna structure registry (the competitive density signal) is already ingested
- The physical risk stack (soil, slope, bedrock, flood, seismic, wind, landslide) lives in a single fetch
- The permitting friction stack (wetlands, protected areas, critical habitat, zoning, conservation easements, airspace) is in the same call
- The subscriber catchment proxy (housing density, POI count, urban area distance) is available without a Census data pipeline

42 fields across 6 layers combine into a single `/v1/fetch` call. No stitching, no geocoding pipeline, no manual data acquisition.

---

## 4. The 42 Fields and Why They Matter

### Dimension 1: Coverage Necessity (Carrier Urgency)
*How badly does the carrier need this exact location? The fewer viable alternatives, the more leverage the landlord has.*

| Field | Layer | Why it matters |
|---|---|---|
| `antenna_structures_within_500m_count` | utilities | Core competitive density. Zero alternatives within 500m = maximum leverage |
| `antenna_structures_within_2km_count` | utilities | Broader search ring competition. Carriers use 0.5–5 mile search rings |
| `nearest_antenna_structure_distance_m` | utilities | Distance to nearest competitor — lower = more competition |
| `nearest_antenna_structure_height_m` | utilities | Height of nearest alternative; if it's already at capacity, it's not truly an alternative |
| `nearest_antenna_structure_type` | utilities | Guyed towers can add tenants more easily; monopoles often can't — distinguishes real vs saturated alternatives. **Critical caveat**: Mireye knows structure type but not current tenancy count — see Section 8 |
| `mobile_5g_coverage_class` | utilities | Poor or no 5G coverage = active carrier urgency to site here |
| `nearest_major_road_distance_m` | built_environment | Highway proximity = coverage necessity; carriers must maintain continuous coverage along interstates |
| `nearest_major_road_class` | built_environment | Motorway > trunk > primary; motorway adjacency is near-mandatory coverage |
| `elevation` | terrain | Higher elevation = larger coverage radius per tower; fewer sites needed = each one more critical |
| `nearest_hospital_distance_m` | built_environment | Hospitals demand coverage SLAs; proximity to anchor demand institutions raises necessity |
| `nearest_school_distance_m` | built_environment | Schools = daytime population concentration and high-visibility coverage requirement |
| `nearest_urban_area_distance_m` | utilities | Defines urban/suburban/rural tier — the primary rate bracket |

**Weighting rationale**: Coverage necessity is the single largest driver of lease rate. Industry sources (Steel in the Air, Vertical Consultants, Tower Genius) consistently identify "no reasonable alternatives" as the #1 factor. This dimension receives the highest weight in the composite score (40%).

---

### Dimension 2: Subscriber Value (Revenue Potential)
*How much revenue does the carrier generate from this site? Sites serving more people are worth more.*

| Field | Layer | Why it matters |
|---|---|---|
| `housing_units_within_1km` | hazards | Primary subscriber catchment count |
| `housing_units_density_per_km2` | hazards | Density determines spectral efficiency needs and revenue per site |
| `poi_count_1km` | built_environment | POI density is a strong proxy for daytime population beyond residential — offices, retail, restaurants all generate traffic |
| `total_road_length_within_500m_m` | built_environment | Road density = urban fabric density = more mobile users passing through |
| `nearest_lodging_distance_m` | built_environment | Hotels generate concentrated high-ARPU data usage |

**Weighting rationale**: Higher subscriber value raises the carrier's willingness to pay rent. Urban sites command $2,500–$6,000/month vs rural sites at $500–$1,500/month primarily because of this dimension. It's the second-largest scoring weight (35%). The observed rate range across site types is the primary calibration anchor — see Section 5.

---

### Dimension 3: Construction and Operating Cost
*How expensive is this site to build and maintain? Higher cost sites reduce carrier profitability — but if the alternative is an even more expensive site, the carrier still pays.*

| Field | Layer | Why it matters |
|---|---|---|
| `slope_degrees` | terrain | Flat terrain = straightforward construction. Steep = expensive grading and anchoring |
| `bedrock_depth_cm` | terrain | Shallow bedrock requires blasting for foundation anchoring — significant cost premium |
| `soil_drainage_class` | terrain | Poorly drained soil = waterlogged excavation, complex foundation work |
| `soil_shrink_swell_class` | terrain | Expansive soil causes foundation movement; requires engineered solution |
| `within_floodplain_polygon` | terrain | Floodplain = elevated foundation requirement + flood insurance + potential relocation liability |
| `seismic_pga_2pct_50yr_g` | hazards | High seismic zone = structural overdesign requirement — significant cost |
| `seismic_design_category` | hazards | ASCE category directly maps to structural specification tier |
| `design_wind_speed_mph` | hazards | High wind zone = heavier steel specification, larger foundation |
| `landslide_susceptibility_index` | hazards | Slope instability = ongoing structural monitoring and potential loss |
| `lightning_annual_flash_days` | hazards | High lightning = extensive grounding system + surge protection + maintenance |
| `wildfire_annual_frequency` | hazards | High wildfire = structural fire risk, potential site loss, insurance cost |
| `tornado_annual_frequency` | hazards | Tornado zone = structural specification premium |
| `nearest_transmission_line_distance_m` | utilities | Power hookup distance = major cost variable; grid-distant sites require expensive extensions or generators |
| `nearest_substation_distance_m` | utilities | Closer substation = simpler interconnection |
| `nearest_substation_status` | utilities | Inactive substation = site may not have reliable power |
| `fiber_broadband_available` | utilities | Fiber present = cheap backhaul. No fiber = microwave backhaul equipment cost |
| `fiber_provider_count` | utilities | Multiple providers = competitive backhaul pricing |
| `nearest_road_surface` | built_environment | Unpaved access road = construction logistics cost and ongoing maintenance access premium |
| `coast_distance_m` | terrain | Coastal proximity = salt spray corrosion, accelerated equipment degradation |
| `mean_annual_relative_humidity_pct` | climate | High humidity = accelerated corrosion, more frequent equipment servicing |
| `days_above_32c_annual_count` | climate | Extreme heat = active cooling required for equipment cabinets |
| `mean_annual_snow_cover_days` | climate | Heavy snow load = structural specification premium |
| `mean_annual_dry_bulb_temperature_degc` | climate | Extreme temperature range = thermal cycling stress on equipment |
| `avg_retail_electricity_price_industrial_usd_per_kwh` | utilities | High electricity cost = higher opex; small downward pressure on rent willingness |
| `intersects_nhd_area` | terrain | Water body intersection = access and corrosion complications |

**Weighting rationale**: Construction cost is scored inversely — a harder-to-build site has two effects. First, it makes the current site more valuable to the carrier *if* they already have it (relocation is expensive). Second, it raises the cost of building a replacement, which raises the carrier's switching cost. Sites with bad construction profiles but no alternatives score high on leverage; sites with bad profiles but abundant alternatives score low. Weight: 25%.

---

### Dimension 4: Permitting Friction
*How hard is it for the carrier to build a new tower near this one? The harder it is, the more the carrier pays to keep existing sites.*

| Field | Layer | Why it matters |
|---|---|---|
| `intersects_wetland` | terrain | Wetland = Section 404/401 permitting — can take years and often fails |
| `wetlands_within_100m_count` | terrain | Nearby wetlands constrain alternative site options in the search ring |
| `nearest_wetland_distance_m` | terrain | Buffer zone proximity — most alternatives within 100m of wetland are unfeasible |
| `intersects_protected_area` | parcels | Protected area = near-impossible to permit new tower construction |
| `protected_area_gap_status` | parcels | GAP 1 (strict) vs GAP 4 (minimal protection) — major permitting difficulty gradient |
| `intersects_conservation_easement` | parcels | Easement = encumbered land, severely limits tower siting on affected parcels |
| `intersects_critical_habitat` | parcels | ESA critical habitat = the hardest possible permitting environment for new construction |
| `critical_habitat_status` | parcels | Final vs proposed — Final is binding, Proposed creates uncertainty |
| `land_use_class` | land_cover | Developed land = NIMBY resistance and stricter aesthetic zoning for new towers |
| `parcel_zoning` | parcels | Agricultural/industrial = easier permitting; residential = hard; historical = very hard |
| `lcms_class` | land_cover | Barren/impervious vs forest — visual impact objections harder to overcome in forested areas |
| `tree_canopy_pct` | land_cover | High canopy = visual screening concern = community opposition to new tower aesthetics |
| `surface_management_agency` | parcels | Federal land management = additional regulatory layers for siting alternatives |
| `special_use_airspace_type` | parcels | MOA/restricted airspace = FAA height constraints, may prevent alternative towers at required height |
| `nearest_airport_distance_m` | utilities | FAA notification zones constrain tower height within 3 nautical miles |
| `golden_eagle_nest_density_index` | parcels | Eagle habitat = US Fish & Wildlife consultation requirement in Western US |
| `primary_building_height_m` | built_environment | Dense high-rise = visual clutter objections; but also may mean rooftop alternative exists |
| `nearest_class_i_area_distance_m` | hazards | Class I area proximity = strict air quality rules, further development often opposed |

**Weighting rationale**: Permitting friction has an asymmetric effect. It does not directly affect what the existing site earns — it affects whether the carrier can replace it. A site surrounded by wetlands, critical habitat, and conservation easements is essentially irreplaceable regardless of its other characteristics. This dimension functions as a leverage multiplier rather than an additive score component. Treating it as additive would produce the nonsensical result that a low-coverage, low-subscriber site in a wetland scores "above average" — it doesn't earn more, it's just harder to abandon.

---

## 5. Scoring Model

### Composite Score Architecture

The score is not a simple weighted average. It is a two-stage model:

**Stage 1 — Baseline value score (0–100)**
A weighted combination of Coverage Necessity (40%), Subscriber Value (35%), and Construction Cost inverse (25%).

**Stage 2 — Leverage multiplier (0.5×–2.0×)**
The permitting friction dimension does not add to the baseline score. It multiplies it. A site with high baseline value and maximum permitting friction (wetlands, protected areas, critical habitat, restricted airspace) gets its score doubled. A site with high baseline value but easy permitting (flat open farmland with no restrictions) gets its full score but a lower multiplier — meaning the carrier has leverage too, because they could relocate.

This prevents a common mistake in scoring models: treating a site that's excellent on four dimensions as simply "good on all four." What matters is the carrier's switching cost, which is the product of site quality and replaceability.

### Benchmark Range Calibration

The benchmark ranges are the weakest link in this model, and that deserves honest treatment.

There is no MLS for cell tower leases, no public transaction database, and no federal disclosure requirement for lease rates. The calibration is therefore a **prior built from published industry ranges**, not from comparable transactions. Here is exactly what that prior looks like and how it was constructed:

**Published rate ranges (multiple independent sources, consistent)**

| Site type | Monthly range | Source |
|---|---|---|
| Urban rooftop | $2,500–$6,000 | Steel in the Air, EMFRadar, Nexus Towers |
| Suburban macro tower | $1,200–$2,800 | Steel in the Air, Vertical Consultants |
| Rural ground lease | $500–$1,500 | Steel in the Air, EMFRadar |

These ranges are published by firms that negotiate hundreds of leases annually and have proprietary comp databases. They are not peer-reviewed, but they are operationally grounded and mutually consistent across sources.

**Calibration against documented case outcomes**

Three publicly documented cases where before/after rates are known:

*Case 1 — South Carolina suburban site (Tower Genius)*: Carrier presented "comps" showing a range of $608–$925/month and offered $1,100/month as the opening. Tower Genius negotiated a 245% increase above the carrier's position — final rate approximately $2,100–$2,700/month. Site characteristics: suburban SC, standard macro tower. A well-calibrated SignalRent output for a suburban SC macro site should produce a benchmark range that encompasses $2,100–$2,700 — if it outputs $800–$1,200, the model is miscalibrated downward.

*Case 2 — Rent reduction attempt (Steel in the Air)*: A tower company demanded a 50% rent reduction, citing an "empty" tower (no tenants). The landlord held firm; the tower subsequently added two additional carriers. The original lease rate was clearly below market for the site's actual value. A correctly calibrated model would have flagged this site as high-value before the reduction attempt.

*Case 3 — 308% average increase (Vertical Consultants, 2024)*: Across a portfolio of negotiated deals, average immediate increase was 308%. This is a portfolio-level signal, not a site-level comp — but it establishes the floor for how bad the status quo is. If SignalRent's average output across a random sample of existing leases does not show a meaningful gap between current rates and benchmark ranges, the model is underpredicting leverage.

**What this means for confidence**

These are real calibration anchors but they are a thin prior. The model should be disclosed as: "benchmark ranges calibrated to published industry data and documented outcomes; intended to be updated with actual negotiated rates as users report back results." This is the honest version of "empirically calibrated" — it names what the empirical basis actually is rather than implying a statistical fit to transaction data that does not exist.

The right framing on the 30-minute call: "Here is our prior. Here is exactly where it came from. Here is how we update it."

---

## 6. The Product

### What it is

SignalRent is a web application. A landlord enters a US address, the carrier or tower company name, and optionally their current or offered lease rate. SignalRent calls Mireye `/v1/fetch` with the 42 relevant fields, runs the scoring model, and returns:

1. **Site score** (0–100) with dimension breakdown
2. **Market benchmark range** (monthly rent) calibrated to the score and site type
3. **Leverage summary** — 2–3 plain-English sentences explaining the landlord's negotiating position, derived from the specific fields that drive the score
4. **Comparison to offered/current rate** — if a rate is entered, the tool outputs whether it's above, within, or below the benchmark range

### User scenarios

**User A — new lease offer**
Margaret, a retired farmer outside Flagstaff, Arizona, receives a letter from a Crown Castle site acquisition agent offering $750/month for a 30-year ground lease on the corner of her property. She goes to SignalRent.com, enters her parcel address, types "Crown Castle," and enters $750. The tool fetches her Mireye data: `antenna_structures_within_500m_count = 0`, `antenna_structures_within_2km_count = 1` (that one is a guyed tower already at capacity per structure type), `mobile_5g_coverage_class = "No coverage"`, `within_floodplain_polygon = false`, `intersects_critical_habitat = false`, `parcel_zoning = "Agricultural"`, `elevation = 2,134m`. Her site scores 81/100 with a leverage multiplier of 1.4×. Benchmark range: $1,650–$2,400/month. Leverage summary: "Crown Castle has no viable alternative within the standard search ring. The nearest structure is a guyed tower — structure type suggests additional co-location may be possible, but you should verify current tenancy before conceding on that point. Your elevation advantage at 2,134m expands coverage radius significantly. Leverage is high." Margaret counters at $1,800.

**User B — renewal negotiation**
Derek manages a commercial portfolio in suburban Phoenix. A Verizon rooftop lease on one of his strip malls comes up for renewal; the current rate is $950/month, set in 2013. He enters the address on SignalRent and checks the renewal scenario. The tool shows `housing_units_density_per_km2 = 4,200`, `mobile_5g_coverage_class = "Partial"`, `fiber_broadband_available = true`, `antenna_structures_within_500m_count = 2`. Score: 71/100, multiplier 1.1×. Benchmark: $1,400–$2,000/month. Leverage summary: "Current rate is 47% below market benchmark. 5G mid-band deployment in this area has increased site value since original signing. Two competing structures exist within 500m — partial competition, but your rooftop height profile is distinct. Consider requesting documentation of alternative site availability before accepting renewal terms." Derek opens at $1,600.

**User C — buyout evaluation**
Priya inherited land in rural Tennessee from her grandfather. An unsolicited letter from a lease aggregator offers $88,000 to buy the income stream from a tower lease paying $1,100/month. She enters the address on SignalRent and enters $88,000 as the buyout offer. The tool calculates $88,000 = 6.7× annual rent. It runs the site score: 69/100, multiplier 1.6× (`wetlands_within_100m_count = 3`, making the site hard to replace). Benchmark buyout range based on site score: 14–18× annual rent = $184,800–$237,600. Output: "This offer is likely 50–60% below defensible market value. The site's wetland-constrained search ring significantly raises its replacement cost. Before accepting, counter at $215,000 or solicit a competing bid — lease aggregators run a bid process internally and the opening offer is a starting position." Priya does not sign.

### Business model

**Free tier**: Address → site score + dimension breakdown + benchmark range
**Paid tier ($49 one-time per report)**: Full PDF report with field-level explanations, 10-year NPV projection, buyout fair value range, and specific negotiation talking points derived from the highest-impact fields
**API tier ($199/month)**: Bulk lookup for property managers, real estate attorneys, and appraisers managing portfolios with multiple tower leases

The paid report is the primary revenue driver. The free tier exists to demonstrate the product's value and create the moment where a landlord realizes how undervalued their lease is — that is the conversion event.

---

## 7. Why This Points Somewhere Mireye Hasn't Looked

The data center siting and school bus routing use cases Mireye already solves are both **operator-side** decisions — a sophisticated organization using Mireye data to make their own deployment decision. SignalRent is the first **counterparty-side** use case: using Mireye to give the less-informed party in a negotiation access to the same physical data the sophisticated party already has.

This is a different buyer profile (individual property owners, small property managers, real estate attorneys) and a different deployment context (B2C with a freemium web product rather than B2B API integration). It demonstrates Mireye's relevance outside the institutional buyer context.

The competitive moat is not the scoring model — that is replicable. The moat is: (1) the Mireye integration that collapses a 12-source data pull into one API call, and (2) outcome data. Every time a SignalRent user reports back what they actually negotiated, that data calibrates the model. Over time, SignalRent's benchmark ranges become empirically grounded in real negotiated rates rather than industry-published approximations. That feedback loop is not replicable by a consultant with a spreadsheet.

---

## 8. Where the Data Falls Short

This is what Mireye is currently lacking for this use case, and what it means for product accuracy and for Mireye's catalog roadmap.

### The FCC tenancy gap — the most important limitation

`nearest_antenna_structure_type` tells you the nearest competing structure is a guyed tower, a monopole, or a building mount. `nearest_antenna_structure_height_m` tells you how tall it is. What neither field tells you is **how many carriers are currently co-located on that structure**.

This matters enormously. A guyed tower 600 meters away with 4 carriers already on it and no remaining structural capacity is not a real alternative — it is effectively the same as having no alternative. A guyed tower 600 meters away with 1 carrier and room for 3 more is strong competition. SignalRent currently cannot distinguish these two cases from Mireye data alone, which means the entire Coverage Necessity dimension (40% of the baseline score) is systematically overstating or understating leverage any time a nearby structure exists — the model treats "one alternative exists" as a fixed discount to leverage, when the real discount should range from near-zero (saturated structure) to severe (empty structure with room to spare).

The data to fix this exists. The FCC ULS (Universal Licensing System) database contains license records that can be cross-referenced to antenna structure registration numbers to determine how many licensed operators are using a given structure. This is public data. If Mireye were to ingest FCC ULS license counts per ASR registration number and expose a field like `nearest_antenna_structure_tenant_count`, it would be the single highest-value addition to the catalog for this use case — and likely for any cell tower siting or lease valuation application. Concretely, it would let SignalRent turn Section 8's biggest caveat into a scored input: a structure at tenant_count ≥ 3 (near FCC/FAA structural limits for most tower classes) could be treated as functionally saturated, while tenant_count ≤ 1 would sharply reduce the leverage score for the subject site.

Until that field exists, SignalRent handles this gap by: (1) flagging structure type with a disclosure note ("structure type suggests co-location capacity; verify current tenancy independently"), and (2) downweighting the competitive density signal for guyed tower alternatives vs. monopoles, since guyed towers have higher theoretical capacity even if actual tenancy is unknown. Both are stopgaps, not fixes — the report is explicit with the user that this is the single largest source of uncertainty in the score.

### No RF propagation data

The single most important factor in tower site valuation — whether this location actually solves a coverage gap in the carrier's current network — is not in the Mireye catalog. Mireye has physical terrain (`elevation`, `slope_degrees`) which proxies for line-of-sight propagation, but not the carrier's actual drive-test data or RF coverage model.

This means SignalRent infers coverage necessity from physical proxies. `mobile_5g_coverage_class` from FCC BDC data is the closest available signal — it shows current coverage status, which is a lagging indicator of where carriers need to build. But it doesn't tell you whether *this carrier specifically* has a gap here, or whether the gap is served by a competing tower the carrier is already on.

This is an inherent limitation of any tool that doesn't have carrier-internal data. The honest framing is that SignalRent assesses site *potential* for coverage necessity, not confirmed coverage necessity. The model would be materially improved by propagation loss estimates derived from terrain data — Mireye has the terrain inputs (`elevation`, `slope`, `aspect`) that would support a simplified Okumura-Hata or COST-231 model if Mireye chose to compute and expose a derived field.

### `parcel_zoning` coverage is incomplete

Regrid's zoning data has gaps, particularly in rural counties. Where the field returns null, the permitting friction dimension loses one of its most directly relevant inputs. The model falls back to `land_use_class` and `lcms_class` as proxies, but those are cruder signals. Zoning null rate is worth monitoring — if it's high in rural areas, which is exactly where many tower leases are, the permitting friction score for rural sites is systematically less reliable.

### No market transaction data

Mireye is a physical and infrastructure data source. It has no access to actual negotiated lease rates. As described in Section 5, SignalRent's benchmark ranges are calibrated to published industry ranges and documented case outcomes — a thin prior. The ranges will require iterative refinement as users report actual negotiated rates. This is a product limitation, not a Mireye catalog gap — no data source has this, because lease rate data is not public.

---

*SignalRent — built on Mireye. 42 fields, one API call, one negotiation you don't lose.*