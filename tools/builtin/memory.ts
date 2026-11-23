import { z } from "zod";
import { Tool, ToolInvocation, ToolResult, ToolKind } from "../base.ts";
import { createMemoryDb, MemoryDb } from "./memoryDb.ts";

const MemoryParamsSchema = z.object({
  action: z
    .enum(["set", "get", "delete", "list", "clear"])
    .describe("Action: 'set', 'get', 'delete', 'list', 'clear'"),
  key: z
    .string()
    .optional()
    .describe("Memory key (required for `set`, `get`, `delete`)"),
  value: z.string().optional().describe("Value to store (required for `set`)"),
});

export class MemoryTool extends Tool {
  name = "memory";
  description =
    "Store and retrieve persistent memory. Use this to remember user preferences, important context or notes.";
  kind = ToolKind.MEMORY;

  get schema() {
    return MemoryParamsSchema;
  }

  private db: MemoryDb = createMemoryDb();

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const params = MemoryParamsSchema.parse(invocation.params);

    if (params.action === "set") {
      if (!params.key || !params.value) {
        return ToolResult.errorResult(
          "`key` and `value` are required for 'set' action",
        );
      }
      this.db.set(params.key, params.value);
      return ToolResult.successResult(`Set memory: ${params.key}`);
    } else if (params.action === "get") {
      if (!params.key) {
        return ToolResult.errorResult("`key` required for 'get' action");
      }
      const value = this.db.get(params.key);
      if (value === undefined) {
        return ToolResult.successResult(`Memory not found: ${params.key}`, {
          metadata: { found: false },
        });
      }
      return ToolResult.successResult(`Memory found: ${params.key}: ${value}`, {
        metadata: { found: true },
      });
    } else if (params.action === "delete") {
      if (!params.key) {
        return ToolResult.errorResult("`key` required for 'delete' action");
      }
      const deleted = this.db.delete(params.key);
      if (!deleted) {
        return ToolResult.successResult(`Memory not found: ${params.key}`);
      }
      return ToolResult.successResult(`Deleted memory: ${params.key}`);
    } else if (params.action === "list") {
      const rows = this.db.list();
      if (rows.length === 0) {
        return ToolResult.successResult("No memories stored", {
          metadata: { found: false },
        });
      }
      const lines = [
        "Stored memories:",
        ...rows.map((r) => `  ${r.key}: ${r.value}`),
      ];
      return ToolResult.successResult(lines.join("\n"), {
        metadata: { found: true },
      });
    } else if (params.action === "clear") {
      const count = this.db.clear();
      return ToolResult.successResult(`Cleared ${count} memory entries`);
    } else {
      return ToolResult.errorResult(`Unknown action: ${params.action}`);
    }
  }
}
