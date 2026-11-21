import {
  AnalysisRequestPayload,
  CompleteAnalysisResult,
  StreamEvent,
} from "./types";
import { runUniversalWorkforce } from "./workforce/orchestrator";

/**
 * Main Orchestrator entrypoint — delegates to the Universal Multi-Agent Workforce
 * (preserving backwards compatibility with /api/analyze and existing callers).
 */
export async function runInvestmentCommittee(
  request: AnalysisRequestPayload,
  apiKey: string | undefined,
  emit: (event: StreamEvent) => void
): Promise<CompleteAnalysisResult> {
  return runUniversalWorkforce(request, apiKey, emit);
}
