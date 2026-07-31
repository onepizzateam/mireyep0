import { Annotation, StateGraph } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { mcpResource, mcpTool } from "./mcp";
import { ScoreResponse } from "@/lib/types";
import { fetchFederalLayer } from "./federal";

export const SignalRentState = Annotation.Root({
  address: Annotation<string>(), lat: Annotation<number | undefined>(), lng: Annotation<number | undefined>(), carrier: Annotation<string | undefined>(), offeredRate: Annotation<number | undefined>(), buyoutAmount: Annotation<number | undefined>(),
  resolvedLat: Annotation<number>(), resolvedLng: Annotation<number>(), displayAddress: Annotation<string>(), parcelGrade: Annotation<boolean>(), catalogSummary: Annotation<string>(), fetchedFields: Annotation<Record<string, unknown>>(), selectedFields: Annotation<string[]>(), intelligence: Annotation<any>({ reducer: (left, right) => ({ ...(left ?? {}), ...(right ?? {}) }), default: () => ({}) }), result: Annotation<ScoreResponse | null>(), error: Annotation<string | null>(),
});

type State = typeof SignalRentState.State;
const unwrap = (v: any): any => v?.content ?? v?.structuredContent ?? v?.data ?? v;
const fields = (v: any): Record<string, unknown> => unwrap(v)?.fields ?? unwrap(v)?.data ?? unwrap(v) ?? {};

async function lookupNode(state: State) {
  const response: any = unwrap(await mcpTool("mireye_lookup", { input: state.lat !== undefined && state.lng !== undefined ? `${state.lat},${state.lng}` : state.address }));
  if (response?.disposition === "clarify") return { error: `Address is ambiguous: ${response.candidates?.[0]?.label} or ${response.candidates?.[1]?.label}` };
  if (response?.disposition === "no_match") return { error: "Address not found." };
  const location = response?.location ?? response;
  return { resolvedLat: Number(location.lat), resolvedLng: Number(location.lng), displayAddress: location.displayAddress ?? location.label ?? state.address, parcelGrade: Boolean(location.parcelGrade ?? response.parcelGrade), fetchedFields: fields(response) };
}

async function catalogNode() {
  const [rawFields, rawPresets] = await Promise.all([mcpResource("mireye://catalog/fields"), mcpResource("mireye://catalog/presets")]);
  const value: any = unwrap(rawFields); const entries = value?.fields ?? value?.resources ?? value;
  const lines = Array.isArray(entries) ? entries.map((x: any) => `${x.name ?? x.field}: ${String(x.description ?? "").split(".")[0]}`) : Object.entries(entries ?? {}).map(([k, x]: any) => `${k}: ${String(x?.description ?? x ?? "").split(".")[0]}`);
  const presetText = JSON.stringify(unwrap(rawPresets));
  return { catalogSummary: `${lines.join("\n").slice(0, 5900)}\nPresets: ${presetText.includes("cell_tower_siting") ? "cell_tower_siting" : "site_selection"}` };
}

const explicitFields = ["antenna_structures_within_500m_count","antenna_structures_within_2km_count","nearest_antenna_structure_distance_m","nearest_antenna_structure_type","housing_units_within_1km","housing_units_density_per_km2","poi_count_1km","nearest_urban_area_distance_m","total_road_length_within_500m_m","slope_degrees","seismic_pga_2pct_50yr_g","landslide_susceptibility_index","within_floodplain_polygon","intersects_nhd_area","wetlands_area_pct","zoning_classification","fcc_asm_tower_height_m","population_density_per_km2","median_household_income"];
async function fetchNode(state: State) {
  const preset = state.catalogSummary.includes("cell_tower_siting") ? "cell_tower_siting" : "site_selection";
  const [a, b] = await Promise.all([mcpTool("mireye_fetch", { lat: state.resolvedLat, lng: state.resolvedLng, preset }), mcpTool("mireye_fetch", { lat: state.resolvedLat, lng: state.resolvedLng, fields: explicitFields })]);
  return { fetchedFields: { ...state.fetchedFields, ...fields(a), ...fields(b) }, selectedFields: explicitFields };
}

