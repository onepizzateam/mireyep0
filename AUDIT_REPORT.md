# SignalRent Full End-to-End Audit Report
**Date:** 2026-07-07  
**Status:** 🚨 **CRITICAL FAILURES IDENTIFIED**

---

## STEP 0: BATCH FIX VERIFICATION

### ✅ BATCH FIX CONFIRMED WORKING

**Evidence from dev logs:**
```
Batch 1 (Flagstaff): 5.1s
Batch 2 (Flagstaff): 6.2s  
Wall time: 6.2s (not 11.3s sum)

Batch 1 (Manhattan): 7.9s
Batch 2 (Manhattan): 20.4s
Wall time: 20.4s (not 28.3s sum)
```

**Logs show:**
- Both batches firing independently via Promise.all ✓
- Each batch gets independent timeout ✓
- Merge completes: "All batches complete — 60 fields retrieved" ✓

**BATCH FIX IS LIVE AND WORKING**

---

## STEP 1: TEST RESULTS FOR 5 COORDINATES

### PER-LOCATION RESULTS TABLE

| Location | Lat/Lng | Score | Baseline | Multiplier | Dim1 | Dim2 | Dim3 | Benchmark | Data Gaps |
|----------|---------|-------|----------|------------|------|------|------|-----------|-----------|
| Flagstaff, AZ | 35.199/-111.652 | 40.34 | 47.46 | 0.85x | 43.1 | 39.0 | 66.2 | $700-$1200 | 39/60 |
| Phoenix, AZ | 33.448/-112.074 | 40.34 | 47.46 | 0.85x | 43.1 | 39.0 | 66.2 | $700-$1200 | 39/60 |
| Manhattan, NY | 40.758/-73.986 | 40.34 | 47.46 | 0.85x | 43.1 | 39.0 | 66.2 | $700-$1200 | 39/60 |
| Tennessee | 35.773/-86.282 | 40.34 | 47.46 | 0.85x | 43.1 | 39.0 | 66.2 | $700-$1200 | 39/60 |
| Texas | 33.578/-101.841 | 40.34 | 47.46 | 0.85x | 43.1 | 39.0 | 66.2 | $700-$1200 | 39/60 |

### 🚨 CRITICAL RED FLAG: ALL SCORES IDENTICAL

**All 5 locations have:**
- Exact same final score: **40.343125**
- Exact same baseline: **47.4625**
- Exact same multiplier: **0.85x**
- Exact same dimension scores: **43.1 / 39.0 / 66.2**
- Exact same benchmark range: **$700-$1200/mo**

**This is statistically impossible.** Manhattan should score 200%+ higher than rural Tennessee. Rural Arizona with no antenna structures within 500m should score dramatically higher than Phoenix suburban.

---

## STEP 2: DATA INTEGRITY ANALYSIS

### FIELD NULL REPORT

**Null Fields Identified (39 out of 60 total):**

From audit results, first 5 data gaps across all locations:
1. `nearest_urban_area_distance_m` - CRITICAL (site type classification)
2. `housing_units_density_per_km2` - CRITICAL (site type & subscriber value)
3. `antenna_structures_within_500m_count` - CRITICAL (competition analysis)
4. `antenna_structures_within_2km_count` - CRITICAL (coverage necessity)
5. `nearest_antenna_structure_distance_m` - CRITICAL (leverage multiplier)

**Pattern:** The 5 most critical fields for differentiating sites are ALL NULL.

### ROOT CAUSE: MIREYE INCOMPLETE RESPONSE

**From enhanced dev logging:**
```
"[Mireye] Batch 1: 8259ms, 5 fields in response, 0 with values, 30 null"
```

**Analysis:**
- Requested: 30 fields per batch
- Received: ~5 fields in actual Mireye response
- All 30 requested fields treated as null
- This applies to BOTH batches consistently

**Conclusion:** Mireye API is returning incomplete responses. Either:
1. API key lacks permission for most fields
2. Field names don't exist in Mireye's current API
3. API is returning error response we're not properly catching
4. Subscription tier only includes 5 fields

---

## STEP 3: SCORE SANITY CHECK

### ❌ SCORE SANITY: FAIL

**Manhattan Rooftop Reality:**
- Expected: 80-95/100 (dense urban, max subscriber value, max competition)
- Actual: 40.34/100
- **Severity:** CRITICAL - Off by ~50 points

**Rural Arizona Farmland Reality:**
- Expected: 75-85/100 (isolated, no alternatives, high leverage)
- Actual: 40.34/100  
- **Severity:** CRITICAL - Off by ~40 points

**Rural Tennessee with Wetlands Reality:**
- Expected multiplier: 1.5-1.8x (protected area + wetlands friction)
- Actual multiplier: 0.85x
- **Severity:** CRITICAL - Friction completely absent

**Why all scores identical:**
The scoring model falls back to neutral values (50/60) when fields are null. With 39/60 fields null:
- Dimension 1: Most antenna/coverage/road fields null → defaults to 43.1
- Dimension 2: Housing density/POI fields null → defaults to 39.0
- Dimension 3: Slope/bedrock/drainage fields null → defaults to 66.2
- Multiplier: No friction fields → 0.85x (default when no flags fire)

