"use client";

import { RateComparison } from "@/lib/types";

interface RateComparisonProps {
  comparison: RateComparison;
}

export default function RateComparisonComponent({
  comparison,
}: RateComparisonProps) {
  return (
    <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">Rate Comparison</h3>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-red-50 rounded border border-red-200">
          <p className="text-xs text-gray-600 font-medium">Your Offer</p>
          <p className="text-2xl font-bold text-red-700 mt-2">
            ${comparison.offeredRate.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}/mo
          </p>
        </div>

        <div className="p-4 bg-gray-50 rounded border border-gray-300">
          <p className="text-xs text-gray-600 font-medium">Benchmark Mid</p>
          <p className="text-2xl font-bold text-gray-700 mt-2">
            ${(
              (comparison.benchmarkMin + comparison.benchmarkMax) /
              2
            ).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
          </p>
        </div>

        <div className="p-4 bg-emerald-50 rounded border border-emerald-200">
          <p className="text-xs text-gray-600 font-medium">Benchmark Range</p>
          <p className="text-sm font-bold text-emerald-700 mt-2">
            ${comparison.benchmarkMin.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })} – ${comparison.benchmarkMax.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}/mo
          </p>
        </div>
      </div>

      <div className="border-t pt-4">
        <p className="text-sm text-gray-700">{comparison.message}</p>
        {comparison.position === "below" && (
          <p className="text-sm font-semibold text-red-700 mt-3">
            Gap: ${comparison.gapDollars.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}/month = ${comparison.thirtyYearCost.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })} over 30 years
          </p>
        )}
      </div>
    </div>
  );
}
