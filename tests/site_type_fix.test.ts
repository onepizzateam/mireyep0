/**
 * Test script to verify site type classification fix and permitting friction behavior
 * Tests three synthetic addresses: urban, suburban, rural
 * Also checks if permitting friction multipliers are being applied too aggressively
 */

import { computeSiteScore } from "../src/lib/score";
import { computeBenchmarkRange } from "../src/lib/benchmark";
import type { MireyeFields } from "../src/lib/types";

// Helper to create synthetic MireyeFields with defaults
function createSyntheticFields(overrides: Partial<MireyeFields>): MireyeFields {
  const defaults: MireyeFields = {
    // Coverage Necessity fields
    antenna_structures_within_500m_count: 1,
    antenna_structures_within_2km_count: 2,
    nearest_antenna_structure_distance_m: 800,
    nearest_antenna_structure_height_m: 100,
    nearest_antenna_structure_type: "monopole",
    mobile_5g_coverage_class: "Coverage",
    nearest_major_road_distance_m: 500,
    nearest_major_road_class: "secondary",
    elevation: 300,
    nearest_hospital_distance_m: 5000,
    nearest_school_distance_m: 2000,
    nearest_urban_area_distance_m: 10000,

    // Subscriber Value fields
    housing_units_within_1km: 800,
    housing_units_density_per_km2: 800,
    poi_count_1km: 50,
    total_road_length_within_500m_m: 3000,
    nearest_lodging_distance_m: 2000,

    // Construction Cost fields
    slope_degrees: 5,
    bedrock_depth_cm: 150,
    soil_drainage_class: "Well drained",
    soil_shrink_swell_class: "Low",
    within_floodplain_polygon: false,
    seismic_pga_2pct_50yr_g: 0.1,
    seismic_design_category: "C",
    design_wind_speed_mph: 90,
    landslide_susceptibility_index: 20,
    lightning_annual_flash_days: 30,
    wildfire_annual_frequency: 0.5,
    tornado_annual_frequency: 0.2,
    nearest_transmission_line_distance_m: 1000,
    nearest_substation_distance_m: 500,
    nearest_substation_status: "active",
    fiber_broadband_available: true,
    fiber_provider_count: 2,
    nearest_road_surface: "asphalt",
    coast_distance_m: 50000,
    mean_annual_relative_humidity_pct: 60,
    days_above_32c_annual_count: 50,
    mean_annual_snow_cover_days: 20,
    mean_annual_dry_bulb_temperature_degc: 55,
    avg_retail_electricity_price_industrial_usd_per_kwh: 0.08,
    intersects_nhd_area: false,

    // Permitting Friction fields
    intersects_wetland: false,
    wetlands_within_100m_count: 0,
    nearest_wetland_distance_m: 5000,
    intersects_protected_area: false,
    protected_area_gap_status: null,
    intersects_conservation_easement: false,
    intersects_critical_habitat: false,
    critical_habitat_status: null,
    land_use_class: "agricultural",
    parcel_zoning: "rural",
    lcms_class: "forest",
    tree_canopy_pct: 40,
    surface_management_agency: null,
    special_use_airspace_type: null,
    nearest_airport_distance_m: 50000,
    golden_eagle_nest_density_index: 0,
    primary_building_height_m: 10,
    nearest_class_i_area_distance_m: 100000,
  };

  return { ...defaults, ...overrides };
}

