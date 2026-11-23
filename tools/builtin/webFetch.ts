import { z } from "zod";
import { tavily } from "@tavily/core";

import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.ts";

// ---------------------------------------------------------------------------
// Params schema
// ---------------------------------------------------------------------------

const WebFetchParams = z.object({
  url: z.string().url().describe("URL to fetch (must be http:// or https://)"),
  timeout: z
    .number()
    .int()
    .min(5)
    .max(120)
    .default(30)
    .describe("Request timeout in seconds (default: 30)"),
});

type WebFetchParamsType = z.infer<typeof WebFetchParams>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const MAX_CONTENT_LENGTH = 100 * 1024; // 100 KB

export class WebFetchTool extends Tool {
  name = "web_fetch";
  description = "Fetch content from a URL. Returns the response body as text.";
  kind = ToolKind.NETWORK;

  get schema() {
    return WebFetchParams;
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const parsed = WebFetchParams.safeParse(invocation.params);
    if (!parsed.success) {
      return ToolResult.errorResult(parsed.error.issues[0].message);
    }

    const params: WebFetchParamsType = parsed.data;

    const apiKey = process.env.TAVLY_API_KEY;
    if (!apiKey) {
      return ToolResult.errorResult(
        "TAVLY_API_KEY is not set in environment variables",
      );
    }

    let text: string;
    try {
      const client = tavily({ apiKey });
      const response = await client.extract([params.url], {
        format: "markdown",
        timeout: params.timeout,
      });

      const result = response.results?.[0];
      if (!result) {
        const failed = response.failedResults?.[0];
        return ToolResult.errorResult(
          failed
            ? `Failed to fetch URL: ${failed.url}`
            : `No content returned for: ${params.url}`,
        );
      }

      text = result.rawContent ?? "";
    } catch (e) {
      return ToolResult.errorResult(`Request failed: ${e}`);
    }

    let truncated = false;
    if (text.length > MAX_CONTENT_LENGTH) {
      text = text.slice(0, MAX_CONTENT_LENGTH) + "\n... [content truncated]";
      truncated = true;
    }

    return ToolResult.successResult(text, {
      truncated,
      metadata: {
        url: params.url,
        content_length: text.length,
      },
    });
  }
}
