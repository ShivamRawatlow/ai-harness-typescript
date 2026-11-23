import { z } from "zod";
import fs from "fs";
import path from "path";

import {
  Tool,
  ToolInvocation,
  ToolKind,
  ToolResult,
} from "../base.ts";
import { resolvePath, isBinaryFile } from "../../utils/paths.ts";
import { countTokens, truncateText } from "../../utils/text.ts";

// ---------------------------------------------------------------------------
// Params schema
// ---------------------------------------------------------------------------

const ReadFileParams = z.object({
  path: z
    .string()
    .describe(
      "Path to the file to read (relative to working directory or absolute)",
    ),
  offset: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe("Line number to start reading from (1-based). Defaults to 1"),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Maximum number of lines to read. If not specified, reads entire file.",
    ),
});

type ReadFileParamsType = z.infer<typeof ReadFileParams>;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class ReadFileTool extends Tool {
  name = "read_file";
  description =
    "Read the contents of a text file. Returns the file content with line numbers. " +
    "For large files, use offset and limit to read specific portions. " +
    "Cannot read binary files (images, executables, etc.).";
  kind = ToolKind.READ;

  static readonly MAX_FILE_SIZE = 1024 * 1024 * 10; // 10 MB
  static readonly MAX_OUTPUT_TOKENS = 25000;

  get schema() {
    return ReadFileParams;
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const parsed = ReadFileParams.safeParse(invocation.params);
    if (!parsed.success) {
      return ToolResult.errorResult(parsed.error.issues[0].message);
    }

    const params: ReadFileParamsType = parsed.data;
    const filePath = resolvePath(invocation.cwd, params.path);

    if (!fs.existsSync(filePath)) {
      return ToolResult.errorResult(`File not found: ${filePath}`);
    }

    const stat = fs.statSync(filePath);

    if (!stat.isFile()) {
      return ToolResult.errorResult(`Path is not a file: ${filePath}`);
    }

    const fileSize = stat.size;

    if (fileSize > ReadFileTool.MAX_FILE_SIZE) {
      const sizeMB = fileSize / (1024 * 1024);
      const maxMB = ReadFileTool.MAX_FILE_SIZE / (1024 * 1024);
      return ToolResult.errorResult(
        `File too large (${sizeMB.toFixed(1)}MB). Maximum is ${maxMB.toFixed(0)}MB.`,
      );
    }

    if (isBinaryFile(filePath)) {
      const fileSizeMB = fileSize / (1024 * 1024);
      const sizeStr =
        fileSizeMB >= 1 ? `${fileSizeMB.toFixed(2)}MB` : `${fileSize} bytes`;
      const fileName = path.basename(filePath);
      return ToolResult.errorResult(
        `Cannot read binary file: ${fileName} (${sizeStr}) This tool only reads text files.`,
      );
    }

    try {
      let content: string;
      try {
        content = fs.readFileSync(filePath, { encoding: "utf-8" });
      } catch {
        content = fs.readFileSync(filePath, { encoding: "latin1" });
      }

      const lines = content.split("\n");
      const totalLines = lines.length;

      if (totalLines === 0 || (totalLines === 1 && lines[0] === "")) {
        return ToolResult.successResult("File is empty.", { metadata: { lines: 0 } });
      }

      const startIdx = Math.max(0, params.offset - 1);
      const endIdx =
        params.limit !== undefined
          ? Math.min(startIdx + params.limit, totalLines)
          : totalLines;

      const selectedLines = lines.slice(startIdx, endIdx);
      const formattedLines = selectedLines.map(
        (line, i) => `${String(startIdx + i + 1).padStart(6)}|${line}`,
      );

      let output = formattedLines.join("\n");
      const tokenCount = countTokens(output);

      let truncated = false;
      if (tokenCount > ReadFileTool.MAX_OUTPUT_TOKENS) {
        output = truncateText(
          output,
          "gpt-4",
          ReadFileTool.MAX_OUTPUT_TOKENS,
          `\n... [truncated ${totalLines} total lines]`,
        );
        truncated = true;
      }

      if (startIdx > 0 || endIdx < totalLines) {
        const header = `Showing lines ${startIdx + 1}-${endIdx} of ${totalLines}\n\n`;
        output = header + output;
      }

      return ToolResult.successResult(output, {
        truncated,
        metadata: {
          path: filePath,
          total_lines: totalLines,
          shown_start: startIdx + 1,
          shown_end: endIdx,
        },
      });
    } catch (e) {
      return ToolResult.errorResult(`Failed to read file: ${e}`);
    }
  }
}
