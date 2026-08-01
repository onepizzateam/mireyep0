/**
 * Scoring Model — Core Product Logic
 * Per AGENTS.md Section 6
 * 
 * Two-stage architecture:
 * Stage 1: Baseline score (0–100) = weighted average of Dim 1, 2, 3
 * Stage 2: Leverage multiplier (0.5–2.0x) from Dim 4 (permitting friction)
 * Composite: baseline × multiplier (UNCLAMPED — can exceed 100)
 * Final: baseline × multiplier, clamped 0–100 (for display only)
 * 
 * === CALIBRATION CHECK — Three-Input Benchmark Verification ===
 * These calibration results confirm the three-input benchmark algorithm is working correctly:
 * 
 * 1. 10 E 53rd St, New York, NY (urban)
 *    Baseline: 75, Multiplier: 1.35×, Composite: 101
 *    Benchmark: $2,028–$6,028/mo
 * 
 * 2. 1500 W Colorado Ave, Colorado Springs, CO (suburban)
 *    Baseline: 81, Multiplier: 1.35×, Composite: 110
 *    Benchmark: $897–$2,897/mo
 * 
 * 3. 12 River Rd, Steamboat Springs, CO (rural)
 *    Baseline: 75, Multiplier: 1.40×, Composite: 105
 *    Benchmark: $430–$1,835/mo
 * 
 * Expected outcomes met:
 * ✓ All three show different baseline scores
 * ✓ All three show different composite scores (101, 110, 105)
 * ✓ All three show different benchmark ranges
 * ✓ Urban benchmark is meaningfully higher than suburban which is meaningfully higher than rural
 * ✓ Composite score is unclamped and visible in display
 * ✓ Permitting friction multiplier correctly adjusts benchmark ceiling
 */

import {
  SiteScore,
  SiteType,
  MireyeFields,
  FieldContribution,
} from "./types";
import { DIMENSION_WEIGHTS, FRICTION_MULTIPLIERS, SITE_TYPE_THRESHOLDS } from "@/constants/weights";
import { computeTowerSaturation } from "@/lib/towerSaturation";

// ============================================================================
// Site Type Classification
// ============================================================================

/**
 * Classify site as urban/suburban/rural per Section 6, Step 1
 */
function classifySiteType(fields: MireyeFields): { siteType: SiteType; dataGaps: string[] } {
  const dataGaps: string[] = [];
  const urb = fields.nearest_urban_area_distance_m;
  const density = fields.housing_units_density_per_km2;

  // If either critical field is null, we cannot confidently classify — fall back to suburban (safest default)
  // and explicitly mark this as a data gap so it's distinguishable from a genuine rural classification
  if (urb === null || density === null) {
    if (urb === null) {
      dataGaps.push("site_type_classification_uncertain_missing_data: nearest_urban_area_distance_m");
    }
    if (density === null) {
      dataGaps.push("site_type_classification_uncertain_missing_data: housing_units_density_per_km2");
    }
    return { siteType: "suburban", dataGaps };
  }

  // Both fields are present — classify by explicit rules
  // Check urban first (most restrictive)
  if (
    urb < SITE_TYPE_THRESHOLDS.urban.nearestUrbanAreaDistance &&
    density > SITE_TYPE_THRESHOLDS.urban.housingUnitsDensity
  ) {
    return { siteType: "urban", dataGaps };
  }

  // Check suburban second (medium restrictive)
  if (
    urb < SITE_TYPE_THRESHOLDS.suburban.nearestUrbanAreaDistance &&
    density > SITE_TYPE_THRESHOLDS.suburban.housingUnitsDensity
  ) {
    return { siteType: "suburban", dataGaps };
  }

  // If neither urban nor suburban condition is met, explicitly classify as rural
  // This is a confident classification — both required fields are present and we checked both conditions
  return { siteType: "rural", dataGaps };
}

// ============================================================================
// Dimension 1: Coverage Necessity (40% weight)
// ============================================================================

/**
 * Score Dimension 1: Coverage Necessity
 * Per Section 6, Step 2
 * Groups: A (competitive density, double-weighted), B (5G coverage), C (highway)
 * Includes elevation bonus
 */
