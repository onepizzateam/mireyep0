"use client";

import { SiteScore } from "@/lib/types";

interface LeverageSummaryProps {
  summary: string[];
  score: SiteScore;
}

function getLeverageColor(score: number): string {
  if (score >= 75) return "border-green-600 bg-green-50";
  if (score >= 50) return "border-amber-600 bg-amber-50";
  return "border-red-600 bg-red-50";
}

function getLeverageTextColor(score: number): string {
  if (score >= 75) return "text-green-800";
  if (score >= 50) return "text-amber-800";
  return "text-red-800";
}

export default function LeverageSummary({ summary, score }: LeverageSummaryProps) {
  return (
    <div
      className={`w-full max-w-2xl mx-auto border-l-4 rounded-lg p-6 space-y-3 ${getLeverageColor(
        score.final
      )}`}
    >
      <h3 className={`text-sm font-semibold ${getLeverageTextColor(score.final)}`}>
        Your Negotiating Position
      </h3>
      <div className="space-y-2">
        {summary.map((sentence, idx) => (
          <p key={idx} className={`text-sm ${getLeverageTextColor(score.final)}`}>
            {sentence}
          </p>
        ))}
      </div>
    </div>
  );
}
