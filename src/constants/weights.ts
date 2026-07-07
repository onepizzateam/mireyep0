/**
 * Scoring Model Weights and Multiplier Thresholds
 */

export const DIMENSION_WEIGHTS = {
  coverageNecessity: 0.4,
  subscriberValue: 0.35,
  constructionCost: 0.25,
} as const;

// Verify weights sum to 1.0
const weightSum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1.0) > 0.001) {
  throw new Error(
    `Dimension weights must sum to 1.0, but sum to ${weightSum}`
  );
}

/**
 * Permitting Friction Multiplier Thresholds
 * Each condition adds to the multiplier. Capped at 2.0, floored at 0.5
 */
export const FRICTION_MULTIPLIERS = {
  // Base multiplier if no friction flags
  noFriction: 0.85,

  // Friction flags
  intersectsWetland: 0.25,
  wetlandsWithin100m: 0.15,
  intersectsProtectedArea: 0.3,
  protectedAreaGAP1: 0.1, // additional on top of protectedArea
  intersectsConservationEasement: 0.2,
  intersectsCriticalHabitat: 0.35,
  criticalHabitatFinal: 0.05, // additional on top of criticalHabitat
  specialUseAirspace: 0.15,
  nearAirport: 0.1,
  federalLandManagement: 0.1,
  goldenEagleNestDensity: 0.1,
  residentialOrHistoricZoning: 0.1,

  // Multiplier bounds
  min: 0.5,
  max: 2.0,
} as const;

/**
 * Site Type Classification Thresholds
 * Per AGENTS.md Section 6, Step 1
 */
export const SITE_TYPE_THRESHOLDS = {
  urban: {
    nearestUrbanAreaDistance: 5000, // < this = urban
    housingUnitsDensity: 2000, // > this = urban
  },
  suburban: {
    nearestUrbanAreaDistance: 25000, // < this = suburban
    housingUnitsDensity: 400, // > this = suburban
  },
  // rural is the fallback
} as const;