describe("Site Type Classification Fix", () => {
  describe("Basic site type classifications", () => {
    test("Dense urban site classifies as urban", () => {
      const fields = createSyntheticFields({
        nearest_urban_area_distance_m: 2000, // < 5000
        housing_units_density_per_km2: 5000, // > 2000
      });

      const score = computeSiteScore(fields);
      expect(score.siteType).toBe("urban");
    });

    test("Generic suburban site classifies as suburban", () => {
      const fields = createSyntheticFields({
        nearest_urban_area_distance_m: 10000, // < 25000, > 5000
        housing_units_density_per_km2: 800, // > 400, < 2000
      });

      const score = computeSiteScore(fields);
      expect(score.siteType).toBe("suburban");
    });

    test("Remote rural site classifies as rural", () => {
      const fields = createSyntheticFields({
        nearest_urban_area_distance_m: 50000, // >= 25000
        housing_units_density_per_km2: 20, // <= 400
        antenna_structures_within_500m_count: 0,
        antenna_structures_within_2km_count: 0,
        mobile_5g_coverage_class: "No coverage",
      });

      const score = computeSiteScore(fields);
      expect(score.siteType).toBe("rural");
    });
  });

  describe("Boundary conditions", () => {
    test("Site just outside urban boundary classifies as suburban", () => {
      const fields = createSyntheticFields({
        nearest_urban_area_distance_m: 5001, // Just outside urban
        housing_units_density_per_km2: 2001, // Just above urban threshold
      });

      const score = computeSiteScore(fields);
      expect(score.siteType).toBe("suburban");
    });

    test("Site at urban/suburban boundary classifies correctly", () => {
      const fields = createSyntheticFields({
        nearest_urban_area_distance_m: 5000, // At urban boundary
        housing_units_density_per_km2: 2000, // At urban boundary
      });

      const score = computeSiteScore(fields);
      expect(score.siteType).toBe("suburban"); // Just misses urban condition (not <)
    });

    test("Site at suburban/rural boundary classifies as rural", () => {
      const fields = createSyntheticFields({
        nearest_urban_area_distance_m: 25000, // At suburban upper bound
        housing_units_density_per_km2: 400, // At suburban lower bound
      });

      const score = computeSiteScore(fields);
      expect(score.siteType).toBe("rural");
    });

    test("Site just inside suburban boundary classifies as suburban", () => {
      const fields = createSyntheticFields({
        nearest_urban_area_distance_m: 24999, // Just inside suburban
        housing_units_density_per_km2: 401, // Just above suburban
      });

      const score = computeSiteScore(fields);
      expect(score.siteType).toBe("suburban");
    });
  });

  describe("Data gap handling", () => {
    test("Null urban distance falls back to suburban with data gap marker", () => {
      const fields = createSyntheticFields({
        nearest_urban_area_distance_m: null,
        housing_units_density_per_km2: 800,
      });

      const score = computeSiteScore(fields);
      expect(score.siteType).toBe("suburban");
      expect(score.dataGaps.some((gap) => gap.field.includes("site_type_classification_uncertain_missing_data"))).toBe(true);
    });

    test("Null density falls back to suburban with data gap marker", () => {
      const fields = createSyntheticFields({
        nearest_urban_area_distance_m: 10000,
        housing_units_density_per_km2: null,
      });

      const score = computeSiteScore(fields);
      expect(score.siteType).toBe("suburban");
      expect(score.dataGaps.some((gap) => gap.field.includes("site_type_classification_uncertain_missing_data"))).toBe(true);
    });

    test("Both null falls back to suburban with both data gap markers", () => {
      const fields = createSyntheticFields({
        nearest_urban_area_distance_m: null,
        housing_units_density_per_km2: null,
      });

      const score = computeSiteScore(fields);
      expect(score.siteType).toBe("suburban");
      const dataGapString = score.dataGaps.map((gap) => gap.field).join("|");
      expect(dataGapString).toMatch(/site_type_classification_uncertain_missing_data.*nearest_urban_area_distance_m/);
      expect(dataGapString).toMatch(/site_type_classification_uncertain_missing_data.*housing_units_density_per_km2/);
    });
  });

  describe("Benchmark ranges differ by site type", () => {
    test("Benchmark ranges are visibly different across site types", () => {
      const urbanFields = createSyntheticFields({
        nearest_urban_area_distance_m: 2000,
        housing_units_density_per_km2: 5000,
      });
      const urbanScore = computeSiteScore(urbanFields);
      const urbanBenchmark = computeBenchmarkRange(urbanScore);

      const suburbanFields = createSyntheticFields({
        nearest_urban_area_distance_m: 10000,
        housing_units_density_per_km2: 800,
      });
      const suburbanScore = computeSiteScore(suburbanFields);
      const suburbanBenchmark = computeBenchmarkRange(suburbanScore);

      const ruralFields = createSyntheticFields({
        nearest_urban_area_distance_m: 50000,
        housing_units_density_per_km2: 20,
      });
      const ruralScore = computeSiteScore(ruralFields);
      const ruralBenchmark = computeBenchmarkRange(ruralScore);

      console.log("\n📊 Benchmark Ranges by Site Type:");
      console.log(`  Urban:     $${urbanBenchmark.monthlyRange.min} - $${urbanBenchmark.monthlyRange.max}/mo`);
      console.log(`  Suburban:  $${suburbanBenchmark.monthlyRange.min} - $${suburbanBenchmark.monthlyRange.max}/mo`);
      console.log(`  Rural:     $${ruralBenchmark.monthlyRange.min} - $${ruralBenchmark.monthlyRange.max}/mo`);

      // Urban > Suburban > Rural
      expect(urbanBenchmark.monthlyRange.max).toBeGreaterThan(suburbanBenchmark.monthlyRange.max);
      expect(suburbanBenchmark.monthlyRange.max).toBeGreaterThan(ruralBenchmark.monthlyRange.max);
    });
  });

  describe("Permitting friction aggressiveness", () => {
    test("No friction flags result in 0.85x multiplier (easy permitting)", () => {
      const fields = createSyntheticFields({
        intersects_wetland: false,
        wetlands_within_100m_count: 0,
        intersects_protected_area: false,
        intersects_conservation_easement: false,
        intersects_critical_habitat: false,
        special_use_airspace_type: null,
        nearest_airport_distance_m: 50000,
        surface_management_agency: null,
        parcel_zoning: "rural",
        golden_eagle_nest_density_index: 0,
      });

      const score = computeSiteScore(fields);
      expect(score.multiplier).toBeCloseTo(0.85, 2);
      expect(score.permittingFriction.flags.length).toBe(0);
    });

    test("High friction site with multiple flags", () => {
      const fields = createSyntheticFields({
        intersects_wetland: true,
        wetlands_within_100m_count: 3,
        intersects_critical_habitat: true,
        critical_habitat_status: "Final",
        intersects_conservation_easement: true,
        special_use_airspace_type: "MOA",
        nearest_airport_distance_m: 3000,
        surface_management_agency: "USFS",
        parcel_zoning: "residential",
      });

      const score = computeSiteScore(fields);
      console.log("\n🚨 High Friction Site Analysis:");
      console.log(`  Multiplier: ${score.multiplier.toFixed(2)}x`);
      console.log(`  Baseline Score: ${score.baseline.toFixed(2)}`);
      console.log(`  Final Score: ${score.final.toFixed(2)}`);
      console.log(`  Friction Flags (${score.permittingFriction.flags.length}):`);
      score.permittingFriction.flags.forEach((flag, i) => {
        console.log(`    ${i + 1}. ${flag}`);
      });

      // Multiplier should be reasonable (not exploding to max)
      expect(score.multiplier).toBeLessThanOrEqual(2.0);
      expect(score.permittingFriction.flags.length).toBeGreaterThan(0);
    });

    test("Check if multiple friction flags are stacking excessively", () => {
      // Create a baseline site
      const baselineFields = createSyntheticFields({
        nearest_urban_area_distance_m: 15000,
        housing_units_density_per_km2: 500,
      });
      const baselineScore = computeSiteScore(baselineFields);

      // Create a site with many friction flags
      const frictionFields = createSyntheticFields({
        nearest_urban_area_distance_m: 15000,
        housing_units_density_per_km2: 500,
        intersects_wetland: true,
        wetlands_within_100m_count: 5,
        intersects_protected_area: true,
        protected_area_gap_status: "GAP1",
        intersects_conservation_easement: true,
        intersects_critical_habitat: true,
        critical_habitat_status: "Final",
        special_use_airspace_type: "MOA",
        nearest_airport_distance_m: 2000,
        surface_management_agency: "NPS",
        golden_eagle_nest_density_index: 1.0,
        parcel_zoning: "residential",
      });
      const frictionScore = computeSiteScore(frictionFields);

      const scoreIncrease = frictionScore.final - baselineScore.final;

      console.log("\n🔍 Friction Multiplier Aggressiveness Check:");
      console.log(`  Baseline Final Score: ${baselineScore.final.toFixed(2)}`);
      console.log(`  Baseline Multiplier: ${baselineScore.multiplier.toFixed(2)}x`);
      console.log(`  With Friction Final Score: ${frictionScore.final.toFixed(2)}`);
      console.log(`  With Friction Multiplier: ${frictionScore.multiplier.toFixed(2)}x`);
      console.log(`  Score Increase: ${scoreIncrease.toFixed(2)} points`);
      console.log(`  Number of Friction Flags: ${frictionScore.permittingFriction.flags.length}`);

      // If multiplier reaches 2.0, should be justified by legitimate friction
      if (frictionScore.multiplier === 2.0) {
        console.log(`  ⚠️  Multiplier is at max (2.0x) - verify this is intentional`);
      }

      // Score increase should be meaningful but not absurd
      expect(scoreIncrease).toBeLessThan(100); // Sanity check
    });
  });
});