const system = `You are SignalRent's valuation engine. Analyze US cell tower lease sites for landlords. Return transparent structured JSON. Use exact weights: coverageNecessity .4, subscriberValue .35, constructionCost .25. Classify urban when nearest_urban_area_distance_m < 5000 and housing_units_density_per_km2 > 1000; suburban when distance < 25000 and density > 200; otherwise rural. Monthly base ranges: urban 2500-8000, suburban 1200-4500, rural 400-2000. Include reasoning, topFields (at least 3), dataGaps with field/impact/assumption, benchmark adjustments, leverageSummary paragraphs, and optional rate/buyout comparisons. Output only <reasoning>...</reasoning><output>{JSON}</output>.`;
async function federalNode(state: State, kind: "bdc" | "uls" | "opencellid" | "faa" | "auction") {
  try {
    return { intelligence: await fetchFederalLayer(kind, state.resolvedLat, state.resolvedLng, String(state.fetchedFields.political_county ?? "")) };
  } catch (e) {
    return { intelligence: { [kind]: { error: String(e), citations: [] } } };
  }
}
const bdcNode = (s: State) => federalNode(s, "bdc");
const ulsNode = (s: State) => federalNode(s, "uls");
const opencellidNode = (s: State) => federalNode(s, "opencellid");
const faaNode = (s: State) => federalNode(s, "faa");
const auctionNode = (s: State) => federalNode(s, "auction");
async function reasonNode(state: State) {
  const model = new ChatAnthropic({ model: "claude-haiku-4-5", temperature: 0, apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `Site address: ${state.displayAddress}\nCoordinates: ${state.resolvedLat}, ${state.resolvedLng}\nParcel-grade: ${state.parcelGrade}\nCarrier: ${state.carrier ?? "unknown"}\nOffered rate: ${state.offeredRate ?? "not provided"}\nBuyout: ${state.buyoutAmount ?? "not provided"}\nCatalog:\n${state.catalogSummary}\nMireye fields:\n${JSON.stringify(state.fetchedFields, null, 2)}\nFederal intelligence layers (missing/error values must be acknowledged, never invented):\n${JSON.stringify(state.intelligence ?? {}, null, 2)}`;
  const message: any = await model.invoke([new SystemMessage(system), new HumanMessage(prompt)]); const text = String(message.content); const reasoning = text.match(/<reasoning>([\s\S]*?)<\/reasoning>/i)?.[1]?.trim() ?? ""; const output = text.match(/<output>([\s\S]*?)<\/output>/i)?.[1];
  if (!output) throw new Error("LLM output did not contain an output block");
  return { result: { ...JSON.parse(output), reasoning, intelligence: state.intelligence } as ScoreResponse };
}

async function validateNode(state: State) {
  const r: any = state.result; const checks = [[typeof r?.score?.baseline === "number" && r.score.baseline >= 0 && r.score.baseline <= 100, "score.baseline"], [typeof r?.score?.composite === "number", "score.composite"], [r?.benchmark?.monthlyRange?.min < r?.benchmark?.monthlyRange?.max && r.benchmark.monthlyRange.min > 0, "benchmark range"], [Array.isArray(r?.leverageSummary?.paragraphs) && r.leverageSummary.paragraphs.length >= 1, "leverage paragraphs"], [Array.isArray(r?.topFields) && r.topFields.length >= 3, "topFields"]]; const failed = checks.find(([ok]) => !ok); return failed ? { error: `Validation failed: ${failed[1]}`, result: null } : { result: r };
}

const graph = new StateGraph(SignalRentState).addNode("lookup", lookupNode).addNode("catalog", catalogNode).addNode("fetch", fetchNode).addNode("bdc", bdcNode).addNode("uls", ulsNode).addNode("opencellid", opencellidNode).addNode("faa", faaNode).addNode("auction", auctionNode).addNode("reason", reasonNode).addNode("validate", validateNode).addEdge("__start__", "lookup").addConditionalEdges("lookup", (s) => s.error ? "__end__" : "catalog").addEdge("catalog", "fetch").addEdge("fetch", "bdc").addEdge("fetch", "uls").addEdge("fetch", "opencellid").addEdge("fetch", "faa").addEdge("fetch", "auction").addEdge("bdc", "reason").addEdge("uls", "reason").addEdge("opencellid", "reason").addEdge("faa", "reason").addEdge("auction", "reason").addEdge("reason", "validate").addEdge("validate", "__end__").compile();
export { graph };
