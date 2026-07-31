import { parseScoreResponse } from "@/lib/response-schema";

const dimension = { raw: 70, label: "Test", weight: 1 / 3, topFields: [] };

test("accepts a captured successful valuation envelope", () => {
  const fixture = {
    ok: true,
    address: "123 Main St",
    displayAddress: "123 Main St, Phoenix, Arizona",
    lat: 33.45,
    lng: -112.07,
    score: {
      baseline: 70, multiplier: 1, composite: 70, final: 70,
      dimensions: { coverageNecessity: dimension, subscriberValue: dimension, constructionCost: dimension },
      permittingFriction: { multiplierRaw: 1, flags: [] }, siteType: "urban", dataGaps: [],
    },
    benchmark: {
      monthlyRange: { min: 2500, max: 3500 }, annualRange: { min: 30000, max: 42000 },
      siteType: "urban", scoreBand: "mid", calibrationNote: "Fixture", baseValue: 3000, priceBreakdown: [],
    },
    leverageSummary: ["Fixture evidence supports a moderate negotiating position."],
    dataGaps: [], processingMs: 1, reasoning: "Fixture reasoning.",
  };

  const parsed = parseScoreResponse(JSON.parse(JSON.stringify(fixture)));
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data.score.dimensions.coverageNecessity.raw).toBe(70);
});

test("rejects an ok envelope that would crash the renderer", () => {
  const parsed = parseScoreResponse({ ok: true, score: undefined });
  expect(parsed.success).toBe(false);
});