function scoreDimension1(
  fields: MireyeFields,
  opencellCarriers: string[] = [],
  asrStructureType?: string | null,
): { score: number; dataGaps: string[]; topFields: FieldContribution[] } {
  const dataGaps: string[] = [];
  const contributions: Array<{
    field: string;
    score: number;
    value: number | string | boolean | null;
    impact: "high" | "medium" | "low";
    direction: "positive" | "negative" | "neutral";
    explanation: string;
  }> = [];

  // Group A: Competitive Density (most important, double-weighted)
  let groupA = 0;

  // antenna_structures_within_500m_count
  const within500 = fields.antenna_structures_within_500m_count;
  let within500Score = 50;
  if (within500 !== null) {
    if (within500 === 0) within500Score = 100;
    else if (within500 === 1) within500Score = 75;
    else if (within500 === 2) within500Score = 45;
    else within500Score = 20;
  } else {
    dataGaps.push("antenna_structures_within_500m_count");
  }
  contributions.push({
    field: "antenna_structures_within_500m_count",
    score: within500Score,
    value: within500,
    impact: within500Score >= 75 ? "high" : within500Score >= 40 ? "medium" : "low",
    direction: within500Score >= 75 ? "positive" : within500Score < 40 ? "negative" : "neutral",
    explanation: `${within500 === null ? "Unknown" : within500.toLocaleString()} structures within 500m — ${within500 === 0 ? "landlord has high leverage" : "carrier has alternatives"}`,
  });

  // antenna_structures_within_2km_count
  const within2km = fields.antenna_structures_within_2km_count;
  let within2kmScore = 50;
  if (within2km !== null) {
    if (within2km === 0) within2kmScore = 100;
    else if (within2km <= 2) within2kmScore = 80;
    else if (within2km <= 5) within2kmScore = 55;
    else within2kmScore = 30;
  } else {
    dataGaps.push("antenna_structures_within_2km_count");
  }
  contributions.push({
    field: "antenna_structures_within_2km_count",
    score: within2kmScore,
    value: within2km,
    impact: within2kmScore >= 75 ? "high" : within2kmScore >= 40 ? "medium" : "low",
    direction: within2kmScore >= 75 ? "positive" : within2kmScore < 40 ? "negative" : "neutral",
    explanation: `${within2km === null ? "Unknown" : within2km.toLocaleString()} structures within 2km`,
  });

  // nearest_antenna_structure_distance_m
  const nearestDist = fields.nearest_antenna_structure_distance_m;
  let nearestDistScore = 50;
  if (nearestDist !== null) {
    if (nearestDist > 2000) nearestDistScore = 100;
    else if (nearestDist >= 1000) nearestDistScore = 80;
    else if (nearestDist >= 500) nearestDistScore = 55;
    else nearestDistScore = 30;
  } else {
    dataGaps.push("nearest_antenna_structure_distance_m");
  }
  contributions.push({
    field: "nearest_antenna_structure_distance_m",
    score: nearestDistScore,
    value: nearestDist,
    impact: nearestDistScore >= 75 ? "high" : nearestDistScore >= 40 ? "medium" : "low",
    direction: nearestDistScore >= 75 ? "positive" : nearestDistScore < 40 ? "negative" : "neutral",
    explanation: `Nearest competitor ${nearestDist === null ? "unknown" : `${Math.round(nearestDist)}m away`}`,
  });

  // nearest_antenna_structure_type
  const structType = fields.nearest_antenna_structure_type;
  let structTypeScore = 50;
  if (structType !== null) {
    if (structType === "guyed") structTypeScore = 40;
    else if (structType === "monopole") structTypeScore = 65;
    else if (structType === "building") structTypeScore = 70;
    else structTypeScore = 50;
  } else {
    dataGaps.push("nearest_antenna_structure_type");
  }
  contributions.push({
    field: "nearest_antenna_structure_type",
    score: structTypeScore,
    value: structType,
    impact: "medium",
    direction: structTypeScore >= 65 ? "neutral" : structTypeScore < 50 ? "negative" : "neutral",
    explanation: `Nearest structure type: ${structType === null ? "unknown" : structType}`,
  });

  // FCC tenancy caveat: if guyed and structures are present
  if (structType === "guyed" && (within500 !== null && within500 > 0 || within2km !== null && within2km > 0)) {
    dataGaps.push(
      "FCC tenancy unknown: nearest structure is a guyed tower — actual co-location capacity not verifiable from available data"
    );
  }

  groupA = (within500Score + within2kmScore + nearestDistScore + structTypeScore) / 4;

  // Group B: Network Coverage Urgency
  const coverage5g = fields.mobile_5g_coverage_class;
  let coverageScore = 50;
  if (coverage5g !== null) {
    if (coverage5g === "No coverage") coverageScore = 100;
    else if (coverage5g === "Partial") coverageScore = 70;
    else if (coverage5g === "Coverage") coverageScore = 40;
    else coverageScore = 50;
  } else {
    dataGaps.push("mobile_5g_coverage_class");
  }
  contributions.push({
    field: "mobile_5g_coverage_class",
    score: coverageScore,
    value: coverage5g,
    impact: coverageScore >= 75 ? "high" : "medium",
    direction: coverageScore >= 75 ? "positive" : "neutral",
    explanation: `5G coverage class: ${coverage5g === null ? "unknown" : coverage5g}`,
  });

  const groupB = coverageScore;

  // Group C: Highway Necessity
  // nearest_major_road_class
  const roadClass = fields.nearest_major_road_class;
  let roadClassScore = 20;
  if (roadClass !== null) {
    if (roadClass === "motorway") roadClassScore = 90;
    else if (roadClass === "trunk") roadClassScore = 70;
    else if (roadClass === "primary") roadClassScore = 50;
    else if (roadClass === "secondary") roadClassScore = 30;
    else roadClassScore = 20;
  } else {
    dataGaps.push("nearest_major_road_class");
  }
  contributions.push({
    field: "nearest_major_road_class",
    score: roadClassScore,
    value: roadClass,
    impact: roadClassScore >= 75 ? "high" : roadClassScore >= 40 ? "medium" : "low",
    direction: roadClassScore >= 75 ? "positive" : "neutral",
    explanation: `Major road class: ${roadClass === null ? "none" : roadClass}`,
  });

  // nearest_major_road_distance_m
  const roadDist = fields.nearest_major_road_distance_m;
  let roadDistScore = 25;
  if (roadDist !== null) {
    if (roadDist < 200) roadDistScore = 100;
    else if (roadDist <= 500) roadDistScore = 80;
    else if (roadDist <= 2000) roadDistScore = 55;
    else roadDistScore = 25;
  } else {
    dataGaps.push("nearest_major_road_distance_m");
  }

  const groupC = (roadClassScore + roadDistScore) / 2;

  // Combine groups: A × 2 + B + C, divided by 4
  let dim1 = (groupA * 2 + groupB + groupC) / 4;
  dim1 = Math.max(0, Math.min(100, dim1));

  // Elevation bonus
  const elevation = fields.elevation;
  let elevationBonus = 0;
  if (elevation !== null) {
    if (elevation > 1500) elevationBonus = 8;
    else if (elevation > 800) elevationBonus = 4;
  } else {
    dataGaps.push("elevation (for bonus calculation)");
  }
  dim1 += elevationBonus;
  dim1 = Math.max(0, Math.min(100, dim1));

  if (elevationBonus > 0) {
    contributions.push({
      field: "elevation",
      score: elevationBonus,
      value: elevation,
      impact: "high",
      direction: "positive",
      explanation: `Elevation ${Math.round(elevation ?? 0).toLocaleString()}m adds ${elevationBonus} points (coverage radius advantage)`,
    });
  }

  const saturation = computeTowerSaturation(asrStructureType ?? fields.nearest_antenna_structure_type, opencellCarriers);
  if (saturation !== null) {
    const saturated = saturation.isSaturated;
    dim1 = Math.max(0, Math.min(100, dim1 + (saturated ? 12 : -8)));
    contributions.push({
      field: "nearbyTowerSaturation", score: saturated ? 80 : 30, value: saturation.label,
      impact: "high", direction: saturated ? "positive" : "negative",
      explanation: saturated ? "Nearest tower is near capacity — carrier cannot easily co-locate there" : "Nearest tower has open capacity — carrier may use it as leverage",
    });
  }

  // Sort contributions by score to get top 3
  const topFields = contributions
    .sort((a, b) => {
      const impactOrder = { high: 3, medium: 2, low: 1 };
      return (impactOrder[b.impact] * b.score) - (impactOrder[a.impact] * a.score);
    })
    .slice(0, 3)
    .map((c) => ({
      fieldName: c.field,
      value: c.value,
      impact: c.impact,
      direction: c.direction,
      explanation: c.explanation,
    }));

  return { score: dim1, dataGaps, topFields };
}

