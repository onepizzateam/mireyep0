"use client";
import { useState } from "react";
import type { ScoreResponse } from "@/lib/types";
interface Message { role: "user" | "assistant"; content: string; }
const suggestions = ["What drives this score?", "How should I negotiate?", "What data is missing?", "Explain the benchmark"];
export default function ValuationAssistant({ valuation }: { valuation: ScoreResponse }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  async function send(text = input) {
    if (!text.trim() || loading) return;
    const nextMessages: Message[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(nextMessages); setInput(""); setLoading(true);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: nextMessages, valuation }) });
      const data = await response.json();
      setMessages([...nextMessages, { role: "assistant", content: data.answer ?? data.error ?? "Unable to answer." }]);
    } finally { setLoading(false); }
  }
  return <section className="w-full max-w-2xl mx-auto border border-gray-200 p-6 space-y-3"><h3 className="text-xs font-medium text-gray-900 uppercase">Valuation assistant</h3><div className="max-h-72 overflow-y-auto space-y-2">{messages.length === 0 && <div className="grid grid-cols-2 gap-2">{suggestions.map((s) => <button key={s} onClick={() => void send(s)} className="border border-gray-300 p-2 text-xs text-left">{s}</button>)}</div>}{messages.map((m, i) => <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}><p className={`max-w-[85%] rounded px-3 py-2 text-sm ${m.role === "user" ? "bg-black text-white" : "bg-gray-100 border border-gray-200 text-gray-900"}`}>{m.content}</p></div>)}{loading && <p className="text-sm text-gray-400 animate-pulse">Thinking…</p>}</div><div className="flex gap-2"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} placeholder="Ask about the score, evidence, or negotiation" className="flex-1 border border-gray-300 p-2 text-sm" /><button onClick={() => void send()} disabled={loading} className="bg-black text-white px-4 text-sm">Send</button></div></section>;
}
