import { NextRequest } from "next/server";
import { runInvestmentCommittee } from "@/lib/gemini-committee";
import { AnalysisRequestPayload, StreamEvent } from "@/lib/types";
import {
  extractSafeGeminiApiKey,
  logServerError,
  readJsonBodyWithLimit,
  validateAttachment,
} from "@/lib/security/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 6 MB cap accommodates a 4 MB base64-encoded chart/PDF attachment plus JSON metadata
const MAX_ANALYZE_BODY_BYTES = 6_000_000;

export async function POST(req: NextRequest) {
  const parsed = await readJsonBodyWithLimit<AnalysisRequestPayload>(
    req,
    MAX_ANALYZE_BODY_BYTES
  );
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: parsed.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = parsed.data;
  if (
    typeof payload.thesisPrompt !== "string" ||
    !Array.isArray(payload.holdings) ||
    payload.holdings.length > 200
  ) {
    return new Response(
      JSON.stringify({
        error: "Invalid analysis payload: thesisPrompt and holdings (max 200) are required.",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const attachmentCheck = validateAttachment({
    attachmentBase64: payload.attachmentBase64,
    attachmentMimeType: payload.attachmentMimeType,
  });
  if (!attachmentCheck.ok) {
    return new Response(JSON.stringify({ error: attachmentCheck.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headerApiKey = extractSafeGeminiApiKey(req);
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
        logServerError("api/analyze", err);
        send({
          type: "error",
          message: "Unable to complete Investment Committee analysis. Please retry.",
        });
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
      "X-Accel-Buffering": "no",
    },
  });
}
