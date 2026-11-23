import { z } from "zod";
import fs from "fs";
import path from "path";

import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.ts";
import { resolvePath, isBinaryFile } from "../../utils/paths.ts";

// ---------------------------------------------------------------------------
// Params schema
// ---------------------------------------------------------------------------

const GrepParams = z.object({
  pattern: z.string().describe("Regular expression pattern to search for"),
  path: z
    .string()
    .default(".")
    .describe("File or directory to search in (default: current directory)"),
  case_insensitive: z
    .boolean()
    .default(false)
    .describe("Case-insensitive search (default: false)"),
});

type GrepParamsType = z.infer<typeof GrepParams>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules",
  "__pycache__",
  ".git",
  ".venv",
  "venv",
]);

const MAX_FILES = 500;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class GrepTool extends Tool {
  name = "grep";
  description =
    "Search for text or a regex pattern in file contents. Use this to find, locate or search for any text, string, keyword or pattern across files. Returns matching lines with file paths and line numbers. Prefer this over the shell tool for any text search task.";
  kind = ToolKind.READ;

  get schema() {
    return GrepParams;
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const parsed = GrepParams.safeParse(invocation.params);
    if (!parsed.success) {
      return ToolResult.errorResult(parsed.error.issues[0].message);
    }

    const params: GrepParamsType = parsed.data;
    const searchPath = resolvePath(invocation.cwd, params.path);

    if (!fs.existsSync(searchPath)) {
      return ToolResult.errorResult(`Path does not exist: ${searchPath}`);
    }

    let regex: RegExp;
    try {
      regex = new RegExp(params.pattern, params.case_insensitive ? "i" : "");
    } catch (e) {
      return ToolResult.errorResult(`Invalid regex pattern: ${e}`);
    }

    const stat = fs.statSync(searchPath);
    const files = stat.isDirectory()
      ? this._findFiles(searchPath)
      : [searchPath];

    const outputLines: string[] = [];
    let matches = 0;

    for (const filePath of files) {
      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }

      const lines = content.split("\n");
      let fileMatched = false;

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i]!)) {
          matches++;
          if (!fileMatched) {
            const rel = path.relative(invocation.cwd, filePath);
            outputLines.push(`=== ${rel} ===`);
            fileMatched = true;
          }
          outputLines.push(`${i + 1}:${lines[i]}`);
        }
      }

      if (fileMatched) outputLines.push("");
    }

    if (outputLines.length === 0) {
      return ToolResult.successResult(
        `No matches found for pattern '${params.pattern}'`,
        {
          metadata: {
            path: searchPath,
            matches: 0,
            files_searched: files.length,
          },
        },
      );
    }

    return ToolResult.successResult(outputLines.join("\n"), {
      metadata: {
        path: searchPath,
        matches,
        files_searched: files.length,
      },
    });
  }

  private _findFiles(searchPath: string): string[] {
    const files: string[] = [];

    const walk = (dir: string) => {
      if (files.length >= MAX_FILES) return;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (files.length >= MAX_FILES) return;

        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) {
            walk(path.join(dir, entry.name));
          }
        } else {
          if (entry.name.startsWith(".")) continue;
          const filePath = path.join(dir, entry.name);
          if (!isBinaryFile(filePath)) {
            files.push(filePath);
          }
        }
      }
    };

    walk(searchPath);
    return files;
  }
}
