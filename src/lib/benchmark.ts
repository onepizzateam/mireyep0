/**
 * Benchmark Range Calculator
 * Per AGENTS.md Section 7
 * 
 * Strategy:
 * 1. Anchor on BENCHMARK_TABLE[siteType][scoreBand] to get the base band
 * 2. Compute base value as the midpoint of that band
 * 3. Build itemized adjustments from specific Mireye fields (field-driven, not score-driven)
 * 4. Apply adjustments to base value (capped at ±30% total) to get adjusted center
 * 5. Apply fixed ±25% spread around adjusted center to get min/max
 * 6. Apply permitting friction multiplier to ceiling only
 * 7. Return breakdown array for full transparency
 */

import {
  BenchmarkResult,
  SiteScore,
  ScoreBand,
  PriceAdjustment,
  MireyeFields,
} from "./types";
import { BENCHMARK_TABLE, BENCHMARK_CALIBRATION_NOTE } from "@/constants/benchmarks";

/**
 * Determine score band from final (clamped) score
 * Score band drives which row of BENCHMARK_TABLE to use
 */
function getScoreBand(finalScore: number): ScoreBand {
  if (finalScore >= 75) return "high";
  if (finalScore >= 50) return "mid";
  return "low";
}

/**
 * Build itemized price adjustments from specific Mireye fields
 * 
 * Each adjustment is:
 * - Tied to a specific field (full traceability)
 * - A fixed, capped percentage (no field exceeds ±15% individually)
 * - Skipped if the underlying field is null
 * - Included in the breakdown array for UI display
 * 
 * Total stacked adjustment is capped at ±30% to prevent implausible outcomes.
 */
function buildPriceAdjustments(
  fields: MireyeFields,
  baseValue: number
): PriceAdjustment[] {
  const adjustments: PriceAdjustment[] = [];
  let totalAdjustmentPercent = 0;

  // Rule 1: High density subscriber base (+12%)
  if (fields.housing_units_density_per_km2 !== null && fields.housing_units_density_per_km2 > 5000) {
    const percent = 0.12;
    adjustments.push({
      label: "High-density subscriber base",
      fieldName: "housing_units_density_per_km2",
      percent,
      amount: Math.round(baseValue * percent),
      direction: "positive",
    });
    totalAdjustmentPercent += percent;
  }

  // Rule 2: Above-average density (+6%)
  if (
    fields.housing_units_density_per_km2 !== null &&
    fields.housing_units_density_per_km2 > 2000 &&
    fields.housing_units_density_per_km2 <= 5000
  ) {
    const percent = 0.06;
    adjustments.push({
      label: "Above-average subscriber density",
      fieldName: "housing_units_density_per_km2",
      percent,
      amount: Math.round(baseValue * percent),
      direction: "positive",
    });
    totalAdjustmentPercent += percent;
  }

  // Rule 3: No competing structures within 2km (+15%)
  if (fields.antenna_structures_within_2km_count !== null && fields.antenna_structures_within_2km_count === 0) {
    const percent = 0.15;
    adjustments.push({
      label: "No competing structures within 2km — sole option in search ring",
      fieldName: "antenna_structures_within_2km_count",
      percent,
      amount: Math.round(baseValue * percent),
      direction: "positive",
    });
    totalAdjustmentPercent += percent;
  }

  // Rule 4: Limited competing structures (+7%)
  if (fields.antenna_structures_within_2km_count !== null && fields.antenna_structures_within_2km_count === 1) {
    const percent = 0.07;
    adjustments.push({
      label: "Limited competing structures nearby",
      fieldName: "antenna_structures_within_2km_count",
      percent,
      amount: Math.round(baseValue * percent),
      direction: "positive",
    });
    totalAdjustmentPercent += percent;
  }

  // Rule 5: High site accessibility (near major road) (+4%)
  if (fields.nearest_major_road_distance_m !== null && fields.nearest_major_road_distance_m < 200) {
    const percent = 0.04;
    adjustments.push({
      label: "High site accessibility (near major road)",
      fieldName: "nearest_major_road_distance_m",
      percent,
      amount: Math.round(baseValue * percent),
      direction: "positive",
    });
    totalAdjustmentPercent += percent;
  }

  // Rule 6: High commercial/foot-traffic density (+5%)
  if (fields.poi_count_1km !== null && fields.poi_count_1km > 150) {
    const percent = 0.05;
    adjustments.push({
      label: "High commercial/foot-traffic density",
      fieldName: "poi_count_1km",
      percent,
      amount: Math.round(baseValue * percent),
      direction: "positive",
    });
    totalAdjustmentPercent += percent;
  }

  // Rule 7: Within floodplain (-6%)
  if (fields.within_floodplain_polygon === true) {
    const percent = -0.06;
    adjustments.push({
      label: "Within floodplain — added construction/insurance cost",
      fieldName: "within_floodplain_polygon",
      percent,
      amount: Math.round(baseValue * percent),
      direction: "negative",
    });
    totalAdjustmentPercent += percent;
  }

  // Rule 8: Steep slope (-4%)
  if (fields.slope_degrees !== null && fields.slope_degrees > 15) {
    const percent = -0.04;
    adjustments.push({
      label: "Steep slope — added construction cost",
      fieldName: "slope_degrees",
      percent,
      amount: Math.round(baseValue * percent),
      direction: "negative",
    });
    totalAdjustmentPercent += percent;
  }

  // Cap total adjustment at ±30%
  const cappedAdjustmentPercent = Math.max(-0.30, Math.min(0.30, totalAdjustmentPercent));

  // If capping changed the total, recalculate adjusted amounts proportionally
  if (cappedAdjustmentPercent !== totalAdjustmentPercent) {
    const scaleFactor = cappedAdjustmentPercent / totalAdjustmentPercent;
    adjustments.forEach((adj) => {
      adj.amount = Math.round(adj.amount * scaleFactor);
      adj.percent = adj.percent * scaleFactor;
    });
  }

  return adjustments;
}

