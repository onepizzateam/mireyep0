import { parseModelResponse } from "@/lib/agent/graph";

function output(extra: string = "") {
  const value = {
    score: { baseline: 79, multiplier: 1.2, composite: 94.8, final: 94.8, dimensions: { coverageNecessity: { raw: 70, label: "Coverage Necessity", weight: 0.4, topFields: [] }, subscriberValue: { raw: 60, label: "Subscriber Value", weight: 0.35, topFields: [] }, constructionCost: { raw: 50, label: "Construction Cost", weight: 0.25, topFields: [] } }, permittingFriction: { multiplierRaw: 1.2, flags: [] }, siteType: "urban", dataGaps: [] },
    benchmark: { monthlyRange: { min: 100, max: 200 }, annualRange: { min: 1200, max: 2400 }, siteType: "urban", scoreBand: "high", calibrationNote: "Test", baseValue: 150, priceBreakdown: [] }, leverageSummary: ["Test insight"], dataGaps: [],
  };
  return JSON.stringify({ ...value, ...JSON.parse(extra || "{}") });
}

test("parses reasoning outside JSON", () => expect(parseModelResponse(`<reasoning>0 structures within 500m support strong leverage.</reasoning><output>${output()}</output>`).reasoning).toContain("0 structures"));
test("parses JSON without a reasoning field", () => expect(() => parseModelResponse(`<reasoning>5,630 housing units drive demand.</reasoning><output>${output()}</output>`)).not.toThrow());
test("strips malformed reasoning field from JSON", () => {
  const valid = output();
  const malformed = `${valid.slice(0, -1)},"reasoning":"First line.
Second line."}`;
  expect(() => parseModelResponse(`<reasoning>1.65x permitting multiplier increases leverage.</reasoning><output>${malformed}</output>`)).not.toThrow();
});