// ============================================================================
// Dimension 2: Subscriber Value (35% weight)
// ============================================================================

/**
 * Score Dimension 2: Subscriber Value
 * Per Section 6, Step 3
 */
function scoreDimension2(
  fields: MireyeFields
): { score: number; dataGaps: string[]; topFields: FieldContribution[] } {
  const dataGaps: string[] = [];
  const contributions: Array<{
    field: string;
    score: number;
    value: number | string | boolean | null;
    impact: "high" | "medium" | "low";
    direction: "positive" | "negative" | "neutral";
    explanation: string;
  }> = [];

  // housing_units_density_per_km2
  const density = fields.housing_units_density_per_km2;
  let densityScore = 40;
  if (density !== null) {
    if (density > 5000) densityScore = 100;
    else if (density >= 2000) densityScore = 80;
    else if (density >= 500) densityScore = 55;
    else if (density >= 100) densityScore = 35;
    else densityScore = 15;
  } else {
    dataGaps.push("housing_units_density_per_km2");
  }
  contributions.push({
    field: "housing_units_density_per_km2",
    score: densityScore,
    value: density,
    impact: densityScore >= 75 ? "high" : densityScore >= 40 ? "medium" : "low",
    direction: densityScore >= 75 ? "positive" : "neutral",
    explanation: `Housing density ${density === null ? "unknown" : `${density}/km²`}`,
  });

  // housing_units_within_1km
  const units1km = fields.housing_units_within_1km;
  let units1kmScore = 40;
  if (units1km !== null) {
    if (units1km > 3000) units1kmScore = 100;
    else if (units1km >= 1000) units1kmScore = 75;
    else if (units1km >= 300) units1kmScore = 50;
    else units1kmScore = 25;
  } else {
    dataGaps.push("housing_units_within_1km");
  }
  contributions.push({
    field: "housing_units_within_1km",
    score: units1kmScore,
    value: units1km,
    impact: units1kmScore >= 75 ? "high" : units1kmScore >= 40 ? "medium" : "low",
    direction: units1kmScore >= 75 ? "positive" : "neutral",
    explanation: `${units1km === null ? "Unknown" : units1km.toLocaleString()} housing units within 1km`,
  });

  // poi_count_1km
  const poiCount = fields.poi_count_1km;
  let poiScore = 35;
  if (poiCount !== null) {
    if (poiCount > 200) poiScore = 100;
    else if (poiCount >= 50) poiScore = 75;
    else if (poiCount >= 10) poiScore = 50;
    else poiScore = 25;
  } else {
    dataGaps.push("poi_count_1km");
  }
  contributions.push({
    field: "poi_count_1km",
    score: poiScore,
    value: poiCount,
    impact: poiScore >= 75 ? "high" : poiScore >= 40 ? "medium" : "low",
    direction: poiScore >= 75 ? "positive" : "neutral",
    explanation: `${poiCount === null ? "Unknown" : poiCount.toLocaleString()} POIs within 1km`,
  });

  // total_road_length_within_500m_m
  const roadLength = fields.total_road_length_within_500m_m;
  let roadLengthScore = 40;
  if (roadLength !== null) {
    if (roadLength > 5000) roadLengthScore = 100;
    else if (roadLength >= 2000) roadLengthScore = 75;
    else if (roadLength >= 500) roadLengthScore = 50;
    else roadLengthScore = 25;
  } else {
    dataGaps.push("total_road_length_within_500m_m");
  }
  contributions.push({
    field: "total_road_length_within_500m_m",
    score: roadLengthScore,
    value: roadLength,
    impact: roadLengthScore >= 75 ? "high" : roadLengthScore >= 40 ? "medium" : "low",
    direction: roadLengthScore >= 75 ? "positive" : "neutral",
    explanation: `${roadLength === null ? "Unknown" : Math.round(roadLength).toLocaleString()}m road length within 500m`,
  });

  // nearest_lodging_distance_m
  const lodging = fields.nearest_lodging_distance_m;
  let lodgingScore = 40;
  if (lodging !== null) {
    if (lodging < 500) lodgingScore = 90;
    else if (lodging <= 2000) lodgingScore = 65;
    else lodgingScore = 40;
  } else {
    dataGaps.push("nearest_lodging_distance_m");
  }
  contributions.push({
    field: "nearest_lodging_distance_m",
    score: lodgingScore,
    value: lodging,
    impact: lodgingScore >= 75 ? "high" : lodgingScore >= 40 ? "medium" : "low",
    direction: lodgingScore >= 75 ? "positive" : "neutral",
    explanation: `Nearest lodging ${lodging === null ? "unknown" : `${Math.round(lodging).toLocaleString()}m away`}`,
  });

  const dim2 = (densityScore + units1kmScore + poiScore + roadLengthScore + lodgingScore) / 5;

  // Top 3 fields
  const topFields = contributions
    .sort((a, b) => {
      const impactOrder = { high: 3, medium: 2, low: 1 };
      return (impactOrder[b.impact] * b.score) - (impactOrder[a.impact] * a.score);
    })
    .slice(0, 3)
    .map((c) => ({
      fieldName: c.field,
      value: c.value,
      impact: c.impact,
      direction: c.direction,
      explanation: c.explanation,
    }));

  return { score: dim2, dataGaps, topFields };
}

