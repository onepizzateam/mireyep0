import { mcpResource, mcpTool } from "./mcp";
import type { Capability, Evidence, EvidenceProvider, EvidenceRequest, Location } from "./evidence";
import { fetchFederalLayers } from "./federal";

const now = () => new Date().toISOString();
const unwrap = (v: any): any => v?.structuredContent ?? v?.data ?? v?.content ?? v;
const fields = (v: any) => unwrap(v)?.fields ?? unwrap(v)?.data ?? unwrap(v) ?? {};

let catalogPromise: Promise<{ fields: any[]; presets: any }> | undefined;
const evidenceCache = new Map<string, { expires: number; value: Evidence[] }>();
const EVIDENCE_TTL_MS = Number(process.env.SIGNALRENT_EVIDENCE_CACHE_TTL_MS ?? 86_400_000);
export async function catalog() {
  if (!catalogPromise) catalogPromise = Promise.all([mcpResource("mireye://catalog/fields"), mcpResource("mireye://catalog/presets")]).then(([f, p]) => {
    const raw = unwrap(f); const list = Array.isArray(raw) ? raw : raw?.fields ?? Object.entries(raw ?? {}).map(([name, value]) => ({ name, ...(value as object) }));
    return { fields: list, presets: unwrap(p) };
  });
  return catalogPromise;
}
function nearestCapability(items: any[], concept: string) { const words = concept.toLowerCase().split(/\s+/); return items.map((item) => ({ item, score: words.reduce((n, w) => n + (JSON.stringify(item).toLowerCase().includes(w) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score).find((x) => x.score > 0)?.item; }
function resolveCatalogField(items: any[], concept: string) {
  const exact = items.find((item) => String(item.name ?? item.field) === concept);
  return exact ?? nearestCapability(items, concept);
}

export const mireyeProvider: EvidenceProvider = {
  metadata: () => ({ id: "mireye", name: "Mireye", version: "catalog-driven" }),
  discoverCapabilities: async () => { const c = await catalog(); return c.fields.map((f: any, i: number) => ({ id: String(f.name ?? f.field ?? i), label: String(f.name ?? f.field ?? i), description: String(f.description ?? ""), categories: ["unknown"], concepts: String(f.description ?? f.name ?? f.field ?? "").toLowerCase().split(/[^a-z]+/).filter(Boolean) })); },
  supports: async (request) => Boolean(resolveCatalogField((await catalog()).fields, request.concept)),
  collectEvidence: async (location, requests) => { const c = await catalog(); const selected = requests.map((r) => resolveCatalogField(c.fields, r.concept)).filter(Boolean).map((x: any) => String(x.name ?? x.field)); const key = `${location.lat.toFixed(5)}:${location.lng.toFixed(5)}:${selected.sort().join(",")}`; const cached = evidenceCache.get(key); if (cached && cached.expires > Date.now()) return cached.value; const chunks = Array.from({ length: Math.ceil(selected.length / 50) }, (_, i) => selected.slice(i * 50, i * 50 + 50)); const results = await Promise.all(chunks.map((chunk) => mcpTool("mireye_fetch", { lat: location.lat, lng: location.lng, fields: chunk }))); const data = Object.assign({}, ...results.map(fields)); const value: Evidence[] = Object.entries(data).map(([key, value]) => ({ id: `mireye:${key}`, provider: "mireye", category: "unknown", summary: `${key}: ${String((value as any)?.value ?? value)}`, confidence: value == null ? .1 : .8, importance: "medium", provenance: { source: "Mireye MCP", retrievedAt: now() }, timestamp: now(), rawData: value, derivedFacts: [key] })); evidenceCache.set(key, { expires: Date.now() + EVIDENCE_TTL_MS, value }); return value; },
  health: async () => true,
};

export const openCellIdProvider: EvidenceProvider = {
  metadata: () => ({ id: "opencellid", name: "OpenCelliD", version: "1" }),
  discoverCapabilities: async () => [{ id: "cellular-infrastructure", label: "Cellular infrastructure", description: "Nearby cells, carriers, and signal samples", categories: ["coverage", "infrastructure"], concepts: ["tower", "carrier", "coverage", "cell"] }],
  supports: async (request) => /tower|carrier|coverage|cell|competition/i.test(request.concept),
  collectEvidence: async (location) => { const layer = await fetchFederalLayers(location.lat, location.lng); const data = layer.opencellid; return [{ id: `opencellid:${location.lat}:${location.lng}`, provider: "opencellid", category: "infrastructure", summary: `${data.cells.length} nearby cells from ${data.carriersPresent.length} carriers`, confidence: data.error ? .2 : .75, importance: "high", provenance: { source: "OpenCelliD", retrievedAt: now() }, timestamp: now(), rawData: data, derivedFacts: [`${data.cells.length} nearby cells`, `${data.carriersPresent.length} carriers present`], citations: data.citations }]; },
  health: async () => Boolean(process.env.OPENCELLID_API_KEY),
};
