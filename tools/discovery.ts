import fs from "fs";
import path from "path";
import os from "os";
import { Config } from "../config/config.ts";
import { Tool } from "./base.ts";
import { ToolRegistry } from "./registry.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getConfigDir = (): string =>
  path.join(os.homedir(), ".config", "ai-agent");

const isToolClass = (obj: unknown): obj is new (config: Config) => Tool => {
  if (typeof obj !== "function") return false;
  if (obj === Tool) return false;
  try {
    return obj.prototype instanceof Tool;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// ToolDiscoveryManager
// ---------------------------------------------------------------------------

export class ToolDiscoveryManager {
  private config: Config;
  private registry: ToolRegistry;

  constructor(config: Config, registry: ToolRegistry) {
    this.config = config;
    this.registry = registry;
  }

  private async loadToolModule(filePath: string): Promise<Record<string, unknown>> {
    return await import(filePath) as Record<string, unknown>;
  }

  private findToolClasses(
    module: Record<string, unknown>,
  ): Array<new (config: Config) => Tool> {
    const toolClasses: Array<new (config: Config) => Tool> = [];

    for (const key of Object.keys(module)) {
      const obj = module[key];
      if (isToolClass(obj)) {
        toolClasses.push(obj);
      }
    }

    return toolClasses;
  }

  async discoverFromDirectory(directory: string): Promise<void> {
    const toolDir = path.join(directory, ".ai-agent", "tools");

    if (!fs.existsSync(toolDir) || !fs.statSync(toolDir).isDirectory()) {
      return;
    }

    for (const entry of fs.readdirSync(toolDir)) {
      if (!entry.endsWith(".js") && !entry.endsWith(".ts")) continue;
      if (entry.startsWith("_")) continue;

      const filePath = path.join(toolDir, entry);

      try {
        const module = await this.loadToolModule(filePath);
        const toolClasses = this.findToolClasses(module);

        if (toolClasses.length === 0) continue;

        for (const ToolClass of toolClasses) {
          const tool = new ToolClass(this.config);
          this.registry.register(tool);
        }
      } catch {
        continue;
      }
    }
  }

  async discoverAll(): Promise<void> {
    await this.discoverFromDirectory(this.config.cwd);
    await this.discoverFromDirectory(getConfigDir());
  }
}
