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
import { mireyeProvider, openCellIdProvider } from "./providers";
import { mockMireyeProvider } from "./mockMireyeProvider";
import { MOCK_LOCATION } from "./mockMireye";
import { computeTowerSaturation, saturationLeverageSentence } from "@/lib/towerSaturation";
import { MIREYE_FIELDS } from "@/constants/fields";
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
  executorOutput: Annotation<string[]>(),
  evidenceQuality: Annotation<{
    enough: boolean;
    confidence: number;
    missing: string[];
  } | null>(),
  result: Annotation<ScoreResponse | null>(),
  deterministicScore: Annotation<SiteScore | null>({ value: (_prev, next) => next, default: () => null }),
  rawFields: Annotation<MireyeFields | null>({ value: (_prev, next) => next, default: () => null }),
  opencellData: Annotation<any>({ value: (_prev, next) => next, default: () => null }),
  towerSaturationSummary: Annotation<string>({ value: (_prev, next) => next, default: () => "" }),
  error: Annotation<string | null>(),
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
  const response = unwrap(
    await mcpTool("mireye_lookup", {
      input:
        state.lat !== undefined && state.lng !== undefined
          ? `${state.lat},${state.lng}`
          : state.address,
    }),
  );
  if (response?.disposition === "clarify")
    return {
      error: `Address is ambiguous: ${(response.candidates ?? []).map((c: any) => c.label).join(" or ")}`,
    };
  if (response?.disposition === "no_match")
    return { error: "Address not found." };
  const location = response.location ?? response;
  return {
    resolvedLat: Number(location.lat),
    resolvedLng: Number(location.lng),
    displayAddress: location.displayAddress ?? location.label ?? state.address,
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
async function plannerNode() {
  const plannerOutput: EvidenceRequest[] = MIREYE_FIELDS.map((field) => ({
    concept: field,
    category: field.includes("tower") || field.includes("antenna") ? "competition" :
      field.includes("wetland") || field.includes("habitat") || field.includes("zoning") ? "regulatory" :
      field.includes("housing") || field.includes("poi") || field.includes("lodging") ? "population" :
      field.includes("slope") || field.includes("soil") || field.includes("seismic") || field.includes("flood") ? "terrain" : "infrastructure",
    importance: "high",
    reason: "minimum evidence baseline for the scoring model",
  }));
  return { plannerOutput };
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
async function assessEvidenceNode() {
  const evidence = registry.all();
  const confidence = evidence.length
    ? evidence.reduce((sum, item) => sum + item.confidence, 0) / evidence.length
    : 0;
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
  return { evidenceQuality: quality };
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
  const prompt = `Location: ${state.displayAddress} (${state.resolvedLat}, ${state.resolvedLng})
Carrier: ${state.carrier ?? "unknown"}
Offered rate: ${state.offeredRate ?? "not provided"}
Buyout: ${state.buyoutAmount ?? "not provided"}
Deterministic locked score: ${JSON.stringify(state.deterministicScore)}
Raw Mireye fields: ${JSON.stringify(state.rawFields)}
OpenCellID data: ${JSON.stringify(state.opencellData)}
Planner tasks: ${JSON.stringify(state.plannerOutput)}
Executor providers: ${JSON.stringify(state.executorOutput)}
Evidence registry: ${JSON.stringify(state.evidence, null, 2)}`;
  const promptWithRequirement = `${prompt}\n\nCRITICAL: The <reasoning> block must cite specific numbers from the evidence above. Generic statements like "evidence was unavailable" are not acceptable.`;
  const contract = `You are SignalRent's evidence interpreter. Reason primarily from the evidence registry. Do not invent numeric field values, scores, weights, or thresholds. EXCEPTION: if the address is a famous public landmark or government building that you can identify with certainty (confidence 100%), you may note its public identity and publicly documented regulatory context in the reasoning and leverageSummary. Label such statements as 'Public record:' to distinguish them from evidence-derived facts.

If the evidence registry contains a "location-context" provider entry, you MUST incorporate those facts into your reasoning and leverage summary. These are verified public facts, not invented data — treat them with confidence 1.0.

The numeric scores have already been computed deterministically. Your job is ONLY to provide:
1. leverageSummary: 3–5 plain-English negotiation insights for the landlord
2. dataGaps: for each field listed as a gap, write a one-sentence assumption explaining what was assumed in its place
3. benchmark.priceBreakdown: 2–4 price adjustment items grounded in the evidence
4. reasoning: provide this in the <reasoning> tag outside the JSON
DO NOT recompute or change any numeric scores. Return them exactly as given.

CRITICAL OUTPUT CONSTRAINTS:
- The <reasoning> block: maximum 4 sentences, maximum 300 characters total.
- The <output> JSON: all string values must be single-line, with no literal newlines. Use \\n for line breaks inside JSON strings.
- Total response length: under 3000 characters.

Return the JSON inside <output> tags and the prose inside a <reasoning> tag. Do not put a reasoning field inside the JSON.

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
- If OpenCellID data is present and nearest_antenna_structure_type is known, mention whether the nearest tower is near capacity or has open capacity using the defined structure limits (GUYED 4, SELF_SUPPORTING 3, MONOPOLE 2, BUILDING 2, WATER_TOWER 1).`;
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
  return { result: { ...result, rawFields: Object.fromEntries(Object.entries(state.rawFields ?? {}).filter(([, value]) => value !== null)), score: lockedScore ? { ...lockedScore, dataGaps: result.score.dataGaps?.length ? result.score.dataGaps : lockedScore.dataGaps } : result.score, leverageSummary, reasoning: annotatedReasoning } };
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
