# Benchmark Calculation Refactoring — Implementation Complete

**Date**: 2026-07-08  
**Task**: Replace opaque composite-score interpolation with field-driven, itemized benchmark calculation  
**Status**: ✅ COMPLETE

---

## Summary of Changes

### Problem Solved
The previous benchmark calculation was opaque and disconnected:
- The `BENCHMARK_TABLE` (with `high`/`mid`/`low` bands per site type) was defined but never actually used
- Interpolation logic was unexplained and unsourced (arbitrary constants like `+0.25` and `1.2x` multipliers)
- Users saw a final $ range but couldn't trace how specific site fields affected the number

### Solution Implemented
Replaced the calculation with a **transparent, field-driven model**:
1. **Anchors on `BENCHMARK_TABLE`** — now actually imported and used
2. **Itemized adjustments** — each tied to a specific Mireye field with a capped, fixed percentage
3. **Full traceability** — `priceBreakdown` array shows every line item that moved the price
4. **Explicit permitting friction** — separated from range repositioning as a distinct ceiling adjustment

---

## Files Modified

### 1. `src/lib/types.ts`
**Added:**
- `PriceAdjustment` interface — describes each line item in the breakdown:
  ```typescript
  export interface PriceAdjustment {
    label: string;           // e.g. "High-density subscriber base"
    fieldName: string;       // Mireye field name (e.g. "housing_units_density_per_km2")
    amount: number;          // dollar amount (rounded)
    percent: number;         // percentage adjustment (e.g. 0.12 for +12%)
    direction: "positive" | "negative" | "neutral";
  }
  ```

**Extended:**
- `BenchmarkResult` — added two new fields:
  ```typescript
  baseValue: number;              // anchor value (band midpoint)
  priceBreakdown: PriceAdjustment[]; // all applied adjustments
  ```

### 2. `src/lib/benchmark.ts`
**Complete rewrite** of `computeBenchmarkRange()` with new algorithm:

1. **Uses `BENCHMARK_TABLE` directly** — looks up base band, computes midpoint
2. **New function `buildPriceAdjustments()`** — applies field-driven rules:
   - High-density subscriber base (> 5000 units/km²) → +12%
   - Above-average density (> 2000 units/km²) → +6%
   - No competing structures within 2km → +15%
   - Limited competing structures (= 1) → +7%
   - High site accessibility (< 200m to major road) → +4%
   - High commercial density (> 150 POI within 1km) → +5%
   - Within floodplain → -6%
   - Steep slope (> 15°) → -4%

3. **Each rule:**
   - Reads directly from a named field (traceable)
   - Is skipped if the field is null (no silent defaulting)
   - Has a fixed, capped percentage (max ±15% per rule)

4. **Total adjustment capped at ±30%** — prevents stacking from creating implausible values

5. **Fixed spread calculation** — ±25% around adjusted center (stable, not score-dependent)

6. **Permitting friction as separate line item** — added to breakdown for visibility:
   - Multiplier ≥ 1.6 → +35% to ceiling
   - Multiplier ≥ 1.4 → +20% to ceiling

7. **Backward compatibility mode** — when `fields` not provided, returns exact table values (preserves existing test behavior)

**Key exports:**
- `computeBenchmarkRange(siteScore, fields?)` — main function, now optional fields parameter
- `buildPriceAdjustments(fields, baseValue)` — internal function for itemized adjustments
- `getScoreBand(finalScore)` — unchanged, uses `final` (clamped) score

### 3. `src/constants/benchmarks.ts`
**Updated `BENCHMARK_CALIBRATION_NOTE`** to accurately describe the new method:
```
"Base range calibrated to published industry data (Steel in the Air, Vertical Consultants, Tower Genius) 
for this site type and score band. Adjustments are applied individually for site-specific factors 
(density, competing structures, accessibility, construction risk) and shown in the breakdown below. 
This is an informed estimate, not a transaction database — actual negotiated rates may vary."
```

### 4. `src/app/api/score/route.ts`
**Updated call to `computeBenchmarkRange()`** to pass `mireyeFields`:
```typescript
const benchmark = computeBenchmarkRange(siteScore, mireyeFields);
```
This enables itemized adjustments to fire and populate the breakdown.

### 5. `tests/benchmark.test.ts`
**Updated calibration note assertion** to match new text:
```typescript
expect(result.calibrationNote).toContain("Base range calibrated to published");
```

### 6. `tests/benchmark_adjustments.test.ts` (NEW)
**10 new comprehensive tests** for the adjustment model:
1. Empty breakdown when all fields null
2. High-density adjustment (+12%)
3. Sole-option adjustment (+15%)
4. Floodplain penalty (-6%)
5. Steep slope penalty (-4%)
6. Multiple adjustments stacking
7. Permitting friction as line item
8. Backward compatibility (no fields)
9. Traceability of each adjustment
10. Dollar amounts included

---

## How the New Model Works

