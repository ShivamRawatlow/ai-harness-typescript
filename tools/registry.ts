import { Tool, ToolInvocation, ToolResult, OpenAIToolSchema } from "./base.ts";
import { ReadFileTool } from "./builtin/readFile.ts";
import { WriteFileTool } from "./builtin/writeFile.ts";
import { EditFileTool } from "./builtin/editFile.ts";
import { ShellTool } from "./builtin/shell.ts";
import { ListDirectoryTool } from "./builtin/listDirectory.ts";
import { GrepTool } from "./builtin/grep.ts";
import { GlobTool } from "./builtin/glob.ts";
import { WebSearchTool } from "./builtin/webSearch.ts";
import { WebFetchTool } from "./builtin/webFetch.ts";
import { TodosTool } from "./builtin/todo.ts";
import { MemoryTool } from "./builtin/memory.ts";
import { Config } from "../config/config.ts";
import { SubagentTool, getDefaultSubagentDefinitions } from "./subagents.ts";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private config?: Config;

  constructor(config?: Config) {
    this.config = config;
  }

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Overwriting existing tool: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
    console.debug(`Registered tool: ${tool.name}`);
  }

  unregister(name: string): boolean {
    if (this.tools.has(name)) {
      this.tools.delete(name);
      return true;
    }

    return false;
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getTools(): Tool[] {
    const tools: Tool[] = [];

    for (const tool of this.tools.values()) {
      tools.push(tool);
    }

    if (this.config?.allowedTools) {
      const allowedSet = new Set(this.config.allowedTools);
      return tools.filter((tool) => allowedSet.has(tool.name));
    }

    return tools;
  }

  getSchemas(): OpenAIToolSchema[] {
    return this.getTools().map((tool) => tool.toOpenAISchema());
  }

  async invoke(
    name: string,
    params: Record<string, unknown>,
    cwd?: string,
  ): Promise<ToolResult> {
    const tool = this.get(name);
    if (tool === undefined) {
      return ToolResult.errorResult(`Unknown tool: ${name}`, "", {
        metadata: { tool_name: name },
      });
    }

    const validationErrors = tool.validateParams(params);
    if (validationErrors.length > 0) {
      return ToolResult.errorResult(
        `Invalid parameters: ${validationErrors.join("; ")}`,
        "",
        { metadata: { tool_name: name, validation_errors: validationErrors } },
      );
    }

    const invocation: ToolInvocation = {
      params,
      cwd: cwd ?? process.cwd(),
    };

    try {
      return await tool.execute(invocation);
    } catch (e) {
      console.error(`Tool ${name} raised unexpected error`, e);
      return ToolResult.errorResult(`Internal error: ${e}`, "", {
        metadata: { tool_name: name },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Default registry factory
// ---------------------------------------------------------------------------

export function createDefaultRegistry(config?: Config): ToolRegistry {
  const registry = new ToolRegistry(config);

  registry.register(new ReadFileTool());
  registry.register(new WriteFileTool());
  registry.register(new EditFileTool());
  registry.register(new ShellTool(config));
  registry.register(new ListDirectoryTool());
  registry.register(new GrepTool());
  registry.register(new GlobTool());
  registry.register(new WebSearchTool());
  registry.register(new WebFetchTool());
  registry.register(new TodosTool());
  registry.register(new MemoryTool());

  if (config) {
    for (const definition of getDefaultSubagentDefinitions()) {
      registry.register(new SubagentTool(config, definition));
    }
  }

  return registry;
}