/**
 * Compute benchmark range for a given site
 * 
 * Two modes:
 * 1. Without fields (backward compatible): returns exact BENCHMARK_TABLE values
 * 2. With fields (new mode): anchors on table, applies itemized adjustments from fields
 * 
 * Algorithm (with fields):
 * 1. Use siteScore.final (clamped 0–100) to determine score band
 * 2. Look up benchmark band in BENCHMARK_TABLE[siteType][scoreBand]
 * 3. Compute base value as midpoint of the band
 * 4. Build itemized adjustments from specific fields (tied to BENCHMARK_TABLE, not composite score)
 * 5. Apply adjustments to base value (capped at ±30% total)
 * 6. Apply fixed ±25% spread around adjusted center to get min/max
 * 7. Apply permitting friction multiplier to ceiling only
 * 8. Return breakdown array for transparency
 */
export function computeBenchmarkRange(
  siteScore: SiteScore,
  fields?: MireyeFields
): BenchmarkResult {
  const { siteType, final: finalScore, permittingFriction } = siteScore;

  // Determine score band from the final clamped score
  const scoreBand = getScoreBand(finalScore);

  // Direct lookup in BENCHMARK_TABLE
  const benchmarkBand = BENCHMARK_TABLE[siteType][scoreBand];

  // If no fields provided, return exact table values (backward compatible mode)
  if (!fields) {
    return {
      monthlyRange: {
        min: benchmarkBand.min,
        max: benchmarkBand.max,
      },
      annualRange: {
        min: benchmarkBand.min * 12,
        max: benchmarkBand.max * 12,
      },
      siteType,
      scoreBand,
      calibrationNote: BENCHMARK_CALIBRATION_NOTE,
      baseValue: Math.round((benchmarkBand.min + benchmarkBand.max) / 2),
      priceBreakdown: [],
    };
  }

  // NEW MODE: With fields — apply itemized adjustments
  const baseValue = Math.round((benchmarkBand.min + benchmarkBand.max) / 2);

  // Build itemized adjustments from fields
  const priceBreakdown: PriceAdjustment[] = [];

  const adjustments = buildPriceAdjustments(fields, baseValue);
  priceBreakdown.push(...adjustments);

  // Apply adjustments to base value to get adjusted center
  const totalAdjustment = adjustments.reduce((sum, adj) => sum + adj.amount, 0);
  let adjustedCenter = baseValue + totalAdjustment;

  // Apply fixed ±25% spread around adjusted center to get min/max
  const spread = 0.25;
  let min = Math.round(adjustedCenter * (1 - spread));
  let max = Math.round(adjustedCenter * (1 + spread));

  // Apply permitting friction multiplier to ceiling only
  let frictionCeilingBump = 0;
  if (permittingFriction.multiplierRaw >= 1.6) {
    frictionCeilingBump = 0.35;
  } else if (permittingFriction.multiplierRaw >= 1.4) {
    frictionCeilingBump = 0.20;
  }

  if (frictionCeilingBump > 0) {
    const originalMax = max;
    max = Math.round(max * (1 + frictionCeilingBump));

    // Add to breakdown for transparency
    priceBreakdown.push({
      label: `Permitting friction premium (ceiling only) – ${permittingFriction.flags.length} constraint(s)`,
      fieldName: "permittingFriction.multiplier",
      percent: frictionCeilingBump,
      amount: max - originalMax,
      direction: "positive",
    });
  }

  return {
    monthlyRange: { min, max },
    annualRange: { min: min * 12, max: max * 12 },
    siteType,
    scoreBand,
    calibrationNote: BENCHMARK_CALIBRATION_NOTE,
    baseValue,
    priceBreakdown,
  };
}

/**
 * Get the midpoint of a benchmark range
 */
export function getBenchmarkMidpoint(benchmark: BenchmarkResult): number {
  return (benchmark.monthlyRange.min + benchmark.monthlyRange.max) / 2;
}