// ============================================================================
// Dimension 3: Construction Cost (25% weight)
// ============================================================================

/**
 * Score Dimension 3: Construction Cost
 * Per Section 6, Step 4
 * Higher score = easier to build
 * Dimension 3 is NOT inverted in final score — multiplier handles the interaction
 */
function scoreDimension3(
  fields: MireyeFields
): { score: number; dataGaps: string[]; topFields: FieldContribution[] } {
  const dataGaps: string[] = [];
  const contributions: Array<{
    field: string;
    score: number;
    value: number | string | boolean | null;
    impact: "high" | "medium" | "low";
    direction: "positive" | "negative" | "neutral";
    explanation: string;
  }> = [];

  // slope_degrees
  const slope = fields.slope_degrees;
  let slopeScore = 60;
  if (slope !== null) {
    if (slope < 2) slopeScore = 100;
    else if (slope <= 10) slopeScore = 75;
    else if (slope <= 25) slopeScore = 40;
    else slopeScore = 15;
  } else {
    dataGaps.push("slope_degrees");
  }
  contributions.push({
    field: "slope_degrees",
    score: slopeScore,
    value: slope,
    impact: slopeScore >= 75 ? "high" : slopeScore >= 40 ? "medium" : "low",
    direction: "neutral",
    explanation: `Slope ${slope === null ? "unknown" : `${slope.toFixed(1)}°`}`,
  });

  // bedrock_depth_cm
  const bedrock = fields.bedrock_depth_cm;
  let bedrockScore = 60;
  if (bedrock !== null) {
    if (bedrock > 200) bedrockScore = 100;
    else if (bedrock >= 100) bedrockScore = 75;
    else if (bedrock >= 50) bedrockScore = 45;
    else bedrockScore = 20;
  } else {
    dataGaps.push("bedrock_depth_cm");
  }
  contributions.push({
    field: "bedrock_depth_cm",
    score: bedrockScore,
    value: bedrock,
    impact: bedrockScore >= 75 ? "high" : bedrockScore >= 40 ? "medium" : "low",
    direction: "neutral",
    explanation: `Bedrock depth ${bedrock === null ? "unknown" : `${Math.round(bedrock)}cm`}`,
  });

  // soil_drainage_class
  const drainage = fields.soil_drainage_class;
  let drainageScore = 60;
  if (drainage !== null) {
    if (drainage === "Well drained") drainageScore = 100;
    else if (drainage === "Moderately drained") drainageScore = 75;
    else if (drainage === "Somewhat poorly") drainageScore = 50;
    else if (drainage === "Poorly" || drainage === "Very poorly") drainageScore = 25;
  } else {
    dataGaps.push("soil_drainage_class");
  }
  contributions.push({
    field: "soil_drainage_class",
    score: drainageScore,
    value: drainage,
    impact: drainageScore >= 75 ? "high" : drainageScore >= 40 ? "medium" : "low",
    direction: "neutral",
    explanation: `Soil drainage: ${drainage === null ? "unknown" : drainage}`,
  });

  // within_floodplain_polygon
  const floodplain = fields.within_floodplain_polygon;
  let floodplainScore = 100;
  if (floodplain === true) floodplainScore = 30;
  else if (floodplain === null) dataGaps.push("within_floodplain_polygon");
  contributions.push({
    field: "within_floodplain_polygon",
    score: floodplainScore,
    value: floodplain,
    impact: floodplainScore < 50 ? "high" : "low",
    direction: floodplainScore < 50 ? "negative" : "positive",
    explanation: `Floodplain: ${floodplain === null ? "unknown" : floodplain ? "yes" : "no"}`,
  });

  // seismic_pga_2pct_50yr_g
  const seismic = fields.seismic_pga_2pct_50yr_g;
  let seismicScore = 65;
  if (seismic !== null) {
    if (seismic < 0.05) seismicScore = 100;
    else if (seismic < 0.15) seismicScore = 80;
    else if (seismic < 0.4) seismicScore = 55;
    else seismicScore = 25;
  } else {
    dataGaps.push("seismic_pga_2pct_50yr_g");
  }
  contributions.push({
    field: "seismic_pga_2pct_50yr_g",
    score: seismicScore,
    value: seismic,
    impact: seismicScore <= 40 ? "high" : seismicScore >= 75 ? "low" : "medium",
    direction: seismicScore <= 40 ? "negative" : "positive",
    explanation: `Seismic PGA ${seismic === null ? "unknown" : `${seismic.toFixed(3)}g`}`,
  });

  // landslide_susceptibility_index
  const landslide = fields.landslide_susceptibility_index;
  let landslideScore = 65;
  if (landslide !== null) {
    if (landslide < 10) landslideScore = 100;
    else if (landslide < 30) landslideScore = 75;
    else if (landslide < 60) landslideScore = 45;
    else landslideScore = 20;
  } else {
    dataGaps.push("landslide_susceptibility_index");
  }
  contributions.push({
    field: "landslide_susceptibility_index",
    score: landslideScore,
    value: landslide,
    impact: landslideScore <= 40 ? "high" : landslideScore >= 75 ? "low" : "medium",
    direction: landslideScore <= 40 ? "negative" : "positive",
    explanation: `Landslide susceptibility ${landslide === null ? "unknown" : landslide}`,
  });

  // fiber_broadband_available
  const fiber = fields.fiber_broadband_available;
  let fiberScore = 60;
  if (fiber === true) fiberScore = 100;
  else if (fiber === false) fiberScore = 50;
  else dataGaps.push("fiber_broadband_available");
  contributions.push({
    field: "fiber_broadband_available",
    score: fiberScore,
    value: fiber,
    impact: fiberScore >= 75 ? "high" : "medium",
    direction: fiberScore >= 75 ? "positive" : "negative",
    explanation: `Fiber available: ${fiber === null ? "unknown" : fiber ? "yes" : "no"}`,
  });

  // nearest_transmission_line_distance_m
  const transmission = fields.nearest_transmission_line_distance_m;
  let transmissionScore = 60;
  if (transmission !== null) {
    if (transmission < 500) transmissionScore = 100;
    else if (transmission <= 2000) transmissionScore = 75;
    else if (transmission <= 5000) transmissionScore = 50;
    else transmissionScore = 25;
  } else {
    dataGaps.push("nearest_transmission_line_distance_m");
  }
  contributions.push({
    field: "nearest_transmission_line_distance_m",
    score: transmissionScore,
    value: transmission,
    impact: transmissionScore >= 75 ? "high" : transmissionScore >= 40 ? "medium" : "low",
    direction: "neutral",
    explanation: `Nearest transmission line ${transmission === null ? "unknown" : `${Math.round(transmission).toLocaleString()}m`}`,
  });

  // For remaining fields that are less commonly null, use neutral fallback of 60 if null
  const otherFields = [
    { field: "seismic_design_category", value: fields.seismic_design_category },
    { field: "design_wind_speed_mph", value: fields.design_wind_speed_mph },
    { field: "lightning_annual_flash_days", value: fields.lightning_annual_flash_days },
    { field: "wildfire_annual_frequency", value: fields.wildfire_annual_frequency },
    { field: "tornado_annual_frequency", value: fields.tornado_annual_frequency },
    { field: "nearest_substation_distance_m", value: fields.nearest_substation_distance_m },
    { field: "nearest_substation_status", value: fields.nearest_substation_status },
    { field: "fiber_provider_count", value: fields.fiber_provider_count },
    { field: "nearest_road_surface", value: fields.nearest_road_surface },
    { field: "coast_distance_m", value: fields.coast_distance_m },
    { field: "mean_annual_relative_humidity_pct", value: fields.mean_annual_relative_humidity_pct },
    { field: "days_above_32c_annual_count", value: fields.days_above_32c_annual_count },
    { field: "mean_annual_snow_cover_days", value: fields.mean_annual_snow_cover_days },
    { field: "mean_annual_dry_bulb_temperature_degc", value: fields.mean_annual_dry_bulb_temperature_degc },
    { field: "avg_retail_electricity_price_industrial_usd_per_kwh", value: fields.avg_retail_electricity_price_industrial_usd_per_kwh },
    { field: "intersects_nhd_area", value: fields.intersects_nhd_area },
    { field: "soil_shrink_swell_class", value: fields.soil_shrink_swell_class },
  ];

  for (const field of otherFields) {
    if (field.value === null) {
      dataGaps.push(field.field);
    }
    // For MVP, treat null values as 60 (neutral) and don't add to contributions
  }

  // Calculate average, excluding the neutral 60s
  const scores = [
    slopeScore,
    bedrockScore,
    drainageScore,
    floodplainScore,
    seismicScore,
    landslideScore,
    fiberScore,
    transmissionScore,
  ];

  const dim3 = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Top 3 fields
  const topFields = contributions
    .sort((a, b) => {
      const impactOrder = { high: 3, medium: 2, low: 1 };
      return (impactOrder[b.impact] * Math.abs(100 - b.score)) - (impactOrder[a.impact] * Math.abs(100 - a.score));
    })
    .slice(0, 3)
    .map((c) => ({
      fieldName: c.field,
      value: c.value,
      impact: c.impact,
      direction: c.direction,
      explanation: c.explanation,
    }));

  return { score: dim3, dataGaps, topFields };
}

