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
import type { ScoreResponse, IntelligenceLayers } from "@/lib/types";
import {
  normalizeScoreResponse,
  parseReasoningResponse,
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
  const plannerOutput: EvidenceRequest[] = [
    {
      concept: "population and demand",
      category: "population",
      importance: "high",
      reason: "estimate subscriber value",
    },
    {
      concept: "terrain, hazards, utilities and access",
      category: "hazard",
      importance: "high",
      reason: "estimate construction and permitting friction",
    },
    {
      concept: "nearby towers, carriers and coverage",
      category: "coverage",
      importance: "high",
      reason: "estimate coverage necessity and competition",
    },
  ];
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
    const normalized = normalizeScoreResponse(parsed) as Record<string, unknown>;
    const validation = parseReasoningResponse(normalized);
    if (!validation.success) {
      throw new Error(
        `Reasoner returned invalid structured output: ${validation.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
      );
    }
    return {
      parsed: validation.data,
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
  const prompt = `Location: ${state.displayAddress} (${state.resolvedLat}, ${state.resolvedLng})\nCarrier: ${state.carrier ?? "unknown"}\nOffered rate: ${state.offeredRate ?? "not provided"}\nBuyout: ${state.buyoutAmount ?? "not provided"}\nPlanner tasks: ${JSON.stringify(state.plannerOutput)}\nExecutor providers: ${JSON.stringify(state.executorOutput)}\nEvidence registry: ${JSON.stringify(state.evidence, null, 2)}`;
  const contract =
    "You are SignalRent's evidence-based valuation reasoner. Reason only from the evidence registry. Do not invent values, fields, providers, weights, scores, thresholds, or missing facts. Return one top-level JSON object. Every required field must use its specified JSON type: ok boolean true; address string; displayAddress string; lat number; lng number; score object; benchmark object; leverageSummary array of strings (always a JSON array, even for one item); dataGaps array of structured gap objects; reasoning string. The score object must contain baseline number, composite number, multiplier number, final number, dimensions object, permittingFriction object, siteType string, and dataGaps array. The benchmark object must contain monthlyRange object, annualRange object, siteType string, scoreBand string, calibrationNote string, baseValue number, and priceBreakdown array of structured adjustment objects. Include explicit uncertainty in dataGaps and leverageSummary when evidence is missing. Never wrap the object under result, output, valuation, or any other key. You may optionally wrap JSON in <output> tags and reasoning text in <reasoning> tags.";
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
    } as ScoreResponse,
  };
}
async function validateNode(state: State) {
  const missing = [
    !state.result?.score && "score",
    !state.result?.benchmark && "benchmark",
    !Array.isArray(state.result?.leverageSummary) && "leverageSummary",
  ].filter(Boolean);
  const valid = missing.length === 0;
  if (!valid)
    return {
      error: `Reasoner returned an incomplete valuation result (missing: ${missing.join(", ")})`,
    };
  return { result: state.result };
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
