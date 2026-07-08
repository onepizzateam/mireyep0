/**
 * PDF Report Generation
 * Generates a comprehensive field-by-field breakdown report for a scored site
 */

import {
  PDFDocument as PDFLib,
  rgb,
} from "pdf-lib";
import { ScoreResponse } from "./types";
import { BENCHMARK_CALIBRATION_NOTE } from "@/constants/benchmarks";

// Field metadata: dimension, why it matters, scoring interpretation
const FIELD_METADATA: Record<
  string,
  {
    dimension: string;
    explanation: string;
    type: "integer" | "float" | "string" | "boolean";
  }
> = {
  // Dimension 1 — Coverage Necessity
  antenna_structures_within_500m_count: {
    dimension: "Coverage Necessity",
    explanation: "Competitor towers in immediate vicinity. Zero = exclusive search ring.",
    type: "integer",
  },
  antenna_structures_within_2km_count: {
    dimension: "Coverage Necessity",
    explanation: "Competitor towers in expanded ring. Indicates alternative sites nearby.",
    type: "integer",
  },
  nearest_antenna_structure_distance_m: {
    dimension: "Coverage Necessity",
    explanation: "Distance to nearest competitor. Far away = harder to build alternative.",
    type: "integer",
  },
  nearest_antenna_structure_height_m: {
    dimension: "Coverage Necessity",
    explanation: "Height of nearest structure. Taller = stronger coverage from fewer sites.",
    type: "float",
  },
  nearest_antenna_structure_type: {
    dimension: "Coverage Necessity",
    explanation: "Tower type (monopole, guyed, building). Guyed towers may have more capacity.",
    type: "string",
  },
  mobile_5g_coverage_class: {
    dimension: "Coverage Necessity",
    explanation: "Current 5G coverage level. 'No coverage' = site is critical for deployment.",
    type: "string",
  },
  nearest_major_road_distance_m: {
    dimension: "Coverage Necessity",
    explanation: "Distance to highway. Close proximity = must-cover corridor for carriers.",
    type: "integer",
  },
  nearest_major_road_class: {
    dimension: "Coverage Necessity",
    explanation: "Road type (motorway, trunk, primary, secondary). Motorway = highest coverage urgency.",
    type: "string",
  },
  elevation: {
    dimension: "Coverage Necessity",
    explanation: "Site elevation in meters. High elevation = wider coverage radius, more sites replaced.",
    type: "float",
  },
  nearest_hospital_distance_m: {
    dimension: "Coverage Necessity",
    explanation: "Distance to hospital. Nearby critical facility = priority for reliable coverage.",
    type: "integer",
  },
  nearest_school_distance_m: {
    dimension: "Coverage Necessity",
    explanation: "Distance to school. Population center = traffic, data usage, coverage demand.",
    type: "integer",
  },
  nearest_urban_area_distance_m: {
    dimension: "Coverage Necessity",
    explanation: "Distance to urban center. Determines site type classification (urban/suburban/rural).",
    type: "integer",
  },

  // Dimension 2 — Subscriber Value
  housing_units_within_1km: {
    dimension: "Subscriber Value",
    explanation: "Residential count near site. More homes = higher data revenue per tower.",
    type: "integer",
  },
  housing_units_density_per_km2: {
    dimension: "Subscriber Value",
    explanation:
      "Residential density. Determines site type. >5000 = urban, <400 = rural.",
    type: "float",
  },
  poi_count_1km: {
    dimension: "Subscriber Value",
    explanation: "Points of interest (shops, offices, hotels). Commercial activity = subscriber revenue.",
    type: "integer",
  },
  total_road_length_within_500m_m: {
    dimension: "Subscriber Value",
    explanation: "Road network density. More road = more traffic, more data usage.",
    type: "integer",
  },
  nearest_lodging_distance_m: {
    dimension: "Subscriber Value",
    explanation: "Distance to hotel/motel. Transient population = high-ARPU data users.",
    type: "integer",
  },

  // Dimension 3 — Construction Cost
  slope_degrees: {
    dimension: "Construction Cost",
    explanation: "Site slope in degrees. Steep = expensive foundation, anchoring work.",
    type: "float",
  },
  bedrock_depth_cm: {
    dimension: "Construction Cost",
    explanation: "Depth to bedrock. Shallow = must blast. Deep = easier foundation.",
    type: "integer",
  },
  soil_drainage_class: {
    dimension: "Construction Cost",
    explanation:
      "Soil drainage quality. Poor drainage = higher foundation cost, equipment corrosion risk.",
    type: "string",
  },
  soil_shrink_swell_class: {
    dimension: "Construction Cost",
    explanation: "Soil expansion risk. High shrink-swell = longer foundation design, cost increase.",
    type: "string",
  },
  within_floodplain_polygon: {
    dimension: "Construction Cost",
    explanation: "Site in FEMA floodplain. Yes = elevated foundation required, added cost.",
    type: "boolean",
  },
  seismic_pga_2pct_50yr_g: {
    dimension: "Construction Cost",
    explanation:
      "Peak ground acceleration risk. Higher = earthquake-resistant design required, cost increase.",
    type: "float",
  },
  seismic_design_category: {
    dimension: "Construction Cost",
    explanation: "Seismic design level (A–F). Higher category = more expensive design & bracing.",
    type: "string",
  },
  design_wind_speed_mph: {
    dimension: "Construction Cost",
    explanation: "Design wind speed for site. Coastal/windy = stronger tower, higher cost.",
    type: "float",
  },
  landslide_susceptibility_index: {
    dimension: "Construction Cost",
    explanation: "Landslide risk. High risk = slope stabilization, site-specific design required.",
    type: "float",
  },
  lightning_annual_flash_days: {
    dimension: "Construction Cost",
    explanation: "Annual lightning strike days. High = grounding system, RF shielding upgrades.",
    type: "integer",
  },
  wildfire_annual_frequency: {
    dimension: "Construction Cost",
    explanation: "Wildfire risk. High risk = fireproofing, defensible space design.",
    type: "float",
  },
  tornado_annual_frequency: {
    dimension: "Construction Cost",
    explanation: "Tornado risk. High = extreme wind design, structural upgrades.",
    type: "float",
  },
  nearest_transmission_line_distance_m: {
    dimension: "Construction Cost",
    explanation: "Distance to high-voltage transmission. Close = expensive RF shielding, grounding.",
    type: "integer",
  },
  nearest_substation_distance_m: {
    dimension: "Construction Cost",
    explanation: "Distance to electrical substation. Close = cheaper power supply.",
    type: "integer",
  },
  nearest_substation_status: {
    dimension: "Construction Cost",
    explanation: "Substation operational status. Active = reliable power available.",
    type: "string",
  },
  fiber_broadband_available: {
    dimension: "Construction Cost",
    explanation: "Fiber broadband on-site or nearby. Yes = cheaper backhaul, lower OpEx.",
    type: "boolean",
  },
  fiber_provider_count: {
    dimension: "Construction Cost",
    explanation: "Number of fiber providers. More options = competitive backhaul pricing.",
    type: "integer",
  },
  nearest_road_surface: {
    dimension: "Construction Cost",
    explanation:
      "Road surface type. Paved = easier equipment access during construction.",
    type: "string",
  },
  coast_distance_m: {
    dimension: "Construction Cost",
    explanation: "Distance to coast. Close = salt corrosion, higher maintenance costs.",
    type: "integer",
  },
  mean_annual_relative_humidity_pct: {
    dimension: "Construction Cost",
    explanation: "Annual humidity. High = corrosion risk, RF component lifespan reduced.",
    type: "float",
  },
  days_above_32c_annual_count: {
    dimension: "Construction Cost",
    explanation: "Days above 90°F per year. High = equipment thermal stress, faster degradation.",
    type: "integer",
  },
  mean_annual_snow_cover_days: {
    dimension: "Construction Cost",
    explanation: "Days with snow cover. More days = maintenance access harder, higher OpEx.",
    type: "integer",
  },
  mean_annual_dry_bulb_temperature_degc: {
    dimension: "Construction Cost",
    explanation: "Average temperature. Extreme temps = HVAC & cooling costs.",
    type: "float",
  },
  avg_retail_electricity_price_industrial_usd_per_kwh: {
    dimension: "Construction Cost",
    explanation: "Local electricity rate. High rate = higher operational power costs.",
    type: "float",
  },
  intersects_nhd_area: {
    dimension: "Construction Cost",
    explanation: "Site in NHD water area. Yes = potential environmental permitting friction.",
    type: "boolean",
  },

  // Dimension 4 — Permitting Friction
  intersects_wetland: {
    dimension: "Permitting Friction",
    explanation: "Site intersects wetland. Yes = Section 404 permitting, alternative site friction.",
    type: "boolean",
  },
  wetlands_within_100m_count: {
    dimension: "Permitting Friction",
    explanation: "Wetland count nearby. More = larger search ring impact, alternatives constrained.",
    type: "integer",
  },
  nearest_wetland_distance_m: {
    dimension: "Permitting Friction",
    explanation: "Distance to nearest wetland. Close = mitigation requirements likely.",
    type: "integer",
  },
  intersects_protected_area: {
    dimension: "Permitting Friction",
    explanation: "Site in protected area (park, reserve). Yes = severely limits alternative siting.",
    type: "boolean",
  },
  protected_area_gap_status: {
    dimension: "Permitting Friction",
    explanation: "Protected area gap designation. GAP1 = highest protection, hardest to replace.",
    type: "string",
  },
  intersects_conservation_easement: {
    dimension: "Permitting Friction",
    explanation: "Site under conservation easement. Yes = deed restrictions limit alternatives.",
    type: "boolean",
  },
  intersects_critical_habitat: {
    dimension: "Permitting Friction",
    explanation: "ESA critical habitat area. Yes = Endangered Species Act consultation required.",
    type: "boolean",
  },
  critical_habitat_status: {
    dimension: "Permitting Friction",
    explanation: "Critical habitat designation status. 'Final' = highest protection level.",
    type: "string",
  },
  land_use_class: {
    dimension: "Permitting Friction",
    explanation: "Land use classification. Residential/Historic = community opposition to new towers.",
    type: "string",
  },
  parcel_zoning: {
    dimension: "Permitting Friction",
    explanation: "Parcel zoning designation. Restrictive zoning = harder to replace tower.",
    type: "string",
  },
  lcms_class: {
    dimension: "Permitting Friction",
    explanation: "LCMS land cover class. Tree canopy/wetland = environmental review friction.",
    type: "string",
  },
  tree_canopy_pct: {
    dimension: "Permitting Friction",
    explanation: "Tree canopy coverage %. High % = forest habitat value, environmental friction.",
    type: "float",
  },
  surface_management_agency: {
    dimension: "Permitting Friction",
    explanation: "Federal land management agency. Yes = added regulatory layers for alternatives.",
    type: "string",
  },
  special_use_airspace_type: {
    dimension: "Permitting Friction",
    explanation:
      "Special use airspace (military, etc). Yes = height limits, alternative towers constrained.",
    type: "string",
  },
  nearest_airport_distance_m: {
    dimension: "Permitting Friction",
    explanation: "Distance to airport. <5000m = FAA notification zone, height limits.",
    type: "integer",
  },
  golden_eagle_nest_density_index: {
    dimension: "Permitting Friction",
    explanation:
      "Golden eagle nest density. High = USFWS consultation for new tower alternatives.",
    type: "float",
  },
  primary_building_height_m: {
    dimension: "Permitting Friction",
    explanation: "Primary building height. Affects RF propagation and permitting scope.",
    type: "float",
  },
  nearest_class_i_area_distance_m: {
    dimension: "Permitting Friction",
    explanation: "Distance to Class I air quality area. Close = visibility/air quality review.",
    type: "integer",
  },
};

