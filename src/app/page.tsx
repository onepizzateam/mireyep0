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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Find out what your cell tower lease is actually worth.
          </h1>
          <p className="text-lg text-gray-600">
            Carriers know exactly what your site is worth. Now you can too.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Form Section */}
        <div className="mb-12">
          <AddressForm onSubmit={handleScoreRequest} isLoading={isLoading} />
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-8 w-full max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-red-800 mb-1">Error</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="space-y-6">
            <div className="w-full max-w-2xl mx-auto h-32 bg-gray-200 rounded animate-pulse"></div>
            <div className="w-full max-w-2xl mx-auto h-24 bg-gray-200 rounded animate-pulse"></div>
            <div className="w-full max-w-2xl mx-auto h-24 bg-gray-200 rounded animate-pulse"></div>
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
              <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200 rounded-lg p-6 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Buyout Analysis
                </h3>
                <div className="space-y-2">
                  <p className="text-sm text-gray-700">
                    <strong>Implied Multiple:</strong>{" "}
                    {results.buyoutComparison.impliedMultiple.toFixed(1)}× annual
                    rent
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>Fair Value Range:</strong> ${results.buyoutComparison.fairValueMin.toLocaleString(undefined, { maximumFractionDigits: 0 })} – ${results.buyoutComparison.fairValueMax.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-sm text-gray-700 mt-3">
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
            <div className="w-full max-w-2xl mx-auto bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-8 text-center space-y-4">
              <h3 className="text-lg font-bold text-gray-900">
                Get the Full Report
              </h3>
              <p className="text-sm text-gray-700">
                PDF report with 10-year NPV projections, detailed field analysis,
                and negotiation talking points — $49 one-time
              </p>
              <button
                disabled
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-8 rounded-lg transition cursor-not-allowed"
                title="Coming soon"
              >
                Coming Soon
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 mt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm">
            SignalRent — Built on Mireye. 42 fields. One API call. One negotiation
            you don't lose.
          </p>
        </div>
      </footer>
    </div>
  );
}
