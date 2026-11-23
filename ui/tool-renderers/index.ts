import { ToolContentRenderer } from "./types.js";
import { readFileRenderer } from "./read-file.js";
import { writeFileRenderer } from "./write-file.js";
import { shellRenderer } from "./shell.js";
import { grepRenderer } from "./grep.js";
import { globRenderer } from "./glob.js";
import { listDirRenderer } from "./list-dir.js";
import { todosRenderer } from "./todos.js";
import { memoryRenderer } from "./memory.js";
import { webSearchRenderer } from "./web-search.js";
import { subagentRenderer } from "./subagent.js";
import { genericRenderer } from "./generic.js";

export type { ToolContentRenderer } from "./types.js";

/**
 * Maps tool names (and name prefixes) to their content renderer.
 *
 * Lookup order:
 *  1. Exact name match
 *  2. Prefix match (for dynamically-named tools like subagents and MCP tools)
 *  3. Falls back to `genericRenderer`
 */
export class ToolRendererRegistry {
  private exact = new Map<string, ToolContentRenderer>();
  private prefixes: Array<{ prefix: string; renderer: ToolContentRenderer }> =
    [];

  register(name: string, renderer: ToolContentRenderer): void {
    this.exact.set(name, renderer);
  }

  registerPrefix(prefix: string, renderer: ToolContentRenderer): void {
    this.prefixes.push({ prefix, renderer });
  }

  get(name: string): ToolContentRenderer {
    const exact = this.exact.get(name);
    if (exact) return exact;

    for (const { prefix, renderer } of this.prefixes) {
      if (name.startsWith(prefix)) return renderer;
    }

    return genericRenderer;
  }
}

// ---------------------------------------------------------------------------
// Singleton registry with all built-in tools registered
// ---------------------------------------------------------------------------

const registry = new ToolRendererRegistry();

registry.register("read_file", readFileRenderer);
registry.register("write_file", writeFileRenderer);
registry.register("edit", writeFileRenderer);
registry.register("shell", shellRenderer);
registry.register("grep", grepRenderer);
registry.register("glob", globRenderer);
registry.register("list_dir", listDirRenderer);
registry.register("todos", todosRenderer);
registry.register("memory", memoryRenderer);
registry.register("web_search", webSearchRenderer);

// Subagents are named "subagent_<name>" — match by prefix
registry.registerPrefix("subagent_", subagentRenderer);

// MCP tools are named "<serverName>__<toolName>" — fall through to genericRenderer
// (no explicit registration needed; the registry fallback handles them)

export { registry as toolRendererRegistry };