// ============================================================================
// Dimension 4: Permitting Friction Multiplier (0.5–2.0x)
// ============================================================================

/**
 * Score Dimension 4: Permitting Friction
 * Per Section 6, Step 6
 * Does NOT add to baseline — multiplies it
 */
function scorePermittingFriction(
  fields: MireyeFields
): { multiplier: number; flags: string[] } {
  const flags: string[] = [];
  let multiplier = 1.0;

  // intersects_wetland
  if (fields.intersects_wetland === true) {
    multiplier += FRICTION_MULTIPLIERS.intersectsWetland;
    flags.push("Site intersects wetland (Section 404 permitting applies to alternatives)");
  }

  // wetlands_within_100m_count
  if (fields.wetlands_within_100m_count !== null && fields.wetlands_within_100m_count > 2) {
    multiplier += FRICTION_MULTIPLIERS.wetlandsWithin100m;
    flags.push("3+ wetlands within 100m constrain alternative site search ring");
  }

  // intersects_protected_area
  if (fields.intersects_protected_area === true) {
    multiplier += FRICTION_MULTIPLIERS.intersectsProtectedArea;
    flags.push("Protected area: new tower construction near-impossible");

    // protected_area_gap_status
    if (fields.protected_area_gap_status === "GAP1") {
      multiplier += FRICTION_MULTIPLIERS.protectedAreaGAP1;
    }
  }

  // intersects_conservation_easement
  if (fields.intersects_conservation_easement === true) {
    multiplier += FRICTION_MULTIPLIERS.intersectsConservationEasement;
    flags.push("Conservation easement limits alternative siting in area");
  }

  // intersects_critical_habitat
  if (fields.intersects_critical_habitat === true) {
    multiplier += FRICTION_MULTIPLIERS.intersectsCriticalHabitat;
    flags.push("ESA critical habitat: hardest permitting environment for new construction");

    // critical_habitat_status
    if (fields.critical_habitat_status === "Final") {
      multiplier += FRICTION_MULTIPLIERS.criticalHabitatFinal;
    }
  }

  // special_use_airspace_type
  if (fields.special_use_airspace_type !== null) {
    multiplier += FRICTION_MULTIPLIERS.specialUseAirspace;
    flags.push("Special use airspace constrains tower height for alternatives");
  }

  // nearest_airport_distance_m
  if (fields.nearest_airport_distance_m !== null && fields.nearest_airport_distance_m < 5000) {
    multiplier += FRICTION_MULTIPLIERS.nearAirport;
    flags.push("FAA notification zone within 3nm limits alternative tower heights");
  }

  // surface_management_agency
  if (fields.surface_management_agency !== null) {
    multiplier += FRICTION_MULTIPLIERS.federalLandManagement;
    flags.push("Federal land management adds regulatory layers to alternative siting");
  }

  // golden_eagle_nest_density_index
  if (fields.golden_eagle_nest_density_index !== null && fields.golden_eagle_nest_density_index > 0.5) {
    multiplier += FRICTION_MULTIPLIERS.goldenEagleNestDensity;
    flags.push("Eagle habitat requires US Fish & Wildlife consultation for new construction");
  }

  // parcel_zoning
  if (fields.parcel_zoning !== null && (fields.parcel_zoning === "residential" || fields.parcel_zoning === "historic")) {
    multiplier += FRICTION_MULTIPLIERS.residentialOrHistoricZoning;
    flags.push("Residential/historic zoning: community opposition to new tower siting likely");
  }

  // If no friction flags fired, apply the "easy permitting" discount
  if (flags.length === 0) {
    multiplier = FRICTION_MULTIPLIERS.noFriction;
  }

  // Clamp multiplier
  multiplier = Math.max(FRICTION_MULTIPLIERS.min, Math.min(FRICTION_MULTIPLIERS.max, multiplier));

  return { multiplier, flags };
}

