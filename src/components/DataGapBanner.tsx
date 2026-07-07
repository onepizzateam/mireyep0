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
    <div className="w-full max-w-2xl mx-auto p-4 space-y-3" style={{backgroundColor: '#FFFBF5', border: '1px solid #E5E5E5', borderRadius: '4px'}}>
      <div
        className="flex items-start justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3 flex-1">
          <span className="text-lg mt-0" style={{color: '#FF6600'}}>⚠</span>
          <div>
            <p className="text-xs font-medium text-gray-900 uppercase">Data Limitations</p>
            <p className="text-xs text-gray-700 mt-1">
              {dataGaps.length} field{dataGaps.length !== 1 ? "s returned null" : " returned null"} — scores for affected dimensions are estimated from fallback values.
            </p>
          </div>
        </div>
        <button
          className="text-gray-600 hover:text-gray-900 font-bold text-lg mt-0"
          aria-label="Toggle details"
        >
          {expanded ? "−" : "+"}
        </button>
      </div>

      {expanded && (
        <div className="pl-7 border-t border-gray-200 pt-3 space-y-2 text-xs text-gray-700">
          {dataGaps.map((gap, idx) => (
            <p key={idx} className="font-mono">
              • {gap}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
