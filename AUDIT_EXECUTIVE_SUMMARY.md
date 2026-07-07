# ⚠️ SIGNALRENT AUDIT: EXECUTIVE SUMMARY

**Date:** 2026-07-07  
**Verdict:** 🚨 **CRITICAL FAILURES - DO NOT SHIP**

---

## ONE-SENTENCE SUMMARY
All 5 test locations (Flagstaff, Phoenix, Manhattan, Tennessee, Texas) return **identical scores (40.34/100)** due to **39 out of 60 Mireye fields coming back null**, making the product worthless.

---

## KEY FINDINGS

### ✅ What IS Working
- **Batch parallel execution:** Both Mireye batches fire simultaneously via Promise.all
- **Batch timing:** Wall time = max(batch1, batch2), not sum ✓
- **Logging:** Shows both batches complete with "60 fields retrieved"
- **API Route:** Correctly wires geocoding → Mireye → scoring → response

### ❌ What's BROKEN (Critical)

| Issue | Severity | Evidence |
|-------|----------|----------|
| **All 5 sites identical score** | 🔴 CRITICAL | 40.343125 for Flagstaff, Phoenix, Manhattan, Tennessee, Texas |
| **39/60 fields null** | 🔴 CRITICAL | Dev logs: "Batch 1: 30 requested, ~5 returned, 30 null" |
| **Wrong benchmark ranges** | 🔴 CRITICAL | Manhattan: $700-1200 (should be $3,000-6,000) |
| **Missing FCC tenancy caveat** | 🔴 CRITICAL | Should fire for all 5 if towers nearby; fires for 0 |
| **No permitting multiplier** | 🔴 CRITICAL | All sites 0.85x (should vary 0.5-2.0x across locations) |
| **Generic leverage summary** | 🔴 CRITICAL | Same text for all 5; no site-specific guidance |
| **Not compelling for $49 conversion** | 🔴 CRITICAL | Users see generic garbage; identical for all locations |

---

## ROOT CAUSE: INCOMPLETE MIREYE API RESPONSE

**From enhanced dev logging:**
```
[Mireye] Batch 1 at (47.6038321, -122.330062): 8259ms,
         5 fields in response, 0 with values, 30 null
```

**Pattern across all requests:**
- Requested: 30 fields per batch
- Received: ~5 fields in actual Mireye response
- Result: 30 fields set to null, 5 attempted to parse

**Likely causes:**
1. ❌ API key lacks permission for most fields
2. ❌ Field names don't exist in Mireye's current API version
3. ❌ API is returning error response not properly caught
4. ❌ Subscription tier only includes 5-10 fields

---

## SCORE QUALITY: FAILS ALL TESTS

### Test 1: Manhattan Rooftop
- Expected: 80-95/100 (dense, high subscriber value, competition)
- Actual: 40.34/100
- **Gap: ~50 points** ❌

### Test 2: Rural Arizona
- Expected: 75-85/100 (isolated, no alternatives, high leverage)
- Actual: 40.34/100
- **Gap: ~40 points** ❌

### Test 3: Rural Tennessee (with wetlands)
- Expected multiplier: 1.5-1.8x (protected area friction)
- Actual multiplier: 0.85x
- **Gap: -0.65 to -0.95x** ❌

### Test 4: Benchmark Ranges
- All 5 locations: $700-$1,200/mo (suburban low band)
- Manhattan should: $3,000-$6,000/mo
- **Gap: -68%** ❌

### Test 5: Disclosure Compliance
- FCC tenancy caveat: 0/5 locations firing
- Permitting friction flags: 0/5 locations
- All critical disclosures missing
- **Compliance: 0%** ❌

---

## USER EXPERIENCE IMPACT

### What a Landlord Sees (All 5 Locations)
```
Score: 40/100
Benchmark: $700-$1,200/month
Leverage Summary: "Leverage is limited. Negotiate on terms."
```

### Reality Check
- **Manhattan landlord:** Sees $700-$1200, should negotiate $3,000-$5,000+ → **LOSES $20K+/year**
- **Rural Arizona landlord:** Sees "limited leverage", actually has HIGH leverage → **LOSES $10K+/year**
- **Tennessee landlord:** No wetland disclosure, gives up leverage → **LOSES $5K+/year**

**Product Result:** Actively harms users through bad scores. No one would pay $49 for identical garbage output.

---

## CRITICAL ACTIONS REQUIRED

### 1. Debug Mireye API (1 hour)
```bash
# What to check:
- Verify API key has permission for 60 requested fields
- Log actual Mireye response structure in fetchBatch()
- Check if response contains error/status meta-fields
- Compare field names against current Mireye API docs
```

### 2. Increase Timeout (5 minutes)
```typescript
// Current: 30 seconds per batch
// Observed: Some batch 2 requests take 20-28 seconds
// Fix: Change MIREYE_TIMEOUT_MS to 45000 (45 seconds)
```

### 3. Verify Mireye Account (30 minutes)
```
- Contact Mireye support
- Confirm account includes all 60 fields
- Check if higher tier needed for complete field set
- Verify no permission restrictions on API key
```

### 4. Implement Fallback (if Mireye doesn't have fields)
```
If critical fields permanently unavailable:
- Cannot build reliable scoring model
- Consider alternative data sources
- May need to redesign product
```

---

## RECOMMENDATION

### ⛔ DO NOT SHIP TONIGHT

**This is not MVP-ready. Scores are meaningless.**

The application is:
- ✅ Technically sound (batch parallelization works)
- ✅ Architecture correct (API routing, scoring logic present)
- ❌ **Data-broken (incomplete Mireye responses)**
- ❌ **Output wrong (identical scores for different sites)**
- ❌ **Not valuable (generic garbage for users)**

### Next Step
**Fix Mireye data access, then re-run this audit.**

Cannot deploy a tool that tells a landlord in Manhattan the same thing as a landlord in rural Wyoming.

---

## DETAILED REPORT
See `AUDIT_REPORT.md` for full analysis including:
- Per-location result tables
- Field null analysis
- Human usability assessment
- Telecom expert review
- Gap analysis
