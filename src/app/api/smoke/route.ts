import { NextResponse } from "next/server";

const SMOKE_LAT = 41.8789;
const SMOKE_LNG = -87.6359;
const SMOKE_ADDRESS = "NO BUENO";

export interface SmokeCheck { name: string; passed: boolean; ms: number; detail: string; error?: string; }
export interface SmokeResult { ok: boolean; checks: SmokeCheck[]; totalMs: number; timestamp: string; }

export async function GET(): Promise<NextResponse> {
  const start = Date.now();
  const checks: SmokeCheck[] = [];
  const lookupStart = Date.now();
  const previousMock = process.env.SIGNALRENT_MOCK_MIREYE;
  process.env.SIGNALRENT_MOCK_MIREYE = "true";
  try {
    const { graph } = await import("@/lib/agent/graph");
    const state = await graph.invoke({ address: SMOKE_ADDRESS, lat: SMOKE_LAT, lng: SMOKE_LNG, resolvedLat: 0, resolvedLng: 0, displayAddress: "", evidence: [], capabilities: [], plannerOutput: [], executorOutput: [], evidenceQuality: null, result: null, deterministicScore: null, rawFields: null, opencellData: null, towerSaturationSummary: "", error: null });
    const score = state.result?.score;
    checks.push({ name: "Agent — full run (mock Mireye)", passed: !state.error && !!score && typeof score.baseline === "number", ms: Date.now() - lookupStart, detail: score ? `baseline: ${score.baseline.toFixed(1)}, composite: ${score.composite.toFixed(1)}, siteType: ${score.siteType}, multiplier: ${score.multiplier.toFixed(2)}×` : "score missing from result", error: state.error ?? undefined });
  } catch (e) {
    checks.push({ name: "Agent — full run (mock Mireye)", passed: false, ms: Date.now() - lookupStart, detail: "Graph threw", error: e instanceof Error ? e.message : String(e) });
  } finally {
    if (previousMock === undefined) delete process.env.SIGNALRENT_MOCK_MIREYE;
    else process.env.SIGNALRENT_MOCK_MIREYE = previousMock;
  }
  const cellStart = Date.now();
  const key = process.env.OPENCELLID_API_KEY;
  if (!key) checks.push({ name: "OpenCellID — Willis Tower Chicago", passed: false, ms: 0, detail: "OPENCELLID_API_KEY not configured", error: "env var missing" });
  else {
    try {
      const bbox = `${SMOKE_LAT - 0.0045},${SMOKE_LNG - 0.0045},${SMOKE_LAT + 0.0045},${SMOKE_LNG + 0.0045}`;
      const url = `https://opencellid.org/cell/getInArea?key=${encodeURIComponent(key)}&BBOX=${encodeURIComponent(bbox)}&limit=50&offset=0&format=json`;
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const data = await response.json() as { cells?: unknown[] };
      checks.push({ name: "OpenCellID — Willis Tower Chicago", passed: true, ms: Date.now() - cellStart, detail: `${data.cells?.length ?? 0} cells returned for (${SMOKE_LAT}, ${SMOKE_LNG})` });
    } catch (e) { checks.push({ name: "OpenCellID — Willis Tower Chicago", passed: false, ms: Date.now() - cellStart, detail: "OpenCellID fetch failed", error: e instanceof Error ? e.message : String(e) }); }
  }
  return NextResponse.json({ ok: checks.every((check) => check.passed), checks, totalMs: Date.now() - start, timestamp: new Date().toISOString() } satisfies SmokeResult);
}
