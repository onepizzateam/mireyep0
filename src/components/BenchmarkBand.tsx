"use client";

import { BenchmarkResult, RateComparison } from "@/lib/types";

interface BenchmarkBandProps {
  benchmark: BenchmarkResult;
  rateComparison?: RateComparison;
}

export default function BenchmarkBand({
  benchmark,
  rateComparison,
}: BenchmarkBandProps) {
  const { min, max } = benchmark.monthlyRange;
  const range = max - min;
  const mid = (min + max) / 2;

  // Calculate position of offered rate on the scale if provided
  let offeredPosition: number | null = null;
  if (rateComparison) {
    offeredPosition = Math.max(0, Math.min(1, (rateComparison.offeredRate - min) / range));
  }

  return (
    <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200 rounded-lg p-8 shadow-sm space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Market Benchmark Range</h3>
        <p className="text-xs text-gray-600 mb-4">{benchmark.siteType.toUpperCase()} · {benchmark.scoreBand === "high" ? "High Leverage" : benchmark.scoreBand === "mid" ? "Moderate Leverage" : "Limited Leverage"}</p>

        {/* Visual band */}
        <div className="relative mb-8">
          <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
            <span>${min.toLocaleString()}/mo</span>
            <span>${max.toLocaleString()}/mo</span>
          </div>

          {/* Background band */}
          <div className="relative h-12 bg-gray-100 rounded-lg overflow-hidden border border-gray-300">
            {/* Green band representing benchmark range */}
            <div className="h-full bg-emerald-200 border-r-2 border-emerald-600 flex items-center justify-center">
              <span className="text-xs font-bold text-emerald-800">
                ${mid.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
              </span>
            </div>

            {/* Offered rate marker if provided */}
            {offeredPosition !== null && rateComparison && (
              <div
                className="absolute top-0 h-full w-1 bg-red-600 flex flex-col items-center justify-start pt-1"
                style={{
                  left: `${offeredPosition * 100}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="text-xs font-bold text-red-600 bg-white px-2 py-1 rounded border border-red-600 whitespace-nowrap -mt-8">
                  Offer: ${rateComparison.offeredRate.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}/mo
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Calibration note */}
        <p className="text-xs text-gray-600 italic border-t pt-4">
          {benchmark.calibrationNote}
        </p>
      </div>

      {/* Rate comparison if provided */}
      {rateComparison && (
        <div className="border-t pt-6 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">Your Rate Analysis</h4>
          <div className="bg-gray-50 p-4 rounded space-y-2">
            <p
              className={`text-sm font-medium ${
                rateComparison.position === "below"
                  ? "text-red-700"
                  : rateComparison.position === "above"
                    ? "text-green-700"
                    : "text-gray-700"
              }`}
            >
              {rateComparison.position === "below"
                ? `${Math.round(rateComparison.gapPercent)}% below benchmark`
                : rateComparison.position === "above"
                  ? `${Math.round(rateComparison.gapPercent)}% above benchmark`
                  : "Within benchmark range"}
            </p>
            <p className="text-xs text-gray-600">{rateComparison.message}</p>
            {rateComparison.position === "below" && (
              <p className="text-xs font-semibold text-red-700 pt-2">
                30-year cost: ${rateComparison.thirtyYearCost.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
