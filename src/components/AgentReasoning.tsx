export function AgentReasoning({ reasoning, evidence }: { reasoning?: string; evidence?: { fieldsFetched: number; fieldsNull: number } }) {
  if (!reasoning) return null;
  const cleanReasoning = reasoning.replace(/WARNING:[^.]*\./g, "").replace(/ERROR repaired:[^.]*\./g, "").trim();
  if (!cleanReasoning) return null;
  return <div className="w-full max-w-2xl mx-auto bg-white border border-gray-200 rounded-lg shadow-sm"><div className="px-6 py-4 border-b"><h3 className="text-sm font-semibold text-gray-700">Agent Reasoning</h3><p className="text-xs text-gray-500 font-mono mt-1">How the valuation engine interpreted this site&apos;s data</p></div><div className="px-6 py-4"><p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-mono">{cleanReasoning}</p>{evidence && <p className="text-xs text-gray-400 mt-3 font-mono">{evidence.fieldsFetched} fields fetched · {evidence.fieldsNull} returned null</p>}</div></div>;
}
