import { NextRequest } from "next/server";
import { graph } from "@/lib/agent/graph";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const initial = { address: String(body.address ?? ""), lat: typeof body.lat === "number" ? body.lat : undefined, lng: typeof body.lng === "number" ? body.lng : undefined, carrier: body.carrier, offeredRate: body.offeredRate, buyoutAmount: body.buyoutAmount, resolvedLat: 0, resolvedLng: 0, displayAddress: "", parcelGrade: false, catalogSummary: "", fetchedFields: {}, selectedFields: [], result: null, error: null } as any;
  const stream = new ReadableStream({ async start(controller) { try { for await (const event of await graph.stream(initial, { streamMode: "updates" })) controller.enqueue(`data: ${JSON.stringify(event)}\n\n`); controller.close(); } catch (error) { controller.enqueue(`data: ${JSON.stringify({ error: String(error) })}\n\n`); controller.close(); } } });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
}
