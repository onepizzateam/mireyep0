/**
 * Benchmark Range Tables
 * Calibrated to published industry data and documented case outcomes
 * Per AGENTS.md Section 7
 */

export const BENCHMARK_TABLE = {
  urban: {
    high: { min: 3500, max: 6000 }, // score >= 75
    mid: { min: 2500, max: 3500 }, // score 50–74
    low: { min: 1500, max: 2500 }, // score < 50
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
} as const;

/**
 * Buyout multiples by score band (as multiples of annual rent)
 */
export const BUYOUT_MULTIPLES = {
  high: { min: 14, max: 18 }, // score >= 75
  mid: { min: 10, max: 14 }, // score 50–74
  low: { min: 6, max: 10 }, // score < 50
} as const;

/**
 * Calibration note shown to users alongside benchmark ranges
 * Per AGENTS.md Section 7
 * Updated to reflect the itemized adjustment model
 */
export const BENCHMARK_CALIBRATION_NOTE =
  "Base range calibrated to published industry data (Steel in the Air, Vertical Consultants, Tower Genius) " +
  "for this site type and score band. Adjustments are applied individually for site-specific factors " +
  "(density, competing structures, accessibility, construction risk) and shown in the breakdown below. " +
  "This is an informed estimate, not a transaction database — actual negotiated rates may vary.";
