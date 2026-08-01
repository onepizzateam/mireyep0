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

function schemaDescription(schema: any, indent = ""): string {
  const current = unwrapSchema(schema);
  const def = schemaDef(current);
  if (def.type === "object") {
    return `object {\n${Object.entries(schemaProperties(current)).map(([key, child]) => `${indent}  ${key}: ${schemaDescription(child, `${indent}  `)}`).join("\n")}\n${indent}}`;
  }
  if (def.type === "array") return `array of ${schemaDescription(def.element, indent)}`;
  if (def.type === "literal") return JSON.stringify(def.values?.[0] ?? def.value);
  if (def.type === "enum") return `one of ${Object.values(def.entries ?? {}).join(" | ")}`;
  return def.type ?? "unknown";
}

export const reasoningContractDescription = schemaDescription(reasoningResponseSchema);

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

function unwrapSchema(schema: any): any {
  const type = schemaDef(schema).type;
  return ["optional", "nullable", "default", "catch"].includes(type)
    ? schemaDef(schema).innerType ?? schemaDef(schema).schema ?? schema
    : schema;
}

function normalizeNode(schema: any, value: unknown, present: boolean): unknown {
  const currentSchema = unwrapSchema(schema);
  if (!present) return value;
  if (isStringArraySchema(currentSchema)) {
    if (value === null) return [];
    if (typeof value === "string") return [value];
    return value;
  }
  const def = schemaDef(currentSchema);
  if (def.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const normalized = { ...(value as Record<string, unknown>) };
    for (const [key, propertySchema] of Object.entries(schemaProperties(currentSchema))) {
      if (Object.prototype.hasOwnProperty.call(normalized, key)) {
        normalized[key] = normalizeNode(propertySchema, normalized[key], true);
      }
    }
    return normalized;
  }
  return value;
}

/** Recursively normalizes only harmless string-array representation differences. */
export function normalizeScoreResponse(value: unknown): unknown {
  return normalizeNode(scoreResponseSchema, value, true);
}

export function parseScoreResponse(value: unknown) {
  return scoreResponseSchema.safeParse(value);
}

export function parseReasoningResponse(value: unknown) {
  return reasoningResponseSchema.safeParse(value);
}
