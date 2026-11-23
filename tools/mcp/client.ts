import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MCPServerConfig } from "../../config/config.ts";

// ---------------------------------------------------------------------------
// MCPServerStatus
// ---------------------------------------------------------------------------

export enum MCPServerStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  ERROR = "error",
}

// ---------------------------------------------------------------------------
// MCPToolInfo
// ---------------------------------------------------------------------------

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverName: string;
}

// ---------------------------------------------------------------------------
// MCPClient
// ---------------------------------------------------------------------------

export class MCPClient {
  name: string;
  config: MCPServerConfig;
  cwd: string;
  status: MCPServerStatus;

  private client: Client | null = null;
  private toolsMap: Map<string, MCPToolInfo> = new Map();

  constructor(name: string, config: MCPServerConfig, cwd: string) {
    this.name = name;
    this.config = config;
    this.cwd = cwd;
    this.status = MCPServerStatus.DISCONNECTED;
  }

  get tools(): MCPToolInfo[] {
    return Array.from(this.toolsMap.values());
  }

  private createTransport():
    | StdioClientTransport
    | StreamableHTTPClientTransport {
    if (this.config.command) {
      const env = { ...process.env } as Record<string, string>;
      Object.assign(env, this.config.env);

      return new StdioClientTransport({
        command: this.config.command,
        args: this.config.args,
        env,
        cwd: this.config.cwd ?? this.cwd,
      });
    } else {
      return new StreamableHTTPClientTransport(new URL(this.config.url!));
    }
  }

  async connect(): Promise<void> {
    if (this.status === MCPServerStatus.CONNECTED) return;

    this.status = MCPServerStatus.CONNECTING;

    try {
      this.client = new Client({ name: this.name, version: "1.0.0" });
      await this.client.connect(this.createTransport());

      const { tools } = await this.client.listTools();
      for (const tool of tools) {
        this.toolsMap.set(tool.name, {
          name: tool.name,
          description: tool.description ?? "",
          inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {},
          serverName: this.name,
        });
      }

      this.status = MCPServerStatus.CONNECTED;
    } catch (e) {
      this.status = MCPServerStatus.ERROR;
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.toolsMap.clear();
    this.status = MCPServerStatus.DISCONNECTED;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ output: string; isError: boolean }> {
    if (!this.client || this.status !== MCPServerStatus.CONNECTED) {
      throw new Error(`Not connected to MCP server "${this.name}"`);
    }

    const result = await this.client.callTool({
      name: toolName,
      arguments: args,
    });

    const content = result.content as Array<Record<string, unknown>>;
    const output = content
      .map((item) =>
        typeof item["text"] === "string" ? item["text"] : String(item),
      )
      .join("\n");

    return { output, isError: result.isError === true };
  }
}
