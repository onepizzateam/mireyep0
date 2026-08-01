import { NextResponse } from "next/server";
import { beginMcpUsage, mcpTool } from "@/lib/agent/mcp";

const SMOKE_LAT = 41.8789;
const SMOKE_LNG = -87.6359;
const SMOKE_ADDRESS = "233 S Wacker Dr, Chicago, IL 60606";
export interface SmokeCheck { name: string; passed: boolean; ms: number; detail: string; error?: string; }
export interface SmokeResult { ok: boolean; checks: SmokeCheck[]; totalMs: number; timestamp: string; }

export async function GET(): Promise<NextResponse> {
  const start = Date.now();
  const checks: SmokeCheck[] = [];
  const t = Date.now();
  const finish = beginMcpUsage();
  try {
    const result = await mcpTool("mireye_lookup", { input: SMOKE_ADDRESS }) as any;
    finish();
    const unwrapped = result?.structuredContent ?? result?.data ?? result?.content ?? result;
    const resolved = unwrapped?.location ?? unwrapped;
    const disposition = unwrapped?.disposition ?? unwrapped?.location?.disposition ?? "unknown";
    const hasCoords = typeof resolved?.lat === "number" && typeof resolved?.lng === "number";
    checks.push({ name: "Mireye MCP — session + lookup", passed: disposition !== "no_match" && hasCoords, ms: Date.now() - t, detail: hasCoords ? `Resolved to (${resolved.lat}, ${resolved.lng}) — disposition: ${disposition}` : `Disposition: ${disposition} — no coords returned` });
  } catch (e) { finish(); checks.push({ name: "Mireye MCP — session + lookup", passed: false, ms: Date.now() - t, detail: "MCP session or lookup failed", error: e instanceof Error ? e.message : String(e) }); }
  const cellStart = Date.now();
  const key = process.env.OPENCELLID_API_KEY;
  if (!key) checks.push({ name: "OpenCellID — Willis Tower Chicago", passed: false, ms: 0, detail: "OPENCELLID_API_KEY not configured", error: "env var missing" });
  else {
    try {
      const bbox = `${SMOKE_LAT - 0.0045},${SMOKE_LNG - 0.0045},${SMOKE_LAT + 0.0045},${SMOKE_LNG + 0.0045}`;
      const response = await fetch(`https://opencellid.org/cell/getInArea?key=${encodeURIComponent(key)}&BBOX=${encodeURIComponent(bbox)}&limit=50&offset=0&format=json`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const data = await response.json() as { cells?: unknown[] };
      checks.push({ name: "OpenCellID — Willis Tower Chicago", passed: true, ms: Date.now() - cellStart, detail: `${data.cells?.length ?? 0} cells returned for (${SMOKE_LAT}, ${SMOKE_LNG})` });
    } catch (e) { checks.push({ name: "OpenCellID — Willis Tower Chicago", passed: false, ms: Date.now() - cellStart, detail: "OpenCellID fetch failed", error: e instanceof Error ? e.message : String(e) }); }
  }
  return NextResponse.json({ ok: checks.every((check) => check.passed), checks, totalMs: Date.now() - start, timestamp: new Date().toISOString() } satisfies SmokeResult);
}
