import { z } from "zod";
import fs from "fs";

import {
  Tool,
  ToolInvocation,
  ToolKind,
  ToolResult,
} from "../base.ts";
import { resolvePath } from "../../utils/paths.ts";

// ---------------------------------------------------------------------------
// Params schema
// ---------------------------------------------------------------------------

const ListDirParams = z.object({
  path: z
    .string()
    .default(".")
    .describe("Directory path to list (default: current directory)"),
  include_hidden: z
    .boolean()
    .default(false)
    .describe(
      "Whether to include hidden files and directories (default: false)",
    ),
});

type ListDirParamsType = z.infer<typeof ListDirParams>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class ListDirectoryTool extends Tool {
  name = "list_dir";
  description = "List contents of a directory";
  kind = ToolKind.READ;

  get schema() {
    return ListDirParams;
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const parsed = ListDirParams.safeParse(invocation.params);
    if (!parsed.success) {
      return ToolResult.errorResult(parsed.error.issues[0].message);
    }

    const params: ListDirParamsType = parsed.data;
    const dirPath = resolvePath(invocation.cwd, params.path);

    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return ToolResult.errorResult(`Directory does not exist: ${dirPath}`);
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (e) {
      return ToolResult.errorResult(`Error listing directory: ${e}`);
    }

    if (!params.include_hidden) {
      entries = entries.filter((e) => !e.name.startsWith("."));
    }

    // Dirs first, then files — both sorted case-insensitively
    entries.sort((a, b) => {
      const aIsDir = a.isDirectory() ? 0 : 1;
      const bIsDir = b.isDirectory() ? 0 : 1;
      if (aIsDir !== bIsDir) return aIsDir - bIsDir;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    if (entries.length === 0) {
      return ToolResult.successResult("Directory is empty", {
        metadata: { path: dirPath, entries: 0 },
      });
    }

    const lines = entries.map((e) =>
      e.isDirectory() ? `${e.name}/` : e.name,
    );

    return ToolResult.successResult(lines.join("\n"), {
      metadata: {
        path: dirPath,
        entries: entries.length,
      },
    });
  }
}
