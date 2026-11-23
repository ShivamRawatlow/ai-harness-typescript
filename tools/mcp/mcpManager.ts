import { Config } from "../../config/config.ts";
import { ToolRegistry } from "../registry.ts";
import { MCPClient, MCPServerStatus } from "./client.ts";
import { MCPTool } from "./mcpTool.ts";

export class MCPManager {
  private config: Config;
  private clients: Map<string, MCPClient> = new Map();
  private initialized = false;

  constructor(config: Config) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const mcpConfigs = this.config.mcpServers;
    if (!mcpConfigs || Object.keys(mcpConfigs).length === 0) return;

    for (const [name, serverConfig] of Object.entries(mcpConfigs)) {
      if (!serverConfig.enabled) continue;

      this.clients.set(
        name,
        new MCPClient(name, serverConfig, this.config.cwd),
      );
    }

    // Connect all clients concurrently, respecting each server's startup timeout
    const connectionTasks = Array.from(this.clients.values()).map((client) =>
      Promise.race([
        client.connect(),
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error(`MCP server "${client.name}" timed out`)),
            client.config.startupTimeoutSec * 1000,
          ),
        ),
      ]).catch(() => {
        // individual failures don't abort the rest
      }),
    );

    await Promise.all(connectionTasks);

    this.initialized = true;
  }

  registerTools(registry: ToolRegistry): number {
    let count = 0;

    for (const client of this.clients.values()) {
      if (client.status !== MCPServerStatus.CONNECTED) continue;

      for (const toolInfo of client.tools) {
        const mcpTool = new MCPTool({
          config: this.config,
          client,
          toolInfo,
          name: `${client.name}__${toolInfo.name}`,
        });
        registry.register(mcpTool);
        count++;
      }
    }

    return count;
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.clients.values()).map((c) => c.disconnect()),
    );
    this.clients.clear();
    this.initialized = false;
  }

  getServerStatus(): Array<{ name: string; status: string; tools: number }> {
    return Array.from(this.clients.entries()).map(([name, client]) => ({
      name,
      status: client.status,
      tools: client.tools.length,
    }));
  }
}
