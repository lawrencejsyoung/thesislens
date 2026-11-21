#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createThesisLensMcpServer } from "./server";

// Guard stdout strictly for JSON-RPC framing; route any accidental console.log to stderr.
const originalLog = console.log;
console.log = (...args: unknown[]) => {
  console.error(...args);
};

async function main() {
  const server = createThesisLensMcpServer({
    geminiApiKey: process.env.GEMINI_API_KEY,
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[ThesisLens MCP] stdio server ready (16 tools, 3 prompts, 3 resources)");

  const shutdown = async () => {
    try {
      await server.close();
    } catch {
      // ignore close errors during exit
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.log = originalLog;
  console.error("[ThesisLens MCP] Fatal startup error:", err);
  process.exit(1);
});
