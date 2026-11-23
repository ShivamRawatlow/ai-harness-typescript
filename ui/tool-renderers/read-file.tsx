import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";
import { ToolCallCompletePanelProps } from "../tool-complete-panel.js";
import { ToolContentRenderer } from "./types.js";
import { highlightCode } from "../highlight.js";
import { displayPathRelToCwd } from "../../utils/paths.js";

export const extractReadFileCode = (
  text: string,
): { startLine: number; code: string } | null => {
  let body = text;
  const headerMatch = text.match(/^Showing lines \d+-\d+ of \d+\n\n/);
  if (headerMatch) body = text.slice(headerMatch[0].length);

  const codeLines: string[] = [];
  let startLine: number | null = null;

  for (const line of body.split("\n")) {
    const m = line.match(/^\s*(\d+)\|(.*)$/);
    if (!m) return null;
    const lineNo = parseInt(m[1]!, 10);
    if (startLine === null) startLine = lineNo;
    codeLines.push(m[2]!);
  }

  if (startLine === null) return null;
  return { startLine, code: codeLines.join("\n") };
};

export const readFileRenderer: ToolContentRenderer = {
  async prepare(props) {
    const { output, success, metadata } = props;
    if (!success) return {};
    const primaryPath =
      typeof metadata.path === "string" ? metadata.path : null;
    const parsed = extractReadFileCode(output);
    if (!primaryPath || !parsed) return {};
    const highlightedLines = await highlightCode(parsed.code, primaryPath);
    return { highlightedLines };
  },

  render(props, prepared) {
    const { output, metadata, truncated, cwd } = props;
    const highlightedLines = prepared.highlightedLines as
      | string[]
      | undefined;
    const primaryPath =
      typeof metadata.path === "string" ? metadata.path : null;
    const parsed = extractReadFileCode(output);

    if (!primaryPath || !parsed) {
      return <Text {...theme.code}>{output}</Text>;
    }

    const relPath = displayPathRelToCwd(primaryPath, cwd);
    const shownStart = metadata.shown_start as number | undefined;
    const shownEnd = metadata.shown_end as number | undefined;
    const totalLines = metadata.total_lines as number | undefined;

    const header =
      shownStart && shownEnd && totalLines
        ? `${relPath} • lines ${shownStart}-${shownEnd} of ${totalLines}`
        : relPath;

    const lines = highlightedLines ?? parsed.code.split("\n");

    return (
      <Box flexDirection="column">
        <Text {...theme.muted}>{header}</Text>
        {truncated && <Text {...theme.warning}>(output truncated)</Text>}
        {lines.map((line, i) => (
          <Box key={i}>
            <Text {...theme.muted}>
              {String(parsed.startLine + i).padStart(4)}
              {"│"}
            </Text>
            <Text wrap="truncate">{line}</Text>
          </Box>
        ))}
      </Box>
    );
  },
};
