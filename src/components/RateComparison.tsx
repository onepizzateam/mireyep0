"use client";

import { RateComparison } from "@/lib/types";

interface RateComparisonProps {
  comparison: RateComparison;
}

export default function RateComparisonComponent({
  comparison,
}: RateComparisonProps) {
  return (
    <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200 p-6 space-y-4" style={{borderRadius: '4px'}}>
      <h3 className="text-xs font-medium text-gray-600 uppercase">Rate Comparison</h3>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 bg-white border border-gray-200" style={{borderRadius: '4px'}}>
          <p className="text-xs text-gray-600 uppercase font-medium">Your Offer</p>
          <p className="text-2xl font-mono font-bold text-gray-900 mt-2">
            ${comparison.offeredRate.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}/mo
          </p>
        </div>

        <div className="p-4 bg-white border border-gray-200" style={{borderRadius: '4px'}}>
          <p className="text-xs text-gray-600 uppercase font-medium">Benchmark Mid</p>
          <p className="text-2xl font-mono font-bold text-gray-900 mt-2">
            ${(
              (comparison.benchmarkMin + comparison.benchmarkMax) /
              2
            ).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
          </p>
        </div>

        <div className="p-4 bg-white border border-gray-200" style={{borderRadius: '4px', borderColor: '#FF6600'}}>
          <p className="text-xs text-gray-600 uppercase font-medium">Range</p>
          <p className="text-sm font-mono font-bold text-gray-900 mt-2">
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
          <p className="text-sm font-mono font-semibold text-gray-900 mt-3">
            Gap: ${comparison.gapDollars.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}/mo = ${comparison.thirtyYearCost.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })} over 30 years
          </p>
        )}
      </div>
    </div>
  );
}