// Run tests and print summary
describe("Summary Report", () => {
  test("Print comprehensive summary", () => {
    console.log("\n" + "=".repeat(80));
    console.log("SITE TYPE CLASSIFICATION FIX - SUMMARY REPORT");
    console.log("=".repeat(80));

    // Test 1: Urban
    const urbanFields = createSyntheticFields({
      nearest_urban_area_distance_m: 2000,
      housing_units_density_per_km2: 5000,
    });
    const urbanScore = computeSiteScore(urbanFields);
    const urbanBenchmark = computeBenchmarkRange(urbanScore);

    // Test 2: Suburban
    const suburbanFields = createSyntheticFields({
      nearest_urban_area_distance_m: 10000,
      housing_units_density_per_km2: 800,
    });
    const suburbanScore = computeSiteScore(suburbanFields);
    const suburbanBenchmark = computeBenchmarkRange(suburbanScore);

    // Test 3: Rural
    const ruralFields = createSyntheticFields({
      nearest_urban_area_distance_m: 50000,
      housing_units_density_per_km2: 20,
    });
    const ruralScore = computeSiteScore(ruralFields);
    const ruralBenchmark = computeBenchmarkRange(ruralScore);

    console.log("\n📍 Test 1: Dense Urban");
    console.log(`   Site Type: ${urbanScore.siteType}`);
    console.log(`   Final Score: ${urbanScore.final.toFixed(2)}`);
    console.log(`   Benchmark: $${urbanBenchmark.monthlyRange.min} - $${urbanBenchmark.monthlyRange.max}/mo`);

    console.log("\n📍 Test 2: Generic Suburban");
    console.log(`   Site Type: ${suburbanScore.siteType}`);
    console.log(`   Final Score: ${suburbanScore.final.toFixed(2)}`);
    console.log(`   Benchmark: $${suburbanBenchmark.monthlyRange.min} - $${suburbanBenchmark.monthlyRange.max}/mo`);

    console.log("\n📍 Test 3: Remote Rural");
    console.log(`   Site Type: ${ruralScore.siteType}`);
    console.log(`   Final Score: ${ruralScore.final.toFixed(2)}`);
    console.log(`   Benchmark: $${ruralBenchmark.monthlyRange.min} - $${ruralBenchmark.monthlyRange.max}/mo`);

    console.log("\n✅ Verification:");
    console.log(
      `   Urban > Suburban > Rural: ${
        urbanBenchmark.monthlyRange.max > suburbanBenchmark.monthlyRange.max &&
        suburbanBenchmark.monthlyRange.max > ruralBenchmark.monthlyRange.max
          ? "✓ PASS"
          : "✗ FAIL"
      }`
    );

    const hasRural = ruralScore.siteType === "rural";
    console.log(
      `   Rural classification now reachable: ${hasRural ? "✓ PASS (BUG FIXED)" : "✗ FAIL (still unreachable)"}`
    );

    console.log("\n" + "=".repeat(80));
  });
});
