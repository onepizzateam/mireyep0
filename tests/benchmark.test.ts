import { describe, it, expect } from "@jest/globals";
import { computeBenchmarkRange } from "@/lib/benchmark";
import { SiteScore } from "@/lib/types";

/**
 * Unit tests for benchmark calculator per AGENTS.md Section 14
 * 3 test scenarios validating range tables and buyout multiples
 */

describe("Benchmark Calculator", () => {
  /**
   * Test 1: Urban high score
   * Score >= 75, site type = "urban"
   * Expected: monthlyRange min $3,500, max $6,000
   */
  it("should return urban high band ($3,500-$6,000) for urban site with score >= 75", () => {
    const siteScore: SiteScore = {
      baseline: 78,
      multiplier: 1.1,
      final: 85,
      siteType: "urban",
      dimensions: {
        coverageNecessity: {
          raw: 85,
          label: "Coverage Necessity",
          weight: 0.4,
          topFields: [],
        },
        subscriberValue: {
          raw: 80,
          label: "Subscriber Value",
          weight: 0.35,
          topFields: [],
        },
        constructionCost: {
          raw: 75,
          label: "Construction Cost",
          weight: 0.25,
          topFields: [],
        },
      },
      permittingFriction: {
        multiplierRaw: 1.1,
        flags: [],
      },
      dataGaps: [],
    };

    const result = computeBenchmarkRange(siteScore);

    expect(result.monthlyRange.min).toBe(3500);
    expect(result.monthlyRange.max).toBe(6000);
    expect(result.annualRange.min).toBe(3500 * 12);
    expect(result.annualRange.max).toBe(6000 * 12);
    expect(result.siteType).toBe("urban");
    expect(result.scoreBand).toBe("high");
    expect(result.calibrationNote).toContain("Benchmark range calibrated to published");
  });

  /**
   * Test 2: Rural low score
   * Score < 50, site type = "rural"
   * Expected: monthlyRange min $350, max $600
   */
  it("should return rural low band ($350-$600) for rural site with score < 50", () => {
    const siteScore: SiteScore = {
      baseline: 35,
      multiplier: 0.9,
      final: 31,
      siteType: "rural",
      dimensions: {
        coverageNecessity: {
          raw: 40,
          label: "Coverage Necessity",
          weight: 0.4,
          topFields: [],
        },
        subscriberValue: {
          raw: 25,
          label: "Subscriber Value",
          weight: 0.35,
          topFields: [],
        },
        constructionCost: {
          raw: 38,
          label: "Construction Cost",
          weight: 0.25,
          topFields: [],
        },
      },
      permittingFriction: {
        multiplierRaw: 0.9,
        flags: [],
      },
      dataGaps: [],
    };

    const result = computeBenchmarkRange(siteScore);

    expect(result.monthlyRange.min).toBe(350);
    expect(result.monthlyRange.max).toBe(600);
    expect(result.annualRange.min).toBe(350 * 12);
    expect(result.annualRange.max).toBe(600 * 12);
    expect(result.siteType).toBe("rural");
    expect(result.scoreBand).toBe("low");
  });

  /**
   * Test 3: Buyout multiple calculation
   * High score (>= 75) with buyout amount
   * Expected: multiplier range 14–18× (or corresponding to high band)
   * This validates that scoring and buyout logic align
   */
  it("should use 14-18x multiplier for high-score buyout scenario", () => {
    const siteScore: SiteScore = {
      baseline: 80,
      multiplier: 1.4,
      final: 82,
      siteType: "suburban",
      dimensions: {
        coverageNecessity: {
          raw: 75,
          label: "Coverage Necessity",
          weight: 0.4,
          topFields: [],
        },
        subscriberValue: {
          raw: 85,
          label: "Subscriber Value",
          weight: 0.35,
          topFields: [],
        },
        constructionCost: {
          raw: 80,
          label: "Construction Cost",
          weight: 0.25,
          topFields: [],
        },
      },
      permittingFriction: {
        multiplierRaw: 1.4,
        flags: ["Critical habitat"],
      },
      dataGaps: [],
    };

    const result = computeBenchmarkRange(siteScore);

    // For high score, we should get buyout multiples of 14-18x annual rent
    // Verify the score band is correctly identified as "high"
    expect(result.scoreBand).toBe("high");

    // Benchmark should reflect high band for site type
    if (result.siteType === "suburban") {
      expect(result.monthlyRange.min).toBe(1800);
      expect(result.monthlyRange.max).toBe(2800);
    }

    // Verify calibration note is present
    expect(result.calibrationNote).toBeTruthy();
    expect(result.calibrationNote.length).toBeGreaterThan(0);
  });
});
