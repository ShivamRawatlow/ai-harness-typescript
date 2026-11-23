import { z } from "zod";
import { tavily } from "@tavily/core";

import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.ts";

// ---------------------------------------------------------------------------
// Params schema
// ---------------------------------------------------------------------------

const WebSearchParams = z.object({
  query: z.string().describe("Search query"),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe("Maximum results to return (default: 10)"),
});

type WebSearchParamsType = z.infer<typeof WebSearchParams>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class WebSearchTool extends Tool {
  name = "web_search";
  description =
    "Search the web for information. Returns search results with titles, URLs and snippets.";
  kind = ToolKind.NETWORK;

  get schema() {
    return WebSearchParams;
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const parsed = WebSearchParams.safeParse(invocation.params);
    if (!parsed.success) {
      return ToolResult.errorResult(parsed.error.issues[0].message);
    }

    const params: WebSearchParamsType = parsed.data;

    const apiKey = process.env.TAVLY_API_KEY;
    if (!apiKey) {
      return ToolResult.errorResult(
        "TAVLY_API_KEY is not set in environment variables",
      );
    }

    let response;
    try {
      const client = tavily({ apiKey });
      response = await client.search(params.query, {
        maxResults: params.max_results,
        searchDepth: "basic",
        timeRange: "year",
      });
    } catch (e) {
      return ToolResult.errorResult(`Search failed: ${e}`);
    }

    const results = response.results;

    if (!results || results.length === 0) {
      return ToolResult.successResult(`No results found for: ${params.query}`, {
        metadata: { results: 0 },
      });
    }

    const outputLines: string[] = [`Search results for: ${params.query}`];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      outputLines.push(`${i + 1}. Title: ${result.title}`);
      outputLines.push(`   URL: ${result.url}`);
      if (result.content) {
        outputLines.push(`   Snippet: ${result.content}`);
      }
      outputLines.push("");
    }

    return ToolResult.successResult(outputLines.join("\n"), {
      metadata: { results: results.length },
    });
  }
}
