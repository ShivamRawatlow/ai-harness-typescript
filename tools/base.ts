import { ZodType, toJSONSchema } from "zod";
import { createTwoFilesPatch } from "diff";

// ---------------------------------------------------------------------------
// Core data types
// ---------------------------------------------------------------------------

export interface ToolInvocation {
  params: Record<string, unknown>;
  cwd: string;
}

// ---------------------------------------------------------------------------
// FileDiff
// ---------------------------------------------------------------------------

export class FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  isNewFile: boolean;
  isDeletion: boolean;

  constructor(fields: {
    path: string;
    oldContent: string;
    newContent: string;
    isNewFile?: boolean;
    isDeletion?: boolean;
  }) {
    this.path = fields.path;
    this.oldContent = fields.oldContent;
    this.newContent = fields.newContent;
    this.isNewFile = fields.isNewFile ?? false;
    this.isDeletion = fields.isDeletion ?? false;
  }

  toDiff(): string {
    const ensureNewline = (s: string) =>
      s.length > 0 && !s.endsWith("\n") ? s + "\n" : s;

    const oldContent = ensureNewline(this.oldContent);
    const newContent = ensureNewline(this.newContent);

    const oldName = this.isNewFile ? "/dev/null" : this.path;
    const newName = this.isDeletion ? "/dev/null" : this.path;

    return createTwoFilesPatch(
      oldName,
      newName,
      oldContent,
      newContent,
      "",
      "",
      {
        context: 3,
      },
    );
  }
}

export class ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata: Record<string, unknown>;
  truncated: boolean;
  diff?: FileDiff;
  exitCode?: number;

  constructor(fields: {
    success: boolean;
    output: string;
    error?: string;
    metadata?: Record<string, unknown>;
    truncated?: boolean;
    diff?: FileDiff;
    exitCode?: number;
  }) {
    this.success = fields.success;
    this.output = fields.output;
    this.error = fields.error;
    this.metadata = fields.metadata ?? {};
    this.truncated = fields.truncated ?? false;
    this.diff = fields.diff;
    this.exitCode = fields.exitCode;
  }

  static errorResult(
    error: string,
    output = "",
    extras: Partial<ToolResult> = {},
  ): ToolResult {
    return new ToolResult({ success: false, output, error, ...extras });
  }

  static successResult(
    output = "",
    extras: Partial<ToolResult> = {},
  ): ToolResult {
    return new ToolResult({ success: true, output, ...extras });
  }

  toModelOutput(): string {
    if (this.success) {
      return this.output;
    }
    return `Error: ${this.error}\n\nOutput:\n${this.output}`;
  }
}

export interface ToolConfirmation {
  toolName: string;
  params: Record<string, unknown>;
  description: string;
  diff?: FileDiff;
}

// ---------------------------------------------------------------------------
// Tool kind
// ---------------------------------------------------------------------------

export enum ToolKind {
  READ = "read",
  WRITE = "write",
  SHELL = "shell",
  NETWORK = "network",
  MEMORY = "memory",
  MCP = "mcp",
}

// ---------------------------------------------------------------------------
// OpenAI function schema shape
// ---------------------------------------------------------------------------

export interface OpenAIToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Abstract base Tool
// ---------------------------------------------------------------------------

export abstract class Tool {
  name: string = "base_tool";
  description: string = "Base tool";
  kind: ToolKind = ToolKind.READ;

  /**
   * Return either a Zod schema or a raw JSON-schema-compatible dict.
   */
  get schema(): ZodType | Record<string, unknown> {
    throw new Error("Tool must define schema property or class attribute");
  }

  abstract execute(invocation: ToolInvocation): Promise<ToolResult>;

  validateParams(params: Record<string, unknown>): string[] {
    const schema = this.schema;

    if (schema instanceof ZodType) {
      const result = schema.safeParse(params);
      if (!result.success) {
        return result.error.issues.map((issue) => {
          const field = issue.path.join(".");
          return `Parameter '${field}': '${issue.message}'`;
        });
      }
    }

    return [];
  }

  isMutating(): boolean {
    return [
      ToolKind.WRITE,
      ToolKind.SHELL,
      ToolKind.NETWORK,
      ToolKind.MEMORY,
    ].includes(this.kind);
  }

  getConfirmation(invocation: ToolInvocation): ToolConfirmation | null {
    if (!this.isMutating()) return null;

    return {
      toolName: this.name,
      params: invocation.params,
      description: `Execute ${this.name}`,
    };
  }

  toOpenAISchema(): OpenAIToolSchema {
    const schema = this.schema;

    if (schema instanceof ZodType) {
      const jsonSchema = toJSONSchema(schema) as Record<string, unknown>;
      return {
        name: this.name,
        description: this.description,
        parameters: {
          type: "object",
          properties:
            (jsonSchema["properties"] as Record<string, unknown>) ?? {},
          required: (jsonSchema["required"] as string[]) ?? [],
        },
      };
    }

    if (typeof schema === "object" && schema !== null) {
      return {
        name: this.name,
        description: this.description,
        parameters:
          "parameters" in schema
            ? (schema["parameters"] as Record<string, unknown>)
            : schema,
      };
    }

    throw new Error(
      `Invalid schema type for tool ${this.name}: ${typeof schema}`,
    );
  }
}
