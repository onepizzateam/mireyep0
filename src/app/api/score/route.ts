import { NextRequest, NextResponse } from "next/server";
import { graph } from "@/lib/agent/graph";
import { beginMcpUsage } from "@/lib/agent/mcp";

const rateLimitMap = new Map<string, { count: number; reset: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.reset) { rateLimitMap.set(ip, { count: 1, reset: now + 60_000 }); return true; }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!checkRateLimit(ip)) return NextResponse.json({ ok: false, error: "Rate limit exceeded. Try again in a minute.", code: "RATE_LIMITED" }, { status: 429 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON body.", code: "INVALID_INPUT" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "Invalid request body.", code: "INVALID_INPUT" }, { status: 400 });
  const obj = body as Record<string, unknown>;
  if (typeof obj.address !== "string" || !obj.address.trim()) return NextResponse.json({ ok: false, error: "address is required.", code: "INVALID_INPUT" }, { status: 400 });
  const startTime = Date.now();
  const finishMcpUsage = beginMcpUsage();
  try {
    const state = await graph.invoke({ address: obj.address.trim(), lat: typeof obj.lat === "number" ? obj.lat : undefined, lng: typeof obj.lng === "number" ? obj.lng : undefined, carrier: typeof obj.carrier === "string" ? obj.carrier : undefined, offeredRate: typeof obj.offeredRate === "number" ? obj.offeredRate : undefined, buyoutAmount: typeof obj.buyoutAmount === "number" ? obj.buyoutAmount : undefined, resolvedLat: 0, resolvedLng: 0, displayAddress: "", evidence: [], capabilities: [], plannerOutput: [], executorOutput: [], evidenceQuality: null, result: null, error: null });
    console.info("[score] graph state", { keys: Object.keys(state), resultPresent: Boolean(state.result), resultKeys: state.result ? Object.keys(state.result) : [], error: state.error ?? null, evidenceCount: state.evidence?.length ?? 0 });
    const mcpUsage = finishMcpUsage();
    console.info("[score] MCP usage", mcpUsage);
    if (state.error) return NextResponse.json({ ok: false, error: state.error, code: "AGENT_ERROR" }, { status: 200 });
    const payload = { ...state.result, address: obj.address.trim(), displayAddress: state.displayAddress, lat: state.resolvedLat, lng: state.resolvedLng, carrier: typeof obj.carrier === "string" ? obj.carrier : undefined, processingMs: Date.now() - startTime, dataGaps: state.result?.score?.dataGaps ?? [], ok: true as const };
    console.info("[score] response shape", { keys: Object.keys(payload), ok: payload.ok, hasScore: Boolean(payload.score), hasBenchmark: Boolean(payload.benchmark), bodyBytes: JSON.stringify(payload).length });
    return NextResponse.json(payload, { status: 200 });
  } catch (err) { const mcpUsage = finishMcpUsage(); console.error("[SignalRent agent error]", { error: err instanceof Error ? err.message : String(err), mcpUsage }); return NextResponse.json({ ok: false, error: "Agent failed unexpectedly.", code: "UNKNOWN" }, { status: 500 }); }
}
