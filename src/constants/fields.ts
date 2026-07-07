/**
 * The 60 Mireye Fields (split into two 30-field batches for parallel API requests)
 * Source of truth for all field names used in the /v1/fetch call
 * Never hard-code field name strings outside this file
 *
 * AGENTS.md Section 3 specifies exactly 60 fields (12+5+25+18).
 * Mireye API enforces a max of 50 fields per request, so we split into two batches
 * and fetch them simultaneously using Promise.all — same token, two parallel calls,
 * wall time = slowest batch, not the sum.
 */

// BATCH 1: 30 core fields (score-critical: antenna structures, coverage, density, hazards)
export const MIREYE_FIELDS_BATCH_1 = [
  // Dimension 1 — Coverage Necessity (all 12 fields, critical for competitive analysis)
  "antenna_structures_within_500m_count",
  "antenna_structures_within_2km_count",
  "nearest_antenna_structure_distance_m",
  "nearest_antenna_structure_height_m",
  "nearest_antenna_structure_type",
  "mobile_5g_coverage_class",
  "nearest_major_road_distance_m",
  "nearest_major_road_class",
  "elevation",
  "nearest_hospital_distance_m",
  "nearest_school_distance_m",
  "nearest_urban_area_distance_m",

  // Dimension 2 — Subscriber Value (all 5 fields, critical for valuation)
  "housing_units_within_1km",
  "housing_units_density_per_km2",
  "poi_count_1km",
  "total_road_length_within_500m_m",
  "nearest_lodging_distance_m",

  // Dimension 3 — Construction Cost (first 13 fields, core hazards + transmission)
  "slope_degrees",
  "bedrock_depth_cm",
  "soil_drainage_class",
  "soil_shrink_swell_class",
  "within_floodplain_polygon",
  "seismic_pga_2pct_50yr_g",
  "seismic_design_category",
  "design_wind_speed_mph",
  "landslide_susceptibility_index",
  "lightning_annual_flash_days",
  "wildfire_annual_frequency",
  "tornado_annual_frequency",
  "nearest_transmission_line_distance_m",
] as const;

// BATCH 2: 30 remaining fields (infrastructure, permitting, climate, NHD)
export const MIREYE_FIELDS_BATCH_2 = [
  // Dimension 3 — Construction Cost (remaining 12 fields: utilities, climate, NHD)
  "nearest_substation_distance_m",
  "nearest_substation_status",
  "fiber_broadband_available",
  "fiber_provider_count",
  "nearest_road_surface",
  "coast_distance_m",
  "mean_annual_relative_humidity_pct",
  "days_above_32c_annual_count",
  "mean_annual_snow_cover_days",
  "mean_annual_dry_bulb_temperature_degc",
  "avg_retail_electricity_price_industrial_usd_per_kwh",
  "intersects_nhd_area",

  // Dimension 4 — Permitting Friction (all 18 fields: wetlands, protected areas, zoning, airspace)
  "intersects_wetland",
  "wetlands_within_100m_count",
  "nearest_wetland_distance_m",
  "intersects_protected_area",
  "protected_area_gap_status",
  "intersects_conservation_easement",
  "intersects_critical_habitat",
  "critical_habitat_status",
  "land_use_class",
  "parcel_zoning",
  "lcms_class",
  "tree_canopy_pct",
  "surface_management_agency",
  "special_use_airspace_type",
  "nearest_airport_distance_m",
  "golden_eagle_nest_density_index",
  "primary_building_height_m",
  "nearest_class_i_area_distance_m",
] as const;

// Combined for reference
export const MIREYE_FIELDS = [
  ...MIREYE_FIELDS_BATCH_1,
  ...MIREYE_FIELDS_BATCH_2,
] as const;

// Verify batch sizes are within Mireye API 50-field limit
if (MIREYE_FIELDS_BATCH_1.length > 50) {
  throw new Error(
    `MIREYE_FIELDS_BATCH_1 exceeds 50-field limit: ${MIREYE_FIELDS_BATCH_1.length}`
  );
}
if (MIREYE_FIELDS_BATCH_2.length > 50) {
  throw new Error(
    `MIREYE_FIELDS_BATCH_2 exceeds 50-field limit: ${MIREYE_FIELDS_BATCH_2.length}`
  );
}
if (MIREYE_FIELDS.length !== 60) {
  throw new Error(
    `MIREYE_FIELDS must contain exactly 60 fields (per AGENTS.md Section 3), but has ${MIREYE_FIELDS.length}`
  );
}

// Export sets for fast lookups
export const MIREYE_FIELD_SET = new Set(MIREYE_FIELDS);
export const MIREYE_FIELDS_BATCH_1_SET = new Set(MIREYE_FIELDS_BATCH_1);
export const MIREYE_FIELDS_BATCH_2_SET = new Set(MIREYE_FIELDS_BATCH_2);

// Type for a valid field name
export type MireyeFieldName = (typeof MIREYE_FIELDS)[number];

/**
 * Type guard to check if a string is a valid Mireye field name
 */
export function isMireyeField(value: string): value is MireyeFieldName {
  return MIREYE_FIELD_SET.has(value as MireyeFieldName);
}
