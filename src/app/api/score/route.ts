import { NextRequest, NextResponse } from "next/server";
import { beginMcpUsage } from "@/lib/agent/mcp";
import { parseScoreResponse } from "@/lib/response-schema";

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
  const isMockRun = obj.address.trim().toUpperCase() === "NO BUENO";
  if (isMockRun) process.env.SIGNALRENT_MOCK_MIREYE = "true";
  try {
    const { graph } = await import("@/lib/agent/graph");
    const state = await graph.invoke({ address: obj.address.trim(), lat: typeof obj.lat === "number" ? obj.lat : undefined, lng: typeof obj.lng === "number" ? obj.lng : undefined, carrier: typeof obj.carrier === "string" ? obj.carrier : undefined, offeredRate: typeof obj.offeredRate === "number" ? obj.offeredRate : undefined, buyoutAmount: typeof obj.buyoutAmount === "number" ? obj.buyoutAmount : undefined, resolvedLat: 0, resolvedLng: 0, displayAddress: "", evidence: [], capabilities: [], plannerOutput: [], executorOutput: [], evidenceQuality: null, result: null, error: null, geocodeWarning: null });
    finishMcpUsage();
    if (state.error) return NextResponse.json({ ok: false, error: state.error, code: "AGENT_ERROR" }, { status: 200 });
    const payload = { ...state.result, address: obj.address.trim(), displayAddress: state.displayAddress, lat: state.resolvedLat, lng: state.resolvedLng, carrier: typeof obj.carrier === "string" ? obj.carrier : undefined, geocodeWarning: state.geocodeWarning, processingMs: Date.now() - startTime, ok: true as const };
    const responseValidation = parseScoreResponse(payload);
    if (!responseValidation.success) return NextResponse.json({ ok: false, error: "Agent returned an invalid valuation response.", code: "AGENT_CONTRACT" }, { status: 500 });
    return NextResponse.json(payload, { status: 200 });
  } catch (err) { const mcpUsage = finishMcpUsage(); console.error("[SignalRent agent error]", { error: err instanceof Error ? err.message : String(err), mcpUsage }); return NextResponse.json({ ok: false, error: "Agent failed unexpectedly.", code: "UNKNOWN" }, { status: 500 }); }
  finally { if (isMockRun) process.env.SIGNALRENT_MOCK_MIREYE = "false"; }
}
