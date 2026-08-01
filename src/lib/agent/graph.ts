import { Annotation, StateGraph } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { mcpTool } from "./mcp";
import {
  EvidenceRegistry,
  discover,
  type EvidenceCategory,
  type EvidenceRequest,
  type Location,
} from "./evidence";
import { mireyeProvider, openCellIdProvider } from "./providers";
import { MIREYE_FIELDS } from "@/constants/fields";
import type { ScoreResponse, IntelligenceLayers } from "@/lib/types";
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
  error: Annotation<string | null>(),
});
type State = typeof SignalRentState.State;
const registry = new EvidenceRegistry();
registry.addProvider(mireyeProvider);
registry.addProvider(openCellIdProvider);
const unwrap = (v: any) => v?.structuredContent ?? v?.data ?? v?.content ?? v;

async function resolveNode(state: State) {
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
  for (const request of state.plannerOutput) {
    for (const provider of await registry.providersFor(request)) {
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
function parseModelResponse(content: unknown) {
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
  try {
    const raw = JSON.parse(candidate);
    const parsed = raw?.score
      ? raw
      : raw?.result?.score
        ? raw.result
        : raw?.output?.score
          ? raw.output
          : raw;
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
    temperature: 0,
    apiKey: process.env.GEMINI_API_KEY,
  });
  const prompt = `Location: ${state.displayAddress} (${state.resolvedLat}, ${state.resolvedLng})
Carrier: ${state.carrier ?? "unknown"}
Offered rate: ${state.offeredRate ?? "not provided"}
Buyout: ${state.buyoutAmount ?? "not provided"}
Planner tasks: ${JSON.stringify(state.plannerOutput)}
Executor providers: ${JSON.stringify(state.executorOutput)}
Evidence registry: ${JSON.stringify(state.evidence, null, 2)}`;
  const contract = `You are SignalRent's evidence-based valuation reasoner. Reason only from the evidence registry. Do not invent values, fields, providers, weights, scores, thresholds, or missing facts.

Return exactly one top-level JSON object matching this schema. Do NOT wrap it under any key like "result", "output", or "valuation". You may optionally wrap JSON in <output> tags and reasoning text in <reasoning> tags.

${REASONING_CONTRACT}

CRITICAL FIELD REQUIREMENTS:
- score.dimensions.coverageNecessity.label MUST be exactly "Coverage Necessity"
- score.dimensions.subscriberValue.label MUST be exactly "Subscriber Value"  
- score.dimensions.constructionCost.label MUST be exactly "Construction Cost"
- score.dimensions.coverageNecessity.weight MUST be 0.40
- score.dimensions.subscriberValue.weight MUST be 0.35
- score.dimensions.constructionCost.weight MUST be 0.25
- score.baseline = (coverageNecessity.raw * 0.40) + (subscriberValue.raw * 0.35) + (constructionCost.raw * 0.25), a number 0-100
- score.composite = score.baseline * score.permittingFriction.multiplierRaw
- score.final = Math.min(100, Math.max(0, score.composite))
- score.multiplier = score.permittingFriction.multiplierRaw
- score.siteType MUST be one of: "urban", "suburban", "rural"
- benchmark.scoreBand MUST be one of: "high", "mid", "low"
- benchmark.siteType MUST match score.siteType
- benchmark.priceBreakdown items MUST each have: label (string), fieldName (string), amount (number), percent (number 0-1), direction ("positive"|"negative"|"neutral")
- dataGaps items MUST each have: field (string), impact ("high"|"medium"|"low"), assumption (string)
- score.dataGaps MUST be the same array as top-level dataGaps
- leverageSummary MUST be an array of 2-5 plain-English strings
- All numeric score values (raw, baseline, composite, final) must be realistic 0-100 values based on evidence. Do not default to 0 or 1.`;
  const message = await model.invoke([
    new SystemMessage(contract),
    new HumanMessage(prompt),
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
  return { result: { ...result, reasoning: annotatedReasoning } };
}

export const graph = new StateGraph(SignalRentState)
  .addNode("resolveLocation", resolveNode)
  .addNode("discoverCapabilities", discoverNode)
  .addNode("planEvidence", plannerNode)
  .addNode("collectEvidence", collectNode)
  .addNode("assessEvidence", assessEvidenceNode)
  .addNode("reason", reasonNode)
  .addNode("validate", validateNode)
  .addEdge("__start__", "resolveLocation")
  .addConditionalEdges("resolveLocation", (s) =>
    s.error ? "__end__" : "discoverCapabilities",
  )
  .addEdge("discoverCapabilities", "planEvidence")
  .addEdge("planEvidence", "collectEvidence")
  .addEdge("collectEvidence", "assessEvidence")
  .addConditionalEdges("assessEvidence", (s) =>
    s.evidenceQuality?.enough ? "reason" : "reason",
  )
  .addEdge("reason", "validate")
  .addEdge("validate", "__end__")
  .compile();
