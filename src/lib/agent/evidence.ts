export type EvidenceCategory = "population" | "coverage" | "hazard" | "market" | "parcel" | "infrastructure" | "environment" | "telecom" | "utilities" | "demographics" | "transportation" | "regulatory" | "terrain" | "competition" | "unknown";

export interface Evidence {
  id: string;
  provider: string;
  category: EvidenceCategory | EvidenceCategory[];
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
  addEvidence(...items: Evidence[]) { this.evidence.push(...items.map((item) => ({ ...item, category: this.semanticCategories(item) }))); }
  addCapabilities(items: Capability[]) { for (const item of items) this.capabilities.set(item.id, item); }
  query(predicate: (item: Evidence) => boolean) { return this.evidence.filter(predicate); }
  findByCategory(category: EvidenceCategory) { return this.query((item) => Array.isArray(item.category) && item.category.includes(category)); }
  findByProvider(provider: string) { return this.query((item) => item.provider === provider); }
  findRelated(concept: string) { const q = concept.toLowerCase(); return this.evidence.filter((e) => `${e.summary} ${(e.derivedFacts ?? []).join(" ")}`.toLowerCase().includes(q)); }
  getSupportingEvidence() { return this.evidence.filter((e) => e.confidence >= .65); }
  getContradictions() { return this.evidence.filter((e) => e.confidence < .4); }
  all() { return [...this.evidence]; }
  size() { return this.evidence.length; }
  async providersFor(request: EvidenceRequest) { return (await Promise.all(this.providerList().map(async (provider) => (await provider.supports(request)) ? provider : null))).filter((provider): provider is EvidenceProvider => Boolean(provider)); }
  getCapabilities() { return [...this.capabilities.values()]; }
  providerList() { return [...this.providers.values()]; }
  private semanticCategories(item: Evidence): EvidenceCategory[] {
    const text = `${item.summary} ${(item.derivedFacts ?? []).join(" ")} ${item.provenance.source}`.toLowerCase();
    const categories: EvidenceCategory[] = Array.isArray(item.category) ? item.category : [item.category];
    const rules: Array<[EvidenceCategory, RegExp]> = [["population", /population|housing|density|demographic/], ["coverage", /coverage|signal|cell/], ["telecom", /carrier|tower|antenna|telecom/], ["competition", /competition|competitor|co.?location/], ["hazard", /hazard|flood|fire|seismic|landslide/], ["terrain", /terrain|slope|elevation|topograph/], ["environment", /wetland|wildlife|protected|environment/], ["utilities", /utility|electric|fiber|water|sewer/], ["transportation", /road|access|distance|transport/], ["regulatory", /permit|zoning|regulatory|faa|fcc/], ["market", /market|value|rent|price/], ["parcel", /parcel|property|land/], ["infrastructure", /infrastructure|facility|building/]];
    for (const [category, pattern] of rules) if (pattern.test(text)) categories.push(category);
    return [...new Set(categories.filter((category) => category !== "unknown"))] as EvidenceCategory[];
  }
}

export async function discover(registry: EvidenceRegistry) {
  const results = await Promise.all(registry.providerList().map(async (provider) => provider.discoverCapabilities().catch(() => [])));
  results.flat().forEach((capability) => registry.addCapabilities([capability]));
  return registry.getCapabilities();
}
