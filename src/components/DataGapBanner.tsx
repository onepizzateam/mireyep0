"use client";

import { useState } from "react";

interface DataGapBannerProps {
  dataGaps: string[];
}

export default function DataGapBanner({ dataGaps }: DataGapBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (dataGaps.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-2xl mx-auto bg-amber-50 border-l-4 border-amber-500 rounded p-4 space-y-3">
      <div
        className="flex items-start justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3 flex-1">
          <span className="text-amber-700 font-bold text-lg mt-1">⚠</span>
          <div>
            <p className="text-sm font-semibold text-amber-900">
              Data limitations
            </p>
            <p className="text-sm text-amber-800">
              {dataGaps.length} field{dataGaps.length !== 1 ? "s" : ""} affecting
              this score w{dataGaps.length !== 1 ? "ere" : "as"} unavailable or
              uncertain.
            </p>
          </div>
        </div>
        <button
          className="text-amber-700 hover:text-amber-900 font-bold text-lg mt-1"
          aria-label="Toggle details"
        >
          {expanded ? "−" : "+"}
        </button>
      </div>

      {expanded && (
        <div className="pl-8 border-t border-amber-200 pt-3 space-y-2">
          {dataGaps.map((gap, idx) => (
            <p key={idx} className="text-xs text-amber-800">
              • {gap}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
