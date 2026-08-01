"use client";

import { useState } from "react";
import { SiteScore } from "@/lib/types";
import { displayFieldName, displayText } from "@/lib/display";

interface FieldDisclosureProps {
  score: SiteScore;
}

export default function FieldDisclosure({ score }: FieldDisclosureProps) {
  const [expanded, setExpanded] = useState(false);

  // Collect all top fields from all dimensions
  const allFields = [
    ...score.dimensions.coverageNecessity.topFields,
    ...score.dimensions.subscriberValue.topFields,
    ...score.dimensions.constructionCost.topFields,
  ].filter((field) => Boolean(field && (field.fieldName || (field as unknown as Record<string, unknown>).field || (field as unknown as Record<string, unknown>).name)));

  const disclosures = [
    {
      title: "FCC Tenancy Caveat",
      text: "Structure type data is available but actual co-location tenant counts are not — a nearby tower may appear as competition but could already be at structural capacity. Verify with the carrier.",
      always: true,
    },
    {
      title: "Benchmark Calibration",
      text: score.dimensions.coverageNecessity.topFields[0]?.explanation
        ? "Benchmark calibrated to published industry ranges and documented case outcomes — not a transaction database. See methodology."
        : "",
      always: true,
    },
    {
      title: "RF Coverage Limitation",
      text: "This tool assesses site potential for coverage necessity using FCC public data. It cannot access carrier-internal RF coverage models or drive-test data.",
      always: true,
    },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200 rounded-lg shadow-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition"
      >
        <h3 className="text-sm font-semibold text-gray-900">
          How We Calculated This
        </h3>
        <span className="text-lg font-bold text-gray-900">
          {expanded ? "−" : "+"}
        </span>
      </button>

      {/* Content */}
      {expanded && (
        <div className="border-t px-6 py-4 space-y-6">
          {/* Top Contributing Fields */}
          {allFields.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">
                Top Contributing Fields
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-900">
                        Field
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-900">
                        Value
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-900">
                        Impact
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-900">
                        Explanation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allFields.map((field, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-3 px-3 text-xs font-mono text-gray-900">
                          {displayFieldName(field)}
                        </td>
                        <td className="py-3 px-3 text-xs text-gray-900">
                          {field.value === null || field.value === undefined
                            ? <span className="text-gray-400 italic">missing</span>
                            : typeof field.value === "boolean"
                              ? field.value
                                ? "Yes"
                                : "No"
                              : typeof field.value === "number"
                                ? Number.isInteger(field.value)
                                  ? field.value.toLocaleString()
                                  : field.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                : String(field.value).slice(0, 60)}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded ${
                              field.impact === "high"
                                ? "bg-red-100 text-red-800"
                                : field.impact === "medium"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {displayText(field.impact)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs text-gray-900">
                          {displayText(field.explanation)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Methodology Notes */}
          {score.dataGaps.length > 0 && (
            <div className="border-t pt-4 space-y-2">
              <h4 className="text-sm font-semibold text-gray-900">Data Gaps</h4>
              {score.dataGaps.map((gap, idx) => (
                <div key={idx}>
                  <p className="font-mono text-xs">• {gap.field}</p>
                  <p className="text-xs text-gray-500 ml-3">Impact: {gap.impact} — {gap.assumption}</p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-4 border-t pt-4">
            <h4 className="text-sm font-semibold text-gray-900">
              Methodology Notes
            </h4>
            {disclosures.map((disclosure, idx) => (
              <div key={idx} className="bg-gray-50 p-4 rounded">
                <p className="text-xs font-semibold text-gray-900 mb-2">
                  {disclosure.title}
                </p>
                <p className="text-xs text-gray-900 leading-relaxed">
                  {disclosure.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
