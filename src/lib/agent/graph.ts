import { Annotation, StateGraph } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { mcpTool } from "./mcp";
import {
  EvidenceRegistry,
  discover,
  type EvidenceCategory,
  type Evidence,
  type EvidenceRequest,
  type Location,
} from "./evidence";
import { mireyeProvider, openCellIdProvider, catalog } from "./providers";
import { mockMireyeProvider } from "./mockMireyeProvider";
import { MOCK_LOCATION } from "./mockMireye";
import { computeTowerSaturation, saturationLeverageSentence } from "@/lib/towerSaturation";
import { MIREYE_FIELDS, MIREYE_FIELD_SET } from "@/constants/fields";
import type { ScoreResponse, IntelligenceLayers, MireyeFields, SiteScore } from "@/lib/types";
import { computeSiteScore } from "@/lib/score";
import {
  normalizeScoreResponse,
  parseReasoningResponse,
  REASONING_CONTRACT,
} from "@/lib/response-schema";

export const SignalRentState = Annotation.Root({
  address: Annotation<string>(),
  lat: Annotation<number | undefined>(),
  lng: Annotation<number | undefined>(),
  carrier: Annotation<string | undefined>(),
  offeredRate: Annotation<number | undefined>(),
  buyoutAmount: Annotation<number | undefined>(),
  resolvedLat: Annotation<number>(),
  resolvedLng: Annotation<number>(),
  displayAddress: Annotation<string>(),
  evidence: Annotation<any[]>({
    reducer: (a, b) => [...(a ?? []), ...(b ?? [])],
    default: () => [],
  }),
  capabilities: Annotation<any[]>(),
  plannerOutput: Annotation<EvidenceRequest[]>(),
  plannerRationale: Annotation<string>({ value: (_prev, next) => next, default: () => "" }),
  hypotheses: Annotation<Array<{ id: string; claim: string; fieldsToTest: string[]; implication: string; verdict?: string }>>({ value: (_prev, next) => next, default: () => [] }),
  executorOutput: Annotation<string[]>(),
  evidenceQuality: Annotation<{
    enough: boolean;
    confidence: number;
    missing: string[];
  } | null>(),
  gapFillResults: Annotation<Array<{ field: string; question: string; answer: string; filled: boolean }>>({ value: (_prev, next) => next, default: () => [] }),
  result: Annotation<ScoreResponse | null>(),
  deterministicScore: Annotation<SiteScore | null>({ value: (_prev, next) => next, default: () => null }),
  rawFields: Annotation<MireyeFields | null>({ value: (_prev, next) => next, default: () => null }),
  opencellData: Annotation<any>({ value: (_prev, next) => next, default: () => null }),
  towerSaturationSummary: Annotation<string>({ value: (_prev, next) => next, default: () => "" }),
  error: Annotation<string | null>(),
  geocodeWarning: Annotation<string | null>({ value: (_prev, next) => next, default: () => null }),
});
type State = typeof SignalRentState.State;
const registry = new EvidenceRegistry();
const useMock = process.env.SIGNALRENT_MOCK_MIREYE === "true";
registry.addProvider(useMock ? mockMireyeProvider : mireyeProvider);
registry.addProvider(openCellIdProvider);
const unwrap = (v: any) => v?.structuredContent ?? v?.data ?? v?.content ?? v;
const NOTABLE_ADDRESS_FACTS: Array<{ pattern: RegExp; facts: string[]; category: EvidenceCategory }> = [
  {
    pattern: /1600\s+pennsylvania\s+ave/i,
    facts: [
      "This is the address of the White House, the official residence and workplace of the President of the United States.",
      "The site is within a National Security Area with extreme FAA airspace restrictions (P-56A/B prohibited airspace).",
      "The surrounding area is managed by the National Park Service (President's Park).",
      "New tower construction within or adjacent to this site is functionally impossible due to federal security mandates.",
      "The site sits within one of the most heavily regulated telecommunications zones in the United States.",
      "Any lease agreement here would involve federal agency review and potentially national security clearance.",
    ],
    category: "regulatory",
  },
];

