import { NextRequest } from "next/server";
import { runInvestmentCommittee } from "@/lib/gemini-committee";
import { AnalysisRequestPayload, StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let payload: AnalysisRequestPayload;
  try {
    payload = (await req.json()) as AnalysisRequestPayload;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headerApiKey = req.headers.get("x-gemini-api-key") || undefined;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // stream already closed
        }
      };

      try {
        await runInvestmentCommittee(payload, headerApiKey, send);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unexpected error running Gemini Investment Committee.";
        send({ type: "error", message });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
