"use client";

import { useState } from "react";
import AddressForm from "@/components/AddressForm";
import ScoreCard from "@/components/ScoreCard";
import BenchmarkBand from "@/components/BenchmarkBand";
import LeverageSummary from "@/components/LeverageSummary";
import RateComparisonComponent from "@/components/RateComparison";
import DataGapBanner from "@/components/DataGapBanner";
import FieldDisclosure from "@/components/FieldDisclosure";
import { ScoreRequest, ScoreResponse, ScoreErrorResponse } from "@/lib/types";

export default function Home() {
  const [results, setResults] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleScoreRequest = async (request: ScoreRequest) => {
    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch("/api/score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      const data = (await response.json()) as ScoreResponse | ScoreErrorResponse;

      if (!data.ok) {
        setError(data.error);
      } else {
        setResults(data);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-1">
            Cell tower lease valuation.
          </h1>
          <p className="text-base text-gray-600 font-mono">
            One address, 60 federal data points, one defensible number.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Form Section */}
        <div className="mb-12">
          <p className="text-sm text-gray-600 font-mono text-center mb-6">Enter an address to run a site valuation.</p>
          <AddressForm onSubmit={handleScoreRequest} isLoading={isLoading} />
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-8 w-full max-w-2xl mx-auto bg-white border border-red-300 rounded p-4">
            <p className="text-sm font-mono text-red-900">{error}</p>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="w-full max-w-2xl mx-auto text-center py-8">
            <p className="text-sm font-mono text-gray-600">Fetching site data...</p>
          </div>
        )}

        {/* Results Section */}
        {results && !isLoading && (
          <div className="space-y-8">
            {/* Address Display */}
            <div className="max-w-2xl mx-auto">
              <p className="text-sm text-gray-600">
                <strong>Address:</strong> {results.displayAddress}
              </p>
              {results.carrier && (
                <p className="text-sm text-gray-600">
                  <strong>Carrier:</strong> {results.carrier}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Processed in {results.processingMs}ms
              </p>
            </div>

            {/* Score Card */}
            <ScoreCard score={results.score} />

            {/* Benchmark Band */}
            <BenchmarkBand
              benchmark={results.benchmark}
              rateComparison={results.rateComparison}
            />

            {/* Rate Comparison (detailed, if available) */}
            {results.rateComparison && (
              <RateComparisonComponent comparison={results.rateComparison} />
            )}

            {/* Buyout Comparison */}
            {results.buyoutComparison && (
              <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200 p-6 space-y-3" style={{borderRadius: '4px'}}>
                <h3 className="text-xs font-medium text-gray-600 uppercase">
                  Buyout Analysis
                </h3>
                <div className="space-y-2">
                  <p className="text-sm text-gray-700">
                    <span className="font-mono">Implied Multiple:</span>{" "}
                    {results.buyoutComparison.impliedMultiple.toFixed(1)}× annual rent
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-mono">Fair Value:</span> ${results.buyoutComparison.fairValueMin.toLocaleString(undefined, { maximumFractionDigits: 0 })} – ${results.buyoutComparison.fairValueMax.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-sm text-gray-700 mt-3 font-mono">
                    {results.buyoutComparison.message}
                  </p>
                </div>
              </div>
            )}

            {/* Leverage Summary */}
            <LeverageSummary
              summary={results.leverageSummary}
              score={results.score}
            />

            {/* Data Gap Banner */}
            <DataGapBanner dataGaps={results.dataGaps} />

            {/* Field Disclosure */}
            <FieldDisclosure score={results.score} />

            {/* CTA Card */}
            <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200 p-6 text-center space-y-4" style={{borderRadius: '4px'}}>
              <h3 className="text-sm font-semibold text-gray-900">
                Full report — $49
              </h3>
              <p className="text-xs text-gray-600 font-mono">
                Field-by-field breakdown, 10-year NPV, buyout fair value, and negotiation talking points derived from your site&apos;s highest-impact data points.
              </p>
              <button
                disabled
                className="w-full bg-black hover:shadow-md disabled:opacity-60 text-white text-sm font-medium py-2 transition cursor-not-allowed" style={{borderRadius: '4px'}}
                title="Coming soon"
              >
                Coming Soon
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8 mt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs text-gray-600 font-mono text-center">
            Built on Mireye. Data sourced from FCC ASR, USDA SSURGO, FEMA NFHL, USFWS NWI, and 12 other federal datasets. Not a substitute for professional appraisal.
          </p>
        </div>
      </footer>
    </div>
  );
}
