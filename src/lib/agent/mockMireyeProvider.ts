import type { Evidence, EvidenceProvider, Location } from "./evidence";
import { MIREYE_FIELDS } from "@/constants/fields";
import { MOCK_MIREYE_FIELDS } from "./mockMireye";

const now = () => new Date().toISOString();
export const mockMireyeProvider: EvidenceProvider = {
  metadata: () => ({ id: "mireye", name: "Mireye (MOCK)", version: "mock-willis-tower" }),
  discoverCapabilities: async () => MIREYE_FIELDS.map((field) => ({ id: field, label: field, description: `Mock field: ${field}`, categories: ["unknown"], concepts: field.toLowerCase().split("_").filter(Boolean) })),
  supports: async (request) => MIREYE_FIELDS.includes(request.concept as typeof MIREYE_FIELDS[number]),
  collectEvidence: async (_location: Location, requests) => {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return requests.map((request): Evidence => { const fieldName = request.concept as keyof typeof MOCK_MIREYE_FIELDS; const value = MOCK_MIREYE_FIELDS[fieldName] ?? null; return { id: `mireye:${fieldName}`, provider: "mireye", category: "unknown", summary: `${fieldName}: ${String(value)}`, confidence: value === null ? .1 : .8, importance: "medium", provenance: { source: "Mireye MCP (MOCK — Willis Tower Chicago)", retrievedAt: now() }, timestamp: now(), rawData: value, derivedFacts: [fieldName] }; });
  },
  health: async () => true,
};
