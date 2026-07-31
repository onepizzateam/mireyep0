import { z } from "zod";

const dimensionSchema = z.object({
  raw: z.number(),
  label: z.string(),
  weight: z.number(),
  topFields: z.array(z.unknown()),
});

const scoreSchema = z.object({
  baseline: z.number(),
  multiplier: z.number(),
  composite: z.number(),
  final: z.number(),
  dimensions: z.object({
    coverageNecessity: dimensionSchema,
    subscriberValue: dimensionSchema,
    constructionCost: dimensionSchema,
  }),
  permittingFriction: z.object({ multiplierRaw: z.number(), flags: z.array(z.string()) }),
  siteType: z.string(),
  dataGaps: z.array(z.unknown()),
});

const benchmarkSchema = z.object({
  monthlyRange: z.object({ min: z.number(), max: z.number() }),
  annualRange: z.object({ min: z.number(), max: z.number() }),
  siteType: z.string(),
  scoreBand: z.enum(["high", "mid", "low"]),
  calibrationNote: z.string(),
  baseValue: z.number(),
  priceBreakdown: z.array(z.unknown()),
});

export const scoreResponseSchema = z.object({
  ok: z.literal(true),
  address: z.string(),
  displayAddress: z.string(),
  lat: z.number(),
  lng: z.number(),
  score: scoreSchema,
  benchmark: benchmarkSchema,
  leverageSummary: z.array(z.string()),
  dataGaps: z.array(z.unknown()),
  processingMs: z.number(),
  reasoning: z.string(),
}).passthrough();

export function parseScoreResponse(value: unknown) {
  return scoreResponseSchema.safeParse(value);
}