function formatValue(value: unknown, type: string): string {
  if (value === null || value === undefined) {
    return "N/A";
  }

  if (type === "boolean") {
    return value ? "Yes" : "No";
  }

  if (type === "float") {
    const num = Number(value);
    return isNaN(num) ? String(value) : num.toFixed(2);
  }

  if (type === "integer") {
    const num = Number(value);
    return isNaN(num) ? String(value) : Math.round(num).toString();
  }

  return String(value);
}

export async function generatePDFBuffer(scoreData: ScoreResponse): Promise<Buffer> {
  const pdfDoc = await PDFLib.create();
  
  // Add the first page to get dimensions
  let page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  let yPosition = height - 50;

  const fontSize12 = 12;
  const fontSize11 = 11;
  const fontSize10 = 10;
  const fontSize9 = 9;
  const fontSize8 = 8;
  const fontSize7 = 7;
  const marginLeft = 50;
  const marginRight = width - 50;
  const lineHeight = 14;

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Helper to draw text and manage page breaks
  function drawText(
    text: string,
    size: number,
    isBold: boolean = false,
    y?: number
  ): number {
    if (y !== undefined) {
      yPosition = y;
    }

    if (yPosition < 50) {
      page = pdfDoc.addPage();
      yPosition = height - 50;
    }

    page.drawText(text, {
      x: marginLeft,
      y: yPosition,
      size: size,
      color: rgb(0, 0, 0),
    });

    yPosition -= size + 4;
    return yPosition;
  }

  function drawWrappedText(
    text: string,
    size: number,
    maxWidth: number = marginRight - marginLeft
  ): number {
    const lines = text.split("\n");
    for (const line of lines) {
      if (yPosition < 50) {
        page = pdfDoc.addPage();
        yPosition = height - 50;
      }

      const wrappedLines = wrapText(line, size, maxWidth);
      for (const wrappedLine of wrappedLines) {
        if (yPosition < 50) {
          page = pdfDoc.addPage();
          yPosition = height - 50;
        }
        page.drawText(wrappedLine, {
          x: marginLeft,
          y: yPosition,
          size: size,
          color: rgb(0, 0, 0),
        });
        yPosition -= size + 3;
      }
    }
    return yPosition;
  }

  function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
    const lines: string[] = [];
    let currentLine = "";

    const words = text.split(" ");
    for (const word of words) {
      const testLine = currentLine + (currentLine ? " " : "") + word;
      const estimatedWidth = testLine.length * (fontSize * 0.5); // rough estimate

      if (estimatedWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  // ========== Cover Section ==========
  drawText("Cell Tower Site Valuation Report", fontSize12, true);
  yPosition -= 6;
  drawText(`Generated ${dateStr} at ${timeStr}`, fontSize8);
  yPosition -= 8;

  drawText("Property Details", fontSize10, true);
  yPosition -= 4;
  drawText(`Address: ${scoreData.displayAddress}`, fontSize9);
  drawText(
    `Coordinates: ${scoreData.lat.toFixed(6)}°N, ${scoreData.lng.toFixed(6)}°W`,
    fontSize9
  );
  if (scoreData.carrier) {
    drawText(`Carrier: ${scoreData.carrier}`, fontSize9);
  }
  drawText(`Site Type: ${scoreData.score.siteType}`, fontSize9);

  yPosition -= 8;

  // ========== Site Score Summary ==========
  drawText("Site Score Summary", fontSize10, true);
  yPosition -= 4;
  drawText(`Final Score: ${scoreData.score.final.toFixed(0)} / 100`, fontSize11, true);
  yPosition -= 4;
  drawText("Dimension Breakdown:", fontSize9);
  yPosition -= 2;
  drawText(
    `Coverage Necessity: ${scoreData.score.dimensions.coverageNecessity.raw.toFixed(0)}/100 (40% weight)`,
    fontSize8
  );
  drawText(
    `Subscriber Value: ${scoreData.score.dimensions.subscriberValue.raw.toFixed(0)}/100 (35% weight)`,
    fontSize8
  );
  drawText(
    `Construction Cost: ${scoreData.score.dimensions.constructionCost.raw.toFixed(0)}/100 (25% weight)`,
    fontSize8
  );

  yPosition -= 4;
  drawText(`Baseline Score: ${scoreData.score.baseline.toFixed(0)}`, fontSize8);
  drawText(`Permitting Friction Multiplier: ${scoreData.score.multiplier.toFixed(2)}×`, fontSize8);

  yPosition -= 8;

  // ========== Benchmark Range (next page) ==========
  page = pdfDoc.addPage();
  yPosition = height - 50;

  drawText("Benchmark Monthly Rent Range", fontSize10, true);
  yPosition -= 4;
  drawText(
    `Range: $${scoreData.benchmark.monthlyRange.min.toLocaleString(undefined, { maximumFractionDigits: 0 })} – $${scoreData.benchmark.monthlyRange.max.toLocaleString(undefined, { maximumFractionDigits: 0 })}/month`,
    fontSize8
  );
  drawText(`Score Band: ${scoreData.benchmark.scoreBand}`, fontSize8);

  yPosition -= 6;

  // How this range was calculated
  drawText("How This Range Was Calculated", fontSize9, true);
  yPosition -= 2;

  if (scoreData.benchmark.priceBreakdown && scoreData.benchmark.priceBreakdown.length > 0) {
    drawText(
      `Base Value: $${scoreData.benchmark.baseValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}/month`,
      fontSize8
    );
    yPosition -= 3;

    drawText("Site-Specific Adjustments:", fontSize8);
    yPosition -= 2;

    for (const adj of scoreData.benchmark.priceBreakdown) {
      const sign = adj.direction === "positive" ? "+" : "";
      const adjLine = `  ${adj.label} (${sign}${(adj.percent * 100).toFixed(0)}%, $${sign}${adj.amount})`;
      drawWrappedText(adjLine, fontSize7);
      yPosition -= 2;
    }

    yPosition -= 2;
    drawText(
      `Final Range: $${scoreData.benchmark.monthlyRange.min.toLocaleString(undefined, { maximumFractionDigits: 0 })} – $${scoreData.benchmark.monthlyRange.max.toLocaleString(undefined, { maximumFractionDigits: 0 })}/month (±25% from adjusted center)`,
      fontSize7
    );
  } else {
    drawText(
      "No site-specific adjustments applied due to incomplete data. Range shows base benchmark for this site type and score band.",
      fontSize8
    );
  }

  yPosition -= 4;

  if (scoreData.rateComparison) {
    drawText("Rate Comparison", fontSize9, true);
    yPosition -= 2;
    drawText(
      `Your Offered Rate: $${scoreData.rateComparison.offeredRate.toLocaleString(undefined, { maximumFractionDigits: 0 })}/month`,
      fontSize8
    );
    drawText(`Position: ${scoreData.rateComparison.position.toUpperCase()}`, fontSize8);
    if (scoreData.rateComparison.position === "below") {
      drawText(
        `30-Year Impact: $${scoreData.rateComparison.thirtyYearCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} foregone`,
        fontSize8
      );
    }
    yPosition -= 4;
  }

  // ========== Leverage Summary ==========
  yPosition -= 2;
  drawText("Your Negotiating Position", fontSize10, true);
  yPosition -= 4;

  for (const sentence of scoreData.leverageSummary) {
    drawWrappedText(sentence, fontSize8);
    yPosition -= 2;
  }

  if (scoreData.score.permittingFriction?.flags && scoreData.score.permittingFriction.flags.length > 0) {
    yPosition -= 4;
    drawText("Permitting Friction Factors", fontSize9, true);
    yPosition -= 2;
    for (const flag of scoreData.score.permittingFriction.flags) {
      drawWrappedText(`• ${flag}`, fontSize8);
    }
  }

  yPosition -= 8;

  // ========== Field-Level Breakdown (next page) ==========
  page = pdfDoc.addPage();
  yPosition = height - 50;

  drawText("Field-Level Data Breakdown", fontSize10, true);
  yPosition -= 4;

  // Simple tabular data
  const fieldData: string[] = [];
  Object.entries(scoreData.score.dimensions).forEach(([, dimScore]) => {
    dimScore.topFields.forEach((field) => {
      const meta = FIELD_METADATA[field.fieldName];
      const value = formatValue(field.value, meta?.type || "string");
      fieldData.push(
        `${field.fieldName.substring(0, 30).padEnd(30)} | ${value.substring(0, 15).padEnd(15)} | ${(meta?.dimension || "—").substring(0, 20)}`
      );
    });
  });

  for (const line of fieldData) {
    drawText(line, fontSize7);
  }

  yPosition -= 6;

  // ========== Data Gaps & Caveats (next page) ==========
  page = pdfDoc.addPage();
  yPosition = height - 50;

  drawText("Data Gaps & Limitations", fontSize10, true);
  yPosition -= 4;

  if (scoreData.dataGaps && scoreData.dataGaps.length > 0) {
    drawText(`Missing Fields (${scoreData.dataGaps.length}):`, fontSize9, true);
    yPosition -= 2;
    for (const gap of scoreData.dataGaps) {
      drawText(`• ${gap}`, fontSize8);
    }
    yPosition -= 4;
  }

  drawText("Standing Caveats", fontSize9, true);
  yPosition -= 2;

  const caveat1 = "1. FCC Tenancy Disclosure: Structure type data is available but actual co-location tenant counts are not. A nearby tower may appear as competition but could already be at structural capacity.";
  drawWrappedText(caveat1, fontSize7);
  yPosition -= 4;

  const caveat2 = "2. RF Propagation Limitation: This analysis uses FCC public data and geographic layers, not carrier-internal RF models or proprietary drive-test data. Actual coverage designs may differ.";
  drawWrappedText(caveat2, fontSize7);
  yPosition -= 4;

  const caveat3 = `3. Benchmark Calibration: ${BENCHMARK_CALIBRATION_NOTE}`;
  drawWrappedText(caveat3, fontSize7);
  yPosition -= 4;

  const caveat4 = "4. Not Legal or Financial Advice: This report is educational only. Consult with a tower advisor or attorney before negotiating.";
  drawWrappedText(caveat4, fontSize7);

  // ========== Footer ==========
  yPosition -= 12;
  drawText(
    `Generated by SignalRent, built on Mireye. ${dateStr}. Not legal or financial advice.`,
    fontSize7
  );

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
