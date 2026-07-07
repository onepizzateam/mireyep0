/**
 * Mireye API Client
 * Per AGENTS.md Section 4
 * Base URL: https://api.mireye.com/v1
 * Authentication: Bearer token from MIREYE_API_KEY
 */

import { MireyeFields, MireyeResponse, MireyeFieldValue, MireyeTimeoutError, MireyeError } from "./types";
import {
  MIREYE_FIELDS_BATCH_1,
  MIREYE_FIELDS_BATCH_2,
} from "@/constants/fields";

const MIREYE_BASE_URL = "https://api.mireye.com/v1";
const MIREYE_TIMEOUT_MS = 45000; // 45 seconds (observed batch 2 can take 20-28s on slow responses)

/**
 * Fetch a single batch of Mireye fields
 * Internal function used by fetchMireyeFields to parallelize requests
 * @param lat - Latitude
 * @param lng - Longitude
 * @param fields - Array of field names to request
 * @param apiKey - Mireye API key
 * @returns Partial MireyeFields object with requested fields only
 * @throws MireyeTimeoutError if request times out
 * @throws MireyeError for other API errors
 */
async function fetchBatch(
  lat: number,
  lng: number,
  fields: readonly string[],
  apiKey: string
): Promise<Partial<MireyeFields>> {
  const url = `${MIREYE_BASE_URL}/fetch`;
  const body = {
    lat,
    lng,
    fields: Array.from(fields),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MIREYE_TIMEOUT_MS);

  try {
    const startTime = Date.now();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const elapsedMs = Date.now() - startTime;

    if (!response.ok) {
      throw new MireyeError(
        `HTTP ${response.status}: ${await response.text()}`
      );
    }

    const rawResponse: MireyeResponse = await response.json();

    // Fields are nested under rawResponse.fields, not at the top level
    interface MireyeResponseWithFields extends Record<string, unknown> {
      fields?: Record<string, MireyeFieldValue>;
    }
    const responseFields = (rawResponse as MireyeResponseWithFields).fields ?? {};

    // Unwrap the value envelope from each field in this batch
    const unwrappedFields: Partial<MireyeFields> = {};
    let nullCount = 0;
    let valueCount = 0;

    for (const fieldName of fields) {
      if (fieldName in responseFields) {
        const fieldData = responseFields[fieldName as keyof typeof responseFields] as MireyeFieldValue;
        const value = fieldData?.value ?? null;
        unwrappedFields[fieldName as keyof MireyeFields] = value;
        if (value === null) nullCount++;
        else valueCount++;
      } else {
        unwrappedFields[fieldName as keyof MireyeFields] = null;
        nullCount++;
      }
    }

    // Detailed logging in dev mode
    if (process.env.NODE_ENV === "development") {
      const fieldsInResponse = Object.keys(responseFields).length;
      const batchNum = fields === MIREYE_FIELDS_BATCH_1 ? "1" : "2";

      console.log(
        `[Mireye] Batch ${batchNum} at (${lat}, ${lng}): ${elapsedMs}ms, HTTP ${response.status}, ${fieldsInResponse} fields in response, ${valueCount} with values, ${nullCount} null`
      );

      if ("error" in rawResponse) {
        console.log(`  ⚠️  Response has 'error' field: ${(rawResponse as MireyeResponseWithFields).error}`);
      }

      const responseFieldKeys = Object.keys(responseFields).slice(0, 10);
      console.log(
        `  Response field keys: ${responseFieldKeys.join(", ")}${fieldsInResponse > 10 ? "..." : ""}`
      );

      const partialFailures = (rawResponse as Record<string, unknown>).partial_failures;
      if (Array.isArray(partialFailures) && partialFailures.length) {
        console.log(`  ⚠️  Partial failures: ${partialFailures.map((f: Record<string, unknown>) => f.field).join(", ")}`);
      }
    }

    return unwrappedFields;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new MireyeTimeoutError();
    }
    if (error instanceof MireyeError) {
      throw error;
    }
    throw new MireyeError(String(error));
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch all Mireye fields for a given coordinate (60 fields across 2 parallel batch requests)
 * Fires both batches simultaneously using Promise.all to minimize wall time.
 * Each batch gets its own timeout — total wall time is the slowest batch, not the sum.
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns MireyeFields object with all 60 fields unwrapped from their value envelope
 * @throws MireyeTimeoutError if either batch times out
 * @throws MireyeError for other API errors
 */
export async function fetchMireyeFields(
  lat: number,
  lng: number
): Promise<MireyeFields> {
  const apiKey = process.env.MIREYE_API_KEY;
  if (!apiKey) {
    throw new MireyeError("MIREYE_API_KEY environment variable not set");
  }

  // Fire both batches in parallel using the same API key
  const [batch1Results, batch2Results] = await Promise.all([
    fetchBatch(lat, lng, MIREYE_FIELDS_BATCH_1, apiKey),
    fetchBatch(lat, lng, MIREYE_FIELDS_BATCH_2, apiKey),
  ]);

  // Merge both partial results into a single complete MireyeFields object
  const mergedFields = Object.assign({}, batch1Results, batch2Results);

  if (process.env.NODE_ENV === "development") {
    const totalValues = Object.values(mergedFields).filter((v) => v !== null).length;
    const totalNulls = Object.values(mergedFields).filter((v) => v === null).length;
    console.log(
      `[Mireye] All batches complete at (${lat}, ${lng}) — ${totalValues} values, ${totalNulls} nulls`
    );
  }

  return mergedFields as MireyeFields;
}

/**
 * Health check for Mireye API
 * Simple GET to /v1/health to verify connectivity
 */
export async function checkMireyeHealth(): Promise<boolean> {
  const apiKey = process.env.MIREYE_API_KEY;
  if (!apiKey) {
    return false;
  }

  try {
    const response = await fetch(`${MIREYE_BASE_URL}/health`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}