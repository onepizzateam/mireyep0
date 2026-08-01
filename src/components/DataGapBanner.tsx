"use client";

import { useState } from "react";
import { AgentFieldGap } from "@/lib/types";
import { displayText } from "@/lib/display";

export default function DataGapBanner({ dataGaps }: { dataGaps: AgentFieldGap[] }) {
  const [expanded, setExpanded] = useState(false);
  if (dataGaps.length === 0) return null;
  return (
    <div className="w-full max-w-2xl mx-auto p-4 space-y-3" style={{ backgroundColor: "#FFFBF5", border: "1px solid #E5E5E5", borderRadius: "4px" }}>
      <button className="w-full flex items-start justify-between text-left" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <span><span className="text-lg mr-3" style={{ color: "#FF6600" }}>⚠</span><span className="text-xs font-medium uppercase">Data Limitations</span><span className="block text-xs text-gray-700 mt-1 ml-7">{dataGaps.length} field{dataGaps.length !== 1 ? "s" : ""} unavailable — affected scores use documented assumptions.</span></span>
        <span className="font-bold text-lg">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && <div className="pl-7 border-t pt-3 space-y-2 text-xs text-gray-700">{dataGaps.map((gap, idx) => <p key={idx} className="font-mono">• {displayText(gap.field)} — Impact: {displayText(gap.impact)} — {displayText(gap.assumption)}</p>)}</div>}
    </div>
  );
}
