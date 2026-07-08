/**
 * Test script to validate the benchmark fix
 * Verifies three addresses return benchmark ranges that are EXACT matches from BENCHMARK_TABLE
 */

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

// Create a set of valid benchmark min/max pairs for validation
const validRanges = [];
for (const siteType of Object.keys(BENCHMARK_TABLE)) {
  for (const band of Object.keys(BENCHMARK_TABLE[siteType])) {
    const { min, max } = BENCHMARK_TABLE[siteType][band];
    validRanges.push({ siteType, band, min, max });
  }
}

function getBenchmarkBand(min, max) {
  for (const siteType of Object.keys(BENCHMARK_TABLE)) {
    for (const band of Object.keys(BENCHMARK_TABLE[siteType])) {
      const { min: tableMin, max: tableMax } = BENCHMARK_TABLE[siteType][band];
      if (tableMin === min && tableMax === max) {
        return { siteType, band };
      }
    }
  }
  return null;
}

const addresses = [
  { address: "10 E 53rd St, New York, NY", type: "urban" },
  { address: "1500 W Colorado Ave, Colorado Springs, CO", type: "suburban" },
  { address: "12 River Rd, Steamboat Springs, CO", type: "rural" }
];

async function testAddress(address, type) {
  try {
    const response = await fetch("http://localhost:3000/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`[${type.toUpperCase()}] Error:`, error);
      return null;
    }

    const data = await response.json();
    if (!data.ok) {
      console.error(`[${type.toUpperCase()}] API Error:`, data.error);
      return null;
    }

    const benchmarkMin = data.benchmark.monthlyRange.min;
    const benchmarkMax = data.benchmark.monthlyRange.max;
    const match = getBenchmarkBand(benchmarkMin, benchmarkMax);

    console.log(`\n[${ type.toUpperCase() }] ${address}`);
    console.log(`  Display Address: ${data.displayAddress}`);
    console.log(`  Site Type: ${data.score.siteType}`);
    console.log(`  Baseline Score: ${Math.round(data.score.baseline)}`);
    console.log(`  Multiplier: ${data.score.multiplier.toFixed(2)}×`);
    console.log(`  Final Score (clamped): ${Math.round(data.score.final)}`);
    console.log(`  Benchmark Range: $${benchmarkMin} - $${benchmarkMax}/mo`);
    
    if (match) {
      console.log(`  ✅ VALID: Matches ${match.siteType} ${match.band} from BENCHMARK_TABLE`);
    } else {
      console.log(`  ❌ INVALID: Range [$${benchmarkMin}, $${benchmarkMax}] NOT in BENCHMARK_TABLE`);
      console.log(`     Valid ranges are one of:`);
      validRanges.forEach((r) => {
        console.log(`     - ${r.siteType} ${r.band}: $${r.min} - $${r.max}`);
      });
    }

    return {
      address,
      type,
      siteType: data.score.siteType,
      final: Math.round(data.score.final),
      benchmarkMin,
      benchmarkMax,
      isValid: match !== null,
      band: match ? match.band : "INVALID"
    };
  } catch (error) {
    console.error(`[${type.toUpperCase()}] Network error:`, error.message);
    return null;
  }
}

async function main() {
  console.log("🔍 Benchmark Fix Verification — Three-Address Test\n");
  console.log("Verifying that benchmark ranges are EXACT matches from BENCHMARK_TABLE\n");
  console.log("============================================\n");

  const results = [];
  for (const { address, type } of addresses) {
    const result = await testAddress(address, type);
    if (result) results.push(result);
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (results.length === 3) {
    console.log("\n\n============================================");
    console.log("SUMMARY\n");
    console.log(
      "address".padEnd(40) +
      "final_score".padEnd(12) +
      "band".padEnd(8) +
      "benchmark_range".padEnd(20) +
      "valid"
    );
    console.log("-".repeat(90));

    results.forEach(r => {
      const benchmarkRange = `$${r.benchmarkMin}-$${r.benchmarkMax}`;
      const status = r.isValid ? "✅" : "❌";
      console.log(
        r.address.substring(0, 39).padEnd(40) +
        r.final.toString().padEnd(12) +
        r.band.padEnd(8) +
        benchmarkRange.padEnd(20) +
        status
      );
    });

    const allValid = results.every(r => r.isValid);
    
    console.log("\n" + "=".repeat(50));
    if (allValid) {
      console.log("✅ ALL TESTS PASSED!");
      console.log("   All benchmark ranges use direct table lookups.");
      console.log("   No interpolation detected.");
    } else {
      console.log("❌ TESTS FAILED!");
      console.log("   Some benchmark ranges are NOT from BENCHMARK_TABLE.");
      console.log("   Interpolation may still be occurring.");
      process.exit(1);
    }
  }
}

main().catch(console.error);
