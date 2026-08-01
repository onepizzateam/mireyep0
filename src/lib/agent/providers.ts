import { mcpResource, mcpTool } from "./mcp";
import type { Capability, Evidence, EvidenceProvider, EvidenceRequest, Location } from "./evidence";
import { fetchFederalLayers } from "./federal";
import { fetchFccAsrStructures } from "./fccAsr";
import { fetchFccUlsLicenses } from "./fccUls";

const now = () => new Date().toISOString();
const unwrap = (v: any): any => v?.structuredContent ?? v?.data ?? v?.content ?? v;
const fields = (v: any) => unwrap(v)?.fields ?? unwrap(v)?.data ?? unwrap(v) ?? {};

let catalogPromise: Promise<{ fields: any[]; presets: any }> | undefined;
const evidenceCache = new Map<string, { expires: number; value: Evidence[] }>();
const EVIDENCE_TTL_MS = Number(process.env.SIGNALRENT_EVIDENCE_CACHE_TTL_MS ?? 86_400_000);
async function catalog() {
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

export const fccAsrProvider: EvidenceProvider = {
  metadata: () => ({ id: "fcc-asr", name: "FCC ASR", version: "1" }),
  discoverCapabilities: async () => [{ id: "fcc-asr-structures", label: "FCC antenna structures", description: "Registered structures near the site", categories: ["telecom", "competition"], concepts: ["tower", "antenna", "structure", "competition"] }],
  supports: async (request) => /tower|antenna|structure|competition|co.?loc/i.test(request.concept),
  collectEvidence: async (location) => { const r = await fetchFccAsrStructures(location.lat, location.lng, 2); const n = r.nearestStructure; return [{ id: `fcc-asr:${location.lat}:${location.lng}`, provider: "fcc-asr", category: "competition", summary: r.error ?? `${r.structures.length} registered structures within 2km`, confidence: r.error ? .1 : .9, importance: "high", provenance: { source: "FCC ASR", retrievedAt: now() }, timestamp: now(), rawData: r, derivedFacts: [`fcc_asr_structure_count: ${r.structures.length}`, ...(n ? [`nearest_asr_structure_type: ${n.structureType}`] : [])], citations: [{ source: "FCC ASR", url: "https://wireless2.fcc.gov/UlsApp/AsrSearch/", retrievedAt: now() }] }]; },
  health: async () => true,
};

export const fccUlsProvider: EvidenceProvider = {
  metadata: () => ({ id: "fcc-uls", name: "FCC ULS", version: "1" }),
  discoverCapabilities: async () => [{ id: "fcc-uls-licenses", label: "FCC ULS licenses", description: "Active wireless licenses near the site", categories: ["telecom", "competition"], concepts: ["carrier", "license", "spectrum", "competition"] }],
  supports: async (request) => /carrier|license|spectrum|competition/i.test(request.concept),
  collectEvidence: async (location) => { const r = await fetchFccUlsLicenses(location.lat, location.lng, 1); return [{ id: `fcc-uls:${location.lat}:${location.lng}`, provider: "fcc-uls", category: "competition", summary: r.error ?? `${r.carrierNames.length} licensed carriers found`, confidence: r.error ? .1 : .8, importance: "medium", provenance: { source: "FCC ULS", retrievedAt: now() }, timestamp: now(), rawData: r, derivedFacts: r.carrierNames.map((name) => `fcc_uls_carrier: ${name}`), citations: [{ source: "FCC ULS", url: "https://data.fcc.gov/api/license-view/basicSearch/getLicenses", retrievedAt: now() }] }]; },
  health: async () => true,
};
