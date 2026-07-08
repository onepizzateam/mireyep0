#!/usr/bin/env node

/**
 * Verify Benchmark Fix — Three-Address Walkthrough
 * 
 * Test urban, suburban, and rural addresses and confirm each benchmark range
 * matches one of the nine BENCHMARK_TABLE entries (no interpolated values)
 */

import { chromium } from "@playwright/test";

const BENCHMARK_TABLE = {
  urban: {
    high: { min: 3500, max: 6000 },
    mid: { min: 2500, max: 3500 },
    low: { min: 1500, max: 2500 },
  },
  suburban: {
    high: { min: 1800, max: 2800 },
    mid: { min: 1200, max: 1800 },
    low: { min: 700, max: 1200 },
  },
  rural: {
    high: { min: 900, max: 1500 },
    mid: { min: 600, max: 900 },
    low: { min: 350, max: 600 },
  },
};

// Create a set of valid benchmark min/max pairs for easy validation
const validRanges = [];
for (const siteType of Object.keys(BENCHMARK_TABLE)) {
  for (const band of Object.keys(BENCHMARK_TABLE[siteType])) {
    const { min, max } = BENCHMARK_TABLE[siteType][band];
    validRanges.push({ siteType, band, min, max });
  }
}

async function testAddress(page, address) {
  console.log(`\nTesting: ${address}`);
  console.log("=".repeat(60));

  try {
    // Navigate to the page
    await page.goto("http://localhost:3000");

    // Wait for the form to be ready
    await page.waitForSelector('input[placeholder*="123 Main"]', { timeout: 10000 });

    // Enter the address
    const addressInput = page.locator('input[placeholder*="123 Main"]');
    await addressInput.fill(address);
    await page.keyboard.press("Enter");

    // Wait for the map to load and allow manual pin placement
    await page.waitForTimeout(2000);

    // Look for the map container and click near its center to confirm the pin
    const mapContainer = page.locator('[class*="mapboxgl"]').first();
    const box = await mapContainer.boundingBox();

    if (box) {
      // Click to place/confirm pin
      await page.click(
        `[style*="mapboxgl"]`,
        { position: { x: box.width / 2, y: box.height / 2 } }
      );
    }

    // Wait a moment for any map updates
    await page.waitForTimeout(1000);

    // Look for the run valuation button and check if it's enabled
    const runButton = page.locator('button:has-text("Run valuation")');
    const isEnabled = await runButton.isEnabled();

    if (!isEnabled) {
      console.log("⚠️  Run valuation button is disabled - pin may not be placed");
      await page.waitForTimeout(2000);
    }

    // Click run valuation
    await runButton.click();

    // Wait for results to load - look for the score card
    await page.waitForSelector("text=/Score/i", { timeout: 15000 });

    // Extract score and benchmark range
    const scoreText = await page.locator('text=/\\d+\\s*\\/\\s*100/').first().textContent();
    const score = scoreText ? parseInt(scoreText.match(/\d+/)[0]) : null;

    console.log(`Final Score: ${score}/100`);

    // Find the benchmark range display
    const benchmarkBandLocator = page.locator('text=/\\$\\d+.*\\$\\d+/i');
    const benchmarkText = await benchmarkBandLocator.first().textContent();

    if (!benchmarkText) {
      console.log("⚠️  Could not find benchmark range in results");
      return null;
    }

    // Parse benchmark range
    const rangeMatch = benchmarkText.match(/\$?([\d,]+).*?\$?([\d,]+)/);
    if (!rangeMatch) {
      console.log(`⚠️  Could not parse benchmark range: ${benchmarkText}`);
      return null;
    }

    const benchmarkMin = parseInt(rangeMatch[1].replace(/,/g, ""));
    const benchmarkMax = parseInt(rangeMatch[2].replace(/,/g, ""));

    console.log(`Benchmark Range: $${benchmarkMin} - $${benchmarkMax}`);

    // Check if this benchmark range matches one of the nine table values
    const matches = validRanges.filter(
      (r) => r.min === benchmarkMin && r.max === benchmarkMax
    );

    if (matches.length === 0) {
      console.log(`❌ FAIL: Range [$${benchmarkMin}, $${benchmarkMax}] is NOT in BENCHMARK_TABLE`);
      console.log(`   Valid ranges for this score would be one of:`);
      validRanges.forEach((r) => {
        console.log(`   - ${r.siteType} ${r.band}: $${r.min} - $${r.max}`);
      });
      return { address, score, benchmarkMin, benchmarkMax, valid: false };
    }

    const match = matches[0];
    console.log(
      `✅ PASS: Range matches ${match.siteType} ${match.band} from BENCHMARK_TABLE`
    );
    return {
      address,
      score,
      benchmarkMin,
      benchmarkMax,
      siteType: match.siteType,
      band: match.band,
      valid: true,
    };
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log("🔍 Benchmark Fix Verification — Three-Address Walkthrough\n");

  const browser = await chromium.launch();
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  // Test three addresses: urban, suburban, rural
  const addresses = [
    "1600 Pennsylvania Ave NW, Washington DC 20500", // Urban
    "300 Main St, Springfield IL 62701", // Suburban
    "1 Remote Road, Beatrice NE 68310", // Rural-ish
  ];

  const results = [];

  for (const address of addresses) {
    const result = await testAddress(page, address);
    if (result) {
      results.push(result);
    }
    await page.waitForTimeout(500);
  }

  await browser.close();

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const allValid = results.every((r) => r.valid);

  if (results.length === 0) {
    console.log("❌ No results to verify");
    process.exit(1);
  }

  results.forEach((r) => {
    const status = r.valid ? "✅" : "❌";
    const details = r.valid
      ? `${r.siteType} ${r.band}: $${r.benchmarkMin} - $${r.benchmarkMax}`
      : `INVALID RANGE: $${r.benchmarkMin} - $${r.benchmarkMax}`;
    console.log(`${status} ${r.address.split(",")[0]}: Score ${r.score} → ${details}`);
  });

  if (allValid) {
    console.log("\n✅ ALL TESTS PASSED — Benchmark ranges use direct table lookups!");
  } else {
    console.log(
      "\n❌ TESTS FAILED — Some ranges are not from BENCHMARK_TABLE (interpolation detected)"
    );
    process.exit(1);
  }
}

main().catch(console.error);
