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

// The reasoning model response doesn't include ok/processingMs/address/lat/lng —
// those are all injected by the API route after the fact.
// We make them optional here so the model output passes validation cleanly.
export const reasoningResponseSchema = scoreResponseSchema
  .omit({ processingMs: true, ok: true, address: true, displayAddress: true, lat: true, lng: true })
  .extend({
    ok: z.literal(true).optional(),
    address: z.string().optional(),
    displayAddress: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })
  .passthrough();

/**
 * Explicit JSON schema contract sent to the reasoning model.
 * This replaces the broken Zod v4 introspection approach — Zod v4 changed
 * its internal ._def structure, so the old schemaDescription() function
 * produced empty/garbled output, causing the model to guess wrong shapes.
 */
export const REASONING_CONTRACT = `
Return a single JSON object with this exact structure (no wrapper keys):

{
  "score": {
    "baseline": <number 0-100: weighted sum of the three dimension raw scores>,
    "multiplier": <number: same as permittingFriction.multiplierRaw>,
    "composite": <number: baseline * multiplier, may exceed 100>,
    "final": <number 0-100: composite clamped to 0-100>,
    "dimensions": {
      "coverageNecessity": {
        "raw": <number 0-100>,
        "label": "Coverage Necessity",
        "weight": 0.40,
        "topFields": [
          {
            "fieldName": "<mireye field name>",
            "value": "<string representation of value>",
            "impact": "high" | "medium" | "low",
            "direction": "positive" | "negative" | "neutral",
            "explanation": "<one sentence plain English>"
          }
        ]
      },
      "subscriberValue": {
        "raw": <number 0-100>,
        "label": "Subscriber Value",
        "weight": 0.35,
        "topFields": [ ... same structure as above ... ]
      },
      "constructionCost": {
        "raw": <number 0-100>,
        "label": "Construction Cost",
        "weight": 0.25,
        "topFields": [ ... same structure as above ... ]
      }
    },
    "permittingFriction": {
      "multiplierRaw": <number 0.5-2.0>,
      "flags": ["<string: plain English friction flag>", ...]
    },
    "siteType": "urban" | "suburban" | "rural",
    "dataGaps": [
      {
        "field": "<mireye field name that was missing>",
        "impact": "high" | "medium" | "low",
        "assumption": "<string: what assumption was made due to missing data>"
      }
    ]
  },
  "benchmark": {
    "monthlyRange": { "min": <number>, "max": <number> },
    "annualRange": { "min": <number>, "max": <number> },
    "siteType": "urban" | "suburban" | "rural",
    "scoreBand": "high" | "mid" | "low",
    "calibrationNote": "<string: one sentence about benchmark calibration>",
    "baseValue": <number: monthly base before adjustments>,
    "priceBreakdown": [
      {
        "label": "<string: human readable adjustment label>",
        "fieldName": "<string: mireye field that drove this>",
        "amount": <number: dollar amount added/subtracted monthly>,
        "percent": <number: fraction e.g. 0.12 for 12%>,
        "direction": "positive" | "negative" | "neutral"
      }
    ]
  },
  "leverageSummary": [
    "<string: negotiation insight 1>",
    "<string: negotiation insight 2>",
    "<string: negotiation insight 3>"
  ],
  "dataGaps": [
    {
      "field": "<mireye field name>",
      "impact": "high" | "medium" | "low",
      "assumption": "<string: documented assumption>"
    }
  ],
  "reasoning": "<string: narrative explanation of the valuation>"
}

SCORING GUIDANCE (use evidence; do not invent):
- Coverage Necessity (40%): How hard is it for a carrier to cover this area from elsewhere? High antenna count nearby = lower necessity = lower raw score. No coverage + high demand = higher raw score.
- Subscriber Value (30%): What is the economic value of the subscribers this site would serve? Housing density, POI count, road length → higher value.
- Construction Cost (30%): How easy/cheap is it to build here? Flat, low-hazard, fiber available, good road access = higher score (lower cost). Note: higher score = LOWER cost (easier to build), which is GOOD for the landowner.
- Permitting Friction multiplier: 1.0 = neutral. >1.0 = site is harder to replace (benefits landowner). <1.0 = friction makes site less valuable (protected areas, restricted airspace). Range: 0.5–2.0.
- Realistic baseline scores for most US locations are 30–75. Avoid defaulting to 0 or 1.
`.trim();

function isStringArraySchema(schema: any): boolean {
  try {
    // Zod v4: shape is under _zod.def
    const def = schema?._zod?.def ?? schema?._def ?? {};
    const elementDef = (def.element ?? def.type)?._zod?.def ?? (def.element ?? def.type)?._def ?? {};
    return def.type === "array" && elementDef.type === "string";
  } catch {
    return false;
  }
}

function unwrapSchema(schema: any): any {
  try {
    const def = schema?._zod?.def ?? schema?._def ?? {};
    return ["optional", "nullable", "default", "catch"].includes(def.type)
      ? def.innerType ?? def.schema ?? schema
      : schema;
  } catch {
    return schema;
  }
}

function normalizeNode(schema: any, value: unknown, present: boolean): unknown {
  const currentSchema = unwrapSchema(schema);
  if (!present) return value;
  if (isStringArraySchema(currentSchema)) {
    if (value === null) return [];
    if (typeof value === "string") return [value];
    return value;
  }
  try {
    const def = currentSchema?._zod?.def ?? currentSchema?._def ?? {};
    if (def.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
      const shape = typeof def.shape === "function" ? def.shape() : (def.shape ?? {});
      const normalized = { ...(value as Record<string, unknown>) };
      for (const [key, propertySchema] of Object.entries(shape)) {
        if (Object.prototype.hasOwnProperty.call(normalized, key)) {
          normalized[key] = normalizeNode(propertySchema, normalized[key], true);
        }
      }
      return normalized;
    }
  } catch {
    // fall through
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

// Legacy export kept for any imports that still reference it
export const reasoningContractDescription = REASONING_CONTRACT;
