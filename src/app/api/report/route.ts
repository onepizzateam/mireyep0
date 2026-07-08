/**
 * POST /api/report
 * Generate and serve a PDF report for a scored site
 * Takes the full ScoreResponse as input and returns a PDF file
 */

import { NextRequest, NextResponse } from "next/server";
import { ScoreResponse } from "@/lib/types";
import { generatePDFBuffer } from "@/lib/pdf";

// In-memory session cache for generated PDFs (key: lat,lng)
// Maps location to { pdf: Buffer, timestamp: number }
// Clears entries after 1 hour of inactivity
const pdfCache = new Map<string, { pdf: Buffer; timestamp: number }>();

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ScoreResponse;

    // Validate required fields
    if (
      !body.lat ||
      !body.lng ||
      !body.address ||
      !body.displayAddress ||
      !body.score ||
      !body.benchmark
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid score data: missing required fields",
          code: "INVALID_INPUT",
        },
        { status: 400 }
      );
    }

    // Check cache
    const cacheKey = getCacheKey(body.lat, body.lng);
    const cached = pdfCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      // Return cached PDF
      return new NextResponse(new Uint8Array(cached.pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="signalrent-report-${body.lat.toFixed(4)}-${body.lng.toFixed(4)}.pdf"`,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Generate new PDF
    const pdfBuffer = await generatePDFBuffer(body);

    // Store in cache
    pdfCache.set(cacheKey, {
      pdf: pdfBuffer,
      timestamp: Date.now(),
    });

    // Clean up expired cache entries
    for (const [key, value] of pdfCache.entries()) {
      if (Date.now() - value.timestamp > CACHE_TTL) {
        pdfCache.delete(key);
      }
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="signalrent-report-${body.lat.toFixed(4)}-${body.lng.toFixed(4)}.pdf"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("Report generation error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to generate PDF report",
        code: "UNKNOWN",
      },
      { status: 500 }
    );
  }
}
