"use client";

import { SiteScore } from "@/lib/types";

interface LeverageSummaryProps {
  summary: string[];
  _score?: SiteScore;
}

export default function LeverageSummary({ summary }: LeverageSummaryProps) {
  return (
    <div
      className="w-full max-w-2xl mx-auto p-6 space-y-3"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E5E5E5',
        borderLeft: '4px solid #FF6600',
        borderRadius: '4px'
      }}
    >
      <h3 className="text-xs font-medium text-gray-900 uppercase">Negotiating Position</h3>
      <div className="space-y-2">
        {summary.map((sentence, idx) => (
          <p key={idx} className="text-sm text-gray-900">
            {sentence}
          </p>
        ))}
      </div>
    </div>
  );
}
