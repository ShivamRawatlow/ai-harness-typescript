import { z } from "zod";
import fs from "fs";
import path from "path";

import {
  FileDiff,
  Tool,
  ToolConfirmation,
  ToolInvocation,
  ToolKind,
  ToolResult,
} from "../base.ts";
import { resolvePath, ensureParentDirectory } from "../../utils/paths.ts";

// ---------------------------------------------------------------------------
// Params schema
// ---------------------------------------------------------------------------

const WriteFileParams = z.object({
  path: z
    .string()
    .describe(
      "Path to the file to write (relative to working directory or absolute)",
    ),
  content: z.string().describe("Content to write to the file"),
  create_directories: z
    .boolean()
    .default(true)
    .describe("Create parent directories if they don't exist"),
});

type WriteFileParamsType = z.infer<typeof WriteFileParams>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class WriteFileTool extends Tool {
  name = "write_file";
  description =
    "Write content to a file. Creates the file if it doesn't exist, " +
    "or overwrites if it does. Parent directories are created automatically. " +
    "Use this for creating new files or completely replacing file contents. " +
    "For partial modifications, use the edit tool instead.";
  kind = ToolKind.WRITE;

  get schema() {
    return WriteFileParams;
  }

  getConfirmation(invocation: ToolInvocation): ToolConfirmation | null {
    const parsed = WriteFileParams.safeParse(invocation.params);
    if (!parsed.success) return null;

    const params: WriteFileParamsType = parsed.data;
    const filePath = resolvePath(invocation.cwd, params.path);
    const isNewFile = !fs.existsSync(filePath);
    const action = isNewFile ? "Created" : "Updated";

    let oldContent = "";
    if (!isNewFile) {
      try {
        oldContent = fs.readFileSync(filePath, { encoding: "utf-8" });
      } catch {
        // ignore
      }
    }

    return {
      toolName: this.name,
      params: invocation.params,
      description: `${action} file: ${filePath}`,
      diff: new FileDiff({
        path: filePath,
        oldContent,
        newContent: params.content,
        isNewFile,
      }),
    };
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const parsed = WriteFileParams.safeParse(invocation.params);
    if (!parsed.success) {
      return ToolResult.errorResult(parsed.error.issues[0].message);
    }

    const params: WriteFileParamsType = parsed.data;
    const filePath = resolvePath(invocation.cwd, params.path);

    const isNewFile = !fs.existsSync(filePath);
    let oldContent = "";

    if (!isNewFile) {
      try {
        oldContent = fs.readFileSync(filePath, { encoding: "utf-8" });
      } catch {
        // ignore read errors for old content
      }
    }

    try {
      if (params.create_directories) {
        ensureParentDirectory(filePath);
      } else if (!fs.existsSync(path.dirname(filePath))) {
        return ToolResult.errorResult(
          `Parent directory does not exist: ${path.dirname(filePath)}`,
        );
      }

      fs.writeFileSync(filePath, params.content, { encoding: "utf-8" });

      const action = isNewFile ? "Created" : "Updated";
      const lineCount = params.content.split("\n").length;
      const byteCount = Buffer.byteLength(params.content, "utf-8");

      return ToolResult.successResult(
        `${action} ${filePath} ${lineCount} lines`,
        {
          diff: new FileDiff({
            path: filePath,
            oldContent,
            newContent: params.content,
            isNewFile,
          }),
          metadata: {
            path: filePath,
            is_new_file: isNewFile,
            lines: lineCount,
            bytes: byteCount,
          },
        },
      );
    } catch (e) {
      return ToolResult.errorResult(`Failed to write file: ${e}`);
    }
  }
}