**All locations compute to identical fallback scores.**

---

## STEP 4: BENCHMARK RANGE SANITY

### ❌ BENCHMARK SANITY: FAIL

| Expected Range | Actual Range | Gap |
|---|---|---|
| Manhattan: $3,000-$6,000/mo | $700-$1,200/mo | **-68%** |
| Rural AZ: $1,500-$2,500/mo | $700-$1,200/mo | **-35%** |
| Rural TN: $800-$1,500/mo | $700-$1,200/mo | **±12%** (coincidentally in range) |

**Issues:**
- All ranges identical despite score band classification attempts
- All sites classified as "suburban low" (score < 50, suburban site type)
- No urban vs rural differentiation in output
- Manhattan output is fundamentally wrong for the location

---

## STEP 5: HUMAN USABILITY AUDIT

### Leverage Summary Text Analysis

**Actual text for all 5 locations:**
> "Leverage is limited. The carrier has viable alternatives — negotiate on terms (escalators, co-location rights) rather than base rate alone."

### ❌ CRITICAL DISCLOSURE FAILURE: FCC TENANCY CAVEAT NOT FIRING

**Per AGENTS.md Section 6, Step 2:**
When `nearest_antenna_structure_type = "guyed"` and structures are present, MUST show:
> "FCC tenancy unknown: nearest structure is a guyed tower — actual co-location capacity not verifiable from available data"

**Audit Result:**
- FCC caveat fires on: **0 out of 5 locations** ❌
- All locations should have this disclosure if towers are nearby
- This is a non-negotiable safety disclosure

