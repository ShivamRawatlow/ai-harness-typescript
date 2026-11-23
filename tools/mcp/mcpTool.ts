import { Config } from "../../config/config.ts";
import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.ts";
import { MCPClient, MCPToolInfo } from "./client.ts";

export class MCPTool extends Tool {
  kind = ToolKind.MCP;

  private toolInfo: MCPToolInfo;
  private client: MCPClient;

  constructor(fields: {
    config: Config;
    client: MCPClient;
    toolInfo: MCPToolInfo;
    name: string;
  }) {
    super();
    this.toolInfo = fields.toolInfo;
    this.client = fields.client;
    this.name = fields.name;
    this.description = fields.toolInfo.description;
  }

  get schema(): Record<string, unknown> {
    const inputSchema = this.toolInfo.inputSchema ?? {};
    return {
      type: "object",
      properties: (inputSchema["properties"] as Record<string, unknown>) ?? {},
      required: (inputSchema["required"] as string[]) ?? [],
    };
  }

  isMutating(): boolean {
    return true;
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    try {
      const result = await this.client.callTool(
        this.toolInfo.name,
        invocation.params,
      );

      if (result.isError) {
        return ToolResult.errorResult(result.output);
      }

      return ToolResult.successResult(result.output);
    } catch (e) {
      return ToolResult.errorResult(`MCP tool failed: ${e}`);
    }
  }
}