async function resolveNode(state: State) {
  if (process.env.SIGNALRENT_MOCK_MIREYE === "true") {
    return { resolvedLat: MOCK_LOCATION.lat, resolvedLng: MOCK_LOCATION.lng, displayAddress: MOCK_LOCATION.displayAddress };
  }

  // If the frontend already resolved coordinates via Mapbox, use them directly.
  // mireye_lookup is NOT used for geocoding — only for field data fetching downstream.
  if (state.lat !== undefined && state.lng !== undefined) {
    return {
      resolvedLat: state.lat,
      resolvedLng: state.lng,
      displayAddress: state.address,
      geocodeWarning: null,
    };
  }

  // Fallback: no coords provided — return a clear error rather than calling mireye_lookup
  return {
    error: "No coordinates provided. Please select an address from the search suggestions or drop a pin on the map.",
  };
}
async function enrichLocationNode(state: State) {
  const entry = NOTABLE_ADDRESS_FACTS.find((candidate) => candidate.pattern.test(state.displayAddress));
  if (!entry) return { evidence: [] };
  const evidence: Evidence = {
    id: `location-context:${state.resolvedLat}:${state.resolvedLng}`,
    provider: "location-context",
    category: entry.category,
    summary: `Notable address context: ${entry.facts[0]}`,
    confidence: 1,
    importance: "high",
    provenance: { source: "SignalRent location enrichment", retrievedAt: new Date().toISOString() },
    timestamp: new Date().toISOString(), rawData: null, derivedFacts: entry.facts, citations: [],
  };
  return { evidence: [evidence] };
}
async function discoverNode() {
  const capabilities = await discover(registry);
  return { capabilities };
}
async function plannerNode(state: State) {
  const { fields: catalogFields } = await catalog();
  const catalogSummary = catalogFields.map((f: any) => `${f.name ?? f.field}: ${f.description ?? ""}`).join("\n");
  const model = new ChatGoogleGenerativeAI({ model: "gemini-3.1-flash-lite", temperature: 0.2, apiKey: process.env.GEMINI_API_KEY });
  const systemPrompt = `You are the planning agent for SignalRent, a cell tower lease valuation tool.
Select Mireye fields for THIS site and generate 3–5 specific, testable hypotheses about value or risk.
Use the live catalogue below. Consider site type, geography, climate, urban/rural context, and carrier context.
Always include the full antenna/competition set and subscriber-density fields. Prioritise slope/landslide/bedrock in high-slope regions, flood/humidity near coasts, tornado frequency in tornado-prone states, and seismic fields in earthquake zones.
Return ONLY valid JSON, with exactly: selectedFields (field names), rationale (one sentence), and hypotheses (id, claim, fieldsToTest, implication).`;
  const message = await model.invoke([new SystemMessage(systemPrompt), new HumanMessage(`Site address: ${state.displayAddress} (${state.resolvedLat}, ${state.resolvedLng})\nCarrier: ${state.carrier ?? "unknown"}\nOffered rate: ${state.offeredRate ?? "not provided"}\n\nAvailable Mireye fields:\n${catalogSummary}`)]);
  let plannerResult: { selectedFields: string[]; rationale: string; hypotheses: Array<{ id: string; claim: string; fieldsToTest: string[]; implication: string }> };
  try {
    const text = Array.isArray(message.content) ? message.content.map((p: any) => p?.text ?? String(p)).join("") : String(message.content);
    plannerResult = JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    plannerResult = { selectedFields: [...MIREYE_FIELDS], rationale: "Fallback: planner JSON parse failed, fetching all fields.", hypotheses: [] };
  }
  const criticalFields = ["antenna_structures_within_500m_count", "antenna_structures_within_2km_count", "nearest_antenna_structure_distance_m", "nearest_antenna_structure_type", "mobile_5g_coverage_class", "housing_units_within_1km", "housing_units_density_per_km2", "poi_count_1km", "nearest_urban_area_distance_m", "primary_building_height_m"];
  const finalFields = Array.from(new Set([...criticalFields, ...(plannerResult.selectedFields ?? [])])).filter((f) => MIREYE_FIELD_SET.has(f as any));
  const plannerOutput: EvidenceRequest[] = finalFields.map((field) => ({
    concept: field,
    category: field.includes("tower") || field.includes("antenna") ? "competition" :
      field.includes("wetland") || field.includes("habitat") || field.includes("zoning") ? "regulatory" :
      field.includes("housing") || field.includes("poi") || field.includes("lodging") ? "population" :
      field.includes("slope") || field.includes("soil") || field.includes("seismic") || field.includes("flood") ? "terrain" : "infrastructure",
    importance: criticalFields.includes(field) ? "high" : "medium",
    reason: plannerResult.rationale,
  }));
  return { plannerOutput, plannerRationale: plannerResult.rationale, hypotheses: plannerResult.hypotheses ?? [] };
}
async function collectNode(state: State) {
  const location: Location = {
    lat: state.resolvedLat,
    lng: state.resolvedLng,
    displayAddress: state.displayAddress,
  };
  const assignments = new Map<
    ReturnType<typeof registry.providerList>[number],
    EvidenceRequest[]
  >();
  const allAssignments = await Promise.all(
    state.plannerOutput.map(async (request) => ({ request, providers: await registry.providersFor(request) })),
  );
  for (const { request, providers } of allAssignments) {
    for (const provider of providers) {
      const requests = assignments.get(provider) ?? [];
      requests.push(request);
      assignments.set(provider, requests);
    }
  }
  const batches = await Promise.all(
    [...assignments.entries()].map(async ([provider, requests]) => {
      try {
        return await provider.collectEvidence(location, requests);
      } catch (error) {
        return [
          {
            id: `${provider.metadata().id}:error`,
            provider: provider.metadata().id,
            category: ["unknown"] as EvidenceCategory[],
            summary: `Provider unavailable: ${String(error)}`,
            confidence: 0,
            importance: "high" as const,
            provenance: {
              source: provider.metadata().name,
              retrievedAt: new Date().toISOString(),
            },
            timestamp: new Date().toISOString(),
          },
        ];
      }
    }),
  );
  const evidence = batches.flat();
  registry.addEvidence(...evidence);
  const executorOutput = [...assignments.keys()].map(
    (provider) => provider.metadata().id,
  );
  return { evidence, executorOutput };
}
async function assessEvidenceNode(state: State) {
  const evidence = registry.all();
  const confidence = evidence.length
    ? evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length
    : 0;
  const fetchedFields = new Map<string, unknown>();
  for (const item of evidence) if (item.provider === "mireye" && item.id.startsWith("mireye:")) {
    const raw = item.rawData; fetchedFields.set(item.id.slice(7), raw != null && typeof raw === "object" && "value" in raw ? (raw as any).value : raw);
  }
  const highImpact = ["nearest_antenna_structure_type", "nearest_antenna_structure_distance_m", "mobile_5g_coverage_class", "housing_units_density_per_km2", "within_floodplain_polygon", "intersects_protected_area", "parcel_zoning", "fiber_broadband_available", "primary_building_height_m", "landslide_susceptibility_index"];
  const gapFillResults: Array<{ field: string; question: string; answer: string; filled: boolean }> = [];
  if (!process.env.SIGNALRENT_MOCK_MIREYE) {
    gapFillResults.push(...await Promise.all(highImpact.filter((f) => fetchedFields.get(f) == null).slice(0, 3).map(async (field) => {
      const question = `What is the ${field.replace(/_/g, " ")} at coordinates ${state.resolvedLat}, ${state.resolvedLng}? Return only the value, no explanation.`;
      try { const result = await mcpTool("mireye_ask", { lat: state.resolvedLat, lng: state.resolvedLng, question }); const answer = String((result as any)?.answer ?? (result as any)?.value ?? result ?? "").trim();
        if (answer && answer !== "null" && answer !== "unknown") { registry.addEvidence({ id: `mireye-ask:${field}`, provider: "mireye", category: "unknown", summary: `${field} (gap-filled via ask): ${answer}`, confidence: .6, importance: "high", provenance: { source: "Mireye MCP ask (gap-fill)", retrievedAt: new Date().toISOString() }, timestamp: new Date().toISOString(), rawData: { value: answer }, derivedFacts: [field] }); return { field, question, answer, filled: true }; }
        return { field, question, answer: answer || "no answer", filled: false };
      } catch { return { field, question, answer: "fetch failed", filled: false }; }
    })));
  }
  const testedHypotheses = (state.hypotheses ?? []).map((h) => { const values = h.fieldsToTest.map((f) => `${f}=${fetchedFields.get(f) ?? "null"}`); return { ...h, verdict: values.every((v) => v.endsWith("=null")) ? "untestable — field data unavailable" : `Evidence: ${values.join(", ")}` }; });
  const missing = ["population", "coverage", "hazard"].filter(
    (category) =>
      !evidence.some(
        (item) =>
          Array.isArray(item.category) &&
          item.category.includes(category as any),
      ),
  );
  const quality = {
    enough: evidence.length > 0 && confidence >= 0.5 && missing.length < 3,
    confidence,
    missing,
  };
  return { evidenceQuality: quality, hypotheses: testedHypotheses, gapFillResults };
}
async function scoreNode(state: State) {
  const fieldMap: Record<string, unknown> = {};
  for (const item of state.evidence) {
    if (item.provider !== "mireye") continue;
    if (item.id.startsWith("mireye:")) {
      const raw = item.rawData;
      fieldMap[item.id.slice("mireye:".length)] = raw != null && typeof raw === "object" && "value" in raw ? (raw as { value: unknown }).value : raw;
    }
    for (const fact of item.derivedFacts ?? []) {
      const colonIdx = fact.indexOf(":");
      if (colonIdx > 0) {
        const fieldName = fact.slice(0, colonIdx).trim();
        const valueStr = fact.slice(colonIdx + 1).trim();
        if (!(fieldName in fieldMap)) fieldMap[fieldName] = Number.isNaN(Number(valueStr)) ? valueStr : Number(valueStr);
      } else if (!(fact in fieldMap)) {
        const raw = item.rawData;
        fieldMap[fact] = raw != null && typeof raw === "object" && "value" in raw ? (raw as { value: unknown }).value : raw;
      }
    }
  }
  const fields = fieldMap as unknown as MireyeFields;
  const opencellEvidence = state.evidence.find((e) => e.provider === "opencellid");
  const opencellData = opencellEvidence?.rawData as { cells: Array<Record<string, unknown>>; carriersPresent: string[]; error?: string } | undefined;
  const structureType = (fieldMap["nearest_antenna_structure_type"] as string | null) ?? null;
  const carriersPresent = opencellData?.carriersPresent ?? [];
  const saturation = computeTowerSaturation(structureType, carriersPresent);
  return { deterministicScore: computeSiteScore(fields, carriersPresent, structureType), rawFields: fields, opencellData, towerSaturationSummary: saturation ? saturationLeverageSentence(saturation) : "" };
}
export function parseModelResponse(content: unknown) {
  const text = Array.isArray(content)
    ? content
        .map((part: any) =>
          typeof part === "string" ? part : (part?.text ?? ""),
        )
        .join("\n")
    : String(content ?? "");
  const tagged = text.match(/<output>\s*([\s\S]*?)\s*<\/output>/i)?.[1];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  const candidate = tagged ?? fenced ?? text.trim();
  if (!candidate) throw new Error("Reasoner returned empty text");
  const extractReasoning = () => text.match(/<reasoning>([\s\S]*?)<\/reasoning>/i)?.[1]?.trim() ?? "";
  const validateCandidate = (value: unknown) => {
    const raw = value as any;
    const parsed = raw?.score ? raw : raw?.result?.score ? raw.result : raw?.output?.score ? raw.output : raw;
    if (!parsed.ok) parsed.ok = true;
    const normalized = normalizeScoreResponse(parsed) as Record<string, unknown>;
    const validation = parseReasoningResponse(normalized);
    if (!validation.success) throw new Error(`Reasoner returned invalid structured output: ${validation.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
    return { parsed: validation.data as unknown as Record<string, unknown>, reasoning: extractReasoning() };
  };

  try {
    const raw = JSON.parse(candidate);
    const parsed = raw?.score ? raw : raw?.result?.score ? raw.result : raw?.output?.score ? raw.output : raw;
    // Inject ok: true if missing — the model won't return it but our schema requires it
    if (!parsed.ok) parsed.ok = true;
    const normalized = normalizeScoreResponse(parsed) as Record<string, unknown>;
    const validation = parseReasoningResponse(normalized);
    if (!validation.success) {
      throw new Error(
        `Reasoner returned invalid structured output: ${validation.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
      );
    }
    return {
      parsed: validation.data as unknown as Record<string, unknown>,
      reasoning:
        text.match(/<reasoning>([\s\S]*?)<\/reasoning>/i)?.[1]?.trim() ?? "",
    };
  } catch (error) {
    const stripped = candidate.replace(/,?\s*"reasoning"\s*:\s*"[\s\S]*?(?<!\\)"(?=\s*[,}])/, "").replace(/,?\s*"reasoning"\s*:\s*"[\s\S]*$/, "").trim().replace(/,\s*$/, "") + (candidate.trimEnd().endsWith("}") ? "" : "}");
    try {
      const raw = JSON.parse(stripped);
      const result = validateCandidate(raw);
      console.warn("[reasoning] parsed after stripping reasoning field from JSON");
      return result;
    } catch {
      // Fall through to the original parser error.
    }
    console.error("[reasoning] parser result", {
      structuredJson: false,
      error: String(error),
      candidateLength: candidate.length,
    });
    throw new Error(`Reasoner returned invalid JSON: ${String(error)}`);
  }
}
async function reasonNode(state: State) {
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.1-flash-lite",
    temperature: 0.4,
    apiKey: process.env.GEMINI_API_KEY,
  });
  const hypothesisBlock = (state.hypotheses ?? []).length ? `\nHYPOTHESES:\n${state.hypotheses.map((h) => `${h.id}: "${h.claim}"\nFields: ${h.fieldsToTest.join(", ")}\nVerdict: ${h.verdict ?? "untested"}\nImplication: ${h.implication}`).join("\n\n")}` : "";
  const gapFillBlock = (state.gapFillResults ?? []).length ? `\nGAP-FILLS:\n${state.gapFillResults.map((g) => `${g.field}: ${g.filled ? `FILLED → ${g.answer}` : `NOT FILLED — ${g.answer}`}`).join("\n")}` : "";
  const prompt = `Location: ${state.displayAddress} (${state.resolvedLat}, ${state.resolvedLng})
Carrier: ${state.carrier ?? "unknown"}
Offered rate: ${state.offeredRate ?? "not provided"}
Buyout: ${state.buyoutAmount ?? "not provided"}
Planner rationale: ${state.plannerRationale ?? "not available"}${hypothesisBlock}${gapFillBlock}
DETERMINISTIC LOCKED SCORE: ${JSON.stringify(state.deterministicScore, null, 2)}
RAW MIREYE FIELDS: ${JSON.stringify(state.rawFields, null, 2)}
OPENCELLID DATA: ${JSON.stringify(state.opencellData, null, 2)}
FULL EVIDENCE REGISTRY: ${JSON.stringify(state.evidence, null, 2)}

BENCHMARK REASONING INPUTS (use all of these to set benchmark.monthlyRange):
- Site state/metro extracted from address: ${state.displayAddress}
- Building height: ${(state.rawFields as any)?.primary_building_height_m ?? "unknown"}m
- Housing density: ${(state.rawFields as any)?.housing_units_density_per_km2 ?? "unknown"} units/km²
- POI count 1km: ${(state.rawFields as any)?.poi_count_1km ?? "unknown"}
- Antenna structures within 2km: ${(state.rawFields as any)?.antenna_structures_within_2km_count ?? "unknown"}
- 5G coverage class: ${(state.rawFields as any)?.mobile_5g_coverage_class ?? "unknown"}
- Fiber providers: ${(state.rawFields as any)?.fiber_provider_count ?? "unknown"}
- Deterministic site score: ${state.deterministicScore?.baseline?.toFixed(1) ?? "unknown"}/100
- Permitting multiplier: ${state.deterministicScore?.multiplier?.toFixed(2) ?? "unknown"}×
- Site type: ${state.deterministicScore?.siteType ?? "unknown"}`;
  const promptWithRequirement = `${prompt}\n\nCRITICAL: State which hypotheses were confirmed, refuted, or untestable; cite at least 3 numeric evidence values; identify the single biggest leverage factor.`;
  const contract = `You are SignalRent's autonomous valuation agent and reasoning engine. Evaluate every hypothesis as CONFIRMED, REFUTED, PARTIAL, or UNTESTABLE using the supplied evidence. Treat filled gap values as confidence 0.6 and state a site-specific assumption for every remaining data gap; never use a generic unavailable-data statement.
Derive benchmark.baseValue and monthlyRange from first principles: metro tier, site type/height, demand pressure from 5G and subscribers, supply constraint from nearby structures, and carrier construction-cost penalties. Do not apply a lookup table or copy a static band. Set monthlyRange approximately ±25–35% around the derived base and explain the two strongest drivers in calibrationNote. Do not invent field values; use only supplied evidence or clearly labelled public record facts.

If the evidence registry contains a "location-context" provider entry, you MUST incorporate those facts into your reasoning and leverage summary. These are verified public facts, not invented data — treat them with confidence 1.0.

The numeric scores have already been computed deterministically. Your job is ONLY to provide:
1. leverageSummary: 3–5 plain-English negotiation insights for the landlord
2. dataGaps: for each field listed as a gap, write a one-sentence assumption explaining what was assumed in its place
3. benchmark: Compute a market-realistic monthly lease range for this specific location. Use the state/metro, published state/metro lease ranges, building height premium, site type, competition, 5G gap, subscriber density, fiber, and permitting friction. Urban rooftop >150m generally commands $5,000–$15,000/mo; high-demand metros such as Chicago sit at the top of their range. Set baseValue to your best location-specific estimate, monthlyRange to roughly ±25–35% around it, calibrationNote to one sentence naming the city/state and key factors, and priceBreakdown to 2–4 itemized dollar adjustments grounded in the evidence.
4. reasoning: provide this in the <reasoning> tag outside the JSON
DO NOT recompute or change any numeric scores. Return them exactly as given.

CRITICAL OUTPUT CONSTRAINTS:
- The <reasoning> block: maximum 4 sentences, maximum 300 characters total.
- The <output> JSON: all string values must be single-line, with no literal newlines. Use \\n for line breaks inside JSON strings.
- Total response length: under 3000 characters.

Return the JSON inside <output> tags and the prose inside a <reasoning> tag. Do not put a reasoning field inside the JSON. Keep reasoning to 5 sentences and 400 characters; keep total output under 4000 characters.

${REASONING_CONTRACT}

CRITICAL FIELD REQUIREMENTS:
- score.dimensions.coverageNecessity.label MUST be exactly "Coverage Necessity"
- score.dimensions.subscriberValue.label MUST be exactly "Subscriber Value"  
- score.dimensions.constructionCost.label MUST be exactly "Construction Cost"
- score.dimensions.coverageNecessity.weight MUST be 0.40
- score.dimensions.subscriberValue.weight MUST be 0.35
- score.dimensions.constructionCost.weight MUST be 0.25
- ALL score numeric fields, topFields, permitting flags, and siteType are LOCKED — copy exactly from the deterministic locked score in the input.
- score.siteType MUST be one of: "urban", "suburban", "rural"
- benchmark.scoreBand MUST be one of: "high", "mid", "low"
- benchmark.siteType MUST match score.siteType
- benchmark.priceBreakdown items MUST each have: label (string), fieldName (string), amount (number), percent (number 0-1), direction ("positive"|"negative"|"neutral")
- dataGaps items MUST each have: field (string), impact ("high"|"medium"|"low"), assumption (string)
- score.dataGaps MUST be the same array as top-level dataGaps
- leverageSummary MUST be an array of 2-5 plain-English strings
- If OpenCellID data is present and nearest_antenna_structure_type is known, mention whether the nearest tower is near capacity or has open capacity using the defined structure limits (GUYED 4, SELF_SUPPORTING 3, MONOPOLE 2, BUILDING 2, WATER_TOWER 1).

BENCHMARK GUIDANCE: Willis Tower Chicago has a 442m building, urban site, high score, and top-tier metro. Use approximately $8,000 baseValue and a $5,500-$12,000 range as calibration; do not default to static urban table values when height and metro inputs support a higher estimate.`;
  /*
 - If OpenCellID data is present and nearest_antenna_structure_type is known, mention whether the nearest tower is near capacity or has open capacity using the defined structure limits (GUYED 4, SELF_SUPPORTING 3, MONOPOLE 2, BUILDING 2, WATER_TOWER 1).

BENCHMARK GUIDANCE — Willis Tower Chicago calibration: 442m building, urban, high score, Chicago top-tier metro may support a baseValue around $8,000 and a $5,500–$12,000 range. Do not default to static urban table values when height and metro inputs support a higher estimate.`;
  */
  const message = await model.invoke([
    new SystemMessage(contract),
    new HumanMessage(promptWithRequirement),
  ]);
  let { parsed, reasoning } = parseModelResponse(message.content);
  if (!parsed.leverageSummary) {
    const repair = await model.invoke([
      new SystemMessage(
        `${contract} The prior object was missing leverageSummary. Return the complete same object, adding leverageSummary as an array of negotiation insights supported only by the supplied evidence.`,
      ),
      new HumanMessage(
        JSON.stringify({ valuation: parsed, evidence: state.evidence }),
      ),
    ]);
    ({ parsed, reasoning } = parseModelResponse(repair.content));
  }
  return {
    result: {
      ...parsed,
      reasoning,
      intelligence: {} as IntelligenceLayers,
    } as unknown as ScoreResponse,
  };
}
async function validateNode(state: State) {
  const raw = (state.result ?? {}) as any;
  if (!raw.score || !raw.benchmark) {
    return { error: "Valuation is impossible: score or benchmark is missing." };
  }
  const repaired = normalizeScoreResponse({
    ...raw,
    ok: true,
    score: {
      ...raw.score,
      dimensions: {
        ...raw.score.dimensions,
        coverageNecessity: { ...raw.score.dimensions?.coverageNecessity, weight: .4 },
        subscriberValue: { ...raw.score.dimensions?.subscriberValue, weight: .35 },
        constructionCost: { ...raw.score.dimensions?.constructionCost, weight: .25 },
      },
    },
    leverageSummary: Array.isArray(raw.leverageSummary) ? raw.leverageSummary : ["Estimated valuation based on partial evidence."],
    dataGaps: Array.isArray(raw.dataGaps) ? raw.dataGaps : [],
    reasoning: typeof raw.reasoning === "string" && raw.reasoning.trim() ? raw.reasoning : "Estimated from available evidence; some evidence was unavailable.",
  });
  const validation = parseReasoningResponse(repaired);
  if (!validation.success) {
    return { error: "Valuation is impossible: the score or benchmark cannot be formatted." };
  }
  const result = validation.data as unknown as ScoreResponse;
  const lockedScore = state.deterministicScore;
  const findings: string[] = [];
  const numbers = [result.score.baseline, result.score.multiplier, result.score.composite, result.score.final,
    result.score.dimensions.coverageNecessity.raw, result.score.dimensions.subscriberValue.raw,
    result.score.dimensions.constructionCost.raw, result.benchmark.baseValue,
    result.benchmark.monthlyRange.min, result.benchmark.monthlyRange.max];
  const invalidNumber = numbers.some((value) => typeof value !== "number" || !Number.isFinite(value));
  const weights = result.score.dimensions;
  const validWeights = weights.coverageNecessity.weight === .4 && weights.subscriberValue.weight === .35 && weights.constructionCost.weight === .25;
  const evidenceText = state.evidence.map((item) => `${item.summary} ${(item.derivedFacts ?? []).join(" ")}`).join(" ").toLowerCase();
  const supported = (dimension: { topFields: Array<{ fieldName?: string }> }) => dimension.topFields.length > 0 && dimension.topFields.every((field) => field.fieldName && evidenceText.includes(String(field.fieldName).toLowerCase()));
  const dimensionsSupported = supported(weights.coverageNecessity) && supported(weights.subscriberValue) && supported(weights.constructionCost);
  const benchmarkTraceable = result.benchmark.priceBreakdown.every((item: any) => item.fieldName && evidenceText.includes(String(item.fieldName).toLowerCase()));
  const baselineCategories = new Set(state.evidence.flatMap((item) => Array.isArray(item.category) ? item.category : [item.category]));
  const minimumEvidence = ["competition", "population", "terrain", "regulatory"].every((category) => baselineCategories.has(category as any));
  const reasoning = result.reasoning ?? "";
  if (invalidNumber) findings.push("WARNING: some numeric outputs are estimated or incomplete; confidence reduced.");
  if (!validWeights) findings.push("ERROR repaired: scoring weights were normalized to the domain specification.");
  if (!dimensionsSupported) findings.push("WARNING: one or more contributing dimensions have incomplete evidence.");
  if (!benchmarkTraceable) findings.push("WARNING: some benchmark adjustments could not be fully traced to available evidence.");
  if (!minimumEvidence) findings.push("WARNING: partial evidence was available; missing evidence lowers confidence.");
  const annotatedReasoning = [result.reasoning, ...findings].filter(Boolean).join(" ");
  const leverageSummary = [...(result.leverageSummary ?? [])];
  if (state.towerSaturationSummary && !leverageSummary.some((s) => /saturat|tenant|capacity|co.?locat/i.test(s))) leverageSummary.unshift(state.towerSaturationSummary);
  return { result: { ...result, rawFields: Object.fromEntries(Object.entries(state.rawFields ?? {}).filter(([, value]) => value !== null)), score: lockedScore ? { ...lockedScore, dataGaps: result.score.dataGaps?.length ? result.score.dataGaps : lockedScore.dataGaps } : result.score, leverageSummary, reasoning: annotatedReasoning, hypotheses: state.hypotheses } };
}

export const graph = new StateGraph(SignalRentState)
  .addNode("resolveLocation", resolveNode)
  .addNode("enrichLocation", enrichLocationNode)
  .addNode("discoverCapabilities", discoverNode)
  .addNode("planEvidence", plannerNode)
  .addNode("collectEvidence", collectNode)
  .addNode("assessEvidence", assessEvidenceNode)
  .addNode("scoreFields", scoreNode)
  .addNode("reason", reasonNode)
  .addNode("validate", validateNode)
  .addEdge("__start__", "resolveLocation")
  .addConditionalEdges("resolveLocation", (s) =>
    s.error ? "__end__" : "enrichLocation",
  )
  .addEdge("enrichLocation", "discoverCapabilities")
  .addEdge("discoverCapabilities", "planEvidence")
  .addEdge("planEvidence", "collectEvidence")
  .addEdge("collectEvidence", "assessEvidence")
  .addEdge("assessEvidence", "scoreFields")
  .addEdge("scoreFields", "reason")
  .addEdge("reason", "validate")
  .addEdge("validate", "__end__")
  .compile();
