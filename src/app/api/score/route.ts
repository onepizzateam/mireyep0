/**
 * POST /api/score
 * Main scoring endpoint
 * Per AGENTS.md Section 10
 */

import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/geocode";
import { fetchMireyeFields } from "@/lib/mireye";
import { computeSiteScore } from "@/lib/score";
import { computeBenchmarkRange, getBenchmarkMidpoint } from "@/lib/benchmark";
import { generateLeverageSummary } from "@/lib/leverage";
import {
  ScoreRequest,
  ScoreResponse,
  ScoreErrorResponse,
  GeocodingFailedError,
  MireyeError,
  MireyeTimeoutError,
} from "@/lib/types";

// Simple inline validation (zod may not be installed yet)
function validateScoreRequest(body: unknown): ScoreRequest {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid request body");
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.address !== "string" || obj.address.trim().length === 0) {
    throw new Error("address is required and must be a non-empty string");
  }

  const address = obj.address.trim();
  const carrier = typeof obj.carrier === "string" ? obj.carrier.trim() || undefined : undefined;
  const offeredRate =
    typeof obj.offeredRate === "number" && obj.offeredRate > 0 ? obj.offeredRate : undefined;
  const buyoutAmount =
    typeof obj.buyoutAmount === "number" && obj.buyoutAmount > 0
      ? obj.buyoutAmount
      : undefined;
  const lat = typeof obj.lat === "number" ? obj.lat : undefined;
  const lng = typeof obj.lng === "number" ? obj.lng : undefined;

  return {
    address,
    carrier,
    offeredRate,
    buyoutAmount,
    lat,
    lng,
  };
}

/**
 * Compute rate comparison
 */
function computeRateComparison(
  offeredRate: number,
  benchmarkMin: number,
  benchmarkMax: number
) {
  const benchmarkMid = (benchmarkMin + benchmarkMax) / 2;
  let position: "below" | "within" | "above";

  if (offeredRate < benchmarkMin) {
    position = "below";
  } else if (offeredRate > benchmarkMax) {
    position = "above";
  } else {
    position = "within";
  }

  const gapPercent = ((benchmarkMid - offeredRate) / benchmarkMid) * 100;
  const gapDollars = benchmarkMid - offeredRate;
  const thirtyYearCost = Math.max(0, gapDollars) * 12 * 30;

  let message = "";
  if (position === "below") {
    message = `Your offered rate is ${Math.abs(gapPercent).toFixed(0)}% below the benchmark range. Over a 30-year lease, this represents $${thirtyYearCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} in foregone income.`;
  } else if (position === "above") {
    message = `Your offered rate is ${gapPercent.toFixed(0)}% above the benchmark range — an excellent outcome.`;
  } else {
    message = `Your offered rate is within the benchmark range.`;
  }

  return {
    offeredRate,
    benchmarkMin,
    benchmarkMax,
    position,
    gapPercent,
    gapDollars,
    thirtyYearCost,
    message,
  };
}

/**
 * Compute buyout comparison
 */
