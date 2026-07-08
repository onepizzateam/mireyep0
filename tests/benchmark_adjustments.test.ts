import { describe, it, expect } from "@jest/globals";
import { computeBenchmarkRange } from "@/lib/benchmark";
import { SiteScore, MireyeFields } from "@/lib/types";
import { BENCHMARK_TABLE } from "@/constants/benchmarks";

/**
 * Unit tests for itemized price adjustment model
 * Per task specification
 * 
 * Tests verify:
 * (a) Adjustments are applied when fields are provided
 * (b) Each adjustment is traced to a specific field
 * (c) Null fields are skipped (not silently defaulted)
 * (d) Total adjustment is capped at ±30%
 * (e) Permitting friction is added as a separate line item
 * (f) Breakdown array contains all applied adjustments
 */

describe("Benchmark Adjustments (Field-Driven)", () => {
  /**
   * Helper to create a minimal MireyeFields object with all fields null
   */
  function createEmptyFields(): MireyeFields {
    return {
      antenna_structures_within_500m_count: null,
      antenna_structures_within_2km_count: null,
      nearest_antenna_structure_distance_m: null,
      nearest_antenna_structure_height_m: null,
      nearest_antenna_structure_type: null,
      mobile_5g_coverage_class: null,
      nearest_major_road_distance_m: null,
      nearest_major_road_class: null,
      elevation: null,
      nearest_hospital_distance_m: null,
      nearest_school_distance_m: null,
      nearest_urban_area_distance_m: null,
      housing_units_within_1km: null,
      housing_units_density_per_km2: null,
      poi_count_1km: null,
      total_road_length_within_500m_m: null,
      nearest_lodging_distance_m: null,
      slope_degrees: null,
      bedrock_depth_cm: null,
      soil_drainage_class: null,
      soil_shrink_swell_class: null,
      within_floodplain_polygon: null,
      seismic_pga_2pct_50yr_g: null,
      seismic_design_category: null,
      design_wind_speed_mph: null,
      landslide_susceptibility_index: null,
      lightning_annual_flash_days: null,
      wildfire_annual_frequency: null,
      tornado_annual_frequency: null,
      nearest_transmission_line_distance_m: null,
      nearest_substation_distance_m: null,
      nearest_substation_status: null,
      fiber_broadband_available: null,
      fiber_provider_count: null,
      nearest_road_surface: null,
      coast_distance_m: null,
      mean_annual_relative_humidity_pct: null,
      days_above_32c_annual_count: null,
      mean_annual_snow_cover_days: null,
      mean_annual_dry_bulb_temperature_degc: null,
      avg_retail_electricity_price_industrial_usd_per_kwh: null,
      intersects_nhd_area: null,
      intersects_wetland: null,
      wetlands_within_100m_count: null,
      nearest_wetland_distance_m: null,
      intersects_protected_area: null,
      protected_area_gap_status: null,
      intersects_conservation_easement: null,
      intersects_critical_habitat: null,
      critical_habitat_status: null,
      land_use_class: null,
      parcel_zoning: null,
      lcms_class: null,
      tree_canopy_pct: null,
      surface_management_agency: null,
      special_use_airspace_type: null,
      nearest_airport_distance_m: null,
      golden_eagle_nest_density_index: null,
      primary_building_height_m: null,
      nearest_class_i_area_distance_m: null,
    };
  }

  /**
   * Helper to create a base SiteScore
   */
  function createBaseSiteScore(finalScore: number, siteType: "urban" | "suburban" | "rural" = "suburban"): SiteScore {
    return {
      baseline: finalScore,
      multiplier: 1.0,
      composite: finalScore,
      final: finalScore,
      siteType,
      dimensions: {
        coverageNecessity: {
          raw: finalScore,
          label: "Coverage Necessity",
          weight: 0.4,
          topFields: [],
        },
        subscriberValue: {
          raw: finalScore,
          label: "Subscriber Value",
          weight: 0.35,
          topFields: [],
        },
        constructionCost: {
          raw: finalScore,
          label: "Construction Cost",
          weight: 0.25,
          topFields: [],
        },
      },
      permittingFriction: {
        multiplierRaw: 1.0,
        flags: [],
      },
      dataGaps: [],
    };
  }

  /**
   * Test 1: No fields → empty breakdown
   * When fields are provided but all null, no adjustments should fire
   */
  it("should return empty breakdown when all fields are null", () => {
    const siteScore = createBaseSiteScore(62, "suburban");
    const fields = createEmptyFields();

    const result = computeBenchmarkRange(siteScore, fields);

    expect(result.priceBreakdown).toEqual([]);
    expect(result.baseValue).toBe(BENCHMARK_TABLE.suburban.mid.min + (BENCHMARK_TABLE.suburban.mid.max - BENCHMARK_TABLE.suburban.mid.min) / 2);
  });

  /**
   * Test 2: High-density adjustment (+12%)
   * housing_units_density_per_km2 > 5000 should add +12%
   */
  it("should apply high-density subscriber adjustment (+12%)", () => {
    const siteScore = createBaseSiteScore(62, "suburban");
    const fields = createEmptyFields();
    fields.housing_units_density_per_km2 = 6000;

    const result = computeBenchmarkRange(siteScore, fields);

    expect(result.priceBreakdown.length).toBeGreaterThan(0);
    const densityAdj = result.priceBreakdown.find((adj) => adj.fieldName === "housing_units_density_per_km2");
    expect(densityAdj).toBeDefined();
    expect(densityAdj?.percent).toBe(0.12);
    expect(densityAdj?.direction).toBe("positive");
  });

  /**
   * Test 3: No competing structures adjustment (+15%)
   * antenna_structures_within_2km_count = 0 should add +15%
   */
  it("should apply sole-option adjustment (+15%) when antenna_structures_within_2km_count = 0", () => {
    const siteScore = createBaseSiteScore(62, "suburban");
    const fields = createEmptyFields();
    fields.antenna_structures_within_2km_count = 0;

    const result = computeBenchmarkRange(siteScore, fields);

    const soleOptionAdj = result.priceBreakdown.find(
      (adj) => adj.fieldName === "antenna_structures_within_2km_count" && adj.percent === 0.15
    );
    expect(soleOptionAdj).toBeDefined();
    expect(soleOptionAdj?.label).toContain("sole option");
  });

  /**
   * Test 4: Floodplain penalty (-6%)
   * within_floodplain_polygon = true should subtract -6%
   */
  it("should apply floodplain penalty (-6%)", () => {
    const siteScore = createBaseSiteScore(62, "suburban");
    const fields = createEmptyFields();
    fields.within_floodplain_polygon = true;

    const result = computeBenchmarkRange(siteScore, fields);

    const floodAdj = result.priceBreakdown.find((adj) => adj.fieldName === "within_floodplain_polygon");
    expect(floodAdj).toBeDefined();
    expect(floodAdj?.percent).toBe(-0.06);
    expect(floodAdj?.direction).toBe("negative");
  });

  /**
   * Test 5: Steep slope penalty (-4%)
   * slope_degrees > 15 should subtract -4%
   */
  it("should apply steep slope penalty (-4%)", () => {
    const siteScore = createBaseSiteScore(62, "suburban");
    const fields = createEmptyFields();
    fields.slope_degrees = 20;

    const result = computeBenchmarkRange(siteScore, fields);

    const slopeAdj = result.priceBreakdown.find((adj) => adj.fieldName === "slope_degrees");
    expect(slopeAdj).toBeDefined();
    expect(slopeAdj?.percent).toBe(-0.04);
  });

  /**
   * Test 6: Multiple adjustments stack correctly
   * High density (+12%) + sole option (+15%) should stack to +27%
   */
  it("should stack multiple adjustments without exceeding ±30% cap", () => {
    const siteScore = createBaseSiteScore(62, "suburban");
    const fields = createEmptyFields();
    fields.housing_units_density_per_km2 = 6000; // +12%
    fields.antenna_structures_within_2km_count = 0; // +15%

    const result = computeBenchmarkRange(siteScore, fields);

    expect(result.priceBreakdown.length).toBe(2);

    const totalPercent = result.priceBreakdown.reduce((sum, adj) => sum + adj.percent, 0);
    expect(totalPercent).toBeLessThanOrEqual(0.30);
    expect(totalPercent).toBeGreaterThan(0.25); // Both should apply
  });

  /**
   * Test 7: Permitting friction adds a line item
   * multiplierRaw >= 1.4 should add friction bonus to ceiling
   */
  it("should include permitting friction as a separate line item in breakdown", () => {
    const siteScore = createBaseSiteScore(62, "suburban");
    siteScore.permittingFriction.multiplierRaw = 1.5;
    siteScore.permittingFriction.flags = ["wetland constraint"];

    const fields = createEmptyFields();

    const result = computeBenchmarkRange(siteScore, fields);

    const frictionAdj = result.priceBreakdown.find(
      (adj) => adj.fieldName === "permittingFriction.multiplier"
    );
    expect(frictionAdj).toBeDefined();
    expect(frictionAdj?.percent).toBe(0.20); // 1.4 ≤ multiplier < 1.6 → +20%
    expect(frictionAdj?.direction).toBe("positive");
  });

  /**
   * Test 8: Backward compatibility — no fields provided
   * Calling without fields should return exact table values, not adjusted ranges
   */
  it("should return exact table values when fields are not provided (backward compatible)", () => {
    const siteScore = createBaseSiteScore(62, "suburban");

    const result = computeBenchmarkRange(siteScore);

    const expectedBand = BENCHMARK_TABLE.suburban.mid;
    expect(result.monthlyRange.min).toBe(expectedBand.min);
    expect(result.monthlyRange.max).toBe(expectedBand.max);
    expect(result.priceBreakdown).toEqual([]);
  });

  /**
   * Test 9: Adjustments are traceable to fields
   * Each adjustment should have a non-null fieldName pointing to a Mireye field
   */
  it("should trace each adjustment back to a specific Mireye field", () => {
    const siteScore = createBaseSiteScore(62, "suburban");
    const fields = createEmptyFields();
    fields.housing_units_density_per_km2 = 6000;
    fields.antenna_structures_within_2km_count = 0;
    fields.within_floodplain_polygon = true;

    const result = computeBenchmarkRange(siteScore, fields);

    const validFieldNames = [
      "housing_units_density_per_km2",
      "antenna_structures_within_2km_count",
      "nearest_major_road_distance_m",
      "poi_count_1km",
      "within_floodplain_polygon",
      "slope_degrees",
      "permittingFriction.multiplier",
    ];

    result.priceBreakdown.forEach((adj) => {
      expect(validFieldNames).toContain(adj.fieldName);
      expect(adj.label.length).toBeGreaterThan(0);
      expect(typeof adj.percent).toBe("number");
      expect(typeof adj.amount).toBe("number");
    });
  });

  /**
   * Test 10: Adjustments have dollar amounts
   * Each adjustment should have an amount field for UI display
   */
  it("should include dollar amounts for each adjustment", () => {
    const siteScore = createBaseSiteScore(62, "suburban");
    const fields = createEmptyFields();
    fields.housing_units_density_per_km2 = 6000;

    const result = computeBenchmarkRange(siteScore, fields);

    expect(result.baseValue).toBeGreaterThan(0);

    result.priceBreakdown.forEach((adj) => {
      expect(Number.isInteger(adj.amount)).toBe(true);
      // Amount should be roughly baseValue * percent
      const expectedAmount = Math.round(result.baseValue * adj.percent);
      expect(Math.abs(adj.amount - expectedAmount)).toBeLessThanOrEqual(1); // Allow rounding error
    });
  });
});
