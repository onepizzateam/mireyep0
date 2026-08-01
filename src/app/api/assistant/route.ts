import { NextRequest, NextResponse } from "next/server";
import type { ScoreResponse } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { question?: unknown; valuation?: ScoreResponse } | null;
  if (!body || typeof body.question !== "string" || !body.valuation) {
    return NextResponse.json({ ok: false, error: "question and valuation are required" }, { status: 400 });
  }
  const q = body.question.toLowerCase();
  const v = body.valuation;
  let answer = `Using the current valuation: the site score is ${v.score.final.toFixed(1)}/100, with a ${v.score.multiplier.toFixed(2)}× permitting multiplier. The benchmark is $${v.benchmark.monthlyRange.min.toLocaleString()}–$${v.benchmark.monthlyRange.max.toLocaleString()}/month.`;
  if (q.includes("method") || q.includes("weight")) answer = "Using the current valuation methodology: baseline value is 40% Coverage Necessity, 35% Subscriber Value, and 25% Construction Cost. Permitting Friction multiplies that baseline because it changes replaceability rather than site demand.";
  else if (q.includes("gap") || q.includes("confidence")) answer = `Using the current valuation: ${v.dataGaps.length ? `the report identifies ${v.dataGaps.length} data gap(s), so confidence is reduced where evidence is missing.` : "no scored data gaps were reported."}`;
  else if (q.includes("negot") || q.includes("offer")) answer = `Using the current valuation: ${v.leverageSummary.join(" ")}`;
  else if (q.includes("evidence") || q.includes("field")) answer = `Using the current valuation: the report's evidence-backed drivers are ${[...v.score.dimensions.coverageNecessity.topFields, ...v.score.dimensions.subscriberValue.topFields, ...v.score.dimensions.constructionCost.topFields].map((f) => f.fieldName).join(", ")}.`;
  return NextResponse.json({ ok: true, answer, status: "Using current valuation" });
}
