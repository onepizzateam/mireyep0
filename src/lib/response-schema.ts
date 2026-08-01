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
  permittingFriction: z.object({
    multiplierRaw: z.number(),
    flags: z.array(z.string()),
  }),
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

export const scoreResponseSchema = z
  .object({
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
  })
  .passthrough();

export const reasoningResponseSchema = scoreResponseSchema.omit({ processingMs: true });

function schemaDef(schema: any): any {
  return schema?._zod?.def ?? schema?._def ?? {};
}

function schemaProperties(schema: any): Record<string, any> {
  const shape = schemaDef(schema).shape;
  return typeof shape === "function" ? shape() : (shape ?? {});
}

function isStringArraySchema(schema: any): boolean {
  const def = schemaDef(schema);
  const element = def.element ?? def.type;
  return def.type === "array" && schemaDef(element).type === "string";
}

/** Normalizes only harmless string-array representation differences. */
export function normalizeScoreResponse(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const normalized = { ...(value as Record<string, unknown>) };
  for (const [key, propertySchema] of Object.entries(schemaProperties(scoreResponseSchema))) {
    const current = normalized[key];
    if (!isStringArraySchema(propertySchema)) continue;
    if (current === null || current === undefined) normalized[key] = [];
    else if (typeof current === "string") normalized[key] = [current];
  }
  return normalized;
}

export function parseScoreResponse(value: unknown) {
  return scoreResponseSchema.safeParse(value);
}

export function parseReasoningResponse(value: unknown) {
  return reasoningResponseSchema.safeParse(value);
}
