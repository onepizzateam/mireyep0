import type { MireyeFields } from "@/lib/types";
import { MIREYE_FIELDS } from "@/constants/fields";

export const MOCK_LOCATION = { lat: 41.8789, lng: -87.6359, displayAddress: "233 S Wacker Dr, Chicago, IL 60606 (MOCK)" };

const values: Partial<MireyeFields> = {
  antenna_structures_within_500m_count: 1, antenna_structures_within_2km_count: 3, nearest_antenna_structure_distance_m: 850, nearest_antenna_structure_height_m: 45, nearest_antenna_structure_type: "monopole", mobile_5g_coverage_class: "Partial", nearest_major_road_distance_m: 120, nearest_major_road_class: "primary", elevation: 182, nearest_hospital_distance_m: 900, nearest_school_distance_m: 300, nearest_urban_area_distance_m: 0,
  housing_units_within_1km: 3200, housing_units_density_per_km2: 2800, poi_count_1km: 4100, total_road_length_within_500m_m: 9800, nearest_lodging_distance_m: 180,
  slope_degrees: 1.2, bedrock_depth_cm: 1800, soil_drainage_class: "moderately well drained", soil_shrink_swell_class: "low", within_floodplain_polygon: false, seismic_pga_2pct_50yr_g: 0.08, seismic_design_category: "B", design_wind_speed_mph: 90, landslide_susceptibility_index: 0, lightning_annual_flash_days: 45, wildfire_annual_frequency: 0, tornado_annual_frequency: 0.2, nearest_transmission_line_distance_m: 600, nearest_substation_distance_m: 400, nearest_substation_status: "active", fiber_broadband_available: true, fiber_provider_count: 4, nearest_road_surface: "paved", coast_distance_m: 1200000, mean_annual_relative_humidity_pct: 68, days_above_32c_annual_count: 18, mean_annual_snow_cover_days: 42, mean_annual_dry_bulb_temperature_degc: 10.5, avg_retail_electricity_price_industrial_usd_per_kwh: 0.068, intersects_nhd_area: false,
  intersects_wetland: false, wetlands_within_100m_count: 0, nearest_wetland_distance_m: 8000, intersects_protected_area: false, protected_area_gap_status: null, intersects_conservation_easement: false, intersects_critical_habitat: false, critical_habitat_status: null, land_use_class: "commercial", parcel_zoning: "DX-16", lcms_class: "Developed, High Intensity", tree_canopy_pct: 4, surface_management_agency: "private", special_use_airspace_type: null, nearest_airport_distance_m: 25000, golden_eagle_nest_density_index: 0, primary_building_height_m: 442, nearest_class_i_area_distance_m: 150000,
};

export const MOCK_MIREYE_FIELDS: MireyeFields = Object.fromEntries(MIREYE_FIELDS.map((field) => [field, values[field] ?? null])) as unknown as MireyeFields;
