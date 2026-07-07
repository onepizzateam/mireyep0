"use client";

import { SiteScore } from "@/lib/types";

interface ScoreCardProps {
  score: SiteScore;
}

export default function ScoreCard({ score }: ScoreCardProps) {
  return (
    <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200 p-6 space-y-6" style={{borderRadius: '4px'}}>
      {/* Main Score */}
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-xs font-medium text-gray-600 uppercase mb-2">Site Score</h3>
          <div className="flex items-baseline gap-1">
            <p className="text-5xl font-mono font-bold" style={{color: '#FF6600'}}>
              {Math.round(score.final)}
            </p>
            <p className="text-xl font-mono text-gray-400">/100</p>
          </div>
        </div>
        <div className="flex-1 ml-8">
          <div className="w-full" style={{height: '3px', backgroundColor: '#E5E5E5'}}>
            <div
              className="transition-all"
              style={{
                height: '3px',
                width: `${Math.min(100, score.final)}%`,
                backgroundColor: '#FF6600'
              }}
            />
          </div>
        </div>
      </div>

      {/* Dimension Scores */}
      <div className="space-y-3 border-t pt-4">
        <h4 className="text-xs font-medium text-gray-600 uppercase">Dimension Breakdown</h4>

        {/* Dimension 1 */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-gray-700">
              {score.dimensions.coverageNecessity.label}
            </span>
            <span className="text-xs font-mono text-gray-900">
              {Math.round(score.dimensions.coverageNecessity.raw)}
            </span>
          </div>
          <div className="w-full" style={{height: '2px', backgroundColor: '#E5E5E5'}}>
            <div
              style={{
                height: '2px',
                width: `${score.dimensions.coverageNecessity.raw}%`,
                backgroundColor: '#000000'
              }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {(score.dimensions.coverageNecessity.weight * 100).toFixed(0)}% weight
          </p>
        </div>

        {/* Dimension 2 */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-gray-700">
              {score.dimensions.subscriberValue.label}
            </span>
            <span className="text-xs font-mono text-gray-900">
              {Math.round(score.dimensions.subscriberValue.raw)}
            </span>
          </div>
          <div className="w-full" style={{height: '2px', backgroundColor: '#E5E5E5'}}>
            <div
              style={{
                height: '2px',
                width: `${score.dimensions.subscriberValue.raw}%`,
                backgroundColor: '#000000'
              }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {(score.dimensions.subscriberValue.weight * 100).toFixed(0)}% weight
          </p>
        </div>

        {/* Dimension 3 */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-medium text-gray-700">
              {score.dimensions.constructionCost.label}
            </span>
            <span className="text-xs font-mono text-gray-900">
              {Math.round(score.dimensions.constructionCost.raw)}
            </span>
          </div>
          <div className="w-full" style={{height: '2px', backgroundColor: '#E5E5E5'}}>
            <div
              style={{
                height: '2px',
                width: `${score.dimensions.constructionCost.raw}%`,
                backgroundColor: '#000000'
              }}
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
            <p className="text-xs font-medium text-gray-600 uppercase">Leverage Multiplier</p>
            <p className="text-xs text-gray-600 mt-1">
              Permitting friction effect
            </p>
          </div>
          <p className="text-2xl font-mono font-bold text-gray-900">
            {score.multiplier.toFixed(2)}×
          </p>
        </div>
      </div>

      {/* Site Type & Baseline */}
      <div className="border-t pt-4 flex justify-between">
        <div>
          <p className="text-xs font-medium text-gray-600 uppercase">Site Type</p>
          <p className="text-sm font-mono text-gray-900 capitalize mt-1">{score.siteType}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-600 uppercase">Baseline</p>
          <p className="text-sm font-mono text-gray-900 mt-1">{Math.round(score.baseline)}/100</p>
        </div>
      </div>
    </div>
  );
}