### Example: Suburban Site, Score = 62
```
1. Look up BENCHMARK_TABLE.suburban.mid → $1200–$1800/mo
2. Compute baseValue = (1200 + 1800) / 2 = $1500

3. Apply adjustments:
   - housing_units_density_per_km2 = 6000 → +12% = +$180
   - antenna_structures_within_2km_count = 0 → +15% = +$225
   - within_floodplain_polygon = false → no adjustment
   - slope_degrees = 8 → no adjustment
   - [other fields] → no adjustments
   
   Total: +27% = +$405
   Adjusted center = $1500 + $405 = $1905

4. Apply ±25% spread:
   - Min = $1905 × 0.75 = $1429
   - Max = $1905 × 1.25 = $2381

5. Apply permitting friction (if multiplier >= 1.4):
   - Original max = $2381
   - Friction bump = +20%
   - New max = $2381 × 1.20 = $2857

6. Return:
   monthlyRange: { min: 1429, max: 2857 }
   baseValue: 1500
   priceBreakdown: [
     { label: "High-density subscriber base", fieldName: "housing_units_density_per_km2", 
       percent: 0.12, amount: 180, direction: "positive" },
     { label: "No competing structures within 2km — sole option...", 
       fieldName: "antenna_structures_within_2km_count", 
       percent: 0.15, amount: 225, direction: "positive" },
     { label: "Permitting friction premium (ceiling only)...", 
       fieldName: "permittingFriction.multiplier", 
       percent: 0.20, amount: 476, direction: "positive" }
   ]
```

The UI can now show:
```
Base benchmark (suburban, mid score): $1200–$1800/mo
Adjustments:
  + High-density subscriber base: +$180
  + No competing structures: +$225
  = Adjusted range: $1429–$2381/mo
  
Permitting premium (ceiling): +$476
Final range: $1429–$2857/mo
```

---

## Validation & Testing

✅ **All 35 tests pass:**
- `benchmark.test.ts` — 5 tests (backward compatibility, band classification)
- `benchmark_adjustments.test.ts` — 10 tests (new adjustment model)
- `score.test.ts` — 5 tests (scoring unchanged)
- `site_type_fix.test.ts` — 15 tests (site type classification unchanged)

✅ **Build successful** — No TypeScript errors

✅ **Key validation points:**
- `BENCHMARK_TABLE` is now actually imported and used
- `getScoreBand()` called with `final` (clamped) score, not `composite`
- Null fields skipped in adjustments (not silently defaulted)
- Total adjustment capped at ±30%
- Calibration note accurately describes the method
- All 8 adjustment rules are independent, traceable, and capped

---

## Integration Notes for UI/Reports

### For `BenchmarkBand.tsx` component:
The component can now display `benchmark.priceBreakdown` as a collapsible section:
```typescript
<details>
  <summary>How this range was calculated</summary>
  <ul>
    {benchmark.priceBreakdown.map(adj => (
      <li key={adj.fieldName}>
        {adj.label}: ${adj.amount > 0 ? '+' : ''}{adj.amount} ({(adj.percent * 100).toFixed(0)}%)
      </li>
    ))}
  </ul>
</details>
```

### For PDF reports:
The `pdf.ts` generation already has access to `benchmark.priceBreakdown`, so reports can include:
```
BENCHMARK RANGE CALCULATION

Base (suburban, mid score): $1200–$1800/mo
Base value: $1500/mo

Site-Specific Adjustments:
  1. High-density subscriber base (+12%): +$180
  2. No competing structures within 2km (+15%): +$225
  
Total adjustments: +$405 (+27%, capped at ±30%)
Adjusted center: $1905/mo

Market spread (±25%): $1429–$2381/mo

Permitting friction premium (ceiling +20%): +$476
Final range: $1429–$2857/mo
```

---

## What This Fixes

1. ✅ **Dead code removed** — `BENCHMARK_TABLE` is now the central source of truth
2. ✅ **Transparent methodology** — every number in the range is auditable and traceable
3. ✅ **No silent defaulting** — null fields are explicitly tracked, not invisibly assumed to be 0
4. ✅ **Sourced calibration** — the note now accurately describes the actual computation
5. ✅ **Field-driven, not score-driven** — adjustments key off real Mireye data, not the abstract composite score
6. ✅ **Explainable to users** — they can see why their site got that specific range

---

## Backward Compatibility

- When `computeBenchmarkRange()` is called without `fields` parameter, it returns exact `BENCHMARK_TABLE` values (existing behavior)
- All existing tests pass without modification (except calibration note assertion)
- API route automatically passes `mireyeFields` so new behavior activates by default
- Response schema unchanged — `priceBreakdown` is additive, existing code reading `monthlyRange`/`annualRange` unaffected

---

## Next Steps (Optional)

1. **UI integration** — Update `BenchmarkBand.tsx` to display `priceBreakdown` as collapsible "How calculated" section
2. **PDF reports** — Update report generation to include itemized breakdown
3. **Leverage summary** — Review `leverage.ts` for any text duplication with adjustment labels (e.g., "No competing structures" appears in both)
4. **Field documentation** — Add hover tooltips on adjustment labels explaining why each factor matters
