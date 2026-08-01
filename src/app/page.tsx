"use client";

import { useState } from "react";
import AddressForm from "@/components/AddressForm";
import ScoreCard from "@/components/ScoreCard";
import BenchmarkBand from "@/components/BenchmarkBand";
import LeverageSummary from "@/components/LeverageSummary";
import RateComparisonComponent from "@/components/RateComparison";
import DataGapBanner from "@/components/DataGapBanner";
import FieldDisclosure from "@/components/FieldDisclosure";
import { AgentReasoning } from "@/components/AgentReasoning";
import ValuationAssistant from "@/components/ValuationAssistant";
import { ScoreRequest, ScoreResponse, ScoreErrorResponse } from "@/lib/types";
import { parseScoreResponse } from "@/lib/response-schema";

export default function Home() {
  const [results, setResults] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const isAmbiguousAddress = error?.startsWith("Address is ambiguous:") ?? false;

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
        const parsed = parseScoreResponse(data);
        if (!parsed.success) {
        console.error("[score] client response contract failure", JSON.stringify({
          keys: Object.keys(data),
          issueCount: parsed.error.issues.length,
          issuePaths: parsed.error.issues.slice(0, 8).map((issue) => issue.path.join(".")),
        }));
        setError("The valuation response was incomplete. Please try again.");
        } else {
          setResults(parsed.data as ScoreResponse);
        }
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSmokeTest = async () => {
    await handleScoreRequest({ address: "NO BUENO", lat: 41.8789, lng: -87.6359 });
  };

  const handleDownloadReport = async (scoreResponse: ScoreResponse) => {
    setIsDownloading(true);
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(scoreResponse),
      });

      if (!response.ok) {
        setError("Failed to generate PDF report. Please try again.");
        return;
      }

      // Get the PDF blob
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `signalrent-report-${scoreResponse.lat.toFixed(4)}-${scoreResponse.lng.toFixed(4)}.pdf`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError("Failed to download report. Please try again.");
      console.error(err);
    } finally {
      setIsDownloading(false);
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
            One address, 60 federal data points, a data-backed estimate and a read on your negotiating leverage.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Form Section */}
        <div className="mb-12">
          <p className="text-sm text-gray-600 font-mono text-center mb-6">Enter an address to run a site valuation.</p>
          <AddressForm onSubmit={handleScoreRequest} onSmokeTest={handleSmokeTest} isLoading={isLoading} />
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-8 w-full max-w-2xl mx-auto bg-white border border-red-300 rounded p-4">
            <p className="text-sm font-semibold text-red-900">{isAmbiguousAddress ? "Clarification needed" : "Valuation unavailable"}</p>
            <p className="text-sm font-mono text-red-900 mt-2">{error.replace(/^Address is ambiguous:\s*/i, "Did you mean: ")}</p>
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

            {results.geocodeWarning && (
              <div className="w-full max-w-2xl mx-auto rounded border border-yellow-400 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
                ⚠️ {results.geocodeWarning}
              </div>
            )}

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
            />

            {/* Data Gap Banner */}
            <DataGapBanner dataGaps={results.dataGaps} />

            {/* Field Disclosure */}
            <FieldDisclosure score={results.score} />
            <AgentReasoning reasoning={results.reasoning} evidence={{ fieldsFetched: 60, fieldsNull: results.score.dataGaps?.length ?? 0 }} />
            <ValuationAssistant valuation={results} />

            {/* CTA Card */}
            <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200 p-6 text-center space-y-4" style={{borderRadius: '4px'}}>
              <h3 className="text-sm font-semibold text-gray-900">
                Full report — $49
              </h3>
              <p className="text-xs text-gray-600 font-mono">
                Field-by-field breakdown, comprehensive data analysis, and negotiation strategy derived from your site&apos;s highest-impact data points.
              </p>
              <button
                onClick={() => handleDownloadReport(results)}
                disabled={isDownloading}
                className="w-full bg-black hover:bg-gray-900 disabled:opacity-60 hover:shadow-md text-white text-sm font-medium py-2 transition cursor-pointer" style={{borderRadius: '4px'}}
                title="Download your comprehensive PDF report"
              >
                {isDownloading ? "Generating PDF..." : "Download Report (PDF)"}
              </button>
              <p className="text-xs text-gray-500 font-mono">
                Payment integration coming soon — button provided for demonstration.
              </p>
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
