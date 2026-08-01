import { NextRequest, NextResponse } from "next/server";
import type { ScoreResponse } from "@/lib/types";

interface ChatMessage { role: "user" | "assistant"; content: string; }

function buildSystemContext(v: ScoreResponse): string {
  const rawSection = v.rawFields && Object.keys(v.rawFields).length > 0
    ? `\nALL FETCHED FIELD VALUES:\n${Object.entries(v.rawFields).map(([key, value]) => `- ${key}: ${String(value)}`).join("\n")}\n`
    : "";
  return `Address: ${v.displayAddress}
Site type: ${v.score.siteType}
Site score (displayed in UI): ${v.score.baseline.toFixed(1)}/100
Composite (unclamped): ${v.score.composite.toFixed(1)}
Multiplier: ${v.score.multiplier}
Dimensions: ${JSON.stringify(v.score.dimensions)}
Permitting flags: ${JSON.stringify(v.score.permittingFriction.flags)}
Benchmark range: ${JSON.stringify(v.benchmark.monthlyRange)}
Leverage summary: ${JSON.stringify(v.leverageSummary)}
Data gaps: ${JSON.stringify(v.dataGaps)}
OpenCellID: ${JSON.stringify(v.intelligence?.opencellid ? { cells: v.intelligence.opencellid.cells.length, carriers: v.intelligence.opencellid.carriersPresent } : null)}
${rawSection}
INSTRUCTIONS: Write plain prose only — no markdown headers, bullets, or bold. Maximum 4 sentences for simple questions, 6–8 for complex ones. Never use the word "dimension"; say "component" or name it directly. When referencing the site score say "${v.score.baseline.toFixed(0)}/100". Answer field-specific questions directly from the ALL FETCHED FIELD VALUES section above. All field values are pre-loaded; do not say you looked anything up. If a field is genuinely not in that section, say it was not available for this site and suggest a professional site survey.`;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { messages?: ChatMessage[]; valuation?: ScoreResponse } | null;
  if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.some((message) => !message || (message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") || body.messages.at(-1)?.role !== "user" || !body.valuation) return NextResponse.json({ ok: false, error: "messages and valuation are required" }, { status: 400 });
  const valuation = body.valuation;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "Assistant unavailable" }, { status: 503 });
  const contents = [{ role: "user", parts: [{ text: `Use this valuation context as authoritative context:\n${buildSystemContext(valuation)}` }] }, { role: "model", parts: [{ text: "Understood. I will answer questions using the provided valuation data." }] }, ...body.messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] }))];
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents, generationConfig: { temperature: 0.4, maxOutputTokens: 800 } }) });
  if (!response.ok) return NextResponse.json({ ok: false, error: "Assistant unavailable" }, { status: 502 });
  const data = await response.json();
  return NextResponse.json({ ok: true, answer: data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "Unable to answer." });
}