function computeBuyoutComparison(
  buyoutAmount: number,
  offeredRate: number | undefined,
  scoreBand: "high" | "mid" | "low"
) {
  if (!offeredRate) {
    return {
      buyoutAmount,
      offeredRate: 0,
      impliedMultiple: 0,
      fairValueMin: 0,
      fairValueMax: 0,
      position: "within" as const,
      message: "Cannot calculate buyout comparison without a current/offered monthly rate.",
    };
  }

  const annualRent = offeredRate * 12;
  const impliedMultiple = buyoutAmount / annualRent;

  // Get buyout multiples from benchmark
  const BUYOUT_MULTIPLES = {
    high: { min: 14, max: 18 },
    mid: { min: 10, max: 14 },
    low: { min: 6, max: 10 },
  };

  const multiples = BUYOUT_MULTIPLES[scoreBand];
  const fairValueMin = annualRent * multiples.min;
  const fairValueMax = annualRent * multiples.max;

  let position: "below" | "within" | "above";
  if (buyoutAmount < fairValueMin) {
    position = "below";
  } else if (buyoutAmount > fairValueMax) {
    position = "above";
  } else {
    position = "within";
  }

  const message =
    position === "below"
      ? `This offer is ${Math.round(((fairValueMin - buyoutAmount) / fairValueMin) * 100)}% below fair value. Counter at $${fairValueMin.toLocaleString(undefined, { maximumFractionDigits: 0 })} or higher.`
      : position === "above"
        ? `This offer is above market fair value for the site's score tier.`
        : `This offer falls within the fair value range for this site's score.`;

  return {
    buyoutAmount,
    offeredRate,
    impliedMultiple,
    fairValueMin,
    fairValueMax,
    position,
    message,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<ScoreResponse | ScoreErrorResponse>> {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const input = validateScoreRequest(body);

    // Step 1: Determine coordinates
    // If lat/lng provided from frontend map, use them directly
    // Otherwise, geocode the address
    let geocoded;
    if (input.lat !== undefined && input.lng !== undefined) {
      geocoded = {
        lat: input.lat,
        lng: input.lng,
        displayName: input.address,
      };
    } else {
      geocoded = await geocodeAddress(input.address);
    }

    // Step 2: Fetch Mireye fields
    const mireyeFields = await fetchMireyeFields(geocoded.lat, geocoded.lng);

    // Step 3: Compute site score
    const siteScore = computeSiteScore(mireyeFields);

    // Step 4: Compute benchmark
    const benchmark = computeBenchmarkRange(siteScore);

    // Step 5: Generate leverage summary
    const leverageSummary = generateLeverageSummary(
      siteScore,
      mireyeFields,
      input.offeredRate,
      input.buyoutAmount
    );

    // Step 6: Compute rate comparison if offered rate provided
    let rateComparison = undefined;
    if (input.offeredRate !== undefined) {
      rateComparison = computeRateComparison(
        input.offeredRate,
        benchmark.monthlyRange.min,
        benchmark.monthlyRange.max
      );
    }

    // Step 7: Compute buyout comparison if buyout amount provided
    let buyoutComparison = undefined;
    if (input.buyoutAmount !== undefined) {
      buyoutComparison = computeBuyoutComparison(
        input.buyoutAmount,
        input.offeredRate,
        benchmark.scoreBand
      );
    }

    const processingMs = Date.now() - startTime;

    const response: ScoreResponse = {
      ok: true,
      address: input.address,
      displayAddress: geocoded.displayName,
      lat: geocoded.lat,
      lng: geocoded.lng,
      carrier: input.carrier,
      score: siteScore,
      benchmark,
      leverageSummary,
      rateComparison,
      buyoutComparison,
      dataGaps: siteScore.dataGaps,
      processingMs,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const processingMs = Date.now() - startTime;

    let errorMessage = "An unknown error occurred";
    let errorCode: "GEOCODING_FAILED" | "MIREYE_ERROR" | "MIREYE_TIMEOUT" | "INVALID_INPUT" | "UNKNOWN" =
      "UNKNOWN";

    if (error instanceof GeocodingFailedError) {
      errorMessage = `Address could not be geocoded. Try a more specific address or use decimal coordinates (lat, lng).`;
      errorCode = "GEOCODING_FAILED";
    } else if (error instanceof MireyeTimeoutError) {
      errorMessage = `Site data fetch timed out. Mireye occasionally takes 20–30s for rural coordinates. Try again.`;
      errorCode = "MIREYE_TIMEOUT";
    } else if (error instanceof MireyeError) {
      errorMessage = `Mireye API error. Please try again later.`;
      errorCode = "MIREYE_ERROR";
    } else if (error instanceof Error && error.message.includes("Invalid request")) {
      errorMessage = error.message;
      errorCode = "INVALID_INPUT";
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Log errors in dev
    if (process.env.NODE_ENV === "development") {
      console.error(`[Score API] Error (${errorCode}):`, error);
    }

    const errorResponse: ScoreErrorResponse = {
      ok: false,
      error: errorMessage,
      code: errorCode,
    };

    return NextResponse.json(errorResponse, { status: 200 });
  }
}
