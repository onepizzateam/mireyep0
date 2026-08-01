import { NextRequest, NextResponse } from "next/server";
import type { ScoreResponse } from "@/lib/types";
import { catalog } from "@/lib/agent/providers";
import { mcpTool } from "@/lib/agent/mcp";

interface ChatMessage { role: "user" | "assistant"; content: string; }

function buildSystemContext(v: ScoreResponse): string {
  const rawSection = v.rawFields && Object.keys(v.rawFields).length > 0
    ? `\nALL FETCHED FIELD VALUES:\n${Object.entries(v.rawFields).map(([key, value]) => `- ${key}: ${String(value)}`).join("\n")}\n`
    : "";
  const height = v.rawFields?.primary_building_height_m;
  const heightNote = height != null && Number(height) > 50
    ? `\nNOTE: Building height of ${height}m is a significant factor — this tall rooftop has superior signal propagation range, and carriers pay a premium because ground-level alternatives cannot replicate the coverage radius.\n`
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
${rawSection}${heightNote}
INSTRUCTIONS: Write plain prose only — no markdown headers, bullets, or bold. Maximum 4 sentences for simple questions, 6–8 for complex ones. Never use the word "dimension"; say "component" or name it directly. When referencing the site score say "${v.score.baseline.toFixed(0)}/100". Answer field-specific questions directly from the ALL FETCHED FIELD VALUES section above. All field values are pre-loaded; do not say you looked anything up. If a field is genuinely not in that section, say it was not available for this site and suggest a professional site survey.`;
}

async function fetchQuestionFields(question: string, valuation: ScoreResponse): Promise<Record<string, unknown>> {
  const { fields } = await catalog();
  const catalogue = fields.map((field: any) => `${field.name ?? field.field}: ${field.description ?? ""}`).join("\n");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !Number.isFinite(Number((valuation as any).lat)) || !Number.isFinite(Number((valuation as any).lng))) return {};
  const selection = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `Return only JSON: {"fields":["field_name"]}. Select only catalogue fields needed to answer this question. Question: ${question}\nCatalogue:\n${catalogue}` }] }], generationConfig: { temperature: 0, maxOutputTokens: 300 } }),
  });
  if (!selection.ok) return {};
  const payload = await selection.json();
  const text = payload.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "{}";
  let requested: string[] = [];
  try { requested = JSON.parse(text.replace(/```json|```/g, "").trim()).fields ?? []; } catch { return {}; }
  const known = new Set(fields.map((field: any) => String(field.name ?? field.field)));
  const missing = requested.filter((field) => known.has(field) && (valuation.rawFields as any)?.[field] == null).slice(0, 5);
  if (!missing.length) return {};
  const result = await mcpTool("mireye_fetch", { lat: Number((valuation as any).lat), lng: Number((valuation as any).lng), fields: missing }) as any;
  const data = result?.fields ?? result?.data ?? result ?? {};
  return Object.fromEntries(Object.entries(data).map(([field, value]: [string, any]) => [field, value?.value ?? value]));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { messages?: ChatMessage[]; valuation?: ScoreResponse } | null;
  if (!body || !Array.isArray(body.messages) || !body.messages.length || body.messages.some((message) => !message || (message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") || body.messages.at(-1)?.role !== "user" || !body.valuation) return NextResponse.json({ ok: false, error: "messages and valuation are required" }, { status: 400 });
  const valuation = body.valuation;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "Assistant unavailable" }, { status: 503 });
  const latestQuestion = body.messages.at(-1)?.content ?? "";
  let questionFields: Record<string, unknown> = {};
  try { questionFields = await fetchQuestionFields(latestQuestion, valuation); } catch (error) { console.warn("[assistant] targeted Mireye lookup skipped", error instanceof Error ? error.message : String(error)); }
  const targetedContext = Object.keys(questionFields).length ? `\nTARGETED MIREYE LOOKUP FOR THIS QUESTION:\n${JSON.stringify(questionFields)}` : "";
  const contents = [{ role: "user", parts: [{ text: `Use this valuation context as authoritative context:\n${buildSystemContext(valuation)}${targetedContext}\nIf targeted data is present, use it as the freshest field evidence and explain its relevance.` }] }, { role: "model", parts: [{ text: "Understood. I will answer using the valuation and any targeted field evidence." }] }, ...body.messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] }))];
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents, generationConfig: { temperature: 0.4, maxOutputTokens: 800 } }) });
  if (!response.ok) return NextResponse.json({ ok: false, error: "Assistant unavailable" }, { status: 502 });
  const data = await response.json();
  return NextResponse.json({ ok: true, answer: data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "Unable to answer." });
}
