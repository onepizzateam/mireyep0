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
    <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200 p-6 space-y-6" style={{borderRadius: '4px'}}>
      <div>
        <h3 className="text-xs font-medium text-gray-600 uppercase mb-3">Market Benchmark Range</h3>
        <p className="text-xs text-gray-500 mb-4 font-mono">{benchmark.siteType.toUpperCase()} · {benchmark.scoreBand === "high" ? "High" : benchmark.scoreBand === "mid" ? "Moderate" : "Limited"} leverage</p>

        {/* Visual band */}
        <div className="relative mb-6">
          <div className="flex justify-between text-xs font-mono text-gray-700 mb-2">
            <span>${min.toLocaleString()}/mo</span>
            <span>${max.toLocaleString()}/mo</span>
          </div>

          {/* Background band */}
          <div className="relative" style={{height: '32px', backgroundColor: '#F5F5F5', border: '1px solid #E5E5E5'}}>
            {/* Orange band representing benchmark range */}
            <div className="h-full flex items-center justify-center" style={{backgroundColor: '#FFF0E6', borderRight: '2px solid #FF6600'}}>
              <span className="text-xs font-bold font-mono" style={{color: '#FF6600'}}>
                ${mid.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
              </span>
            </div>

            {/* Offered rate marker if provided */}
            {offeredPosition !== null && rateComparison && (
              <div
                className="absolute top-0 h-full flex flex-col items-center justify-start pt-1"
                style={{
                  left: `${offeredPosition * 100}%`,
                  transform: "translateX(-50%)",
                  width: '2px',
                  backgroundColor: '#000000'
                }}
              >
                <div className="text-xs font-mono font-bold text-gray-900 bg-white px-2 py-1" style={{border: '1px solid #000000', whiteSpace: 'nowrap', marginTop: '-24px'}}>
                  Offer: ${rateComparison.offeredRate.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}/mo
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Calibration note */}
        <p className="text-xs text-gray-600 border-t pt-4 font-mono">
          {benchmark.calibrationNote}
        </p>
      </div>

      {/* How this range was calculated — itemized price breakdown */}
      {benchmark.priceBreakdown && benchmark.priceBreakdown.length > 0 && (
        <div className="border-t pt-4 space-y-3">
          <h4 className="text-xs font-medium text-gray-600 uppercase">How this range was calculated</h4>
          <div className="bg-gray-50 p-4 space-y-2" style={{ borderRadius: "4px" }}>
            <div className="flex justify-between text-xs font-mono text-gray-700">
              <span>Base value ({benchmark.siteType} · {benchmark.scoreBand} band)</span>
              <span>${benchmark.baseValue.toLocaleString()}/mo</span>
            </div>
            {benchmark.priceBreakdown.map((adj, idx) => {
              const sign = adj.direction === "positive" ? "+" : adj.direction === "negative" ? "−" : "";
              const pct = Math.round(Math.abs(adj.percent) * 100);
              const amt = Math.abs(adj.amount).toLocaleString();
              return (
                <div key={idx} className="flex justify-between gap-3 text-xs font-mono text-gray-700 border-t border-gray-200 pt-2">
                  <span className="flex-1">{adj.label}</span>
                  <span className="whitespace-nowrap text-gray-900">{sign}{pct}% · {sign}${amt}</span>
                </div>
              );
            })}
            <div className="flex justify-between text-xs font-mono font-semibold text-gray-900 border-t border-gray-300 pt-2">
              <span>Final range (±25% around adjusted center)</span>
              <span>${min.toLocaleString()} – ${max.toLocaleString()}/mo</span>
            </div>
          </div>
        </div>
      )}

      {/* Rate comparison if provided */}
      {rateComparison && (
        <div className="border-t pt-4 space-y-3">
          <h4 className="text-xs font-medium text-gray-600 uppercase">Your Rate Analysis</h4>
          <div className="bg-gray-50 p-4 space-y-2" style={{borderRadius: '4px'}}>
            <p
              className={`text-sm font-mono font-medium ${
                rateComparison.position === "below"
                  ? "text-gray-900"
                  : rateComparison.position === "above"
                    ? "text-gray-900"
                    : "text-gray-900"
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
              <p className="text-xs font-mono font-semibold text-gray-900 pt-2">
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
