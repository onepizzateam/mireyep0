/**
 * Benchmark Range Calculator
 * Per AGENTS.md Section 7
 */

import { BenchmarkResult, SiteScore, ScoreBand } from "./types";
import { BENCHMARK_TABLE, BENCHMARK_CALIBRATION_NOTE } from "@/constants/benchmarks";

/**
 * Determine score band from final score
 */
function getScoreBand(score: number): ScoreBand {
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

/**
 * Compute benchmark range for a given site
 */
export function computeBenchmarkRange(siteScore: SiteScore): BenchmarkResult {
  const scoreBand = getScoreBand(siteScore.final);
  const siteType = siteScore.siteType;

  const range = BENCHMARK_TABLE[siteType][scoreBand];

  return {
    monthlyRange: {
      min: range.min,
      max: range.max,
    },
    annualRange: {
      min: range.min * 12,
      max: range.max * 12,
    },
    siteType,
    scoreBand,
    calibrationNote: BENCHMARK_CALIBRATION_NOTE,
  };
}

/**
 * Get the midpoint of a benchmark range
 */
export function getBenchmarkMidpoint(benchmark: BenchmarkResult): number {
  return (benchmark.monthlyRange.min + benchmark.monthlyRange.max) / 2;
}
