import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { Config } from "../config/config.js";
import LLMClient from "../client/LLMClient.js";
import ContextManager from "../context/manager.js";
import { createDefaultRegistry, ToolRegistry } from "../tools/registry.js";
import { ToolDiscoveryManager } from "../tools/discovery.js";
import { MCPManager } from "../tools/mcp/mcpManager.js";
import { compress } from "../context/compaction.js";

// ---------------------------------------------------------------------------
// User Memory Loading
// ---------------------------------------------------------------------------

function getUserMemoryString(): string | undefined {
  const dataDir = path.join(process.env.HOME || ".", ".ai-agent-data");
  const memoryPath = path.join(dataDir, "user_memory.json");

  if (!fs.existsSync(memoryPath)) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(memoryPath, "utf-8");
    const data = JSON.parse(content);
    const entries = data.entries as Record<string, string>;

    if (!entries || Object.keys(entries).length === 0) {
      return undefined;
    }

    // Format memories as a readable list
    const lines: string[] = [];
    for (const [key, value] of Object.entries(entries).sort()) {
      lines.push(`- **${key}**: ${value}`);
    }

    return lines.join("\n");
  } catch {
    return undefined;
  }
}

export default class Session {
  config: Config;
  client: LLMClient;
  toolRegistry: ToolRegistry;
  contextManager: ContextManager | null;
  sessionId: string;
  createdAt: Date;
  updatedAt: Date;
  private turnCount: number;
  userMemory: string | undefined;
  private discoveryManager: ToolDiscoveryManager;
  private mcpManager: MCPManager;
  private initialized: boolean;
  readonly chatCompactor: typeof compress;

  constructor(config: Config) {
    this.config = config;
    this.client = new LLMClient(config);
    this.toolRegistry = createDefaultRegistry(config);
    this.contextManager = null;
    this.sessionId = randomUUID();
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.turnCount = 0;
    this.userMemory = undefined;
    this.initialized = false;
    this.discoveryManager = new ToolDiscoveryManager(config, this.toolRegistry);
    this.mcpManager = new MCPManager(config);
    this.chatCompactor = compress;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;

    await this.discoveryManager.discoverAll();
    await this.mcpManager.initialize();
    this.mcpManager.registerTools(this.toolRegistry);
    const tools = this.toolRegistry.getTools().map((t) => ({
      name: t.name,
      description: t.description,
    }));
    this.userMemory = getUserMemoryString();
    this.contextManager = new ContextManager(
      this.config,
      this.userMemory,
      tools,
    );
  }

  async shutdown(): Promise<void> {
    await this.mcpManager.shutdown();
  }

  incrementTurn(): number {
    this.turnCount += 1;
    this.updatedAt = new Date();
    return this.turnCount;
  }

  hasReachedMaxTurns(): boolean {
    return this.turnCount >= this.config.maxTurns;
  }
}
