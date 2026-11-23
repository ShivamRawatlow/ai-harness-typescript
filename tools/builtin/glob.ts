import { z } from "zod";
import fs from "fs";
import path from "path";
import { minimatch } from "minimatch";

import { Tool, ToolInvocation, ToolKind, ToolResult } from "../base.ts";
import { resolvePath } from "../../utils/paths.ts";

// ---------------------------------------------------------------------------
// Params schema
// ---------------------------------------------------------------------------

const GlobParams = z.object({
  pattern: z.string().describe("Glob pattern to match"),
  path: z
    .string()
    .default(".")
    .describe("Directory to search in (default: current directory)"),
});

type GlobParamsType = z.infer<typeof GlobParams>;

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

const MAX_RESULTS = 1000;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class GlobTool extends Tool {
  name = "glob";
  description =
    "Find files matching a glob pattern. Supports ** for recursive matching. Use this to search for filenames or files by extension across directories.";
  kind = ToolKind.READ;

  get schema() {
    return GlobParams;
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const parsed = GlobParams.safeParse(invocation.params);
    if (!parsed.success) {
      return ToolResult.errorResult(parsed.error.issues[0].message);
    }

    const params: GlobParamsType = parsed.data;
    const searchPath = resolvePath(invocation.cwd, params.path);

    if (!fs.existsSync(searchPath) || !fs.statSync(searchPath).isDirectory()) {
      return ToolResult.errorResult(`Directory does not exist: ${searchPath}`);
    }

    let allFiles: string[];
    try {
      allFiles = this._collectFiles(searchPath);
    } catch (e) {
      return ToolResult.errorResult(`Error searching: ${e}`);
    }

    // Match each file's path relative to searchPath against the pattern
    const matches: string[] = [];
    for (const filePath of allFiles) {
      const rel = path.relative(searchPath, filePath);
      if (minimatch(rel, params.pattern, { dot: false, matchBase: true })) {
        matches.push(filePath);
      }
    }

    const limited = matches.slice(0, MAX_RESULTS);
    const outputLines = limited.map((filePath) => {
      try {
        return path.relative(invocation.cwd, filePath);
      } catch {
        return filePath;
      }
    });

    if (matches.length > MAX_RESULTS) {
      outputLines.push(`...(limited to ${MAX_RESULTS} results)`);
    }

    if (outputLines.length === 0) {
      return ToolResult.successResult(
        `No files matched pattern '${params.pattern}'`,
        {
          metadata: {
            path: searchPath,
            matches: 0,
          },
        },
      );
    }

    return ToolResult.successResult(outputLines.join("\n"), {
      metadata: {
        path: searchPath,
        matches: matches.length,
      },
    });
  }

  private _collectFiles(dir: string): string[] {
    const files: string[] = [];

    const walk = (current: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) {
            walk(path.join(current, entry.name));
          }
        } else {
          files.push(path.join(current, entry.name));
        }
      }
    };

    walk(dir);
    return files;
  }
}
