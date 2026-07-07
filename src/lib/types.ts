/**
 * SignalRent Core Types
 * Source of truth for all TypeScript interfaces and types across the application
 */

// ============================================================================
// Geocoding Types
// ============================================================================

export interface GeocodedAddress {
  lat: number;
  lng: number;
  displayName: string; // Nominatim's formatted address
}

// ============================================================================
// Mireye API Types
// ============================================================================

export interface MireyeFieldValue {
  value: number | string | boolean | null;
  source: string;
  updated_at: string;
}

export interface MireyeResponse {
  [fieldName: string]: MireyeFieldValue;
}

export interface MireyeFields {
  // Dimension 1 — Coverage Necessity (12 fields)
  antenna_structures_within_500m_count: number | null;
  antenna_structures_within_2km_count: number | null;
  nearest_antenna_structure_distance_m: number | null;
  nearest_antenna_structure_height_m: number | null;
  nearest_antenna_structure_type: string | null;
  mobile_5g_coverage_class: string | null;
  nearest_major_road_distance_m: number | null;
  nearest_major_road_class: string | null;
  elevation: number | null;
  nearest_hospital_distance_m: number | null;
  nearest_school_distance_m: number | null;
  nearest_urban_area_distance_m: number | null;

  // Dimension 2 — Subscriber Value (5 fields)
  housing_units_within_1km: number | null;
  housing_units_density_per_km2: number | null;
  poi_count_1km: number | null;
  total_road_length_within_500m_m: number | null;
  nearest_lodging_distance_m: number | null;

  // Dimension 3 — Construction Cost (25 fields)
  slope_degrees: number | null;
  bedrock_depth_cm: number | null;
  soil_drainage_class: string | null;
  soil_shrink_swell_class: string | null;
  within_floodplain_polygon: boolean | null;
  seismic_pga_2pct_50yr_g: number | null;
  seismic_design_category: string | null;
  design_wind_speed_mph: number | null;
  landslide_susceptibility_index: number | null;
  lightning_annual_flash_days: number | null;
  wildfire_annual_frequency: number | null;
  tornado_annual_frequency: number | null;
  nearest_transmission_line_distance_m: number | null;
  nearest_substation_distance_m: number | null;
  nearest_substation_status: string | null;
  fiber_broadband_available: boolean | null;
  fiber_provider_count: number | null;
  nearest_road_surface: string | null;
  coast_distance_m: number | null;
  mean_annual_relative_humidity_pct: number | null;
  days_above_32c_annual_count: number | null;
  mean_annual_snow_cover_days: number | null;
  mean_annual_dry_bulb_temperature_degc: number | null;
  avg_retail_electricity_price_industrial_usd_per_kwh: number | null;
  intersects_nhd_area: boolean | null;

  // Dimension 4 — Permitting Friction (18 fields)
  intersects_wetland: boolean | null;
  wetlands_within_100m_count: number | null;
  nearest_wetland_distance_m: number | null;
  intersects_protected_area: boolean | null;
  protected_area_gap_status: string | null;
  intersects_conservation_easement: boolean | null;
  intersects_critical_habitat: boolean | null;
  critical_habitat_status: string | null;
  land_use_class: string | null;
  parcel_zoning: string | null;
  lcms_class: string | null;
  tree_canopy_pct: number | null;
  surface_management_agency: string | null;
  special_use_airspace_type: string | null;
  nearest_airport_distance_m: number | null;
  golden_eagle_nest_density_index: number | null;
  primary_building_height_m: number | null;
  nearest_class_i_area_distance_m: number | null;
}

// ============================================================================
// Scoring Types
// ============================================================================

export type SiteType = "urban" | "suburban" | "rural";

export interface FieldContribution {
  fieldName: string;
  value: number | string | boolean | null;
  impact: "high" | "medium" | "low";
  direction: "positive" | "negative" | "neutral";
  explanation: string; // one sentence, plain English
}

export interface DimensionScore {
  raw: number; // 0–100
  label: string; // "Coverage Necessity", etc.
  weight: number; // 0.40, 0.35, 0.25
  topFields: FieldContribution[]; // top 3 fields driving this dimension
}

export interface PermittingFriction {
  multiplierRaw: number; // 0.5–2.0
  flags: string[]; // list of friction flags that fired, plain English
}

export interface SiteScore {
  baseline: number; // 0–100, weighted sum of dim 1–3
  multiplier: number; // 0.5–2.0 from permitting friction
  final: number; // baseline × multiplier, clamped 0–100
  dimensions: {
    coverageNecessity: DimensionScore;
    subscriberValue: DimensionScore;
    constructionCost: DimensionScore;
  };
  permittingFriction: PermittingFriction;
  siteType: SiteType;
  dataGaps: string[]; // list of null fields that affected scoring
}

// ============================================================================
// Benchmark Types
// ============================================================================

export type ScoreBand = "high" | "mid" | "low";

export interface PriceRange {
  min: number;
  max: number;
}

export interface BenchmarkResult {
  monthlyRange: PriceRange;
  annualRange: PriceRange;
  siteType: SiteType;
  scoreBand: ScoreBand;
  calibrationNote: string;
}

export interface BuyoutComparison {
  buyoutAmount: number;
  offeredRate: number; // monthly
  impliedMultiple: number;
  fairValueMin: number; // annual
  fairValueMax: number; // annual
  position: "below" | "within" | "above";
  message: string;
}

// ============================================================================
// Rate Comparison Types
// ============================================================================

export interface RateComparison {
  offeredRate: number;
  benchmarkMin: number;
  benchmarkMax: number;
  position: "below" | "within" | "above";
  gapPercent: number; // how far below mid of range, as %
  gapDollars: number; // monthly
  thirtyYearCost: number; // gapDollars * 12 * 30
  message: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ScoreRequest {
  address: string; // required
  carrier?: string; // optional, stored for display only
  offeredRate?: number; // optional, monthly dollars
  buyoutAmount?: number; // optional, lump sum
}

export interface ScoreResponse {
  ok: true;
  address: string;
  displayAddress: string; // from Nominatim
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
}

export type ScoreErrorCode =
  | "GEOCODING_FAILED"
  | "MIREYE_ERROR"
  | "MIREYE_TIMEOUT"
  | "INVALID_INPUT"
  | "UNKNOWN";

export interface ScoreErrorResponse {
  ok: false;
  error: string; // user-facing message
  code: ScoreErrorCode;
}

export type ScoreAPIResponse = ScoreResponse | ScoreErrorResponse;

// ============================================================================
// Error Types
// ============================================================================

export class GeocodingFailedError extends Error {
  constructor(address: string) {
    super(`Failed to geocode address: ${address}`);
    this.name = "GeocodingFailedError";
  }
}

export class MireyeError extends Error {
  constructor(message: string) {
    super(`Mireye API error: ${message}`);
    this.name = "MireyeError";
  }
}

export class MireyeTimeoutError extends Error {
  constructor() {
    super("Mireye API request timed out (15 seconds)");
    this.name = "MireyeTimeoutError";
  }
}
