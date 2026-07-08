/**
 * Test PDF generation directly
 */

import fetch from "node-fetch";

const testScoreResponse = {
  ok: true,
  address: "123 Main St, Phoenix AZ",
  displayAddress: "123 Main St, Phoenix, Arizona 85027, United States",
  lat: 33.669149,
  lng: -112.111866,
  carrier: "Crown Castle",
  score: {
    baseline: 81,
    multiplier: 1.35,
    final: 100,
    dimensions: {
      coverageNecessity: {
        raw: 74,
        label: "Coverage Necessity",
        weight: 0.4,
        topFields: [
          {
            fieldName: "antenna_structures_within_500m_count",
            value: 2,
            impact: "high",
            direction: "positive",
            explanation: "Two towers nearby provide good coverage options.",
          },
          {
            fieldName: "nearest_major_road_distance_m",
            value: 150,
            impact: "high",
            direction: "positive",
            explanation: "Close to major highway.",
          },
          {
            fieldName: "elevation",
            value: 1100,
            impact: "medium",
            direction: "positive",
            explanation: "Good elevation for coverage.",
          },
        ],
      },
      subscriberValue: {
        raw: 84,
        label: "Subscriber Value",
        weight: 0.35,
        topFields: [
          {
            fieldName: "housing_units_within_1km",
            value: 15000,
            impact: "high",
            direction: "positive",
            explanation: "High residential density.",
          },
          {
            fieldName: "poi_count_1km",
            value: 250,
            impact: "high",
            direction: "positive",
            explanation: "Many points of interest.",
          },
          {
            fieldName: "total_road_length_within_500m_m",
            value: 8000,
            impact: "medium",
            direction: "positive",
            explanation: "Extensive road network.",
          },
        ],
      },
      constructionCost: {
        raw: 87,
        label: "Construction Cost",
        weight: 0.25,
        topFields: [
          {
            fieldName: "slope_degrees",
            value: 3,
            impact: "high",
            direction: "positive",
            explanation: "Flat terrain, easy construction.",
          },
          {
            fieldName: "fiber_broadband_available",
            value: true,
            impact: "high",
            direction: "positive",
            explanation: "Fiber available for backhaul.",
          },
          {
            fieldName: "seismic_pga_2pct_50yr_g",
            value: 0.12,
            impact: "medium",
            direction: "positive",
            explanation: "Moderate seismic risk.",
          },
        ],
      },
    },
    permittingFriction: {
      multiplierRaw: 1.35,
      flags: [
        "Site intersects wetland (Section 404 permitting applies to alternatives)",
        "Protected area gap status indicates challenging alternative siting environment",
      ],
    },
    siteType: "suburban",
    dataGaps: ["nearest_antenna_structure_distance_m", "primary_building_height_m"],
  },
  benchmark: {
    monthlyRange: { min: 1800, max: 2800 },
    annualRange: { min: 21600, max: 33600 },
    siteType: "suburban",
    scoreBand: "high",
    calibrationNote: "Calibrated to published industry data",
  },
  leverageSummary: [
    "This area's population density places it in the top subscriber-value tier for suburban sites—carriers generate significant revenue per site here.",
    "Overall leverage is high. Open well above the offered rate.",
  ],
  rateComparison: {
    offeredRate: 1500,
    benchmarkMin: 1800,
    benchmarkMax: 2800,
    position: "below",
    gapPercent: 23.9,
    gapDollars: 700,
    thirtyYearCost: 252000,
    message:
      "Your offered rate is 24% below the benchmark range. Over a 30-year lease, this represents $252,000 in foregone income.",
  },
  dataGaps: ["nearest_antenna_structure_distance_m", "primary_building_height_m"],
  processingMs: 6500,
};

async function testPDF() {
  console.log("Testing PDF generation...");

  try {
    const response = await fetch("http://localhost:3000/api/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testScoreResponse),
    });

    if (!response.ok) {
      console.error(`API returned ${response.status}: ${response.statusText}`);
      const text = await response.text();
      console.error("Response:", text);
      return;
    }

    const buffer = await response.arrayBuffer();
    console.log(`✅ PDF generated successfully! Size: ${buffer.byteLength} bytes`);

    // Save to file
    const fs = require("fs");
    fs.writeFileSync("/tmp/test-report.pdf", Buffer.from(buffer));
    console.log("✅ PDF saved to /tmp/test-report.pdf");
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

testPDF();
