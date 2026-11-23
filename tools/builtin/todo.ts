import { z } from "zod";
import { randomUUID } from "crypto";

import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.ts";

// ---------------------------------------------------------------------------
// Params schema
// ---------------------------------------------------------------------------

const TodosParams = z.object({
  action: z
    .enum(["add", "complete", "list", "clear"])
    .describe("Action: 'add', 'complete', 'list', 'clear'"),
  id: z.string().optional().describe("Todo ID (for complete)"),
  content: z.string().optional().describe("Todo content (for add)"),
});

type TodosParamsType = z.infer<typeof TodosParams>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class TodosTool extends Tool {
  name = "todos";
  description =
    "Manage a task list for the current session. Use this to track progress on multi-step tasks.";
  kind = ToolKind.MEMORY;

  private _todos: Map<string, string> = new Map();

  get schema() {
    return TodosParams;
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const parsed = TodosParams.safeParse(invocation.params);
    if (!parsed.success) {
      return ToolResult.errorResult(parsed.error.issues[0].message);
    }

    const params: TodosParamsType = parsed.data;

    switch (params.action) {
      case "add": {
        if (!params.content) {
          return ToolResult.errorResult("`content` required for 'add' action");
        }
        const id = randomUUID().slice(0, 8);
        this._todos.set(id, params.content);
        return ToolResult.successResult(
          `Added todo [${id}]: ${params.content}`,
        );
      }

      case "complete": {
        if (!params.id) {
          return ToolResult.errorResult("`id` required for 'complete' action");
        }
        const content = this._todos.get(params.id);
        if (content === undefined) {
          return ToolResult.errorResult(`Todo not found: ${params.id}`);
        }
        this._todos.delete(params.id);
        return ToolResult.successResult(
          `Completed todo [${params.id}]: ${content}`,
        );
      }

      case "list": {
        if (this._todos.size === 0) {
          return ToolResult.successResult("No todos");
        }
        const lines = ["Todos:"];
        for (const [id, content] of this._todos) {
          lines.push(`  [${id}] ${content}`);
        }
        return ToolResult.successResult(lines.join("\n"));
      }

      case "clear": {
        const count = this._todos.size;
        this._todos.clear();
        return ToolResult.successResult(`Cleared ${count} todos`);
      }
    }
  }
}