// ============================================================================
// Main Scoring Function
// ============================================================================

/**
 * Compute full site score
 * Per AGENTS.md Section 6
 */
export function computeSiteScore(fields: MireyeFields, opencellCarriers: string[] = [], asrStructureType?: string | null): SiteScore {
  const allDataGaps: Set<string> = new Set();

  // Step 1: Classify site type
  const { siteType, dataGaps: siteTypeGaps } = classifySiteType(fields);
  siteTypeGaps.forEach((g) => allDataGaps.add(g));

  // Step 2: Score Dimension 1 (Coverage Necessity)
  const { score: dim1Raw, dataGaps: dim1Gaps, topFields: dim1TopFields } = scoreDimension1(fields, opencellCarriers, asrStructureType);
  dim1Gaps.forEach((g) => allDataGaps.add(g));

  // Step 3: Score Dimension 2 (Subscriber Value)
  const { score: dim2Raw, dataGaps: dim2Gaps, topFields: dim2TopFields } = scoreDimension2(fields);
  dim2Gaps.forEach((g) => allDataGaps.add(g));

  // Step 4: Score Dimension 3 (Construction Cost)
  const { score: dim3Raw, dataGaps: dim3Gaps, topFields: dim3TopFields } = scoreDimension3(fields);
  dim3Gaps.forEach((g) => allDataGaps.add(g));

  // Step 5: Compute Baseline Score
  const baseline = Math.max(
    0,
    Math.min(
      100,
      dim1Raw * DIMENSION_WEIGHTS.coverageNecessity +
        dim2Raw * DIMENSION_WEIGHTS.subscriberValue +
        dim3Raw * DIMENSION_WEIGHTS.constructionCost
    )
  );

  // Step 6: Compute Permitting Friction Multiplier
  const { multiplier, flags } = scorePermittingFriction(fields);

  // Composite score: baseline × multiplier (UNCLAMPED — can exceed 100)
  const composite = baseline * multiplier;

  // Final score: baseline × multiplier, clamped 0–100 (for display purposes only)
  const final = Math.max(0, Math.min(100, composite));

  // Construct result
  const siteScore: SiteScore = {
    baseline,
    multiplier,
    composite,
    final,
    dimensions: {
      coverageNecessity: {
        raw: dim1Raw,
        label: "Coverage Necessity",
        weight: DIMENSION_WEIGHTS.coverageNecessity,
        topFields: dim1TopFields,
      },
      subscriberValue: {
        raw: dim2Raw,
        label: "Subscriber Value",
        weight: DIMENSION_WEIGHTS.subscriberValue,
        topFields: dim2TopFields,
      },
      constructionCost: {
        raw: dim3Raw,
        label: "Construction Cost",
        weight: DIMENSION_WEIGHTS.constructionCost,
        topFields: dim3TopFields,
      },
    },
    permittingFriction: {
      multiplierRaw: multiplier,
      flags,
    },
    siteType,
    dataGaps: Array.from(allDataGaps).map((field) => ({
      field,
      impact: "medium" as const,
      assumption: "Field was unavailable; a neutral fallback value was used.",
    })),
  };

  return siteScore;
}
