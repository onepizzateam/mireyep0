"use client";
import { useState } from "react";
import type { ScoreResponse } from "@/lib/types";
export default function ValuationAssistant({ valuation }: { valuation: ScoreResponse }) {
  const [question, setQuestion] = useState(""); const [answer, setAnswer] = useState(""); const [loading, setLoading] = useState(false);
  async function ask() { if (!question.trim()) return; setLoading(true); const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, valuation }) }); const data = await response.json(); setAnswer(data.answer ?? data.error); setLoading(false); }
  return <section className="w-full max-w-2xl mx-auto border border-gray-200 p-6 space-y-3"><h3 className="text-xs font-medium text-gray-600 uppercase">Valuation assistant</h3><p className="text-xs text-gray-500 font-mono">Using current valuation</p><div className="flex gap-2"><input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void ask(); }} placeholder="Ask about the score, evidence, or negotiation" className="flex-1 border border-gray-300 p-2 text-sm" /><button onClick={() => void ask()} disabled={loading} className="bg-black text-white px-4 text-sm">{loading ? "Thinking…" : "Ask"}</button></div>{answer && <p className="text-sm text-gray-700 font-mono">{answer}</p>}</section>;
}