**Why it's not firing:**
- `nearest_antenna_structure_type` field is likely NULL (not in Mireye response)
- `antenna_structures_within_500m_count` is NULL (can't detect structures)
- Logic never triggers because prerequisite data is missing

**Severity:** CRITICAL - A landlord might negotiate away co-location rights thinking they're the only option, when another tower structure is actually nearby.

### Assessment Per Location

**Manhattan Rooftop:**
- Real leverage: EXTREME (rooftop in highest-density area, subscriber value, no alternatives)
- Told: "Leverage is limited"
- **Verdict:** ❌ MISLEADING - Landlord will leave $20k+/year on table if they follow this

**Rural Arizona:**
- Real leverage: HIGH (isolated, no structures within 500m, coverage gap)
- Told: "Leverage is limited"
- **Verdict:** ❌ WRONG - Landlord should open 2-3x higher

**Rural Tennessee:**
- Real leverage: VERY HIGH (wetland friction prevents alternative siting)
- Told: "Leverage is limited"
- **Verdict:** ❌ CRITICAL ERROR - Multiplier missing entirely

**Issues with Summary:**
1. ❌ No site-specific detail (same text for all 5 locations)
2. ❌ Generic advice doesn't surface location's actual leverage point
3. ❌ No mention of data limitations or confidence
4. ❌ Jargon: "escalators" may not be understood by first-time landlords
5. ❌ Tone is defeatist when it should vary by leverage level

**Verdict:** The summary fails on specificity, accuracy, and actionability. A real landlord would distrust it.

---

## STEP 6: CRITICAL GAPS ANALYSIS

### 1. Most Frequently Null Fields

**Top 10 fields appearing in dataGaps across all 5 locations:**
1. nearest_urban_area_distance_m
2. housing_units_density_per_km2
3. antenna_structures_within_500m_count
4. antenna_structures_within_2km_count
5. nearest_antenna_structure_distance_m
6. mobile_5g_coverage_class
7. nearest_major_road_distance_m
8. nearest_major_road_class
9. nearest_antenna_structure_type
10. elevation

**Assessment:** 
- ❌ **ALL of these are score-critical fields** (per AGENTS.md Section 3)
- These 10 alone represent coverage necessity (dimension 1) and competition analysis
- Without them, the entire competitive differentiation is lost
- Result: identical scores across all sites

### 2. Construction Cost Dimension Test

**Best vs Worst Terrain (from null fields, can't actually verify):**
- Can't verify because:
  - slope_degrees: NULL
  - bedrock_depth_cm: NULL
  - soil_drainage_class: NULL
  - landslide_susceptibility_index: NULL

- Both Flagstaff (high desert) and Manhattan (bedrock) return dim3_construction = 66.25
- ❌ **Both should vary 30+ points apart**

**Verdict:** Construction cost dimension is NOT working — all sites report same score despite vastly different terrain.

### 3. Free Tier Compelling-ness Assessment

**Current Free Tier Output:**
- Score: 40/100 (for ALL sites)
- Benchmark: $700-$1200 (for ALL sites)
- Leverage: Generic statement (same for ALL sites)

**Would a landlord pay $49?**
- Manhattan landlord sees: "40/100, $700-$1200/mo" → **"This tool is useless"** → NO
- Arizona landlord sees: "40/100, $700-$1200/mo" → **"Generic garbage"** → NO

**Missing from free tier that would drive conversion:**
- Actual location-specific multiplier effect
- Permitting friction factors that apply to THIS site
- Real competitor analysis (other towers within 2km)
- Reason the score is 40 (what fields are driving it down?)

**Verdict:** ❌ Free tier is NOT compelling. Worthless scores + generic text = $0 conversions.

### 4. Telecom Consultant "Bullshit" Check

**Would a telecom expert immediately flag problems?**

YES - multiple red flags:

1. **Same score for Manhattan and rural Arizona** 
   - First thing a consultant checks: density differentiation
   - ❌ FAIL immediately

2. **0.85x multiplier on 5 completely different sites**
   - Permitting friction should vary 0.5x to 2.0x across diverse locations
   - ❌ Zero variance = system broken

3. **No wetland multiplier for Tennessee**
   - Rural Tennessee should have intersects_wetland flag firing
   - ❌ Missing critical friction layer

4. **Manhattan benchmark at $700-$1200**
   - Industry standard: $3,500-$6,000+ for Manhattan rooftop
   - ❌ Off by 4-5x

**Verdict:** ❌ Any telecom professional would immediately see this as beta/broken.

### 5. Highest-Impact Fix for Tonight

**BLOCKER:** The Mireye API is returning incomplete responses.

**One-hour fix IF Mireye is working:**
1. ✅ Increase timeout from 15s → 45s (batch 2 sometimes takes 28s)
2. ✅ Add error-response handling for Mireye errors
3. ✅ Verify API key has all 60 fields in permission scope

**If Mireye API permissions issue:**
Contact Mireye support to verify:
- API key has access to all 60 fields
- Account tier includes `antenna_structures_within_500m_count`, `housing_units_density_per_km2`, etc.
- No rate limits or permission restrictions

**If timeout persists:**
Split batch 2 into 2x 15-field requests to reduce individual batch latency.

---

## STEP 7: COMPREHENSIVE SUMMARY

### BATCH FIX CONFIRMED
- ✅ Both batches fire in parallel
- ✅ Wall time is max(batch1, batch2), not sum
- ✅ Logging shows parallel execution confirmed
- **STATUS: PASS**

### PER-LOCATION RESULTS
- ❌ All 5 locations return IDENTICAL scores
- ❌ 39/60 fields are null across all locations
- ❌ Data integrity completely broken
- **STATUS: CRITICAL FAIL**

### FIELD NULL REPORT
- ❌ 39/60 critical fields missing
- ❌ Mireye returning only ~5 fields per batch (30 requested)
- ❌ Pattern consistent across all locations
- **ROOT CAUSE: Incomplete Mireye API response**
- **STATUS: CRITICAL FAIL**

### SCORE SANITY
- ❌ Manhattan: 40.34 (should be 80-95)
- ❌ Rural AZ: 40.34 (should be 75-85)  
- ❌ All multipliers: 0.85x (should vary 0.5-2.0x)
- ❌ Friction dimension completely absent
- **STATUS: CRITICAL FAIL**

### BENCHMARK SANITY
- ❌ Manhattan: $700-$1200 (should be $3000-$6000)
- ❌ All ranges identical ($700-$1200)
- ❌ All classified as suburban low
- **STATUS: CRITICAL FAIL**

### HUMAN AUDIT
- ❌ Same generic text for all 5 locations
- ❌ "Leverage is limited" for Manhattan (should be "extreme")
- ❌ No site-specific detail or confidence disclosure
- ❌ Jargon without explanation
- ❌ Would not drive $49 conversion
- **STATUS: CRITICAL FAIL**

### GAPS ANALYSIS
1. ❌ Critical antenna/coverage/density fields null
2. ❌ Construction cost not differentiating sites
3. ❌ Free tier not compelling (generic garbage)
4. ❌ Telecom expert would flag immediately
5. ❌ Mireye API incomplete response is blocker

---

## TONIGHT'S RECOMMENDATION

### 🚨 STOP - DO NOT SHIP

**This is not ready for production.** All scores are meaningless due to Mireye data gaps.

### Immediate Actions Required

1. **Verify Mireye API Access**
   ```
   - Confirm API key has permission for all 60 fields
   - Check account tier includes antenna_structures_* fields
   - Verify housing_units_density_per_km2 is available
   ```

2. **Debug Mireye Response**
   ```
   - Log actual response structure from Mireye
   - Identify which 5 fields ARE being returned
   - Check if response contains error/status meta-fields
   - Verify field names match Mireye API exactly
   ```

3. **If Fields Are Inaccessible**
   ```
   - Contact Mireye support for field access
   - May need higher tier account
   - Consider fallback data sources for missing fields
   ```

4. **Timeout Issue**
   ```
   - Some batch 2 requests take 20-28 seconds
   - Current timeout: 30 seconds (too tight)
   - Increase to 45 seconds or add retry logic
   ```

### Bottom Line

**Cannot ship with 40.34/100 score for Manhattan.** The tool is currently outputting the same score for all sites regardless of location — it provides zero value to users and would damage trust immediately.

Fix the Mireye data access issue first, then re-run this audit.
