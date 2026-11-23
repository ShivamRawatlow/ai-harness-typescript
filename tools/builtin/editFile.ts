import { z } from "zod";
import fs from "fs";

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

const EditFileParams = z.object({
  path: z
    .string()
    .describe(
      "Path to the file to edit (relative to working directory or absolute path)",
    ),
  old_string: z
    .string()
    .default("")
    .describe(
      "The exact text to find and replace. Must match exactly including all whitespace and indentation. For new files, leave this empty.",
    ),
  new_string: z
    .string()
    .describe(
      "The text to replace old_string with. Can be empty to delete text",
    ),
  replace_all: z
    .boolean()
    .default(false)
    .describe("Replace all occurrences of old_string (default: false)"),
});

type EditFileParamsType = z.infer<typeof EditFileParams>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class EditFileTool extends Tool {
  name = "edit";
  description =
    "Edit a file by replacing text. The old_string must match exactly " +
    "(including whitespace and indentation) and must be unique in the file " +
    "unless replace_all is true. Use this for precise, surgical edits. " +
    "For creating new files or complete rewrites, use write_file instead.";
  kind = ToolKind.WRITE;

  get schema() {
    return EditFileParams;
  }

  getConfirmation(invocation: ToolInvocation): ToolConfirmation | null {
    const parsed = EditFileParams.safeParse(invocation.params);
    if (!parsed.success) return null;

    const params: EditFileParamsType = parsed.data;
    const filePath = resolvePath(invocation.cwd, params.path);
    const isNewFile = !fs.existsSync(filePath);

    if (isNewFile) {
      return {
        toolName: this.name,
        params: invocation.params,
        description: `Create new file: ${filePath}`,
        diff: new FileDiff({
          path: filePath,
          oldContent: "",
          newContent: params.new_string,
          isNewFile: true,
        }),
      };
    }

    const oldContent = fs.readFileSync(filePath, { encoding: "utf-8" });
    const newContent = params.replace_all
      ? replaceAll(oldContent, params.old_string, params.new_string)
      : oldContent.replace(params.old_string, params.new_string);

    return {
      toolName: this.name,
      params: invocation.params,
      description: `Edit file: ${filePath}`,
      diff: new FileDiff({ path: filePath, oldContent, newContent }),
    };
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const parsed = EditFileParams.safeParse(invocation.params);
    if (!parsed.success) {
      return ToolResult.errorResult(parsed.error.issues[0].message);
    }

    const params: EditFileParamsType = parsed.data;
    const filePath = resolvePath(invocation.cwd, params.path);

    // --- New file creation ---
    if (!fs.existsSync(filePath)) {
      if (params.old_string) {
        return ToolResult.errorResult(
          `File does not exist: ${filePath}. To create a new file, use an empty old_string.`,
        );
      }

      ensureParentDirectory(filePath);
      fs.writeFileSync(filePath, params.new_string, { encoding: "utf-8" });

      const lineCount = params.new_string.split("\n").length;

      return ToolResult.successResult(
        `Created ${filePath} ${lineCount} lines`,
        {
          diff: new FileDiff({
            path: filePath,
            oldContent: "",
            newContent: params.new_string,
            isNewFile: true,
          }),
          metadata: { path: filePath, is_new_file: true, lines: lineCount },
        },
      );
    }

    // --- Edit existing file ---
    const oldContent = fs.readFileSync(filePath, { encoding: "utf-8" });

    if (!params.old_string) {
      return ToolResult.errorResult(
        "old_string is empty but file exists. Provide old_string to edit, or use write_file to overwrite.",
      );
    }

    const occurrenceCount = countOccurrences(oldContent, params.old_string);

    if (occurrenceCount === 0) {
      return this._noMatchError(params.old_string, oldContent, filePath);
    }

    if (occurrenceCount > 1 && !params.replace_all) {
      return ToolResult.errorResult(
        `old_string found ${occurrenceCount} times in ${filePath}. ` +
          `Either: \n` +
          `1. Provide more context to make the match unique or\n` +
          `2. Set replace_all=true to replace all occurrences`,
        "",
        { metadata: { occurrence_count: occurrenceCount } },
      );
    }

    let newContent: string;
    let replaceCount: number;

    if (params.replace_all) {
      newContent = replaceAll(oldContent, params.old_string, params.new_string);
      replaceCount = occurrenceCount;
    } else {
      newContent = oldContent.replace(params.old_string, params.new_string);
      replaceCount = 1;
    }

    if (newContent === oldContent) {
      return ToolResult.errorResult(
        "No change made - old_string equals new_string",
      );
    }

    try {
      fs.writeFileSync(filePath, newContent, { encoding: "utf-8" });
    } catch (e) {
      return ToolResult.errorResult(`failed to write file: ${e}`);
    }

    const oldLines = oldContent.split("\n").length;
    const newLines = newContent.split("\n").length;
    const lineDiff = newLines - oldLines;

    const diffMsg =
      lineDiff > 0
        ? ` (+${lineDiff} lines)`
        : lineDiff < 0
          ? ` (${lineDiff} lines)`
          : "";

    return ToolResult.successResult(
      `Edited ${filePath}: replaced ${replaceCount} occurrence(s)${diffMsg}`,
      {
        diff: new FileDiff({ path: filePath, oldContent, newContent }),
        metadata: {
          path: filePath,
          replaced_count: replaceCount,
          line_diff: lineDiff,
        },
      },
    );
  }

  private _noMatchError(
    oldString: string,
    content: string,
    filePath: string,
  ): ToolResult {
    const lines = content.split("\n");
    const searchTerms = oldString.split(/\s+/).slice(0, 5);
    const partialMatches: Array<[number, string]> = [];

    if (searchTerms.length > 0) {
      const firstTerm = searchTerms[0];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(firstTerm)) {
          partialMatches.push([i + 1, lines[i].trim().slice(0, 80)]);
          if (partialMatches.length >= 3) break;
        }
      }
    }

    let errorMsg = `old_string not found in ${filePath}.`;

    if (partialMatches.length > 0) {
      errorMsg += "\n\nPossible similar lines:";
      for (const [lineNum, linePreview] of partialMatches) {
        errorMsg += `\n  Line ${lineNum}: ${linePreview}`;
      }
      errorMsg +=
        "\n\nMake sure old_string matches exactly (including whitespace and indentation).";
    } else {
      errorMsg +=
        " Make sure the text matches exactly, including:\n" +
        "- All whitespace and indentation\n" +
        "- Line breaks\n" +
        "- Any invisible characters\n" +
        "Try re-reading the file using read_file tool and then editing.";
    }

    return ToolResult.errorResult(errorMsg);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function replaceAll(
  haystack: string,
  needle: string,
  replacement: string,
): string {
  // Use split/join to avoid regex special-character issues
  return haystack.split(needle).join(replacement);
}
