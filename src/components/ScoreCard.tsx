"use client";

import { SiteScore } from "@/lib/types";

interface ScoreCardProps {
  score: SiteScore;
}

function getScoreColor(score: number): string {
  if (score >= 75) return "bg-green-600";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function getScoreLabelColor(score: number): string {
  if (score >= 75) return "text-green-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

export default function ScoreCard({ score }: ScoreCardProps) {
  return (
    <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200 rounded-lg p-8 shadow-sm space-y-6">
      {/* Main Score */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-600">Site Score</h3>
          <p className={`text-5xl font-bold ${getScoreLabelColor(score.final)}`}>
            {Math.round(score.final)}
            <span className="text-2xl text-gray-500"> / 100</span>
          </p>
        </div>
        <div className="flex-1 ml-8">
          <div className="w-full bg-gray-200 rounded-full h-8">
            <div
              className={`h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold transition-all ${getScoreColor(
                score.final
              )}`}
              style={{ width: `${Math.min(100, score.final)}%` }}
            >
              {Math.round(score.final)}
            </div>
          </div>
        </div>
      </div>

      {/* Dimension Scores */}
      <div className="space-y-4 border-t pt-6">
        <h4 className="text-sm font-semibold text-gray-700">Dimension Breakdown</h4>

        {/* Dimension 1 */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              {score.dimensions.coverageNecessity.label}
            </span>
            <span className="text-sm font-semibold text-gray-900">
              {Math.round(score.dimensions.coverageNecessity.raw)} / 100
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-blue-600"
              style={{ width: `${score.dimensions.coverageNecessity.raw}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {(score.dimensions.coverageNecessity.weight * 100).toFixed(0)}% weight
          </p>
        </div>

        {/* Dimension 2 */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              {score.dimensions.subscriberValue.label}
            </span>
            <span className="text-sm font-semibold text-gray-900">
              {Math.round(score.dimensions.subscriberValue.raw)} / 100
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-emerald-600"
              style={{ width: `${score.dimensions.subscriberValue.raw}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {(score.dimensions.subscriberValue.weight * 100).toFixed(0)}% weight
          </p>
        </div>

        {/* Dimension 3 */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              {score.dimensions.constructionCost.label}
            </span>
            <span className="text-sm font-semibold text-gray-900">
              {Math.round(score.dimensions.constructionCost.raw)} / 100
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-purple-600"
              style={{ width: `${score.dimensions.constructionCost.raw}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {(score.dimensions.constructionCost.weight * 100).toFixed(0)}% weight
          </p>
        </div>
      </div>

      {/* Leverage Multiplier */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Leverage Multiplier</p>
            <p className="text-xs text-gray-600 mt-1">
              Permitting friction effect on negotiating position
            </p>
          </div>
          <p
            className={`text-2xl font-bold ${
              score.multiplier > 1.2
                ? "text-green-600"
                : score.multiplier < 0.9
                  ? "text-red-600"
                  : "text-gray-700"
            }`}
          >
            {score.multiplier.toFixed(2)}×
          </p>
        </div>
      </div>

      {/* Site Type */}
      <div className="border-t pt-4 flex justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700">Site Type</p>
          <p className="text-sm text-gray-600 capitalize mt-1">{score.siteType}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">Baseline Score</p>
          <p className="text-sm text-gray-600 mt-1">{Math.round(score.baseline)} / 100</p>
        </div>
      </div>
    </div>
  );
}
