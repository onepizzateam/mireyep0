export type EvidenceCategory = "parcel" | "market" | "infrastructure" | "hazard" | "population" | "utilities" | "access" | "coverage" | "unknown";

export interface Evidence {
  id: string;
  provider: string;
  category: EvidenceCategory;
  summary: string;
  confidence: number;
  importance: "high" | "medium" | "low";
  provenance: { source: string; uri?: string; retrievedAt: string };
  timestamp: string;
  rawData?: unknown;
  derivedFacts?: string[];
  citations?: Array<{ source: string; url: string; retrievedAt: string; claim?: string }>;
}

export interface Capability { id: string; label: string; description: string; categories: EvidenceCategory[]; concepts: string[]; }
export interface Location { lat: number; lng: number; displayAddress: string; }
export interface EvidenceRequest { concept: string; category?: EvidenceCategory; importance: "high" | "medium" | "low"; reason: string; }
export interface EvidenceProvider { metadata(): { id: string; name: string; version: string }; discoverCapabilities(): Promise<Capability[]>; supports(request: EvidenceRequest): Promise<boolean>; collectEvidence(location: Location, requests: EvidenceRequest[]): Promise<Evidence[]>; health(): Promise<boolean>; }

export class EvidenceRegistry {
  private readonly evidence: Evidence[] = [];
  private readonly providers = new Map<string, EvidenceProvider>();
  private readonly capabilities = new Map<string, Capability>();
  addProvider(provider: EvidenceProvider) { this.providers.set(provider.metadata().id, provider); }
  addEvidence(...items: Evidence[]) { this.evidence.push(...items); }
  addCapabilities(items: Capability[]) { for (const item of items) this.capabilities.set(item.id, item); }
  query(predicate: (item: Evidence) => boolean) { return this.evidence.filter(predicate); }
  findByCategory(category: EvidenceCategory) { return this.query((item) => item.category === category); }
  findByProvider(provider: string) { return this.query((item) => item.provider === provider); }
  findRelated(concept: string) { const q = concept.toLowerCase(); return this.evidence.filter((e) => `${e.summary} ${(e.derivedFacts ?? []).join(" ")}`.toLowerCase().includes(q)); }
  getSupportingEvidence() { return this.evidence.filter((e) => e.confidence >= .65); }
  getContradictions() { return this.evidence.filter((e) => e.confidence < .4); }
  all() { return [...this.evidence]; }
  size() { return this.evidence.length; }
  providersFor(request: EvidenceRequest) { return [...this.providers.values()].filter(async (p) => p.supports(request)); }
  getCapabilities() { return [...this.capabilities.values()]; }
  providerList() { return [...this.providers.values()]; }
}

export async function discover(registry: EvidenceRegistry) {
  const results = await Promise.all(registry.providerList().map(async (provider) => provider.discoverCapabilities().catch(() => [])));
  results.flat().forEach((capability) => registry.addCapabilities([capability]));
  return registry.getCapabilities();
}
