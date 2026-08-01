"use client";

import { RateComparison } from "@/lib/types";
import { displayNumber } from "@/lib/display";

export default function RateComparisonComponent({ comparison }: { comparison: RateComparison }) {
  const mid = (comparison.benchmarkMin + comparison.benchmarkMax) / 2;
  return (
    <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200 p-6 space-y-4" style={{ borderRadius: "4px" }}>
      <h3 className="text-xs text-gray-600 uppercase">Rate Comparison</h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 border border-gray-200"><p className="text-xs text-gray-600 uppercase">Your Offer</p><p className="text-2xl font-mono font-bold">${displayNumber(comparison.offeredRate)}/mo</p></div>
        <div className="p-4 border border-gray-200"><p className="text-xs text-gray-600 uppercase">Benchmark Mid</p><p className="text-2xl font-mono font-bold">${displayNumber(mid)}/mo</p></div>
        <div className="p-4 border border-gray-200"><p className="text-xs text-gray-600 uppercase">Range</p><p className="text-sm font-mono font-bold">${displayNumber(comparison.benchmarkMin)} – ${displayNumber(comparison.benchmarkMax)}/mo</p></div>
      </div>
      <div className="border-t pt-4"><p className="text-sm text-gray-700">{comparison.message || "Unknown"}</p>{comparison.position === "below" && <p className="text-sm font-mono font-semibold mt-3">Gap: ${displayNumber(comparison.gapDollars)}/mo = ${displayNumber(comparison.thirtyYearCost)} over 30 years</p>}</div>
    </div>
  );
}
