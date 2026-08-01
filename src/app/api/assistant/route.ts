import { NextRequest, NextResponse } from "next/server";
import type { ScoreResponse } from "@/lib/types";
interface ChatMessage { role: "user" | "assistant"; content: string; }
function buildSystemContext(v: ScoreResponse) { return `Address: ${v.displayAddress}; site type: ${v.score.siteType}; final score: ${v.score.final}; baseline: ${v.score.baseline}; multiplier: ${v.score.multiplier}; composite: ${v.score.composite}; dimensions: ${JSON.stringify(v.score.dimensions)}; permitting flags: ${JSON.stringify(v.score.permittingFriction.flags)}; benchmark range: ${JSON.stringify(v.benchmark.monthlyRange)}; leverage summary: ${JSON.stringify(v.leverageSummary)}; data gaps: ${JSON.stringify(v.dataGaps)}; OpenCellID: ${JSON.stringify(v.intelligence?.opencellid ? { cells: v.intelligence.opencellid.cells.length, carriers: v.intelligence.opencellid.carriersPresent } : undefined)}`; }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { messages?: ChatMessage[]; valuation?: ScoreResponse } | null;
  if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.some((m) => !m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") || body.messages.at(-1)?.role !== "user" || !body.valuation) return NextResponse.json({ ok: false, error: "messages and valuation are required" }, { status: 400 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "Assistant unavailable" }, { status: 503 });
  const contents = [{ role: "user", parts: [{ text: `Use this valuation context as authoritative context:\n${buildSystemContext(body.valuation)}` }] }, { role: "model", parts: [{ text: "Understood. I will answer using the provided valuation context." }] }, ...body.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))];
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents, generationConfig: { temperature: 0.4, maxOutputTokens: 512 } }) });
  if (!response.ok) return NextResponse.json({ ok: false, error: "Assistant unavailable" }, { status: 502 });
  const data = await response.json();
  return NextResponse.json({ ok: true, answer: data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "Unable to answer." });
}
